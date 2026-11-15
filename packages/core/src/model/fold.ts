/**
 * The fold table, and the fold.
 *
 * One handler per event type, gathered from the families beside this file, and the two entry
 * points the app uses: `createFold` for a stream and `buildModel` for a list.
 */

import {
  DEFAULT_EXCHANGE_LIMITS,
  LATER_EVENTS,
  LEVEL_ONE_EVENTS,
  NO_CAPS,
  resetsTheCount,
} from "@chipschat/protocol";
import { actorKind, type ClientEvent } from "../events.js";
import { APPROVAL_FOLDS } from "./approvals.js";
import { freeze, noteConnection } from "./build.js";
import { EXCHANGE_LIMITS_FOLDS } from "./exchange-limits.js";
import { LANE_FOLDS } from "./lanes.js";
import { LIMITS_FOLDS } from "./limits.js";
import { placeOf } from "./lines.js";
import { MESSAGE_FOLDS } from "./messages.js";
import { PEOPLE_FOLDS } from "./people.js";
import { POLICY_FOLDS } from "./policy.js";
import { PROJECT_FOLDS } from "./project.js";
import { RUN_FOLDS } from "./runs.js";
import { SESSION_FOLDS } from "./sessions.js";
import { quiet, SPACE_FOLDS } from "./spaces.js";
import {
  type Building,
  erase,
  type FoldStep,
  forget,
  type MutableSpace,
  putAway,
  spaceOf,
} from "./state.js";
import type { WorkspaceModel } from "./types.js";
import { WORKSPACE_FOLDS } from "./workspace.js";

/**
 * Every event the client folds, by type. The families beside this file each keep their own
 * table; this is the union of them, and `fold.test.ts` asserts it holds each key once.
 */
const FOLDS: Readonly<Record<string, FoldStep>> = {
  ...SPACE_FOLDS,
  ...SESSION_FOLDS,
  ...MESSAGE_FOLDS,
  ...RUN_FOLDS,
  ...APPROVAL_FOLDS,
  ...POLICY_FOLDS,
  ...LANE_FOLDS,
  ...PEOPLE_FOLDS,
  ...LIMITS_FOLDS,
  ...EXCHANGE_LIMITS_FOLDS,
  ...WORKSPACE_FOLDS,
  ...PROJECT_FOLDS,
};

/**
 * A fold that keeps its place. `push` folds a batch of events onto what is already there and
 * `model` freezes the result, so a client that receives a thousand events in a hundred flushes
 * folds each event once rather than folding the whole log a hundred times (Phase 1 review,
 * finding 1). Only the spaces a batch touched are frozen again; the rest are handed back
 * by the identity they already had, which is also what lets React skip them.
 *
 * Within a batch, events are sorted by `seq`, and a line finds its place in its space by
 * `seq` too, so a replay that arrives out of order folds to the same thing as one that does not
 * (M0.6's invariant, kept). An event type this build does not know changes nothing, which is
 * what lets an older client keep working against a newer server.
 */
/** The line an app draws for what a newer computer sent that it can't (ADR 0297). */
export const NEWER_LINE = "Something here needs a newer Chips.";

/**
 * Every event type the catalogue has, at any level: the first level's and each one added since
 * (`LATER_EVENTS`). One of these with no step in the table is left undrawn on purpose.
 */
const KNOWN: ReadonlySet<string> = new Set([...LEVEL_ONE_EVENTS, ...Object.keys(LATER_EVENTS)]);

/**
 * An event in a room that this app's catalogue doesn't have: a newer computer sent it, and the app
 * has no way to show it. Rather than nothing, one quiet line of Chips's own, and one for a run of
 * them. An event the catalogue has and the app leaves undrawn on purpose is not one.
 *
 * The line is made from the event's envelope alone: its id, its place and its time. What the event
 * holds is not this app's to read, so nothing of it is, whatever it is called: a field named
 * `attachments` or `reply_to` there need not be a message's.
 */
function noteNewer(space: MutableSpace | undefined, event: ClientEvent): void {
  if (space === undefined || KNOWN.has(event.type)) return;
  // Where it belongs by `seq`, which is the end only when events come in order: a run of them
  // replayed behind a later line is still one line, so the lines on both sides are looked at.
  const lines = space.lines;
  const at = placeOf(lines, event.seq);
  if (lines[at - 1]?.newer === true || lines[at]?.newer === true) return;
  lines.splice(at, 0, {
    id: event.id,
    seq: event.seq,
    kind: "system",
    authorId: "chips",
    authorKind: "system",
    text: NEWER_LINE,
    ts: event.ts,
    whole: true,
    newer: true,
  });
}

/** One event into the model: its family's step, or the line for one this app doesn't know. */
function foldOne(state: Building, space: MutableSpace | undefined, event: ClientEvent): void {
  const step = FOLDS[event.type];
  if (step !== undefined) step(state, event);
  else noteNewer(space, event);
  if (space !== undefined) noteExchange(space, event);
}

export interface Fold {
  readonly push: (events: readonly ClientEvent[]) => void;
  readonly model: () => WorkspaceModel;
  /**
   * Keep these spaces and forget every other. The server says which spaces a credential is in
   * as it connects, and a client that kept a cache may hold one it left while this device was
   * away — the one event a replay can never bring it, because it is no longer in the space that
   * event belongs to. Returns what was forgotten, so the cache can drop it too.
   */
  readonly keepOnly: (spaceIds: ReadonlySet<string>) => string[];
  /**
   * Forget rooms erased from the server (ADR 0067), as their `space.erased` does when it comes:
   * what a device that asked for the erase does at once, rather than wait for the socket.
   */
  readonly erase: (spaceIds: readonly string[]) => void;
}

export interface FoldOptions {
  /** The participant reading. Only they can be said to have left a space. */
  readonly selfId?: string | undefined;
}

export function createFold(options: FoldOptions = {}): Fold {
  const state: Building = {
    selfId: options.selfId,
    spaces: new Map(),
    runs: new Map(),
    people: new Map(),
    lanes: new Map(),
    questions: new Map(),
    policies: new Map(),
    workspaceMax: undefined,
    caps: NO_CAPS,
    exchangeLimits: DEFAULT_EXCHANGE_LIMITS,
    erased: new Set(),
    away: new Map(),
    takenOut: new Map(),
    audit: [],
    connections: new Map(),
    order: [],
    dirty: new Set(),
    threadsByRoot: new Map(),
    repliesTo: new Map(),
    frozen: new Map(),
    frozenRuns: new Map(),
    frozenAudit: [],
    auditFrozenAt: 0,
  };
  let current: WorkspaceModel | undefined;

  return {
    push(events) {
      if (events.length === 0) return;
      for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
        noteConnection(state, event);
        const space = spaceOf(state, event);
        if (space !== undefined && event.seq > space.lastEventSeq && !quiet(event)) {
          space.lastEventSeq = event.seq;
          space.lastActivityAt = event.ts;
        }
        foldOne(state, space, event);
      }
      current = undefined;
    },
    model() {
      current ??= freeze(state);
      return current;
    },
    keepOnly(spaceIds) {
      const gone = [...state.spaces.keys()].filter((id) => !spaceIds.has(id));
      const rooms = new Set(gone.filter((id) => state.spaces.get(id)?.parentSpaceId === undefined));
      for (const id of gone) {
        // A room goes out of sight, kept for a return as a leaving seen live is (JR-16), and its
        // threads with it; a thread of a room still listed is forgotten, as before.
        if (rooms.has(id)) putAway(state, id);
        else if (!rooms.has(state.spaces.get(id)?.parentSpaceId ?? "")) forget(state, id);
      }
      if (gone.length > 0) current = undefined;
      return gone;
    },
    erase(spaceIds) {
      erase(state, spaceIds);
      current = undefined;
    },
  };
}

/**
 * Where the referee's count in a room starts again, and whether the agents there are paused (ADR
 * 0097): the newest thing a person did that the server counts as acting, and the newest pause, a
 * person's or Chips's at the room's spend ceiling (ADR 0118).
 */
function noteExchange(space: MutableSpace, event: ClientEvent): void {
  const payload = event as unknown as Readonly<Record<string, unknown>>;
  const by = actorKind(event.actor);
  const pause =
    event.type === "exchange.set" && payload["state"] === "paused" && event.seq > space.pausedSeq;
  if (by === "system") {
    const spend = payload["spend"] as { spent_usd?: unknown; ceiling_usd?: unknown } | undefined;
    if (!pause || payload["why"] !== "spend") return;
    space.pausedSeq = event.seq;
    space.pausedBy = undefined;
    space.pausedSpend = {
      spentUsd: Number(spend?.spent_usd ?? 0),
      ceilingUsd: Number(spend?.ceiling_usd ?? 0),
      at: event.ts,
    };
    return;
  }
  if (by !== "person") return;
  if (resetsTheCount(event.type, payload) && event.seq > space.actedSeq) space.actedSeq = event.seq;
  if (pause) {
    space.pausedSeq = event.seq;
    space.pausedBy = event.actor.id;
    space.pausedSpend = undefined;
  }
}

/** The whole log in one go: the same fold, pushed once. */
export function buildModel(
  events: readonly ClientEvent[],
  options: FoldOptions = {},
): WorkspaceModel {
  const fold = createFold(options);
  fold.push(events);
  return fold.model();
}
