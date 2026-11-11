/**
 * Freezing what was folded.
 *
 * The fold keeps mutable shapes while events arrive; a screen reads immutable ones. Everything
 * here turns the first into the second, once per flush, for the spaces that changed.
 */

import { actorKind, type ClientEvent, harnessOfActor } from "../events.js";
import { buildLanes } from "./lanes.js";
import { buildHarnesses } from "./policy.js";
import { frozenProject } from "./project.js";
import { askHeadline, mayAnswer } from "./readers.js";
import { contextPercentOf, freezeRun } from "./runs.js";
import { freezeSessions } from "./sessions.js";
import { type Building, isGlimpse, type MutableRun, type MutableSpace } from "./state.js";
import type {
  FleetHarness,
  HarnessConnection,
  Lane,
  LaneHop,
  NeedsYouItem,
  Space,
  WorkspaceModel,
} from "./types.js";

export function freeze(state: Building): WorkspaceModel {
  for (const id of state.dirty) {
    if (state.spaces.has(id)) state.frozen.set(id, freezeSpace(state, id));
  }
  state.dirty.clear();
  const spaces = state.order.map((id) => state.frozen.get(id) as Space);
  // Most recent first, which is how the sidebar reads.
  spaces.sort((a, b) => b.lastEventSeq - a.lastEventSeq);
  if (state.audit.length !== state.auditFrozenAt) {
    state.frozenAudit = [...state.audit].sort((a, b) => b.seq - a.seq);
    state.auditFrozenAt = state.audit.length;
  }
  const lanes = buildLanes(state);
  const laneByRun = new Map(
    lanes.filter((lane) => lane.runId !== undefined).map((lane) => [lane.runId as string, lane]),
  );
  const needsYou = buildNeedsYou(state, laneByRun);
  return {
    spaces,
    fleet: buildFleet(state, needsYou, laneByRun),
    needsYou,
    lanes,
    harnesses: buildHarnesses(state),
    connections: buildConnections(state),
    audit: state.frozenAudit,
    people: Object.fromEntries(state.people),
    attachmentCaps: state.caps,
    exchangeLimits: state.exchangeLimits,
    ...(state.relay === undefined ? {} : { relay: state.relay }),
    takenOut: Object.fromEntries(state.takenOut),
  };
}

/** Every harness with a policy: its level, its rules, its budget, and what its runs have cost. */
/** What a harness has sent: the rows of its connection checklist that have lit (M1.6). */
export function noteConnection(state: Building, event: ClientEvent): void {
  if (actorKind(event.actor) !== "harness") return;
  // The harness's checklist, whichever of its agents sent it (ADR 0087).
  const harness = harnessOfActor(event.actor);
  const entry = state.connections.get(harness) ?? { seen: [], lastSeenAt: event.ts };
  if (!entry.seen.includes(event.type)) entry.seen.push(event.type);
  entry.lastSeenAt = event.ts;
  state.connections.set(harness, entry);
}

export function buildConnections(state: Building): Record<string, HarnessConnection> {
  const connections: Record<string, HarnessConnection> = {};
  for (const [harnessId, entry] of state.connections) {
    connections[harnessId] = { harnessId, seen: [...entry.seen], lastSeenAt: entry.lastSeenAt };
  }
  return connections;
}

/**
 * One entry per harness, showing its latest run — the one most recently touched — rather than one
 * entry per run: a harness with a run in each of two spaces is still one harness
 * (phase-1-interim-review finding 8). Beside the run, what the harness is across all of its
 * spaces: how many terminals are open on it, how many spaces it works in, and how much of
 * what is waiting on a person is its (ADR 0024). A harness that has opened a session and run nothing
 * is here as well, because a terminal sitting idle is worth seeing.
 */
export function buildFleet(
  state: Building,
  needsYou: readonly NeedsYouItem[],
  laneByRun: ReadonlyMap<string, Lane>,
): FleetHarness[] {
  const latest = latestRuns(state);
  const { live, seen, spaces } = acrossSpaces(state);
  // Waiting on a person is an ask still open: an approval or a question. The rest of `needsYou`
  // (a finished run to look at, a failure, a checkpoint) was For you's queue, withdrawn in ADR
  // 0065; counted here, a harness's card said "22 waiting on you" for 22 finished runs.
  const waiting = new Map<string, number>();
  // An ask names who asked, an agent (ADR 0087); the card is its harness's.
  const harnessOfRunner = new Map(
    [...state.runs.values()].map((run) => [run.harnessId, run.harness] as const),
  );
  for (const item of needsYou) {
    if (item.harnessId === "" || (item.kind !== "approval" && item.kind !== "question")) continue;
    const harness = harnessOfRunner.get(item.harnessId) ?? item.harnessId;
    waiting.set(harness, (waiting.get(harness) ?? 0) + 1);
  }
  const ids = new Set([...latest.keys(), ...spaces.keys()]);
  return [...ids].map((harnessId) => {
    const run = latest.get(harnessId);
    const lane = run === undefined ? undefined : laneByRun.get(run.runId);
    return {
      harnessId,
      liveSessions: live.get(harnessId) ?? 0,
      sessionCount: seen.get(harnessId) ?? 0,
      spaceCount: spaces.get(harnessId)?.size ?? 0,
      needsYou: waiting.get(harnessId) ?? 0,
      workingFor: lane?.leadId,
      spaceId: run?.spaceId,
      runId: run?.runId,
      status: run?.state,
      paused: run?.paused ?? false,
      pausable: run?.pausable === true,
      statusVerb: run?.statusVerb,
      contextPercent: run === undefined ? undefined : contextPercentOf(run),
    };
  });
}

export function latestRuns(state: Building): Map<string, MutableRun> {
  const latest = new Map<string, MutableRun>();
  for (const run of state.runs.values()) {
    if (run.harness === "") continue;
    const shown = latest.get(run.harness);
    if (shown === undefined || run.lastSeq > shown.lastSeq) latest.set(run.harness, run);
  }
  return latest;
}

/** Per harness: how many visits are open, and which spaces it has been seen working in. */
export function acrossSpaces(state: Building): {
  live: Map<string, number>;
  seen: Map<string, number>;
  spaces: Map<string, Set<string>>;
} {
  const live = new Map<string, number>();
  const seen = new Map<string, number>();
  const spaces = new Map<string, Set<string>>();
  const worksIn = (harnessId: string, spaceId: string) => {
    if (harnessId === "" || spaceId === "") return;
    const seen = spaces.get(harnessId) ?? new Set<string>();
    seen.add(spaceId);
    spaces.set(harnessId, seen);
  };
  for (const space of state.spaces.values()) {
    for (const session of space.sessions.values()) {
      if (session.harness === "") continue;
      worksIn(session.harness, space.id);
      seen.set(session.harness, (seen.get(session.harness) ?? 0) + 1);
      if (session.endedAt === undefined) {
        live.set(session.harness, (live.get(session.harness) ?? 0) + 1);
      }
    }
  }
  for (const run of state.runs.values()) worksIn(run.harness, run.spaceId);
  return { live, seen, spaces };
}

/**
 * The three tiers, from what is in the log: pending approvals and questions with no default
 * are Decide now; questions with a default, and runs that have ended, are Review today;
 * checkpoints are FYI. A screen decides what is read from its own read state.
 */
export function buildNeedsYou(
  state: Building,
  laneByRun: ReadonlyMap<string, Lane>,
): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const run of state.runs.values()) {
    const lane = laneByRun.get(run.runId);
    const trail = lane?.trail;
    const room = state.spaces.get(run.spaceId);
    const outside = room !== undefined && isGlimpse(state, room);
    const own = [...asksOf(run, trail, state.selfId, outside), ...endOf(run, trail)];
    const label = lane?.label;
    items.push(...(label === undefined ? own : own.map((item) => ({ ...item, laneLabel: label }))));
  }
  for (const space of state.spaces.values()) {
    items.push(...checkpointsOf(space));
  }
  return items;
}

/**
 * A run's open asks: approvals to decide, questions to decide or to review. An approval that is
 * somebody else's to answer is not in this reader's queue (M3.3); the card in the room says so.
 */
export function asksOf(
  run: MutableRun,
  trail: readonly LaneHop[] | undefined,
  selfId: string | undefined,
  outside = false,
): NeedsYouItem[] {
  const base = {
    spaceId: run.spaceId,
    runId: run.runId,
    harnessId: run.harnessId,
    ...(trail === undefined ? {} : { trail }),
    ...(outside ? { outside: true as const } : {}),
  };
  const approvals = run.approvals
    .filter((approval) => approval.resolved === undefined)
    .filter((approval) => selfId === undefined || mayAnswer(approval, selfId))
    .map(
      (approval): NeedsYouItem => ({
        ...base,
        kind: "approval",
        tier: "decide",
        id: approval.approvalId,
        title: askHeadline(approval),
        seq: run.lastSeq,
        expiresAt: approval.expiresAt,
      }),
    );
  const questions = run.questions
    .filter((question) => question.answered === undefined)
    .map((question): NeedsYouItem => {
      const hasDefault = question.questions.some((each) => each.defaultValue !== undefined);
      return {
        ...base,
        kind: "question",
        tier: hasDefault ? "review" : "decide",
        id: question.askId,
        title: question.questions[0]?.prompt ?? "A question",
        seq: run.lastSeq,
        expiresAt: question.timeoutAt,
      };
    });
  return [...approvals, ...questions];
}

/** A run that has ended, to review: what it did, or what it left undone. */
export function endOf(run: MutableRun, trail: readonly LaneHop[] | undefined): NeedsYouItem[] {
  if (run.state !== "done" && run.state !== "failed") return [];
  return [
    {
      kind: run.state === "done" ? "summary" : "failure",
      tier: "review",
      id: run.runId,
      spaceId: run.spaceId,
      runId: run.runId,
      harnessId: run.harnessId,
      title: (run.state === "done" ? run.summary : run.error) ?? run.goal,
      seq: run.lastSeq,
      ...(trail === undefined ? {} : { trail }),
    },
  ];
}

export function checkpointsOf(space: MutableSpace): NeedsYouItem[] {
  return space.checkpoints.map((line) => ({
    kind: "checkpoint",
    tier: "fyi",
    id: line.id,
    spaceId: space.id,
    runId: line.runId,
    harnessId: line.authorId,
    title: line.text,
    seq: line.seq,
  }));
}

export function freezeSpace(state: Building, id: string): Space {
  const space = state.spaces.get(id) as MutableSpace;
  const runs = space.runIds.map((runId) => freezeRun(state, state.runs.get(runId) as MutableRun));
  return {
    id: space.id,
    title: space.title,
    kind: space.kind,
    members: space.members,
    roles: Object.fromEntries(space.roles),
    state: space.state,
    openedBy: space.openedBy,
    keyed: space.keyed === true,
    askedOf: space.askedOf,
    home: space.home === true,
    ...(space.lead === undefined ? {} : { lead: space.lead }),
    ...(space.spendCeiling === undefined ? {} : { spendCeiling: space.spendCeiling }),
    ...(space.project === undefined ? {} : { project: frozenProject(space.project) }),
    ...(space.locked === true ? { locked: true } : {}),
    left: [...space.left.values()],
    forked: Object.fromEntries(space.forked),
    made: Object.fromEntries(space.made),
    ...(space.held.size === 0 ? {} : { held: Object.fromEntries(space.held) }),
    ...(space.passed === undefined ? {} : { passed: Object.fromEntries(space.passed) }),
    lastActivityAt: space.lastActivityAt,
    lastEventSeq: space.lastEventSeq,
    actedSeq: space.actedSeq,
    pausedSeq: space.pausedSeq,
    pausedBy: space.pausedBy,
    ...(space.pausedSpend === undefined ? {} : { pausedSpend: space.pausedSpend }),
    lines: [...space.lines],
    // The run on screen is the most recent one in this space.
    run: runs.at(-1),
    runs,
    sessions: freezeSessions(space),
    parentSpaceId: space.parentSpaceId,
    rootLineId: space.rootLineId,
    pins: [...space.pins],
    ...(space.hidden.size === 0 ? {} : { hidden: new Set(space.hidden) }),
    ...(space.letWork === undefined || space.letWork.size === 0
      ? {}
      : { letWork: [...space.letWork.values()] }),
    glimpse: isGlimpse(state, space),
  };
}
