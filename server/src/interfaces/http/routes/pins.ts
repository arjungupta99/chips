/**
 * Which visit a person's messages go to, per space (ADR 0040).
 *
 * `GET /v1/me/pins` answers every pin this person holds, so a client that has just connected
 * fills in one read. `PUT /v1/me/pins/:spaceId` pins a visit and `DELETE` lets it go, back to
 * whichever the harness would have chosen. All three are the person's own: no route reads or
 * writes another person's, an owner's and an admin's included (ADR 0037, decision 1).
 *
 * A ref is checked against the space before it is kept, for the same reason `message.post`
 * checks it: a pin nothing answers to would send messages somewhere the person did not mean.
 */

import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "A pin is a person's, not a harness's.");
  }
  return principal;
}

function readRef(raw: string): string {
  let body: { session_ref?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const ref = body.session_ref;
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 500) {
    throw new HttpError("invalid_event", "Send a `session_ref`.");
  }
  return ref;
}

export function registerPinRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/pins", async (c) => {
    const me = person(c.get("principal"));
    const pins = await deps.sessionPins.pins(me.workspaceId, me.participantId);
    return c.json({
      pins: pins.map((pin) => ({ space_id: pin.spaceId, session_ref: pin.sessionRef })),
    });
  });

  app.put("/v1/me/pins/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    const sessionRef = readRef(c.get("rawBody"));
    const known = await deps.readModels.sessionInSpace(me.workspaceId, spaceId, sessionRef);
    if (!known) {
      throw new HttpError("not_found", "That session is not one of this space's.");
    }
    await deps.sessionPins.pin({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
      sessionRef,
      at: deps.clock.nowIso(),
    });
    return c.json({ space_id: spaceId, session_ref: sessionRef });
  });

  app.delete("/v1/me/pins/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    await deps.sessionPins.unpin({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId: c.req.param("spaceId"),
    });
    return c.json({ space_id: c.req.param("spaceId"), session_ref: null });
  });
}
