/**
 * The owner's relay switch (ADR 0211, Phase 4).
 *
 * - `GET /v1/relay` — whether a relay is set up and on, which (`url`: the one `CHIPS_RELAY_URL`
 *   names, or Chips's, ADR 0245), whether the server is connected to it (`status`) and why not
 *   while it is on and isn't (`why`), who turned it last and when, every device
 *   of the workspace with its way in (`now`, the way its socket goes now; `last_via`, the way its
 *   newest came; `direct_at`, when it last came other than through the relay), and the share link
 *   kept for the next guest (Phase 3).
 * - `PUT /v1/relay` — `{ on }`. Off: every device connected is told (`relay.set`), then the link
 *   goes; new invite and pairing links open only on the server's own network. A server with no
 *   relay set up refuses it (`422`, `refusal: "invalid"`).
 * - `POST /v1/relay/ask` — a push to the people whose devices came through the relay last, to go
 *   direct first: `{ asked }`, how many people.
 *
 * An owner's, all three.
 */

import type { Hono } from "hono";
import type { RelayRefusal, RelayView } from "../../../application/use-cases/relay-switch.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function viewOf(view: RelayView) {
  return {
    configured: view.configured,
    url: view.url,
    on: view.on,
    status: view.status,
    why: view.why,
    set_by: view.setBy,
    set_at: view.setAt,
    devices: view.devices.map((device) => ({
      device_id: device.deviceId,
      participant_id: device.participantId,
      name: device.name,
      now: device.now,
      last_via: device.lastVia,
      last_via_at: device.lastViaAt,
      direct_at: device.directAt,
    })),
    kept_link: view.keptLink ?? null,
  };
}

function refused(error: RelayRefusal): never {
  if (error.kind === "not_allowed") throw new HttpError("forbidden", error.message);
  throw new HttpError("invalid_event", error.message, undefined, undefined, error.kind);
}

export function registerRelayRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/relay", async (c) => {
    const result = await deps.relaySwitch.view(c.get("principal"));
    if (!result.ok) refused(result.error);
    return c.json(viewOf(result.value));
  });

  app.put("/v1/relay", async (c) => {
    let on: unknown;
    try {
      on = (JSON.parse(c.get("rawBody") || "{}") as { on?: unknown }).on;
    } catch {
      on = undefined;
    }
    if (typeof on !== "boolean")
      throw new HttpError("invalid_event", "Send `{ on }`, true or false.");
    const result = await deps.relaySwitch.set(c.get("principal"), on);
    if (!result.ok) refused(result.error);
    return c.json(viewOf(result.value));
  });

  app.post("/v1/relay/ask", async (c) => {
    const result = await deps.relaySwitch.ask(c.get("principal"));
    if (!result.ok) refused(result.error);
    return c.json(result.value);
  });
}
