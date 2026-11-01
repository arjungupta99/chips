/**
 * What a room allows a job, and what its job has spent (ADR 0117).
 *
 * - `GET /v1/spaces/:id/spend`: the job's spend against the room's ceiling, as of now, for anybody
 *   in the room: the same shape a harness is handed as `context.spend` with a message.
 * - `POST /v1/spaces/:id/spend-ceiling {usd: number | null}`: the workspace's owner, in the room,
 *   sets what it allows a job (ADR 0196), from 0.25 to 100 in steps of 0.25, or `null` for the
 *   default.
 *   Setting what it is already changes nothing.
 */

import type { Hono } from "hono";
import type { SpendCeilingRefusal } from "../../../application/index.js";
import { roomSpendFor } from "../../../application/room-spend.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown_space: "not_found",
  out_of_range: "invalid_event",
} as const;

function readUsd(raw: string | undefined): number | null {
  let body: unknown;
  try {
    body = raw === undefined || raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const usd =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["usd"]
      : undefined;
  if (usd === null || (typeof usd === "number" && Number.isFinite(usd))) return usd;
  throw new HttpError(
    "invalid_event",
    "Say what a job may spend as `usd`, or `null` for the default.",
  );
}

export function registerSpendRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/spaces/:id/spend", async (c) => {
    const principal = c.get("principal");
    const spaceId = c.req.param("id");
    const mine = await deps.readModels.spacesForMember(
      principal.workspaceId,
      principal.participantId,
    );
    if (!mine.includes(spaceId))
      throw new HttpError("not_found", "You are in no space with that id.");
    const spend = await roomSpendFor({
      readModels: deps.readModels,
      workspaceId: principal.workspaceId,
      spaceId,
    });
    return c.json({ space_id: spaceId, ...spend });
  });

  app.post("/v1/spaces/:id/spend-ceiling", async (c) => {
    const spaceId = c.req.param("id");
    const usd = readUsd(c.get("rawBody"));
    const result = await deps.setSpendCeiling({ principal: c.get("principal"), spaceId, usd });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) {
      c.get("logger").info({ spaceId, usd: result.usd }, "what a space allows a job set");
    }
    return c.json({ space_id: spaceId, usd: result.usd, changed: result.changed });
  });
}

function refusal(error: SpendCeilingRefusal): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
