/**
 * What a room allows a job, and what its job has spent (ADR 0117).
 *
 * - `GET /v1/spaces/:id/spend`: the job's spend against the room's ceiling, as of now, for anybody
 *   in the room: the same shape a harness is handed as `context.spend` with a message, and with it
 *   what began the job, the jobs before it that spent, and the room's total (ADR 0282).
 * - `POST /v1/spaces/:id/spend-ceiling {usd: number | null, carry_on?: true}`: the workspace's
 *   owner, in the room, sets what it allows a job (ADR 0196), from 0.25 to 100 in steps of 0.25, or
 *   `null` for the default. Setting what it is already changes nothing. With `carry_on`, the
 *   agents Chips held at the ceiling carry on as well, in the same request, so the room hears both
 *   at once (ADR 0282).
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

function readBody(raw: string | undefined): {
  readonly usd: number | null;
  readonly carryOn: boolean;
} {
  let body: unknown;
  try {
    body = raw === undefined || raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const usd = fields["usd"];
  const carryOn = fields["carry_on"] === true;
  if (usd === null || (typeof usd === "number" && Number.isFinite(usd))) return { usd, carryOn };
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
    const [spend, history] = await Promise.all([
      roomSpendFor({ readModels: deps.readModels, workspaceId: principal.workspaceId, spaceId }),
      deps.readModels.spendHistoryOf(principal.workspaceId, spaceId),
    ]);
    return c.json({ space_id: spaceId, ...spend, ...history });
  });

  app.post("/v1/spaces/:id/spend-ceiling", async (c) => {
    const spaceId = c.req.param("id");
    const principal = c.get("principal");
    const { usd, carryOn } = readBody(c.get("rawBody"));
    const result = await deps.setSpendCeiling({ principal, spaceId, usd });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) {
      c.get("logger").info({ spaceId, usd: result.usd }, "what a space allows a job set");
    }
    // Carrying on is a person acting in the room, as the banner's other button is: the owner who
    // may set the ceiling may always let the agents go on. Agents that are not held are not told
    // to carry on, which would say so in the room for nothing.
    const held =
      carryOn && (await deps.readModels.exchangeOf(principal.workspaceId, spaceId)).paused;
    const going = held ? await deps.setExchange({ principal, spaceId, state: "going" }) : undefined;
    return c.json({
      space_id: spaceId,
      usd: result.usd,
      changed: result.changed,
      carried_on: going?.ok === true && going.changed,
    });
  });
}

function refusal(error: SpendCeilingRefusal): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
