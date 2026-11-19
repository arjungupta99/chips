/**
 * Rules a person writes, and a harness's asks turned off (ADR 0299), as Chips keeps them.
 *
 * A person sends a scope's rules whole (`policy.updated`, `policy.workspace_updated`). A rule
 * already there keeps who made it and when, whatever the client sent; a rule new to the scope is
 * stamped with the sender and the time, so a written Allow never allows an action that matters
 * (ADR 0195), and refused when no person may give it (`writtenRuleRefusal`). A hold is stamped
 * the same way, and becomes one rule, `*` → allow, read after every rule that says no.
 */

import {
  HOLD_REASON,
  type PolicyHold,
  type PolicyRule,
  ruleShape,
  writtenRuleRefusal,
} from "@chipschat/protocol";

/** The rules as Chips keeps them, or why one is refused. */
export type Kept =
  | { readonly ok: true; readonly rules: PolicyRule[] }
  | { readonly ok: false; readonly why: string };

/**
 * `next`, with each rule `previous` had keeping its maker, and each new one stamped `by` at `at`;
 * or the first new rule no person may write, refused.
 */
export function keepWritten(
  previous: readonly PolicyRule[],
  next: readonly PolicyRule[],
  by: string,
  at: string,
): Kept {
  const known = new Map(previous.map((rule) => [ruleShape(rule), rule]));
  const rules: PolicyRule[] = [];
  for (const rule of next) {
    const { made_by: _by, made_at: _at, ...asSent } = rule;
    const before = known.get(ruleShape(rule));
    if (before !== undefined) {
      rules.push({
        ...asSent,
        ...(before.made_by === undefined ? {} : { made_by: before.made_by }),
        ...(before.made_at === undefined ? {} : { made_at: before.made_at }),
      });
      continue;
    }
    const why = writtenRuleRefusal(rule);
    if (why !== undefined) return { ok: false, why };
    rules.push({ ...asSent, made_by: by, made_at: at });
  }
  return { ok: true, rules };
}

/** A hold as Chips keeps it: who turned the asks off and when, whatever the client said. */
export function keepHold(hold: PolicyHold, by: string, at: string): PolicyHold {
  return {
    ...(hold.until === undefined ? {} : { until: hold.until }),
    ...(hold.matters === true ? { matters: true } : {}),
    by,
    at,
  };
}

/**
 * The yes each hold still holding says, as the engine reads it after every rule that says no: one
 * rule each. A hold that covers asks that matter carries no `made_at`; one that doesn't carries
 * the time it began, so what matters still waits for a person (ADR 0195).
 */
export function holdRules(
  holds: readonly (PolicyHold | null | undefined)[],
  now: string,
): PolicyRule[] {
  return holds.flatMap((hold) => (holding(hold, now) ? [holdRule(hold, now)] : []));
}

/** Whether a hold still holds at `now`. */
function holding(hold: PolicyHold | null | undefined, now: string): hold is PolicyHold {
  return hold !== null && hold !== undefined && (hold.until === undefined || hold.until > now);
}

/** The one rule a hold says. */
function holdRule(hold: PolicyHold, now: string): PolicyRule {
  return {
    match: "*",
    decision: "allow",
    reason: hold.until === undefined ? HOLD_REASON : `${HOLD_REASON} until ${hold.until}`,
    ...(hold.by === undefined ? {} : { made_by: hold.by }),
    ...(hold.matters === true ? {} : { made_at: hold.at ?? now }),
  };
}
