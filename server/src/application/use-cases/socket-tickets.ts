/**
 * Single-use tickets for opening a WebSocket (ADR 0006, phase-0-review finding 5): one instance of
 * `createTickets`, holding the principal the socket opens as.
 *
 * A browser cannot set headers on a WebSocket handshake, so the client makes one ordinary signed
 * request — `POST /v1/socket-tickets`, whose signature covers the path and body like any other —
 * and opens `/v1/ws?ticket=…`. The ticket is spent on the upgrade.
 */

import type { Principal } from "../ports/identity.js";
import {
  createTickets,
  TICKET_BYTES,
  type Ticket,
  type Tickets,
  type TicketsDeps,
} from "./tickets.js";

/** Thirty seconds is long enough to open a socket and far too short to reuse a leaked one. */
export const SOCKET_TICKET_TTL_SECONDS = 30;

/** How many bytes of randomness a ticket carries. 256 bits, base64url, like a harness token. */
export const SOCKET_TICKET_BYTES = TICKET_BYTES;

export type SocketTicket = Ticket;

export type SocketTickets = Tickets<Principal>;

export type SocketTicketsDeps = Omit<TicketsDeps, "ttlSeconds">;

export function createSocketTickets(deps: SocketTicketsDeps): SocketTickets {
  return createTickets<Principal>({ ...deps, ttlSeconds: SOCKET_TICKET_TTL_SECONDS });
}
