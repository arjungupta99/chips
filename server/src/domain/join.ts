/**
 * The rules of a join request (ADR 0122), pure: what state one is in at a moment, where a device
 * may ask from, what a person may grant, and how often one address may ask.
 */

import { GRANTABLE, JOIN_ASKS_PER_MINUTE, type JoinState } from "@chipschat/protocol";

/**
 * A request as it stands now. One past its expiry and never collected reads expired before the
 * sweep marks it, so nothing waits on a timer to be told the truth.
 */
export function stateAt(
  request: { readonly state: JoinState; readonly expiresAt: string },
  nowMs: number,
): JoinState {
  const live = request.state === "waiting" || request.state === "allowed";
  return live && Date.parse(request.expiresAt) <= nowMs ? "expired" : request.state;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** The four numbers of an IPv4 address, from a mapped IPv6 one too; nothing otherwise. */
function octets(address: string): number[] | undefined {
  const bare = address.replace(/^::ffff:/i, "");
  const match = IPV4.exec(bare);
  if (match === null) return undefined;
  const numbers = match.slice(1).map(Number);
  return numbers.every((each) => each <= 255) ? numbers : undefined;
}

/** 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, and 100.64/10, which is a tailnet's. */
function privateV4([a = 0, b = 0]: number[]): boolean {
  if (a === 127 || a === 10) return true;
  if (a === 172) return b >= 16 && b <= 31;
  if (a === 192) return b === 168;
  if (a === 169) return b === 254;
  return a === 100 && b >= 64 && b <= 127;
}

/**
 * Whether an address is on this machine or its network: loopback, a private range, link-local,
 * or a tailnet. A device asks to be paired only from such an address, never through the relay and
 * never from the open internet, so nobody can fill a stranger's server with requests (ADR 0122).
 * Away from home, the QR is the way in.
 */
export function onThisNetwork(address: string | undefined): boolean {
  if (address === undefined || address === "") return false;
  const four = octets(address);
  if (four !== undefined) return privateV4(four);
  const lower = address.toLowerCase();
  // ::1, unique-local fc00::/7, link-local fe80::/10, and Tailscale's fd7a:115c:a1e0::/48.
  return lower === "::1" || /^f[cd][0-9a-f]{2}:/.test(lower) || /^fe[89ab][0-9a-f]:/.test(lower);
}

/**
 * What a person grants: what they chose, each once, of what may be granted at all and, for a
 * request a harness started, of what it asked for. A harness that did not ask for something does
 * not get it, as under ADR 0046 a harness asks and a person declares.
 */
export function granted(chosen: readonly string[], asked: readonly string[] | undefined): string[] {
  const allowed = new Set(asked ?? GRANTABLE);
  return [...new Set(chosen)].filter((each) => GRANTABLE.includes(each) && allowed.has(each));
}

/** Names that are not capabilities a person may grant; none means every one is. */
export function unknownCapabilities(names: readonly string[]): string[] {
  return names.filter((each) => !GRANTABLE.includes(each));
}

const MINUTE_MS = 60_000;

/** How many asks one address has made in the last minute, and how long until it may again. */
export interface AskCounter {
  /** Counts an ask. Answers the seconds to wait when the address is over its minute's allowance. */
  readonly note: (address: string, nowMs: number) => number | undefined;
}

/**
 * Ten asks a minute from one address (`JOIN_ASKS_PER_MINUTE`): every ask counts, refused or not,
 * since each one costs the people who may decide a card. Addresses a minute quiet are forgotten.
 */
export function createAskCounter(limit = JOIN_ASKS_PER_MINUTE): AskCounter {
  const asks = new Map<string, number[]>();
  const forget = (nowMs: number): void => {
    for (const [address, times] of asks) {
      if ((times.at(-1) ?? 0) <= nowMs - MINUTE_MS) asks.delete(address);
    }
  };
  return {
    note(address, nowMs) {
      forget(nowMs);
      const recent = (asks.get(address) ?? []).filter((at) => at > nowMs - MINUTE_MS);
      if (recent.length >= limit) {
        asks.set(address, recent);
        const freeing = recent[recent.length - limit] ?? nowMs;
        return Math.max(1, Math.ceil((freeing + MINUTE_MS - nowMs) / 1000));
      }
      asks.set(address, [...recent, nowMs]);
      return undefined;
    },
  };
}
