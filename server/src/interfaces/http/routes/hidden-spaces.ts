/**
 * The rooms a person hid from their own list (19 October 2026, ADR 0205).
 *
 * `GET /v1/me/hidden-spaces` reads the caller's, `PUT /v1/me/hidden-spaces/:spaceId` hides one and
 * `DELETE` puts it back on the list. All three are the person's own: no route reads or writes
 * another person's, an owner's or an admin's included, as their faces for rooms are theirs (Gate 5).
 *
 * A room is hidden only by somebody in it. Without that check the table would take a row for any
 * id at all, and say that an id exists; with it, a room you are not in is a `not_found` like any
 * other.
 */

import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "A hidden space is a person's own.");
  }
  return principal;
}

export function registerHiddenSpaceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/hidden-spaces", async (c) => {
    const me = person(c.get("principal"));
    const spaces = await deps.hiddenSpaces.forPerson(me.workspaceId, me.participantId);
    return c.json({ spaces });
  });

  app.put("/v1/me/hidden-spaces/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    await deps.hiddenSpaces.hide({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
      at: deps.clock.nowIso(),
    });
    return c.body(null, 204);
  });

  app.delete("/v1/me/hidden-spaces/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    await deps.hiddenSpaces.unhide({
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
