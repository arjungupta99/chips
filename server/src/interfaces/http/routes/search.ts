/**
 * Search (M5.4): `GET /v1/search?q=&limit=&cursor=&space_id=`.
 *
 * Messages and receipts with the words in them, newest first, from the spaces the caller is in
 * and nothing else — the same scope as a read of the log. A message's words include what was
 * heard in its voice notes, and a hit that quotes those says `snippet_from: "transcript"`. A page carries a `next_cursor` to
 * carry on from; `space_id` narrows it to one room. The words are matched by SQLite's FTS5,
 * with the last one as a prefix, so a search narrows as it is typed.
 */

import type { Hono } from "hono";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function limitOf(requested: string | undefined): number {
  if (requested === undefined) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(requested, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new HttpError("invalid_event", "`limit` is a count of hits, from one to a hundred.");
  }
  return Math.min(parsed, MAX_LIMIT);
}

export function registerSearchRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/search", async (c) => {
    const text = c.req.query("q");
    if (text === undefined) throw new HttpError("invalid_event", "Send the words as `q`.");
    const limit = limitOf(c.req.query("limit"));
    const principal = c.get("principal");
    const spaces = await deps.readModels.spacesForMember(
      principal.workspaceId,
      principal.participantId,
    );
    const page = await deps.readModels.search(principal.workspaceId, spaces, {
      text,
      limit,
      cursor: c.req.query("cursor"),
      spaceId: c.req.query("space_id"),
    });
    return c.json(page);
  });
}
