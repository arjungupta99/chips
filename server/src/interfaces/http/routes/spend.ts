/**
 * What a room allows a job, and what its job has spent (ADR 0117).
 *
 * - `GET /v1/spaces/:id/spend`: the job's spend against the room's ceiling, as of now, for anybody
 *   in the room: the same shape a harness is handed as `context.spend` with a message, and with it
 *   what began the job, the jobs before it that spent, and the room's total (ADR 0282).
 * - `GET /v1/spaces/:id/spend/jobs?before=<since_seq>&limit=<n>`: those jobs a page at a time,
 *   newest first, for anybody in the room (ADR 0292 addendum): `{space_id, jobs, next?}`.
 * - `POST /v1/spaces/:id/spend-ceiling {usd: number | null | "none", carry_on?: true}`: the
 *   workspace's owner, in the room, sets what it allows a job (ADR 0196), from 0.25 to 1000 in
 *   steps of 0.25, `null` for the default, or `"none"` to take the cap off (ADR 0292). Setting
 *   what it is already changes nothing. With `carry_on`, the agents Chips held at the ceiling carry
 *   on as well, in the same request, so the room hears both at once (ADR 0282).
 */

import {
  NO_SPEND_CEILING,
  SPENT_JOBS_PAGE,
  SPENT_JOBS_PAGE_MAX,
  type SpendCeilingSetting,
} from "@chipschat/protocol";
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
  readonly usd: SpendCeilingSetting;
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
  if (usd === null || usd === NO_SPEND_CEILING || (typeof usd === "number" && Number.isFinite(usd)))
    return { usd, carryOn };
  throw new HttpError(
    "invalid_event",
    'Say what a job may spend as `usd`, `null` for the default, or `"none"` for No cap.',
  );
}

/** A whole number from a query, within bounds; nothing when it was not said. */
function counted(raw: string | undefined, name: string, most: number): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > most) {
    throw new HttpError("invalid_event", `Say \`${name}\` as a whole number from 1 to ${most}.`);
  }
  return n;
}

export function registerSpendRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  /** That this person is in the room, or `not_found` as for a room that is not there. */
  async function inRoom(
    principal: { workspaceId: string; participantId: string },
    spaceId: string,
  ) {
    const mine = await deps.readModels.spacesForMember(
      principal.workspaceId,
      principal.participantId,
    );
    if (!mine.includes(spaceId))
      throw new HttpError("not_found", "You are in no space with that id.");
  }

  app.get("/v1/spaces/:id/spend/jobs", async (c) => {
    const principal = c.get("principal");
    const spaceId = c.req.param("id");
    await inRoom(principal, spaceId);
    const before = counted(c.req.query("before"), "before", Number.MAX_SAFE_INTEGER);
    const limit = counted(c.req.query("limit"), "limit", SPENT_JOBS_PAGE_MAX) ?? SPENT_JOBS_PAGE;
    const page = await deps.readModels.spentJobsOf(principal.workspaceId, spaceId, {
      before,
      limit,
    });
    return c.json({ space_id: spaceId, ...page });
  });

  app.get("/v1/spaces/:id/spend", async (c) => {
    const principal = c.get("principal");
    const spaceId = c.req.param("id");
    await inRoom(principal, spaceId);
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
