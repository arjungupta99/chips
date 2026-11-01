/**
 * Direct asks (ADR 0211, Phase 3): a guest asks the owners to share the server's machine with
 * them in Tailscale; an owner answers with the share link.
 *
 * - `POST /v1/direct-asks` — ask: `{ trip_ms? }`, the guest's round trip through the relay, for
 *   the owner to read. Anybody but an owner. Their open ask again, if they have one.
 * - `GET /v1/direct-asks/mine` — the person's own newest ask, link and all: `{ ask }`, or
 *   `{ ask: null }`.
 * - `GET /v1/direct-asks` — an owner's: the asks waiting, and the link kept for the next guest.
 * - `GET /v1/direct-asks/:id` — an owner's: one ask, as a push names it, and the link kept.
 * - `POST /v1/direct-asks/:id/share` — an owner answers: `{ link, keep }`. Tailscale's own link,
 *   on https; `keep` gives it to the next guest who asks, or forgets the one kept.
 * - `DELETE /v1/direct-asks/kept-link` — an owner forgets the link kept (Phase 4's Relay page).
 */

import type { Hono } from "hono";
import {
  type DirectAskRefusal,
  directAskViewOf as viewOf,
} from "../../../application/use-cases/direct-asks.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function bodyOf(raw: string): Record<string, unknown> {
  try {
    const body: unknown = JSON.parse(raw === "" ? "{}" : raw);
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Said below.
  }
  throw new HttpError("invalid_event", "The body is not a JSON object.");
}

function refused(error: DirectAskRefusal): never {
  if (error.kind === "not_allowed") throw new HttpError("forbidden", error.message);
  if (error.kind === "not_found") throw new HttpError("not_found", error.message);
  // Answered already, by another owner: said by its refusal, as a join decided twice is.
  throw new HttpError("invalid_event", error.message, undefined, undefined, error.kind);
}

export function registerDirectAskRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/direct-asks", async (c) => {
    const trip = bodyOf(c.get("rawBody"))["trip_ms"];
    const result = await deps.directAsks.ask(
      c.get("principal"),
      typeof trip === "number" && Number.isFinite(trip) ? trip : undefined,
    );
    if (!result.ok) refused(result.error);
    return c.json(viewOf(result.value), 201);
  });

  app.get("/v1/direct-asks/mine", async (c) => {
    const result = await deps.directAsks.mine(c.get("principal"));
    if (!result.ok) refused(result.error);
    return c.json({ ask: result.value === undefined ? null : viewOf(result.value) });
  });

  app.get("/v1/direct-asks", async (c) => {
    const result = await deps.directAsks.waiting(c.get("principal"));
    if (!result.ok) refused(result.error);
    return c.json({
      asks: result.value.asks.map(viewOf),
      kept_link: result.value.keptLink ?? null,
    });
  });

  app.delete("/v1/direct-asks/kept-link", async (c) => {
    const result = await deps.directAsks.forget(c.get("principal"));
    if (!result.ok) refused(result.error);
    return c.body(null, 204);
  });

  app.get("/v1/direct-asks/:id", async (c) => {
    const result = await deps.directAsks.get(c.get("principal"), c.req.param("id"));
    if (!result.ok) refused(result.error);
    return c.json({ ...viewOf(result.value.ask), kept_link: result.value.keptLink ?? null });
  });

  app.post("/v1/direct-asks/:id/share", async (c) => {
    const body = bodyOf(c.get("rawBody"));
    if (typeof body["link"] !== "string") {
      throw new HttpError("invalid_event", "Send the share `link` Tailscale gave you.");
    }
    const result = await deps.directAsks.share(c.get("principal"), {
      id: c.req.param("id"),
      link: body["link"],
      keep: body["keep"] === true,
    });
    if (!result.ok) refused(result.error);
    return c.json(viewOf(result.value));
  });
}
