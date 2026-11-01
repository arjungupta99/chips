/**
 * `POST /v1/socket-tickets` — a single-use ticket for opening a WebSocket (ADR 0006,
 * phase-0-review finding 5).
 *
 * A browser cannot put a header on a WebSocket handshake, so a person's client cannot sign the
 * upgrade the way it signs a request, and a signature in the URL would be a durable credential
 * somewhere URLs get logged. Instead it makes this one ordinary signed request — whose
 * signature covers the path and body like any other — and opens `/v1/ws?ticket=…`. The ticket
 * is spent on the upgrade; a logged one is worthless.
 */

import type { Hono } from "hono";
import { SOCKET_TICKET_TTL_SECONDS } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";

export function registerSocketRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/socket-tickets", (c) => {
    const ticket = deps.socketTickets.issue(c.get("principal"));
    return c.json({ ticket: ticket.ticket, expires_in: SOCKET_TICKET_TTL_SECONDS }, 201);
  });
}
