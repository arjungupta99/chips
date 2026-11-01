/**
 * Hooks-mode ingest.
 *
 * This is the "three curl lines" path from the blueprint: a harness with lifecycle hooks makes
 * one HTTP call per hook and never opens a socket. Both routes are the same use case with the
 * run supplied differently — in the path for a run's events, in the body for a harness's.
 */

import type { Hono } from "hono";
import { shown, shows, sightOf } from "../../../application/harness-sight.js";
import { heldOf } from "../../../application/index.js";
import type { Principal } from "../../../application/ports/identity.js";
import type { ParticipantView } from "../../../application/ports/index.js";
import { seesEveryAgent, seesWholeDirectory } from "../../../domain/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

/** Turn a use-case failure into the right envelope. The mapping lives here, at the edge. */
function refuse(error: {
  kind: string;
  message: string;
  issues?: readonly { path: string; message: string }[];
}): never {
  switch (error.kind) {
    case "invalid":
      throw new HttpError("invalid_event", error.message, error.issues);
    case "not_submittable":
    case "wrong_workspace":
    case "wrong_actor":
    case "wrong_direction":
    case "wrong_space":
    case "wrong_run":
    case "wrong_role":
    case "not_the_opener":
    case "not_an_approver":
    case "guest_elsewhere":
    case "agent_elsewhere":
    case "lead_room":
    case "agent_archived":
    case "room_closed":
      throw new HttpError("forbidden", error.message);
    case "stale_file":
      // Made from a version of the room's file that is no longer current (ADR 0099): its own
      // code, so an adapter can post the words again without the file, and say why.
      throw new HttpError("stale_file", error.message);
    case "unknown_run":
    case "unknown_space":
    case "unknown_participant":
    case "unknown_message":
      throw new HttpError("not_found", error.message);
    default:
      // `run_state`, `wrong_message`, a missing key: the event is well formed and, here and
      // now, not valid.
      throw new HttpError("invalid_event", error.message);
  }
}

/** The lane an event is about, for the log line: a task's, or a lane event's. */
function laneIdOf(event: {
  readonly payload: Readonly<Record<string, unknown>>;
}): string | undefined {
  const id = event.payload["lane_id"] ?? event.payload["task_id"];
  return typeof id === "string" ? id : undefined;
}

/** A page holds between one and a thousand events; anything else asked for is clamped. */
const DEFAULT_PAGE = 500;
const MAX_PAGE = 1000;
function pageSize(requested: string | undefined): number {
  const parsed = Number.parseInt(requested ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE;
  return Math.min(Math.max(parsed, 1), MAX_PAGE);
}

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
}

/**
 * An agent's last room, and the room an archive took it from, only while that room is still
 * there (agents review, finding 11): a deleted room is nothing a card should name, and "a room
 * you're not in" is what a card says of an id it cannot find.
 */
async function stillThere(
  deps: GatewayDeps,
  workspaceId: string,
  participants: readonly ParticipantView[],
): Promise<(each: ParticipantView) => ParticipantView> {
  const named = participants.flatMap((each) =>
    [each.last_space_id, each.released_from].filter((id): id is string => typeof id === "string"),
  );
  const there = await deps.readModels.spacesAmong(workspaceId, [...new Set(named)]);
  const gone = (id: string | null | undefined) => typeof id === "string" && !there.has(id);
  return (each) => ({
    ...each,
    ...(gone(each.last_space_id) ? { last_space_id: null } : {}),
    ...(gone(each.released_from) ? { released_from: null } : {}),
  });
}

/**
 * Who a caller is told is here (M3.3, ADR 0034). An owner or admin is told everybody. Anybody else
 * who is a person is told every person, or, as a guest, whoever is or was in their rooms; and of
 * the agents, those that are or were in their rooms and those of a harness they own, with the
 * harness behind each (his call of 19 October 2026, ADR 0034's addendum). An agent that has left
 * one of their rooms is named so what it said there keeps its name; the apps list only the ones
 * with them now. A harness is told whom it shares a room with, the same scope as its reads.
 */
async function directoryFor(
  deps: GatewayDeps,
  principal: Principal,
): Promise<readonly ParticipantView[]> {
  const { workspaceId, participantId } = principal;
  if (principal.kind !== "person") {
    return deps.readModels.participantsVisibleTo(workspaceId, participantId);
  }
  const everyone = await deps.readModels.participantsIn(workspaceId);
  if (seesEveryAgent(principal.role)) return everyone;
  const met = new Set(await deps.readModels.participantsMet(workspaceId, participantId));
  const people = seesWholeDirectory(principal.role);
  // A harness's agents are its owner's, and so is the harness (ADR 0023).
  const owned = (each: ParticipantView) => each.owner_id === participantId;
  const agents = everyone.filter(
    (each) => each.kind === "agent" && (met.has(each.id) || owned(each)),
  );
  const behind = new Set(agents.map((each) => each.harness_id));
  const known = new Set(agents.map((each) => each.id));
  return everyone.filter((each) => {
    if (each.kind === "agent") return known.has(each.id);
    if (each.kind === "harness") return behind.has(each.id) || owned(each) || met.has(each.id);
    return people || met.has(each.id);
  });
}

export function registerEventRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  /** Events that belong to a run, with the run in the path so a hook script need not repeat it. */
  app.post("/v1/runs/:runId/events", async (c) => {
    const result = await deps.submitEvent({
      event: parseBody(c.get("rawBody")),
      principal: c.get("principal"),
      runId: c.req.param("runId"),
      idempotencyKey: c.req.header("idempotency-key"),
    });
    if (!result.ok) refuse(result.error);

    const { event, duplicate, resolution, lane, held } = result.value;
    c.get("logger").info(
      { type: event.type, seq: event.seq, duplicate, runId: event.run_id, laneId: laneIdOf(event) },
      "event appended",
    );
    return c.json(
      {
        event_id: event.id,
        seq: event.seq,
        duplicate,
        // A hook that just posted an approval needs the id to wait on, and computing it
        // client-side would mean two sources of truth for it.
        ...(event.type === "approval.request" ? { approval_id: event.payload["approval_id"] } : {}),
        // And when policy decided on the spot, the answer, so a hook need not even wait.
        ...(resolution === undefined
          ? {}
          : { resolution: resolution.payload["decision"], reason: resolution.payload["reason"] }),
        // A task that opened a lane: where it is, so a lead driving it knows where to post.
        ...(lane === undefined ? {} : { lane }),
        // A message held from the agents it named (ADR 0097), so the sender can say so.
        ...heldOf(held),
      },
      duplicate ? 200 : 201,
    );
  });

  /** Events that belong to a harness rather than to one run: a message, a policy acknowledgement. */
  app.post("/v1/harnesses/:harnessId/events", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "harness" || principal.participantId !== c.req.param("harnessId")) {
      throw new HttpError("forbidden", "A harness may only post its own events.");
    }

    const result = await deps.submitEvent({
      event: parseBody(c.get("rawBody")),
      principal,
      idempotencyKey: c.req.header("idempotency-key"),
    });
    if (!result.ok) refuse(result.error);

    const { event, duplicate, lane, held } = result.value;
    c.get("logger").info(
      { type: event.type, seq: event.seq, duplicate, runId: event.run_id, laneId: laneIdOf(event) },
      "event appended",
    );
    return c.json(
      {
        event_id: event.id,
        seq: event.seq,
        duplicate,
        ...(lane === undefined ? {} : { lane }),
        ...heldOf(held),
      },
      duplicate ? 200 : 201,
    );
  });

  /** The audit read, and the resume path for a client that has no socket. */
  app.get("/v1/events", async (c) => {
    const since = Number.parseInt(c.req.query("since") ?? "0", 10);
    if (!Number.isFinite(since) || since < 0) {
      throw new HttpError("invalid_frame", "`since` is a sequence number, and starts at zero.");
    }
    const limit = pageSize(c.req.query("limit"));

    const principal = c.get("principal");
    // The read sees the spaces this credential belongs to, and nothing else
    // (phase-0-review finding 6). One of them may be asked for on its own: a client added to a
    // space while it was connected reads that space's history this way (M3.3).
    const mine = await deps.readModels.spacesForMember(
      principal.workspaceId,
      principal.participantId,
    );
    const wanted = c.req.query("space_id");
    const spaces = wanted === undefined ? mine : mine.filter((id) => id === wanted);
    if (wanted !== undefined && spaces.length === 0) {
      return c.json({ events: [], next_cursor: null });
    }
    // A harness reads as it is shown things on its socket (ADR 0087's addendum).
    const sight = await sightOf(deps.readModels, principal);
    const page = await deps.store.since(principal.workspaceId, since, limit, {
      spaces,
      participantId: principal.participantId,
      alsoIs: [...sight.agents],
      seesDirectory: principal.kind === "person" && seesWholeDirectory(principal.role),
      seesAgents: principal.kind === "person" && seesEveryAgent(principal.role),
    });
    return c.json({
      events: page.events
        .filter((each) => shows(each.type, sight))
        .map((each) => shown(each.payload, sight)),
      next_cursor: page.nextCursor,
    });
  });

  /**
   * Who ids are (`directoryFor`). A person who is not a guest is told every person — they add
   * people to rooms, and cannot add whom they cannot name (M3.3) — and an owner or admin every
   * agent too; a harness only whom it shares a space with, the same scope as its reads. A guest
   * of the workspace is told what a harness is (ADR 0034): a vendor in one room has no business
   * with the staff list.
   */
  app.get("/v1/participants", async (c) => {
    const principal = c.get("principal");
    const participants = await directoryFor(deps, principal);
    const there = await stillThere(deps, principal.workspaceId, participants);
    // Whether each harness here can answer now (ADR 0083): live, beside what the registry holds.
    // An agent can answer when its harness can (ADR 0087).
    // An agent's own state, active or archived, goes as `agent_state` (ADR 0087), since `state`
    // is whether it can answer.
    const stated = participants.map(there).map((each) => {
      const harness = each.kind === "agent" ? each.harness_id : each.id;
      const own = each.kind === "agent" ? { agent_state: each.state ?? "active" } : {};
      return (each.kind === "harness" || each.kind === "agent") &&
        each.removed_at === null &&
        harness !== undefined
        ? { ...each, ...own, state: deps.presence.stateOf(principal.workspaceId, harness) }
        : { ...each, ...own };
    });
    const sight = await sightOf(deps.readModels, principal);
    if (sight.legacy === undefined) return c.json({ participants: stated });
    // A harness that has not learnt agents knows its own as itself: one entry, its own, where
    // the first of them was.
    const self = await deps.readModels.participant(principal.workspaceId, principal.participantId);
    const mine = (each: { id: string }) =>
      sight.agents.has(each.id) || each.id === principal.participantId;
    const at = stated.findIndex(mine);
    const others = stated.filter((each) => !mine(each));
    const cut = at < 0 ? others.length : at;
    const listed: readonly (ParticipantView | (typeof stated)[number])[] =
      self === undefined ? others : [...others.slice(0, cut), self, ...others.slice(cut)];
    return c.json({ participants: shown(listed, sight) });
  });
}
