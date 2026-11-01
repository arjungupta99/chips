/**
 * The lane rules, on their own. The router (application) drives these through the store for a
 * handful of chains; this file drives them for the cases that matter: the first lane, a nested
 * one, the fourth that flattens, and a loop that flattens whatever its depth.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decideRoute,
  deliveryForLane,
  isLaneTerminal,
  type LaneState,
  laneStateForRun,
  MAX_LANE_DEPTH,
  type ParentLane,
  type RouteDecision,
  type RouteRequest,
} from "./lane.js";
import type { RunState } from "./run-state.js";

const ARJUN = "usr_arjun";
const SCOUT = "hrn_scout";
const LEDGER = "hrn_ledger";
const MOODY = "hrn_moody";

function request(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    leadId: SCOUT,
    leadRunId: "run_scout",
    leadGoal: "Confirm PO-4471",
    onBehalfOf: ARJUN,
    specialistId: LEDGER,
    ...overrides,
  };
}

describe("deciding whether to open a lane", () => {
  it("opens the first lane at depth one, with the person at the head of the trail", () => {
    const decision = decideRoute(request(), undefined);
    expect(decision).toEqual({
      route: true,
      depth: 1,
      trail: [
        { participant_id: ARJUN },
        { participant_id: SCOUT, run_id: "run_scout", goal: "Confirm PO-4471" },
      ],
    });
  });

  it("carries the parent's trail into a nested lane and counts a deeper level", () => {
    const parent: ParentLane = {
      depth: 1,
      trail: [{ participant_id: ARJUN }, { participant_id: SCOUT, run_id: "run_scout" }],
    };
    const decision = decideRoute(
      request({ leadId: LEDGER, leadRunId: "run_ledger", specialistId: MOODY }),
      parent,
    );
    expect(decision).toMatchObject({ route: true, depth: 2 });
    if (decision.route) {
      expect(decision.trail.map((entry) => entry.participant_id)).toEqual([ARJUN, SCOUT, LEDGER]);
    }
  });

  it("declines the fourth level and reports the depth so the caller can flatten it", () => {
    const parent: ParentLane = { depth: MAX_LANE_DEPTH, trail: [{ participant_id: ARJUN }] };
    const decision = decideRoute(request({ specialistId: MOODY }), parent);
    expect(decision).toEqual({ route: false, reason: "too_deep", depth: 4 });
  });

  it("declines a route back to a participant already in the trail, whatever the depth", () => {
    const parent: ParentLane = {
      depth: 1,
      trail: [{ participant_id: ARJUN }, { participant_id: SCOUT }],
    };
    // Ledger, at depth 2, tries to route back to Scout, which is above it.
    const decision = decideRoute(request({ leadId: LEDGER, specialistId: SCOUT }), parent);
    expect(decision).toEqual({ route: false, reason: "loops", depth: 2 });
  });

  it("lets a lead route to itself, which is a lane between two of its own spaces, not a loop", () => {
    // Jacobian handing a Space down, a subagent in a worktree: the harness is in its own trail
    // by construction, and depth is what bounds the chain (M3.5, ADR 0032).
    const parent: ParentLane = {
      depth: 1,
      trail: [{ participant_id: ARJUN }, { participant_id: SCOUT, run_id: "run_scout" }],
    };
    const decision = decideRoute(request({ leadId: SCOUT, specialistId: SCOUT }), parent);
    expect(decision).toMatchObject({ route: true, depth: 2 });
    const third: ParentLane = { depth: 3, trail: [...parent.trail, { participant_id: SCOUT }] };
    expect(decideRoute(request({ leadId: SCOUT, specialistId: SCOUT }), third)).toEqual({
      route: false,
      reason: "too_deep",
      depth: 4,
    });
  });

  it("names a loop as a loop even when it is also too deep", () => {
    const parent: ParentLane = {
      depth: MAX_LANE_DEPTH,
      trail: [{ participant_id: ARJUN }, { participant_id: SCOUT }],
    };
    const decision = decideRoute(request({ leadId: LEDGER, specialistId: SCOUT }), parent);
    expect(decision).toEqual({ route: false, reason: "loops", depth: 4 });
  });
});

describe("a lane's state, seen from the lead", () => {
  it.each<[RunState, LaneState]>([
    ["queued", "queued"],
    ["running", "running"],
    ["waiting", "waiting"],
    ["done", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ])("shows a %s run as %s", (run, lane) => {
    expect(laneStateForRun(run)).toBe(lane);
  });

  it("queues a completed lane for the lead, and marks a failed or cancelled one failed", () => {
    expect(deliveryForLane("completed")).toBe("queued_to_lead");
    expect(deliveryForLane("failed")).toBe("failed");
    expect(deliveryForLane("cancelled")).toBe("failed");
    expect(deliveryForLane("running")).toBe("pending");
  });

  it("knows which states are the last word", () => {
    expect(isLaneTerminal("completed")).toBe(true);
    expect(isLaneTerminal("cancelled")).toBe(true);
    expect(isLaneTerminal("running")).toBe(false);
  });
});

/** One hop of a chain: who routed to whom, what the domain said, and how many lanes were open. */
interface Hop {
  readonly lead: string;
  readonly next: string;
  readonly decision: RouteDecision;
  readonly opened: number;
}

/** Route each harness to the next, each lane nested in the one before, until the domain declines. */
function walk(hops: readonly string[]): Hop[] {
  const steps: Hop[] = [];
  let parent: ParentLane | undefined;
  for (let i = 0; i + 1 < hops.length; i += 1) {
    const lead = hops[i] ?? "";
    const next = hops[i + 1] ?? "";
    const decision = decideRoute(request({ leadId: lead, specialistId: next }), parent);
    steps.push({ lead, next, decision, opened: steps.length + 1 });
    if (!decision.route) break;
    parent = { depth: decision.depth, trail: decision.trail };
  }
  return steps;
}

/** A declined hop is a loop when the specialist is already in the chain and is not the lead itself; otherwise it is past the limit. */
function expectDeclinedRightly(hop: Hop, chain: readonly string[]): void {
  if (hop.decision.route) return;
  const self = hop.lead === hop.next;
  const inTrail = chain.includes(hop.next);
  expect(hop.decision.reason).toBe(!self && inTrail ? "loops" : "too_deep");
  if (hop.decision.reason === "too_deep") expect(hop.decision.depth).toBe(MAX_LANE_DEPTH + 1);
}

/** An opened lane is one deeper than the last, within the limit, with the person at the head and never its own specialist in the trail. */
function expectOpenedRightly(hop: Hop): void {
  if (!hop.decision.route) return;
  expect(hop.decision.depth).toBe(hop.opened);
  expect(hop.decision.depth).toBeLessThanOrEqual(MAX_LANE_DEPTH);
  expect(hop.decision.trail[0]?.participant_id).toBe(ARJUN);
  expect(hop.decision.trail.at(-1)?.participant_id).toBe(hop.lead);
  const routedBack = hop.decision.trail.some((entry) => entry.participant_id === hop.next);
  expect(hop.lead === hop.next || !routedBack).toBe(true);
}

describe("any chain at all", () => {
  const harness = fc.stringMatching(/^hrn_[a-z]{3,5}$/);

  it("never opens a lane past the limit, never routes back into the trail, and keeps the person at the head", () => {
    fc.assert(
      fc.property(fc.array(harness, { minLength: 2, maxLength: 7 }), (hops) => {
        const steps = walk(hops);
        for (const [index, hop] of steps.entries()) {
          expectOpenedRightly(hop);
          expectDeclinedRightly(hop, hops.slice(0, index + 1));
        }
        expect(steps.filter((hop) => hop.decision.route).length).toBeLessThanOrEqual(
          MAX_LANE_DEPTH,
        );
      }),
      { numRuns: 500 },
    );
  });
});
