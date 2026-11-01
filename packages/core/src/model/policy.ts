/** How much a harness may do by itself, everywhere or in one room (ADR 0019). */

import {
  type Building,
  type FoldStep,
  field,
  levelOf,
  type MutablePolicy,
  required,
  touchAll,
} from "./state.js";
import type { HarnessPolicyModel, Rule, RunPolicy } from "./types.js";

/** The policy in force for a harness in a room: the room's dial, else the harness's everywhere. */
export function policyFor(
  state: Building,
  harnessId: string,
  spaceId: string,
): RunPolicy | undefined {
  const entry = state.policies.get(harnessId);
  const set = entry?.rooms.get(spaceId) ?? entry?.everywhere;
  if (set === undefined) return undefined;
  return { autonomy: set.autonomy, maxAutonomy: state.workspaceMax ?? 2, rules: set.rules };
}

export function buildHarnesses(state: Building): Record<string, HarnessPolicyModel> {
  const harnesses: Record<string, HarnessPolicyModel> = {};
  const spending = new Map<string, number>();
  for (const run of state.runs.values()) {
    spending.set(run.harnessId, (spending.get(run.harnessId) ?? 0) + (run.costUsd ?? 0));
  }
  for (const [harnessId, entry] of state.policies) {
    const everywhere = entry.everywhere ?? { autonomy: 2 as const, rules: [] as Rule[] };
    const spent = spending.get(harnessId) ?? 0;
    harnesses[harnessId] = {
      harnessId,
      autonomy: everywhere.autonomy,
      maxAutonomy: state.workspaceMax ?? 2,
      rules: everywhere.rules,
      budgetUsd: entry.everywhere?.budgetUsd,
      spentUsd: Math.round(spent * 10_000) / 10_000,
      bySpace: Object.fromEntries(entry.rooms),
    };
  }
  return harnesses;
}

export const POLICY_FOLDS: Readonly<Record<string, FoldStep>> = {
  // A harness's policy is a projection of these (ADR 0019): the level and rules, everywhere or
  // in one room, the cap, and the budget when the event carries one.
  "policy.updated": (state, event) => {
    const harnessId = required<string>(event, "harness_id");
    const policy = required<{ autonomy: unknown; rules: Rule[] }>(event, "policy");
    const entry: MutablePolicy = state.policies.get(harnessId) ?? { rooms: new Map() };
    const level = levelOf(policy.autonomy);
    if (event.space_id === undefined) {
      entry.everywhere = {
        autonomy: level,
        rules: policy.rules,
        budgetUsd: field<number>(event, "budget_usd") ?? entry.everywhere?.budgetUsd,
      };
    } else {
      entry.rooms.set(event.space_id, { autonomy: level, rules: policy.rules });
      const budget = field<number>(event, "budget_usd");
      if (budget !== undefined && entry.everywhere !== undefined)
        entry.everywhere.budgetUsd = budget;
    }
    state.policies.set(harnessId, entry);
    state.workspaceMax = levelOf(field(event, "workspace_max_autonomy"));
    // A level is part of every run's frozen shape, so a change to one restates them all.
    touchAll(state);
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "policy",
      who: required<string>(event, "changed_by"),
      what: `set autonomy to L${level}${event.space_id === undefined ? "" : " here"}${policy.rules.length > 0 ? `, ${policy.rules.length} rule${policy.rules.length === 1 ? "" : "s"}` : ""}`,
      spaceId: event.space_id,
      reason: field<string>(event, "reason"),
    });
  },
};
