/**
 * The rooms a person pinned to the top of their own list (27 October 2026, ADR 0240).
 *
 * `GET /v1/me/pinned-spaces` reads the caller's, the newest pin first, `PUT
 * /v1/me/pinned-spaces/:spaceId` pins one and `DELETE` unpins it. All three are the person's own,
 * as the rooms they hid are (ADR 0205): no route reads or writes another person's, an owner's or
 * an admin's included.
 *
 * A room is pinned only by somebody in it. Without that check the table would take a row for any
 * id at all, and say that an id exists; with it, a room you are not in is a `not_found` like any
 * other.
 */

import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "A pinned space is a person's own.");
  }
  return principal;
}

export function registerPinnedSpaceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/pinned-spaces", async (c) => {
    const me = person(c.get("principal"));
    const pinned = await deps.pinnedSpaces.forPerson(me.workspaceId, me.participantId);
    return c.json({ spaces: await unarchived(deps, me, pinned) });
  });

  app.put("/v1/me/pinned-spaces/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    await deps.pinnedSpaces.pin({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
      at: deps.clock.nowIso(),
    });
    return c.body(null, 204);
  });

  app.delete("/v1/me/pinned-spaces/:spaceId", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    await deps.pinnedSpaces.unpin({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
    });
    return c.body(null, 204);
  });
}

/**
 * The pins on rooms not archived. One archived without its pins let go (before 4 November 2026,
 * or by a road that does not pass `submitEvent`) is let go as it is read.
 */
async function unarchived(
  deps: GatewayDeps,
  me: Principal,
  pinned: readonly string[],
): Promise<string[]> {
  const kept: string[] = [];
  for (const spaceId of pinned) {
    const space = await deps.readModels.space(me.workspaceId, spaceId);
    if (space?.state === "closed") await deps.pinnedSpaces.forgetSpace(me.workspaceId, spaceId);
    else kept.push(spaceId);
  }
  return kept;
}

/** A room the caller is in, or a `not_found` that says nothing about whether it exists. */
async function seen(deps: GatewayDeps, me: Principal, spaceId: string): Promise<void> {
  const role = await deps.readModels.memberRole(me.workspaceId, spaceId, me.participantId);
  if (role === undefined) throw new HttpError("not_found", "No such space.");
}
