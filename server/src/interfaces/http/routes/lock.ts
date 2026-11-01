/**
 * Whether a room's changes are locked (ADR 0156).
 *
 * - `POST /v1/spaces/:id/lock {locked: boolean}`: a person in the room who is not a guest locks
 *   its changes, so that no person renames, archives or deletes it, or lets them go. Saying what
 *   it is already changes nothing.
 *
 * A person's; never a harness's, whose own rename or close of a room it opened still lands.
 */

import type { Hono } from "hono";
import type { LockRefusal } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown_space: "not_found",
} as const;

function readLocked(raw: string | undefined): boolean {
  let body: unknown;
  try {
    body = raw === undefined || raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const locked =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["locked"]
      : undefined;
  if (typeof locked === "boolean") return locked;
  throw new HttpError("invalid_event", "Say whether the space's changes are locked as `locked`.");
}

export function registerLockRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/spaces/:id/lock", async (c) => {
    const spaceId = c.req.param("id");
    const locked = readLocked(c.get("rawBody"));
    const result = await deps.setLock({ principal: c.get("principal"), spaceId, locked });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) {
      c.get("logger").info(
        { spaceId, locked: result.locked },
        "a space's changes locked or let go",
      );
    }
    return c.json({ space_id: spaceId, locked: result.locked, changed: result.changed });
  });
}

function refusal(error: LockRefusal): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
