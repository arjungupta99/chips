/**
 * Single-use tickets: a credential for a request that cannot carry one (ADR 0006, phase-0-review
 * finding 5; ADR 0201).
 *
 * A browser cannot set headers on a WebSocket handshake, and a frame cannot sign the request for
 * its document, so for those a credential has to travel in the URL. A device signature there is
 * durable for its five-minute window: a URL that lands in a proxy log or a `Referer` would act as
 * that person. So the client does not put its signature in a URL at all. It makes one ordinary
 * signed request and gets back a ticket: opaque, short-lived, and good for exactly one use. A
 * logged ticket is worthless by the time anyone reads it.
 *
 * Tickets are held in memory with a short expiry, the way pairing codes are: a ticket is a
 * capability, not a record, and one that survived a restart would be one more thing that could
 * leak. In Phase 6, several gateway processes behind one address will need this in a shared
 * store; the port is here so that is an adapter swap.
 */

import type { Clock } from "../ports/index.js";

/** How many bytes of randomness a ticket carries. 256 bits, base64url, like a harness token. */
export const TICKET_BYTES = 32;

export interface Ticket {
  readonly ticket: string;
  /** Milliseconds since the epoch. */
  readonly expiresAt: number;
}

/** A store of tickets, each holding what it was minted for: a principal, or a principal and a file. */
export interface Tickets<T> {
  /** Mint a ticket holding `held`, for a caller Chips has already authenticated. */
  readonly issue: (held: T) => Ticket;
  /**
   * Spend a ticket. Returns what it was minted for, or nothing when the ticket is unknown,
   * expired or already spent. Removes it either way, so a ticket is good once.
   */
  readonly redeem: (ticket: string) => T | undefined;
  /** How many tickets are still good, unspent and unexpired, among those `which` picks. */
  readonly count: (which: (held: T) => boolean) => number;
}

export interface TicketsDeps {
  readonly clock: Clock;
  /** How long a ticket holds from its minting. */
  readonly ttlSeconds: number;
  /** Defaults to 32 cryptographically-random bytes. Injected so a test is deterministic. */
  readonly randomToken?: (() => string) | undefined;
}

export function createTickets<T>(deps: TicketsDeps): Tickets<T> {
  const { clock, ttlSeconds } = deps;
  const randomToken = deps.randomToken ?? defaultToken;
  const tickets = new Map<string, { held: T; expiresAt: number }>();

  const prune = () => {
    const now = clock.nowMs();
    for (const [ticket, kept] of tickets) {
      if (kept.expiresAt <= now) tickets.delete(ticket);
    }
  };

  return {
    issue(held) {
      prune();
      const ticket = randomToken();
      const expiresAt = clock.nowMs() + ttlSeconds * 1000;
      tickets.set(ticket, { held, expiresAt });
      return { ticket, expiresAt };
    },
    redeem(ticket) {
      prune();
      const kept = tickets.get(ticket);
      // Single use: take it out whether or not it was still valid.
      tickets.delete(ticket);
      if (kept === undefined || kept.expiresAt <= clock.nowMs()) return undefined;
      return kept.held;
    },
    count(which) {
      prune();
      let good = 0;
      for (const kept of tickets.values()) if (which(kept.held)) good += 1;
      return good;
    },
  };
}

function defaultToken(): string {
  const bytes = new Uint8Array(TICKET_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  // base64url without padding: URL-safe, so it survives a query string or a path untouched.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
