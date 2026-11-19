/**
 * The rules a person writes (ADR 0299): Allow, Ask me or Never, for one harness or for every
 * harness. Chips keeps who made each one, so a written Allow never allows an action that matters
 * (ADR 0195), and refuses the Allows a standing yes is never given for (ADR 0239).
 */

import { commandKind, neverStanding } from "./commands.js";
import type { PolicyRule } from "./primitives.js";

/**
 * The reason the policy engine and the log give a yes said while a harness's asks are off
 * (`policy.hold`), so the apps can tell those answers apart.
 */
export const HOLD_REASON = "its asks are off";

/** Why Chips refuses a rule a person writes, in a sentence; nothing for one that may stand. */
export function writtenRuleRefusal(rule: PolicyRule): string | undefined {
  if (rule.decision !== "allow") return undefined;
  const starts = rule.when?.starts_with;
  if (starts === undefined) {
    // A start speaks only for a command, so `*` with one is every harness's commands that start so.
    if (rule.match.includes("*")) {
      return "A rule can't let everything through: use Stop asking for that.";
    }
    return commandKind(rule.match) ? "A rule that allows commands says how they start." : undefined;
  }
  const never = neverStanding([starts]);
  return never === undefined ? undefined : `\`${never}\` never gets a standing yes.`;
}

/** A rule as itself, whether or not it is switched off and whoever made it. */
export function ruleShape(rule: PolicyRule): string {
  const { off: _off, made_by: _by, made_at: _at, ...rest } = rule;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** The reason an ask goes to a person because the harness's Chips's rules are off (ADR 0300). */
export const CHIPS_RULES_OFF = "Chips's rules are off for this harness";

/** What a harness and its workspace have of Chips's own, for reading a switch never set. */
export interface ChipsRulesHas {
  /** A rule in any of the harness's rows, everywhere or a space's. */
  readonly harnessRules: boolean;
  /** Its level set above L1 anywhere: the dial lets Chips say yes to asks that don't matter. */
  readonly harnessLevel: boolean;
  /** A hold on the harness, past or present. */
  readonly harnessHold: boolean;
  /** A rule for every harness. */
  readonly workspaceRules: boolean;
  /** A hold on every harness, past or present. */
  readonly workspaceHold: boolean;
}

/**
 * Whether Chips's rules answer a harness's asks (ADR 0300): as set, and never set, on for a
 * harness that has a rule, a level above L1 or a hold, or whose workspace has rules or a hold, so
 * nothing anyone set stops working, and off for a new harness. Read from the log's projection, so a replay agrees.
 */
export function chipsRulesOn(set: boolean | null | undefined, has: ChipsRulesHas): boolean {
  if (set === true || set === false) return set;
  return (
    has.harnessRules ||
    has.harnessLevel ||
    has.harnessHold ||
    has.workspaceRules ||
    has.workspaceHold
  );
}
