/**
 * How far a person has read (3 November 2026, ADR 0262).
 *
 * `GET /v1/me/read` reads the caller's marks, `{ spaces: { <space id>: <seq> } }`, and `PUT
 * /v1/me/read` moves some forward. Each mark that moved goes to the caller's sockets that said
 * `reads`, so their other devices count from it at once. Theirs alone, as the rooms they pinned are
 * (ADR 0240): no route reads or writes another person's.
 *
 * A write is passed over, room by room, rather than refused: a room the caller is not in (a device
 * can hold a mark for a room its person has since left) and a mark not ahead of the one kept. One
 * past the workspace's last `seq` is held to it, so no device can mark a room read ahead of what
 * is yet to be said in it.
 */

import { readMarksBody } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { body } from "./body.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "How far a room is read is a person's own.");
  }
  return principal;
}

export function registerReadMarkRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/read", async (c) => {
    const me = person(c.get("principal"));
    const spaces = await deps.readMarks.forPerson(me.workspaceId, me.participantId);
    return c.json({ spaces });
  });

  app.put("/v1/me/read", async (c) => {
    const me = person(c.get("principal"));
    const { spaces } = body(
      readMarksBody,
      c.get("rawBody"),
      "Send `spaces`: each room's id and the `seq` it is read up to.",
    );
    const [mine, head] = await Promise.all([
      deps.readModels.spacesForMember(me.workspaceId, me.participantId),
      deps.store.head(me.workspaceId),
    ]);
    const theirs = new Set(mine);
    const marks = Object.fromEntries(
      Object.entries(spaces)
        .filter(([spaceId]) => theirs.has(spaceId))
        .map(([spaceId, seq]) => [spaceId, Math.min(seq, head)]),
    );
    const moved = await deps.readMarks.advance({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      marks,
      at: deps.clock.nowIso(),
    });
    if (Object.keys(moved).length > 0) {
      deps.sessions.reads(me.workspaceId, me.participantId, { frame: "read", spaces: moved });
    }
    return c.body(null, 204);
  });
}
