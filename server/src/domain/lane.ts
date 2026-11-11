/**
 * A lane's life, and the rules that decide whether one is opened at all.
 *
 * A lane is a run a lead routed to a specialist: one object, two views, never a copy
 * (blueprint, Lead and lanes). The domain layer is pure (technical-plan 6.1), so this file
 * knows the shape of a lane's life and the two things that stop a chain running away — depth
 * and loops — and nothing about how a lane is stored or delivered.
 *
 * Depth and loops are answered the same way: not by rejecting the `task`, which would make a
 * legitimate chain fail, but by declining to open a lane and letting the caller flatten it into
 * a step instead (blueprint: "Lanes deeper than three are flattened into steps, not rejected",
 * and "the trail is always visible, which also rules out loops").
 */

import type { RunState } from "./run-state.js";

/** Where the specialist's run got to, as the lead's route card reads it. */
export type LaneState = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";

export const LANE_STATES: readonly LaneState[] = [
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
];

/**
 * Finishing and delivering are different states (blueprint). A lane completes when the
 * specialist posts its result; the person is told when the lead delivers. Delivery travels with
 * the lane.
 */
export type LaneDelivery = "pending" | "direct" | "queued_to_lead" | "delivered" | "failed";

export const LANE_DELIVERIES: readonly LaneDelivery[] = [
  "pending",
  "direct",
  "queued_to_lead",
  "delivered",
  "failed",
];

/** Three levels deep at most (blueprint). A fourth routing is flattened, not refused. */
export const MAX_LANE_DEPTH = 3;

/** One hop in the chain that led to a lane, as the protocol carries it. */
export interface TrailEntry {
  readonly participant_id: string;
  readonly run_id?: string | undefined;
  readonly goal?: string | undefined;
}

/**
 * The lane the task's own run belongs to, when the lead is itself a specialist of a lane above
 * it. Absent for a top-level lead, whose run is nobody's lane.
 */
export interface ParentLane {
  readonly depth: number;
  readonly trail: readonly TrailEntry[];
}

/** What the router knows about a `task` before it decides whether to open a lane. */
export interface RouteRequest {
  /** The lead sending the task: `task.actor.id`. */
  readonly leadId: string;
  /** The lead's own run, which this task is a hop of: `task.run_id`. */
  readonly leadRunId?: string | undefined;
  /** What the lead itself was asked, to name its hop in the trail. */
  readonly leadGoal?: string | undefined;
  /** The person the whole chain is for: `task.on_behalf_of`. */
  readonly onBehalfOf: string;
  /** Who the work is being routed to. */
  readonly specialistId: string;
}

export type RouteDecision =
  | { readonly route: true; readonly depth: number; readonly trail: TrailEntry[] }
  | { readonly route: false; readonly reason: "too_deep" | "loops"; readonly depth: number };

/** The chain above the specialist: the person, then every lead down to the one routing now. */
function trailFor(request: RouteRequest, parent: ParentLane | undefined): TrailEntry[] {
  const hop: TrailEntry = {
    participant_id: request.leadId,
    ...(request.leadRunId === undefined ? {} : { run_id: request.leadRunId }),
    ...(request.leadGoal === undefined ? {} : { goal: request.leadGoal }),
  };
  // A nested lead's ancestry already begins with the person; a top-level lead's does not, so
  // the person is named here as the head of the trail.
  if (parent !== undefined) return [...parent.trail, hop];
  return [{ participant_id: request.onBehalfOf }, hop];
}

/**
 * Whether to open a lane for this task, and if so at what depth and with what trail. A lane one
 * deeper than the limit, or one that would route to a participant already in its own trail, is
 * declined — the caller flattens it into a step. Loops are checked before depth so a cycle is
 * named as a cycle rather than as depth.
 *
 * A lead routing to itself is not a loop: that is a lane between two spaces of one harness — a
 * Space Jacobian hands down to, a subagent in a worktree (M3.5, ADR 0032) — and the harness is
 * in its own trail by construction. Depth bounds that chain the way it bounds any other.
 */
export function decideRoute(request: RouteRequest, parent: ParentLane | undefined): RouteDecision {
  const depth = (parent?.depth ?? 0) + 1;
  const trail = trailFor(request, parent);
  const self = request.specialistId === request.leadId;
  if (!self && trail.some((entry) => entry.participant_id === request.specialistId)) {
    return { route: false, reason: "loops", depth };
  }
  if (depth > MAX_LANE_DEPTH) return { route: false, reason: "too_deep", depth };
  return { route: true, depth, trail };
}

/**
 * The lane state that a specialist run in this state shows the lead. A run is `done`; a lane,
 * seen from the lead's chat, is `completed`. Everything else reads the same word.
 */
export function laneStateForRun(run: RunState): LaneState {
  if (run === "done") return "completed";
  // A paused specialist is holding for a person, as a waiting one is (ADR 0293).
  return run === "paused" ? "waiting" : run;
}

/**
 * The delivery state a lane in this state carries, by default. A lane that completed is queued
 * for the lead to deliver; one that failed or was cancelled carries a failed delivery; anything
 * still going has delivered nothing yet. An adapter that delivers directly says so itself.
 */
export function deliveryForLane(state: LaneState): LaneDelivery {
  if (state === "completed") return "queued_to_lead";
  if (state === "failed" || state === "cancelled") return "failed";
  return "pending";
}

/** True for a lane state that will not change again, so a reaction to it is the last one. */
export function isLaneTerminal(state: LaneState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}
