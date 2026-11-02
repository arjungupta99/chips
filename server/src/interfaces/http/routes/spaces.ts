/**
 * `DELETE /v1/spaces/:id` erases a space (ADR 0067): its events, its rows, its files and its
 * search entries go from the server for everyone, and every device is sent the `space.erased`
 * that says so. The use case says who may; this turns its answer into HTTP.
 *
 * `GET /v1/spaces/:id/context` is a harness's read of a room it is in (ADR 0088): its lines, a page
 * at a time, older than a cursor, and the room's files as they are now. A person reads the room
 * itself.
 *
 * `GET /v1/spaces/:id/files` is the room's files at their current version, newest first (ADR 0099),
 * for anybody in the room: a harness with a URL for its own token to fetch each at, a person by id.
 * With `?name=`, it is that name's versions, newest first, each with what it was made from (ADR
 * 0100): what a person's Files opens an older version from.
 *
 * Archiving is not here. It is `space.updated` with `state: "closed"`, an event like any other,
 * sent the way every other change to a room is.
 */

import { CONTEXT_BUDGET, ROOM_FILES_CEILING } from "@chipschat/protocol";
import type { Context, Hono } from "hono";
import { shown, sightOf } from "../../../application/harness-sight.js";
import type { Principal } from "../../../application/index.js";
import { contextPage, type Lookup } from "../../../application/room-context.js";
import { fileVersionsFor, roomFilesFor, type Signer } from "../../../application/room-files.js";
import { harnessGrant } from "../../../infrastructure/attachments/signing.js";
import { requestArrivedAt } from "../arrived-at.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

/** Who somebody is now, read once per request: their kind and name. */
function lookupIn(deps: GatewayDeps, workspaceId: string): Lookup {
  const known = new Map<string, { kind: string; name: string } | undefined>();
  return async (id) => {
    if (!known.has(id)) {
      const found = await deps.readModels.participant(workspaceId, id);
      known.set(id, found && { kind: found.kind, name: found.display_name });
    }
    return known.get(id);
  };
}

/**
 * The URL a harness may fetch each of a room's files at, for its own token, as on the socket; a
 * person fetches by id, with a request it signs. A harness on this machine is sent to the address
 * it asked at, and one elsewhere to the server's public one.
 */
function signerFor(
  deps: GatewayDeps,
  principal: Principal,
  c: Context<GatewayEnv>,
): Signer | undefined {
  const tokenId = principal.tokenId;
  if (principal.kind !== "harness" || tokenId === undefined) return undefined;
  const base = requestArrivedAt(c) ?? deps.config.server.publicUrl ?? new URL(c.req.url).origin;
  return (attachmentId) =>
    harnessGrant(base, deps.grants, deps.clock.nowMs(), { attachmentId, tokenId });
}

/** A room the caller is in now, itself or as one of its agents (ADR 0087), or not found. */
async function mustBeIn(deps: GatewayDeps, principal: Principal, spaceId: string): Promise<void> {
  const mine = await deps.readModels.spacesForMember(
    principal.workspaceId,
    principal.participantId,
  );
  if (!mine.includes(spaceId))
    throw new HttpError("not_found", "You are in no space with that id.");
}

/** A positive whole number from the query, or nothing when it is absent. */
function cursorOf(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError("invalid_frame", `\`${name}\` is a whole number, 1 or more.`);
  }
  return parsed;
}

/** Whether the room's one agent goes too (ADR 0087, rule 5): `{delete_agent: true}`, or nothing. */
function readEraseBody(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return false;
  try {
    const body = JSON.parse(raw) as { delete_agent?: unknown };
    return body.delete_agent === true;
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
}

export function registerSpaceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.delete("/v1/spaces/:id", async (c) => {
    const spaceId = c.req.param("id");
    const began = performance.now();
    const result = await deps.eraseSpace({
      principal: c.get("principal"),
      spaceId,
      deleteAgent: readEraseBody(c.get("rawBody")),
    });
    if (!result.ok) {
      const { kind, message } = result.error;
      if (kind === "not_allowed") throw new HttpError("forbidden", message);
      if (kind === "unknown_space") throw new HttpError("not_found", message);
      throw new HttpError("invalid_event", message);
    }
    const { eventId, erased, files, rebuilt } = result.value;
    const ms = Math.round(performance.now() - began);
    c.get("logger").info({ spaceId, erased: erased.length, files, rebuilt, ms }, "space erased");
    return c.json({ event_id: eventId, erased, files });
  });

  app.get("/v1/spaces/:id/context", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "harness") {
      throw new HttpError(
        "forbidden",
        "A harness reads a space's lines here; a person reads the space.",
      );
    }
    const spaceId = c.req.param("id");
    const { workspaceId } = principal;
    // A room it is in now, and no other: a room it is not in is no room of its (ADR 0088).
    await mustBeIn(deps, principal, spaceId);
    const before =
      cursorOf(c.req.query("before"), "before") ?? (await deps.store.head(workspaceId)) + 1;
    const limit = cursorOf(c.req.query("limit"), "limit") ?? CONTEXT_BUDGET.lines;
    const context = await contextPage({
      readModels: deps.readModels,
      workspaceId,
      spaceId,
      before,
      limit,
      lookup: lookupIn(deps, workspaceId),
      sign: signerFor(deps, principal, c),
    });
    return c.json(shown(context, await sightOf(deps.readModels, principal)));
  });

  app.get("/v1/spaces/:id/files", async (c) => {
    const principal = c.get("principal");
    const spaceId = c.req.param("id");
    await mustBeIn(deps, principal, spaceId);
    const room = {
      readModels: deps.readModels,
      workspaceId: principal.workspaceId,
      spaceId,
      lookup: lookupIn(deps, principal.workspaceId),
      most: ROOM_FILES_CEILING,
      sign: signerFor(deps, principal, c),
    };
    const name = c.req.query("name");
    const files =
      name === undefined ? await roomFilesFor(room) : await fileVersionsFor({ ...room, name });
    return c.json(shown({ files }, await sightOf(deps.readModels, principal)));
  });
}
