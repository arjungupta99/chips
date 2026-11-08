/**
 * The fold's own state, while it is folding.
 *
 * Mutable shapes the fold writes into and the get-or-create helpers every family reaches for.
 * Nothing here is exported from the package: `build.ts` freezes these into the public types.
 */

import type { AttachmentCaps, ExchangeLimits } from "@chipschat/protocol";
import type { Attachment } from "../attachments.js";
import { actorKind, type ClientEvent, harnessOfActor } from "../events.js";
import type {
  AgentLeft,
  Approval,
  AuditEntry,
  LaneDelivery,
  LaneHop,
  LaneState,
  LetWork,
  Line,
  PausedSpend,
  PersonModel,
  Pin,
  ProjectChange,
  Question,
  RelayState,
  Rule,
  Run,
  RunState,
  Space,
  SpaceRole,
  Step,
  TakenOut,
  Thought,
} from "./types.js";

/** A field the schema marks required. The server validated the event before appending it. */
export function required<T>(event: ClientEvent, name: string): T {
  return event[name] as T;
}
export function field<T>(event: ClientEvent, name: string): T | undefined {
  return event[name] as T | undefined;
}

export const TERMINAL: readonly RunState[] = ["done", "failed", "cancelled"];

export interface MutableRun {
  runId: string;
  spaceId: string;
  /** Who works it: an agent (ADR 0087), or a harness before agents. What a room names. */
  harnessId: string;
  /** The harness it runs on, whose policy, budget and card it is. */
  harness: string;
  goal: string;
  state: RunState;
  paused: boolean;
  /** The last event that touched this run, so the fleet shows a harness's latest run. */
  lastSeq: number;
  statusVerb?: string | undefined;
  thought?: Thought | undefined;
  steps: Step[];
  summary?: string | undefined;
  /** What the run's own harness said in it, oldest first, so a summary that repeats one is drawn once. */
  saidIds: string[];
  error?: string | undefined;
  approvals: Approval[];
  costUsd?: number | undefined;
  inputTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
  outputTokens?: number | undefined;
  contextUsed?: number | undefined;
  contextLimit?: number | undefined;
  model?: string | undefined;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  sessionRef?: string | undefined;
  goalFrom?: "harness" | "chips" | undefined;
  questions: Question[];
}

/** A visit as it is folded: `live` is derived from `endedAt`, so it cannot disagree with it. */
export interface MutableSession {
  sessionRef: string;
  spaceId: string;
  harnessId: string;
  /** The harness the visit is on: an agent's (ADR 0087), or the harness itself. */
  harness: string;
  where?: string | undefined;
  title?: string | undefined;
  startedAt: string;
  endedAt?: string | undefined;
  endedReason?: string | undefined;
  transcriptRef?: string | undefined;
  lastRunId?: string | undefined;
  lastSeenAt: string;
}

export interface MutablePolicy {
  everywhere?: { autonomy: 0 | 1 | 2 | 3; rules: Rule[]; budgetUsd?: number | undefined };
  rooms: Map<string, { autonomy: 0 | 1 | 2 | 3; rules: Rule[] }>;
}

/** A line that set what the room allows a job (ADR 0282). */
export interface CeilingLine {
  readonly id: string;
  readonly seq: number;
  readonly by: string;
  /** The amount set, or nothing for the default. */
  readonly usd: number | undefined;
  /** What the room allowed before. */
  readonly was: number;
}

export interface MutableSpace {
  id: string;
  title?: string | undefined;
  kind: string;
  members: string[];
  roles: Map<string, SpaceRole>;
  state: "open" | "closed";
  openedBy?: string | undefined;
  /** Opened by a harness under a key of its own, so it can open it again (ADR 0024). */
  keyed?: boolean | undefined;
  /** The harness a person asked for this room, which claims it. */
  askedOf?: string | undefined;
  /** The harness's home, the room its lead speaks in (ADR 0069). */
  home?: boolean | undefined;
  /** The agent last chosen to lead the room (ADR 0104); `roomLeadOf` says whether it still does. */
  lead?: string | undefined;
  /** What the room allows a job, as a person set it (ADR 0117); none follows the default. */
  spendCeiling?: number | undefined;
  /** Whether a person locked the room's changes (ADR 0156): no rename, archive or delete. */
  locked?: boolean | undefined;
  /** The agents that left, by id, the last time each did (ADR 0087). */
  left: Map<string, AgentLeft>;
  /** The room's project (ADR 0222), once it has had a change. */
  project?: MutableProject | undefined;
  /** The copies that joined for an ask (ADR 0087, Fork), by the ask's line id. */
  forked: Map<string, string>;
  /** The new agents that joined for an ask (ADR 0108), by the ask's line id. */
  made: Map<string, string>;
  /** The first names held for the harnesses waiting here (ADR 0150), by harness. */
  held: Map<string, string>;
  /** The newest turn each agent passed here (ADR 0105), by the agent's id: the pass's seq. */
  passed?: Map<string, number> | undefined;
  lastActivityAt?: string | undefined;
  lastEventSeq: number;
  actedSeq: number;
  pausedSeq: number;
  pausedBy?: string | undefined;
  pausedSpend?: PausedSpend | undefined;
  /**
   * The newest line saying what the room allows a job, and who set it from what: the carrying on
   * that follows it at the ceiling says both in that one line (ADR 0282).
   */
  ceilingLine?: CeilingLine | undefined;
  lines: Line[];
  /** The checkpoint lines, kept as they are folded so the queue does not filter every line. */
  checkpoints: Line[];
  runIds: string[];
  /** The visits to this space, by `session_ref`, in the order first heard of. */
  sessions: Map<string, MutableSession>;
  parentSpaceId?: string | undefined;
  rootLineId?: string | undefined;
  pins: Pin[];
  /** The lines the reader deleted for themselves (ADR 0167). */
  hidden: Set<string>;
  /** The agents let work here without asking (ADR 0281), by whose asks go ahead. */
  letWork?: Map<string, LetWork> | undefined;
}

/** A lane as it is folded, from whichever of its two sides the reader can see. */
export interface MutableLane {
  laneId: string;
  leadId: string;
  specialistId: string;
  onBehalfOf: string;
  runId?: string | undefined;
  leadRunId?: string | undefined;
  homeSpaceId?: string | undefined;
  linkedSpaceIds: string[];
  originMessageId?: string | undefined;
  goal: string;
  constraints: string[];
  deadline?: string | undefined;
  state: LaneState;
  delivery: LaneDelivery;
  depth: number;
  trail: LaneHop[];
  summary?: string | undefined;
  attachments?: Attachment[] | undefined;
  costUsd?: number | undefined;
  label?: string | undefined;
  /** The last event that touched it, so the newest lane sorts first. */
  lastSeq: number;
}

export interface Building {
  spaces: Map<string, MutableSpace>;
  runs: Map<string, MutableRun>;
  /** Everyone in the workspace with their role, from `person.joined` and `role.changed`. */
  people: Map<string, PersonModel>;
  /** Every lane the reader has heard of, by lane id, assembled across its two spaces. */
  lanes: Map<string, MutableLane>;
  /** Every question asked, by ask id, so an answer finds it whichever run it was in. */
  questions: Map<string, { runId: string; index: number }>;
  policies: Map<string, MutablePolicy>;
  workspaceMax: 0 | 1 | 2 | 3 | undefined;
  /** What may be attached here (ADR 0047): the workspace's caps, none until an owner sets them. */
  caps: AttachmentCaps;
  /** When Chips steps in on agents talking to each other (ADR 0187): the defaults until set. */
  exchangeLimits: ExchangeLimits;
  /** The relay as an owner last turned it (ADR 0211, Phase 4); absent until anybody has. */
  relay?: RelayState;
  /** Rooms erased from the server (ADR 0067), which nothing that names them brings back. */
  erased: Set<string>;
  audit: AuditEntry[];
  connections: Map<string, { seen: string[]; lastSeenAt: string }>;
  order: string[];
  /** Spaces touched since the last freeze. Only these are frozen again. */
  dirty: Set<string>;
  /** The last frozen shape of each space, handed back untouched while it stays clean. */
  frozen: Map<string, Space>;
  /** The last frozen shape of each run, handed back while nothing in it has changed. */
  frozenRuns: Map<string, Run>;
  /** The audit as the view reads it, newest first, and how long the log was when it was made. */
  frozenAudit: readonly AuditEntry[];
  auditFrozenAt: number;
  /** Who is reading, when the caller said: a space they have left is not one of their spaces. */
  selfId?: string | undefined;
  /**
   * The rooms the reader was taken out of or left, put away with their threads and runs rather
   * than dropped (JR-16): what the room said before is what it says again if they are added back,
   * and a replay that passes their leaving on its way to their return keeps it all.
   */
  away: Map<string, AwayRoom>;
  /** The rooms somebody else took the reader out of, until they are back in (JR-6). */
  takenOut: Map<string, TakenOut>;
  /** The thread grown from each line, by the line's id, so a root arriving late still finds it. */
  threadsByRoot: Map<string, string>;
  /**
   * The lines replying to each line (ADR 0219), by the line's id, oldest first: a line arriving
   * after its replies, as a history read backwards brings it, still finds them.
   */
  repliesTo: Map<string, { readonly id: string; readonly seq: number }[]>;
}

/** A room out of sight: itself, its threads, and the runs of each. */
export interface AwayRoom {
  readonly spaces: MutableSpace[];
  readonly runs: [string, MutableRun][];
}

export function spaceOf(state: Building, event: ClientEvent): MutableSpace | undefined {
  const id = event.space_id;
  // A room erased from the server is not made again by an event that names it afterwards: the
  // release of its agents did, and the room came back empty and untitled in the pickers (agents
  // review, finding 11).
  if (id === undefined || state.erased.has(id)) return undefined;
  // A room the reader is out of takes what a replay says of it while they were out, out of sight.
  const away = awaySpace(state, id);
  if (away !== undefined) return away;
  let space = state.spaces.get(id);
  if (space === undefined) {
    space = {
      id,
      kind: "group",
      members: [],
      roles: new Map(),
      state: "open",
      lastEventSeq: 0,
      actedSeq: 0,
      pausedSeq: 0,
      lines: [],
      checkpoints: [],
      runIds: [],
      sessions: new Map(),
      pins: [],
      hidden: new Set(),
      left: new Map(),
      forked: new Map(),
      made: new Map(),
      held: new Map(),
    };
    state.spaces.set(id, space);
    state.order.push(id);
  }
  // Every fold that touches a space comes through here, so this is where "this one has
  // to be frozen again" is recorded.
  state.dirty.add(id);
  return space;
}

/**
 * Drop a space and everything of it. Nothing is deleted anywhere else: the log still holds all
 * of it, and somebody added back sees it again from the events that follow.
 */
export function forget(state: Building, spaceId: string): void {
  state.spaces.delete(spaceId);
  state.frozen.delete(spaceId);
  state.dirty.delete(spaceId);
  state.order = state.order.filter((id) => id !== spaceId);
  for (const [runId, run] of state.runs) {
    if (run.spaceId !== spaceId) continue;
    state.runs.delete(runId);
    state.frozenRuns.delete(runId);
  }
  // A space's threads go with it (M5.4): whoever is in the space is in them, and nobody else.
  for (const [id, space] of state.spaces) {
    if (space.parentSpaceId === spaceId) forget(state, id);
  }
}

/** The room, or one of its threads, as it was put away; nothing for one that is not away. */
function awaySpace(state: Building, id: string): MutableSpace | undefined {
  for (const room of state.away.values()) {
    const found = room.spaces.find((space) => space.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The reader is out of a room (JR-16): it goes out of sight with its threads and their runs, as
 * `forget` takes it, but kept, so that being added back brings back everything it said rather
 * than a room that starts at the return.
 */
export function putAway(state: Building, spaceId: string): void {
  const space = state.spaces.get(spaceId);
  if (space === undefined) return;
  const spaces = [
    space,
    ...[...state.spaces.values()].filter((each) => each.parentSpaceId === spaceId),
  ];
  const ids = new Set(spaces.map((each) => each.id));
  const runs = [...state.runs].filter(([, run]) => ids.has(run.spaceId));
  for (const id of ids) forget(state, id);
  state.away.set(spaceId, { spaces, runs });
}

/** The reader is in the room again: it comes back as it was put away, and folds on from there. */
export function bringBack(state: Building, spaceId: string): void {
  state.takenOut.delete(spaceId);
  const room = state.away.get(spaceId);
  if (room === undefined) return;
  state.away.delete(spaceId);
  for (const space of room.spaces) {
    state.spaces.set(space.id, space);
    state.order.push(space.id);
    state.dirty.add(space.id);
  }
  for (const [runId, run] of room.runs) {
    if (!state.runs.has(runId)) state.runs.set(runId, run);
  }
}

/**
 * Rooms erased from the server (ADR 0067): each forgotten with its threads, and the lanes that
 * lived in them, whose opening went with them — the lead's side of such a lane is only a line in
 * the lead's room now, as a replay of what is left would draw it.
 */
export function erase(state: Building, spaceIds: readonly string[]): void {
  const gone = new Set(spaceIds);
  for (const id of spaceIds) {
    forget(state, id);
    state.away.delete(id);
    state.takenOut.delete(id);
    state.erased.add(id);
  }
  for (const [laneId, lane] of state.lanes) {
    if (lane.homeSpaceId !== undefined && gone.has(lane.homeSpaceId)) state.lanes.delete(laneId);
  }
}

/**
 * A room the reader only glimpses (ADR 0042): they are not in it, and they never saw it opened
 * — the only reason they know of it is an approval that named them, which visibility lets
 * through wherever it is. `space.created` reaches whoever is in the room, whoever opened it and
 * whoever it was opened for, so having seen it is standing enough.
 */
export function isGlimpse(state: Building, space: MutableSpace): boolean {
  return (
    state.selfId !== undefined &&
    space.openedBy === undefined &&
    !space.members.includes(state.selfId)
  );
}

/** A space whose frozen shape is stale: its run changed, or its policy did. */
export function touch(state: Building, spaceId: string): void {
  if (spaceId !== "") state.dirty.add(spaceId);
}

/** Everything is stale: a policy or the workspace cap moved, and runs carry the level. */
export function touchAll(state: Building): void {
  for (const id of state.spaces.keys()) state.dirty.add(id);
}

export function runOf(state: Building, event: ClientEvent): MutableRun | undefined {
  const runId = event.run_id;
  if (runId === undefined) return undefined;
  const existing = state.runs.get(runId);
  if (existing !== undefined) {
    existing.lastSeq = Math.max(existing.lastSeq, event.seq);
    touch(state, existing.spaceId);
    return existing;
  }
  // A run event before its `run.started` — out of order, or history we joined mid-run. Make a
  // shell so nothing is dropped; `run.started` fills in the goal and the plan.
  const space = spaceOf(state, event);
  const run: MutableRun = {
    runId,
    spaceId: space?.id ?? "",
    harnessId: actorKind(event.actor) === "harness" ? event.actor.id : "",
    harness: actorKind(event.actor) === "harness" ? harnessOfActor(event.actor) : "",
    goal: "",
    state: "running",
    paused: false,
    lastSeq: event.seq,
    steps: [],
    approvals: [],
    questions: [],
    saidIds: [],
  };
  state.runs.set(runId, run);
  space?.runIds.push(runId);
  return run;
}

/**
 * The lane this event belongs to, opened at its defaults if it has not been seen. Either side
 * of a lane may reach us first — the lead's `task` or the specialist's `run.requested` — and
 * each fills in what it knows, so the get-or-create starts from a shape that reads correctly
 * with only one side folded.
 */
export function laneOf(state: Building, laneId: string): MutableLane {
  const existing = state.lanes.get(laneId);
  if (existing !== undefined) return existing;
  const lane: MutableLane = {
    laneId,
    leadId: "",
    specialistId: "",
    onBehalfOf: "",
    linkedSpaceIds: [],
    goal: "",
    constraints: [],
    state: "running",
    delivery: "pending",
    depth: 1,
    trail: [],
    lastSeq: 0,
  };
  state.lanes.set(laneId, lane);
  return lane;
}

/** Add a linked space to a lane once, keeping the order it was first named in. */
export function linkSpace(lane: MutableLane, spaceId: string | undefined): void {
  if (spaceId !== undefined && !lane.linkedSpaceIds.includes(spaceId)) {
    lane.linkedSpaceIds.push(spaceId);
  }
}

/**
 * The visit this event belongs to, opened if it has not been seen. A run can reach us before
 * the `session.started` that ought to have preceded it — out of order, or a headless run that
 * sends no start hook at all — so the first mention of a `session_ref` is what opens it.
 */
export function sessionOf(
  space: MutableSpace | undefined,
  event: ClientEvent,
  sessionRef: string | undefined,
): MutableSession | undefined {
  if (space === undefined || sessionRef === undefined) return undefined;
  const existing = space.sessions.get(sessionRef);
  if (existing !== undefined) {
    if (event.ts > existing.lastSeenAt) existing.lastSeenAt = event.ts;
    return existing;
  }
  const session: MutableSession = {
    sessionRef,
    spaceId: space.id,
    harnessId: actorKind(event.actor) === "harness" ? event.actor.id : "",
    harness: actorKind(event.actor) === "harness" ? harnessOfActor(event.actor) : "",
    startedAt: event.ts,
    lastSeenAt: event.ts,
  };
  space.sessions.set(sessionRef, session);
  return session;
}

/** `expires_in` and `timeout_seconds` are seconds from when the harness asked; a screen wants the instant. */
export function deadline(event: ClientEvent, seconds: number | undefined): string | undefined {
  return seconds === undefined
    ? undefined
    : new Date(Date.parse(event.ts) + seconds * 1000).toISOString();
}

export function levelOf(value: unknown): 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 3 ? value : 2;
}

export type FoldStep = (state: Building, event: ClientEvent) => void;

/**
 * A thread and the line it grew from know each other (M5.4): the root line carries the thread's
 * id and how many replies it holds, in the parent, which is where the thread is drawn from.
 * Either side may arrive first; whichever is second completes the link.
 */
export function linkThread(state: Building, thread: MutableSpace): void {
  if (thread.rootLineId === undefined) return;
  state.threadsByRoot.set(thread.rootLineId, thread.id);
  countReplies(state, thread);
}

export function countReplies(state: Building, thread: MutableSpace): void {
  const parent =
    thread.parentSpaceId === undefined ? undefined : state.spaces.get(thread.parentSpaceId);
  const index = parent?.lines.findIndex((line) => line.id === thread.rootLineId) ?? -1;
  const root = parent?.lines[index];
  if (parent === undefined || root === undefined) return;
  const replies = thread.lines.filter((line) => line.kind === "text" && line.deleted !== true);
  parent.lines[index] = {
    ...root,
    threadId: thread.id,
    replyCount: replies.length,
    lastReplyAt: replies.at(-1)?.ts,
  };
  // A reply is the room's news too: the room comes forward, and its unread count moves.
  if (thread.lastEventSeq > parent.lastEventSeq) {
    parent.lastEventSeq = thread.lastEventSeq;
    parent.lastActivityAt = thread.lastActivityAt;
  }
  state.dirty.add(parent.id);
}

/** A change to a room's project as the fold keeps it (ADR 0222, `project.ts`). */
export interface MutableChange {
  commit: string;
  before: string | null;
  by: string;
  byKind: "person" | "agent";
  /** Who made it as the room's lines name them, from the event's actor. */
  authorKind: ReturnType<typeof actorKind>;
  at: string;
  seq: number;
  message: string;
  files: ProjectChange["files"];
  moreFiles: number;
  undoes?: string | undefined;
  undoneBy?: string | undefined;
  /** The reply that carries it, by its line's id. */
  reply?: string | undefined;
  /** Whether its quiet line is drawn, or it waits for its agent's run to end. */
  shown: boolean;
}

export interface MutableProject {
  /** How many files `main` has, from the newest change that said. */
  files: number;
  changes: Map<string, MutableChange>;
}
