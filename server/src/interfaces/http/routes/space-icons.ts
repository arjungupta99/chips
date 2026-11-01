/**
 * The faces a person chose for their spaces (21 September 2026).
 *
 * `GET /v1/me/space-icons` reads the caller's, `PUT /v1/me/space-icons/:spaceId` sets one and
 * `DELETE` puts it back to the default. All three are the person's own: no route reads or
 * writes another person's, an owner's or admin's included, for the same reason the notification
 * settings beside them are private (Gate 5).
 *
 * A face is set for a space the caller can actually see. Without that check the table would
 * take a row for any id at all, which is a small write amplification and a way to learn that an
 * id exists; with it, an icon for a room you are not in is a `not_found` like any other.
 */

import { parseSpaceIcon } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "A space's face is a person's own.");
  }
  return principal;
}

export function registerSpaceIconRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/space-icons", async (c) => {
    const me = person(c.get("principal"));
    const icons = await deps.spaceIcons.forPerson(me.workspaceId, me.participantId);
    return c.json({ icons });
  });

  app.put("/v1/me/space-icons/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    let raw: unknown;
    try {
      raw = JSON.parse(c.get("rawBody"));
    } catch {
      throw new HttpError("invalid_event", "The body is not JSON.");
    }
    const parsed = parseSpaceIcon(raw);
    if (!parsed.ok) throw new HttpError("invalid_event", `Not a face: ${parsed.message}`);
    await deps.spaceIcons.set({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
      icon: parsed.value,
      at: deps.clock.nowIso(),
    });
    return c.json({ icon: parsed.value });
  });

  app.delete("/v1/me/space-icons/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    await deps.spaceIcons.clear({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
    });
    return c.body(null, 204);
  });
}

/** A room the caller is in, or a `not_found` that says nothing about whether it exists. */
async function seen(deps: GatewayDeps, me: Principal, spaceId: string): Promise<void> {
  const role = await deps.readModels.memberRole(me.workspaceId, spaceId, me.participantId);
  if (role === undefined) throw new HttpError("not_found", "No such space.");
}
