/** How much a harness may do by itself, everywhere or in one room (ADR 0019). */

import type { ClientEvent } from "../events.js";
import {
  type Building,
  type FoldStep,
  field,
  levelOf,
  type MutablePolicy,
  required,
  touchAll,
} from "./state.js";
import type { HarnessPolicyModel, Hold, Rule, RunPolicy } from "./types.js";

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
      ...(entry.hold === undefined ? {} : { hold: entry.hold }),
      ...(entry.chipsRules === undefined ? {} : { chipsRules: entry.chipsRules }),
    };
  }
  return harnesses;
}

/** A hold as the wire says it, or nothing for asks back on (ADR 0299). */
export function holdFrom(wire: unknown): Hold | undefined {
  if (typeof wire !== "object" || wire === null) return undefined;
  const hold = wire as { until?: unknown; matters?: unknown; by?: unknown; at?: unknown };
  return {
    ...(typeof hold.until === "string" ? { until: hold.until } : {}),
    matters: hold.matters === true,
    ...(typeof hold.by === "string" ? { by: hold.by } : {}),
    ...(typeof hold.at === "string" ? { at: hold.at } : {}),
  };
}

/** A harness's level, rules and budget everywhere, and its hold when the event says one. */
function foldEverywhere(
  entry: MutablePolicy,
  event: ClientEvent,
  policy: { rules: Rule[]; hold?: unknown; chips_rules?: unknown },
  level: 0 | 1 | 2 | 3,
): void {
  entry.everywhere = {
    autonomy: level,
    rules: policy.rules,
    budgetUsd: field<number>(event, "budget_usd") ?? entry.everywhere?.budgetUsd,
  };
  // A hold absent leaves it as it was; `null` turns the asks back on (ADR 0299).
  if (policy.hold !== undefined) entry.hold = holdFrom(policy.hold);
  // So does a Chips's rules switch (ADR 0300).
  if (typeof policy.chips_rules === "boolean") entry.chipsRules = policy.chips_rules;
}

export const POLICY_FOLDS: Readonly<Record<string, FoldStep>> = {
  // A harness's policy is a projection of these (ADR 0019): the level and rules, everywhere or
  // in one room, the cap, and the budget when the event carries one.
  "policy.updated": (state, event) => {
    const harnessId = required<string>(event, "harness_id");
    const policy = required<{
      autonomy: unknown;
      rules: Rule[];
      hold?: unknown;
      chips_rules?: unknown;
    }>(event, "policy");
    const entry: MutablePolicy = state.policies.get(harnessId) ?? { rooms: new Map() };
    const level = levelOf(policy.autonomy);
    if (event.space_id === undefined) {
      foldEverywhere(entry, event, policy, level);
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

  // The rules and hold for every harness (ADR 0299); a hold absent leaves it as it was.
  "policy.workspace_updated": (state, event) => {
    const rules = required<Rule[]>(event, "rules");
    const wire = field<unknown>(event, "hold");
    const hold = wire === undefined ? state.workspaceRules.hold : holdFrom(wire);
    state.workspaceRules = { rules, ...(hold === undefined ? {} : { hold }) };
    state.workspaceMax = levelOf(field(event, "workspace_max_autonomy"));
    touchAll(state);
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "policy",
      who: required<string>(event, "changed_by"),
      what: `set the rules for every harness${rules.length > 0 ? `, ${rules.length} rule${rules.length === 1 ? "" : "s"}` : ""}${hold === undefined ? "" : ", asks off"}`,
      spaceId: undefined,
      reason: undefined,
    });
  },
};
