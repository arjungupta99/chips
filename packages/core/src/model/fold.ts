/**
 * The fold table, and the fold.
 *
 * One handler per event type, gathered from the families beside this file, and the two entry
 * points the app uses: `createFold` for a stream and `buildModel` for a list.
 */

import { DEFAULT_EXCHANGE_LIMITS, NO_CAPS, resetsTheCount } from "@chipschat/protocol";
import { actorKind, type ClientEvent } from "../events.js";
import { APPROVAL_FOLDS } from "./approvals.js";
import { freeze, noteConnection } from "./build.js";
import { EXCHANGE_LIMITS_FOLDS } from "./exchange-limits.js";
import { LANE_FOLDS } from "./lanes.js";
import { LIMITS_FOLDS } from "./limits.js";
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
        FOLDS[event.type]?.(state, event);
        if (space !== undefined) noteExchange(space, event);
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
