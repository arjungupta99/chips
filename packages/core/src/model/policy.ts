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
import type { AuditEntry, HarnessPolicyModel, Hold, PickedMode, Rule, RunPolicy } from "./types.js";

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
      ...switchAndHold(entry),
    };
  }
  return harnesses;
}

/**
 * What a harness's everywhere row says beyond its level and rules: its hold (ADR 0299), its Chips's
 * rules switch and its mode (ADR 0300), and whether that row was ever written at all.
 */
function switchAndHold(entry: MutablePolicy): Partial<HarnessPolicyModel> {
  return {
    ...(entry.hold === undefined ? {} : { hold: entry.hold }),
    ...(entry.chipsRules === undefined ? {} : { chipsRules: entry.chipsRules }),
    ...(entry.mode === undefined ? {} : { mode: entry.mode }),
    ...(entry.modeSince === undefined ? {} : { modeSince: entry.modeSince }),
    ...(entry.everywhere === undefined ? { everywhereStandIn: true as const } : {}),
  };
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

/** A mode as the wire says it (ADR 0300, 19 November addendum), or nothing for none. */
export function modeFrom(wire: unknown): PickedMode | undefined {
  if (typeof wire !== "object" || wire === null) return undefined;
  const mode = wire as {
    id?: unknown;
    name?: unknown;
    back_to?: unknown;
    everything?: unknown;
    until?: unknown;
    by?: unknown;
    at?: unknown;
  };
  if (typeof mode.id !== "string" || mode.id === "") return undefined;
  return {
    id: mode.id,
    ...(typeof mode.name === "string" ? { name: mode.name } : {}),
    ...(typeof mode.back_to === "string" ? { backTo: mode.back_to } : {}),
    ...(mode.everything === true ? { everything: true as const } : {}),
    ...(typeof mode.until === "string" ? { until: mode.until } : {}),
    ...(typeof mode.by === "string" ? { by: mode.by } : {}),
    ...(typeof mode.at === "string" ? { at: mode.at } : {}),
  };
}

/** A harness's level and rules in one room; a budget the event carries is still the harness's. */
function foldRoom(
  entry: MutablePolicy,
  event: ClientEvent,
  spaceId: string,
  rules: Rule[],
  level: 0 | 1 | 2 | 3,
): void {
  entry.rooms.set(spaceId, { autonomy: level, rules });
  const budget = field<number>(event, "budget_usd");
  if (budget !== undefined && entry.everywhere !== undefined) entry.everywhere.budgetUsd = budget;
}

/** ", 3 rules" for a change that carries rules; nothing for none. */
function ruleCount(rules: readonly Rule[]): string {
  return rules.length > 0 ? `, ${rules.length} rule${rules.length === 1 ? "" : "s"}` : "";
}

/**
 * The record's line for a harness's policy change: its level and rules, or, for every space, a
 * mode picked or put back, which is its own line: what the person did (ADR 0300, 19 November
 * addendum). A put-back names the mode the one before it said it went back to.
 */
function policyLine(
  harnessId: string,
  spaceId: string | undefined,
  level: number,
  rules: readonly Rule[],
  picked: unknown,
  before: PickedMode | undefined,
): Pick<AuditEntry, "what" | "mode"> {
  if (picked === undefined) {
    return {
      what: `set autonomy to L${level}${spaceId === undefined ? "" : " here"}${ruleCount(rules)}`,
    };
  }
  const mode = modeFrom(picked);
  if (mode === undefined) {
    const name = before?.backTo;
    return {
      what: `put it back in ${name ?? "the mode it starts in"}`,
      mode: { harnessId, back: true, ...(name === undefined ? {} : { name }) },
    };
  }
  const name = mode.name ?? mode.id;
  return {
    what: `put it in ${name}`,
    mode: { harnessId, name, ...(mode.until === undefined ? {} : { until: mode.until }) },
  };
}

/** A harness's level, rules and budget everywhere, and its hold when the event says one. */
function foldEverywhere(
  entry: MutablePolicy,
  event: ClientEvent,
  policy: { rules: Rule[]; hold?: unknown; chips_rules?: unknown; mode?: unknown },
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
  // And a mode: `null` puts it back in the mode it starts in (ADR 0300, 19 November addendum).
  if (policy.mode !== undefined) {
    entry.mode = modeFrom(policy.mode);
    entry.modeSince = event.ts;
  }
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
      mode?: unknown;
    }>(event, "policy");
    const entry: MutablePolicy = state.policies.get(harnessId) ?? { rooms: new Map() };
    // The mode before this change, for the line a put-back writes.
    const before = entry.mode;
    const level = levelOf(policy.autonomy);
    if (event.space_id === undefined) foldEverywhere(entry, event, policy, level);
    else foldRoom(entry, event, event.space_id, policy.rules, level);
    state.policies.set(harnessId, entry);
    state.workspaceMax = levelOf(field(event, "workspace_max_autonomy"));
    // A level is part of every run's frozen shape, so a change to one restates them all.
    touchAll(state);
    const picked = event.space_id === undefined ? policy.mode : undefined;
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "policy",
      who: required<string>(event, "changed_by"),
      ...policyLine(harnessId, event.space_id, level, policy.rules, picked, before),
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
      what: `set the rules for every harness${ruleCount(rules)}${hold === undefined ? "" : ", asks off"}`,
      spaceId: undefined,
      reason: undefined,
    });
  },
};
