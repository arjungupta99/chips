/**
 * A limiter for the doors with no credential behind them: pairing, redeeming an invite,
 * signing in with a passkey. A guesser who is never slowed down has a small but real chance at
 * a six-character code; five wrong answers a minute from one address, then a minute's wait,
 * makes it no chance at all — and a 256-bit token needs no such help, but gets it anyway.
 *
 * What one address is, what the limiter remembers, and how a door is slowed when the guesses
 * come from everywhere at once are ADR 0056's.
 */

import { countedAs } from "@chipschat/platform";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import type { GatewayEnv } from "./context.js";
import { HttpError } from "./errors.js";

/** Wrong answers allowed from one address in a minute before it is told to wait. */
export const WRONG_ANSWERS_PER_MINUTE = 5;
/** Wrong answers allowed from one address in a minute while its door is strained. */
export const WRONG_ANSWERS_WHILE_STRAINED = 1;
/**
 * Addresses one limiter holds at once. Past it, the address whose last wrong answer is oldest
 * is forgotten first. Filling it takes this many addresses answering wrong inside one minute.
 */
export const REMEMBERED_ADDRESSES = 10_000;
const MINUTE_MS = 60_000;

/** A peer on this machine: Tailscale Serve, or whatever other proxy the operator put before the port. */
const LOOPBACK: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Where a request came from, for the limiter: the address the relay saw when the request came
 * through a tunnel (M4.1), the socket's when it came in on the port, and one bucket when there
 * is neither to ask. Each is counted as `countedAs` says.
 *
 * Behind a proxy on this machine — Tailscale Serve, which is how the server gets HTTPS on a
 * tailnet — every request's socket is loopback, and five wrong answers from any one device would
 * make every device wait. The proxy says who asked in `X-Forwarded-For`, so a loopback peer is
 * taken at that word: the last entry, which is the one the proxy wrote, since the ones before it
 * are whatever the caller sent. From any other peer the header is only the caller's own claim,
 * and is not read.
 */
export function addressOf(c: Context<GatewayEnv>): string {
  const relayed = c.env?.relay?.from;
  if (relayed !== undefined && relayed !== "") return `relay:${countedAs(relayed)}`;
  // Through the tunnel door on this network (ADR 0191): the socket's own peer, counted as a
  // request on the port is, since that is what it is.
  const lan = c.env?.lan?.from;
  if (lan !== undefined && lan !== "") return countedAs(lan);
  const peer = peerOf(c);
  if (peer === undefined) return "local";
  if (!LOOPBACK.has(peer)) return countedAs(peer);
  const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded === undefined || forwarded === "" ? peer : countedAs(forwarded);
}

/** The socket's other end, when there is a socket. */
function peerOf(c: Context<GatewayEnv>): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export interface LimiterOptions {
  /** What an address that has had its wrong answers for the minute is told. */
  readonly message: string;
  /**
   * Wrong answers in a minute from every address together at which the door is strained: each
   * address is then allowed one wrong answer a minute, not five, until the rate falls back
   * under. Only a pairing code is short enough to need it. Without it, a door is never strained.
   */
  readonly strainedAt?: number;
  /** What an address refused only because the door is strained is told. */
  readonly strainedMessage?: string;
  /** Called when a wrong answer strains the door, once each time it does. */
  readonly onStrained?: () => void;
  /** Addresses held at once; `REMEMBERED_ADDRESSES` unless a test asks for fewer. */
  readonly remember?: number;
}

export interface Limiter {
  /** Throws `rate_limited` when this address has used its allowance for the minute. */
  readonly check: (address: string) => void;
  /**
   * Hears one answer from this address. It is checked, and holds a place in the address's
   * allowance while `answer` runs; if `answer` calls `wrong`, the place is kept for the minute.
   * So answers sent all at once are counted as they arrive, not as they come back wrong.
   */
  readonly attempt: <T>(
    address: string,
    answer: (wrong: () => void) => T | Promise<T>,
  ) => Promise<T>;
  /** How many addresses it holds now. */
  readonly remembered: () => number;
}

interface Tally {
  /** When this address answered wrong in the last minute, oldest first. */
  readonly failures: number[];
  /** Its answers still being heard. */
  pending: number;
}

export function createLimiter(now: () => number, options: LimiterOptions): Limiter {
  const remember = options.remember ?? REMEMBERED_ADDRESSES;
  // Oldest wrong answer first: an address is moved to the end each time it answers wrong.
  const tallies = new Map<string, Tally>();
  // The last `strainedAt` wrong answers from anywhere, oldest first.
  const lately: number[] = [];
  let sweptAt = now();

  const strained = (): boolean => {
    const ceiling = options.strainedAt;
    if (ceiling === undefined || lately.length < ceiling) return false;
    return (lately[0] ?? 0) > now() - MINUTE_MS;
  };

  const tallyOf = (address: string): Tally | undefined => {
    const tally = tallies.get(address);
    const since = now() - MINUTE_MS;
    while (tally !== undefined && (tally.failures[0] ?? Number.POSITIVE_INFINITY) <= since) {
      tally.failures.shift();
    }
    return tally;
  };

  const check = (address: string): void => {
    const tally = tallyOf(address);
    if (tally === undefined) return;
    const used = tally.failures.length + tally.pending;
    const allowance = strained() ? WRONG_ANSWERS_WHILE_STRAINED : WRONG_ANSWERS_PER_MINUTE;
    if (used < allowance) return;
    // A place is free again when enough wrong answers are a minute old; one held only by
    // answers still being heard is free in a moment.
    const freeing = tally.failures[tally.failures.length - allowance];
    const retryAfter = freeing === undefined ? 1 : Math.ceil((freeing + MINUTE_MS - now()) / 1000);
    const message =
      used < WRONG_ANSWERS_PER_MINUTE
        ? (options.strainedMessage ?? options.message)
        : options.message;
    throw new HttpError("rate_limited", message, undefined, Math.max(1, retryAfter));
  };

  const noteStrain = (at: number): void => {
    const ceiling = options.strainedAt;
    if (ceiling === undefined) return;
    const was = strained();
    lately.push(at);
    if (lately.length > ceiling) lately.shift();
    if (!was && strained()) options.onStrained?.();
  };

  // Every address a minute past its last wrong answer and with nothing being heard.
  const sweep = (at: number): void => {
    for (const [address, tally] of tallies) {
      const last = tally.failures.at(-1) ?? Number.NEGATIVE_INFINITY;
      if (tally.pending === 0 && last <= at - MINUTE_MS) tallies.delete(address);
    }
  };

  // Once a minute, the addresses that are done with; then, past the cap, the addresses whose
  // last wrong answer is oldest.
  const forget = (at: number): void => {
    if (at - sweptAt >= MINUTE_MS) {
      sweptAt = at;
      sweep(at);
    }
    for (const address of tallies.keys()) {
      if (tallies.size <= remember) break;
      tallies.delete(address);
    }
  };

  const countWrong = (address: string, heard: Tally): void => {
    const at = now();
    // Forgotten past the cap while it was heard, and back since: the wrong answer is the newer's.
    const tally = tallies.get(address) ?? heard;
    tally.failures.push(at);
    tallies.delete(address);
    tallies.set(address, tally);
    noteStrain(at);
    forget(at);
  };

  return {
    check,
    async attempt(address, answer) {
      check(address);
      const tally = tallies.get(address) ?? { failures: [], pending: 0 };
      tallies.set(address, tally);
      tally.pending += 1;
      let wrong = false;
      try {
        return await answer(() => {
          wrong = true;
        });
      } finally {
        tally.pending -= 1;
        if (wrong) countWrong(address, tally);
        else if (tally.pending === 0 && tally.failures.length === 0) {
          if (tallies.get(address) === tally) tallies.delete(address);
        }
      }
    },
    remembered: () => tallies.size,
  };
}
