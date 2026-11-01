/**
 * The policy engine: whether an action needs a person, and which person (ADR 0008).
 *
 *   evaluate(action, harnessPolicy, workspacePolicy) -> { decision: allow | ask | deny, approvers?, reason }
 *
 * A pure function with no I/O, so a decision is reproducible from its inputs and the audit
 * record means something. Autonomy levels L0 to L3 are presets that expand to rules; explicit
 * rules match on the action's `kind` — a dotted verb, with `*` as a wildcard — and on its flags:
 * `external`, `irreversible`, `money_usd`, and the risk classes it carries.
 *
 * The workspace cap always wins: the level in force is the harness's, capped by the workspace's,
 * and a workspace rule is consulted before a harness's. A harness's own rule may ask or deny at
 * any level; it may allow only where the workspace lets policy decide (a cap of L2 and above) and
 * the harness is not at L0, so a room capped at L0 or L1 cannot be talked past by a harness's
 * rule, and L0 asks for everything. Among a harness's rules are the ones a person's answer made
 * — "Always", and "This session" in front of them — which is why L1 counts: every harness starts
 * there, and an answer that changed nothing there was a promise the card could not keep.
 *
 * Since ADR 0195 a rule a person turned off is skipped until they turn it back on, and a rule a
 * person's answer made (it carries `made_at`) never allows an action that matters: those always
 * wait for a person, which is what the harness page promises.
 *
 * Since ADR 0239 a rule may name how a command starts (`when.starts_with`). Such a rule never
 * speaks for an action whole: the command is read part by part (`commandParts`), and it goes ahead
 * on those rules only when every part starts with one that allows it, never when a part uses a
 * command no standing yes is given for. A part one denies denies it.
 */

import {
  type AutonomyLevel,
  actionMatters,
  commandParts,
  neverStanding,
  type PolicyRule,
  type RiskClass,
  startsWith,
} from "@chipschat/protocol";

/** What the engine looks at: the action's kind, its flags, and the risk the harness declared. */
export interface PolicyAction {
  readonly kind: string;
  readonly external?: boolean | undefined;
  readonly irreversible?: boolean | undefined;
  readonly money_usd?: number | undefined;
  readonly risk?: readonly RiskClass[] | undefined;
  /** The command it runs, when it carries one: its string, or its words (ADR 0239). */
  readonly command?: string | readonly string[] | undefined;
}

export interface HarnessPolicy {
  readonly autonomy: AutonomyLevel;
  readonly rules: readonly PolicyRule[];
}

export interface WorkspacePolicy {
  readonly maxAutonomy: AutonomyLevel;
  readonly rules: readonly PolicyRule[];
}

export type PolicyDecision = "allow" | "ask" | "deny";

export interface Decision {
  readonly decision: PolicyDecision;
  /** Who may answer, when the decision is `ask`. `owner` unless a rule says otherwise. */
  readonly approvers?: readonly string[] | undefined;
  /** Why, in a sentence the harness gets to read and the audit records. */
  readonly reason: string;
  /** The level in force: the harness's, capped by the workspace. */
  readonly level: AutonomyLevel;
  /** The rule that decided, when one did rather than the level. */
  readonly rule?: PolicyRule | undefined;
}

export const DEFAULT_APPROVERS: readonly string[] = ["owner"];

/**
 * What resolving approver refs needs to know: the harness's owner, the people in the room with
 * their standing there and in the workspace, and the lane's lead when the run is a lane's.
 */
export interface ApproverFacts {
  /** The harness's owner, when it has one. */
  readonly owner: string | undefined;
  /** The people in the space, with their standing there and, since ADR 0034, in the workspace. */
  readonly people: readonly {
    readonly id: string;
    readonly role: string;
    readonly workspaceRole?: string | null | undefined;
  }[];
  /** The harness leading the lane this run is, when it is one (M5.5, open decision 7). */
  readonly lead?: string | undefined;
}

/**
 * Who an approver list names (M3.3). A ref is `owner` — the harness's own — `any`,
 * `role:<name>`, `lead`, or a person's id; the answer is ids, each once, in the order the refs
 * gave them. `role:<name>` is a standing in the space or in the workspace (M5.5): `role:admin`
 * names the workspace's admins in the room, `role:owner` the room's owner and the workspace's.
 * `any` is everyone in the room but a guest (Gate 5): a guest is there to be talked to, not to
 * say yes for the harness's owner. `lead` names the harness leading the lane, which is who
 * policy may hand a low-risk ask to. A list that resolves to nobody falls back to the owner, so
 * an ask always has somebody who may answer it; with no owner either, it is anyone's, which is
 * what an empty list means.
 */
export function approversFor(refs: readonly string[], facts: ApproverFacts): string[] {
  const unique = resolveApprovers(refs, facts);
  if (unique.length > 0) return unique;
  return facts.owner === undefined ? [] : [facts.owner];
}

/**
 * The same, without the fall-back: the ids the refs name and nobody else, each once. What
 * handing an approval on resolves (Gate 5): a router who names nobody is refused, not answered
 * with the owner.
 */
export function resolveApprovers(refs: readonly string[], facts: ApproverFacts): string[] {
  return [...new Set(refs.flatMap((ref) => approverRefIds(ref, facts)))];
}

/**
 * Of the refs, the ids named in person: a person's own id, and `owner`, the asking harness's.
 * These reach outside the room (ADR 0042) — being named is standing enough — where `any`,
 * `role:<name>` and `lead` are the room and the lane, and name nobody who is not there.
 */
export function namedInPerson(refs: readonly string[], facts: ApproverFacts): string[] {
  return [
    ...new Set(
      refs.flatMap((ref) => {
        if (ref === "owner") return facts.owner === undefined ? [] : [facts.owner];
        if (ref === "any" || ref === "lead" || ref.startsWith("role:")) return [];
        return [ref];
      }),
    ),
  ];
}

/** A guest of the room or of the workspace is never "anyone" (Gate 5). */
function notAGuest(person: ApproverFacts["people"][number]): boolean {
  return person.role !== "guest" && person.workspaceRole !== "guest";
}

function approverRefIds(ref: string, facts: ApproverFacts): string[] {
  if (ref === "owner") return facts.owner === undefined ? [] : [facts.owner];
  if (ref === "any") return facts.people.filter(notAGuest).map((person) => person.id);
  if (ref === "lead") return facts.lead === undefined ? [] : [facts.lead];
  if (ref.startsWith("role:")) {
    const role = ref.slice("role:".length);
    return facts.people
      .filter((person) => person.role === role || person.workspaceRole === role)
      .map((person) => person.id);
  }
  return [ref];
}

/** The verbs that make an action a read, which L1 lets through. */
const READ_VERBS: ReadonlySet<string> = new Set([
  "read",
  "list",
  "get",
  "search",
  "fetch",
  "view",
  "lookup",
  "query",
]);

export const LEVEL_NAMES: Readonly<Record<AutonomyLevel, string>> = {
  0: "L0 · Observe",
  1: "L1 · Ask first",
  2: "L2 · Ask when it matters",
  3: "L3 · Autonomous, report back",
};

/** Whether a kind matches a glob: `*` stands for anything, so `payment.*` covers `payment.transfer`. */
export function kindMatches(glob: string, kind: string): boolean {
  const pattern = glob
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(kind);
}

type When = NonNullable<PolicyRule["when"]>;

/** Each condition a rule may carry, as a check; a condition the rule leaves out is met. */
const CONDITIONS: readonly ((when: When, action: PolicyAction) => boolean)[] = [
  (when, action) => when.external === undefined || (action.external ?? false) === when.external,
  (when, action) =>
    when.irreversible === undefined || (action.irreversible ?? false) === when.irreversible,
  (when, action) =>
    when.money_usd_over === undefined || (action.money_usd ?? 0) > when.money_usd_over,
  (when, action) =>
    when.risk === undefined || when.risk.some((risk) => action.risk?.includes(risk) === true),
];

function ruleMatches(rule: PolicyRule, action: PolicyAction): boolean {
  if (!kindMatches(rule.match, action.kind)) return false;
  const when = rule.when;
  return when === undefined || CONDITIONS.every((met) => met(when, action));
}

/** A rule for how a command's part starts (ADR 0239), which speaks only part by part. */
function forParts(rule: PolicyRule): rule is PolicyRule & { when: { starts_with: string[] } } {
  return rule.when?.starts_with !== undefined;
}

/** What the part rules say of a command: one that decides, or every allow that covers it. */
type PartsVerdict =
  | { readonly decision: "deny" | "ask"; readonly rule: PolicyRule }
  | { readonly decision: "allow"; readonly rules: readonly PolicyRule[] };

/**
 * A command against the rules for its parts' starts: a part one denies or asks about decides
 * that; every part starting with one that allows lets it go ahead; anything less says nothing, so
 * the kind's own rules and the level decide. A command that can't be read says nothing either,
 * and one that uses a command never given a standing yes is never let through by them.
 */
function partsVerdict(
  rules: readonly PolicyRule[],
  action: PolicyAction,
): PartsVerdict | undefined {
  if (action.command === undefined) return undefined;
  const speaking = rules
    .filter(forParts)
    .filter((rule) => rule.off !== true && ruleMatches(withoutStarts(rule), action));
  if (speaking.length === 0) return undefined;
  const parts = commandParts(action.command);
  if (parts === undefined) return undefined;
  const covers = (rule: (typeof speaking)[number]) =>
    parts.some((part) => startsWith(part, rule.when.starts_with));
  const stops = speaking.find((rule) => rule.decision !== "allow" && covers(rule));
  if (stops !== undefined) return { decision: stops.decision as "deny" | "ask", rule: stops };
  if (neverStanding(parts) !== undefined) return undefined;
  const allows = speaking.filter(
    (rule) => rule.decision === "allow" && !(rule.made_at !== undefined && matters(action)),
  );
  const used: PolicyRule[] = [];
  for (const part of parts) {
    const rule = allows.find((each) => startsWith(part, each.when.starts_with));
    if (rule === undefined) return undefined;
    if (!used.includes(rule)) used.push(rule);
  }
  return { decision: "allow", rules: used };
}

/** The rule's kind and flags, without its start, for matching the action whole. */
function withoutStarts(rule: PolicyRule): PolicyRule {
  const { starts_with: _, ...when } = rule.when ?? {};
  return { ...rule, when };
}

/** `email.send when external → ask`, the sentence a rule is. */
export function describeRule(rule: PolicyRule): string {
  const when = rule.when;
  const conditions = [
    when?.external === true ? "external" : undefined,
    when?.external === false ? "internal" : undefined,
    when?.irreversible === true ? "irreversible" : undefined,
    when?.money_usd_over === undefined ? undefined : `over $${when.money_usd_over}`,
    when?.risk === undefined ? undefined : `risk ${when.risk.join(" or ")}`,
    when?.starts_with === undefined ? undefined : `starting ${when.starts_with.join(" ")}`,
  ].filter((part) => part !== undefined);
  const clause = conditions.length === 0 ? "" : ` when ${conditions.join(", ")}`;
  return `${rule.match}${clause} → ${rule.decision}`;
}

/**
 * Whether the action is one the presets stop for: it leaves the workspace, spends, or cannot be
 * undone. The protocol's sentence (`actionMatters`), so the conformance kit and the apps agree.
 */
export function matters(action: PolicyAction): boolean {
  return actionMatters(action);
}

/**
 * Whether a rule speaks for this action. A rule a person turned off is skipped until they turn it
 * back on; and a rule a person's answer made (Always, This session: it carries `made_at`) never
 * allows an action that matters, which always waits for a person (ADR 0195). A small ask's
 * Always reaches the next small ask of its kind, not the same kind carrying money.
 */
function speaks(rule: PolicyRule, action: PolicyAction): boolean {
  if (rule.off === true || forParts(rule) || !ruleMatches(rule, action)) return false;
  return !(rule.made_at !== undefined && rule.decision === "allow" && matters(action));
}

function isRead(kind: string): boolean {
  const verb = kind.split(".").at(-1) ?? "";
  return READ_VERBS.has(verb);
}

function decided(rule: PolicyRule, origin: string, level: AutonomyLevel): Decision {
  return {
    decision: rule.decision,
    ...(rule.decision === "ask" ? { approvers: rule.approvers ?? DEFAULT_APPROVERS } : {}),
    reason: rule.reason ?? `${describeRule(rule)}, by ${origin}`,
    level,
    rule,
  };
}

/** Every part of a command allowed by the rules for how it starts, as the audit says it. */
function partsAllowed(
  rules: readonly PolicyRule[],
  origin: string,
  level: AutonomyLevel,
): Decision {
  const starts = rules.map((rule) => `${rule.when?.starts_with?.join(" ") ?? ""} …`);
  return {
    decision: "allow",
    reason: `every part of the command is allowed always (${starts.join(", ")}), by ${origin}`,
    level,
    rule: rules[0],
  };
}

/** What the level says on its own, once no rule has spoken. */
function preset(level: AutonomyLevel, action: PolicyAction): Decision {
  const name = LEVEL_NAMES[level];
  const ask = (why: string): Decision => ({
    decision: "ask",
    approvers: DEFAULT_APPROVERS,
    reason: `${name}: ${why}`,
    level,
  });
  const allow = (why: string): Decision => ({
    decision: "allow",
    reason: `${name}: ${why}`,
    level,
  });

  switch (level) {
    case 0:
      return ask("every action needs a yes");
    case 1:
      return isRead(action.kind) && !matters(action)
        ? allow("reads are free")
        : ask("every write and every external action asks");
    case 2:
      return matters(action)
        ? ask("money, external messages, deletions and anything irreversible ask")
        : allow("runs and shows up in the receipt");
    default:
      return allow("runs end to end and reports back");
  }
}

/**
 * The decision for an action. Workspace rules first, then the harness's, then the level; the
 * first rule that matches decides, except that a harness's `allow` under a cap below L2, or at
 * L0, defers to the level.
 */
export function evaluate(
  action: PolicyAction,
  harness: HarnessPolicy,
  workspace: WorkspacePolicy,
): Decision {
  // The workspace cap always wins. A cap that cannot be read — a projection row missing a
  // number — fails closed to L0, never open: `Math.min(3, undefined)` is NaN, and NaN is
  // below no level and above every rule.
  const cap = Number.isFinite(workspace.maxAutonomy) ? workspace.maxAutonomy : 0;
  const level = Math.min(harness.autonomy, cap) as AutonomyLevel;

  const mayAllow = cap >= 2 && harness.autonomy >= 1;
  return (
    byWorkspace(workspace.rules, action, level) ??
    byHarness(harness.rules, action, level, mayAllow) ??
    preset(level, action)
  );
}

/** The workspace's rules, which speak first and whichever way they decide. */
function byWorkspace(
  rules: readonly PolicyRule[],
  action: PolicyAction,
  level: AutonomyLevel,
): Decision | undefined {
  const parts = partsVerdict(rules, action);
  if (parts !== undefined) {
    return parts.decision === "allow"
      ? partsAllowed(parts.rules, "the workspace", level)
      : decided(parts.rule, "the workspace", level);
  }
  const rule = rules.find((each) => speaks(each, action));
  return rule === undefined ? undefined : decided(rule, "the workspace", level);
}

/**
 * The harness's rules, where a no wins over a yes: a part a rule stops, then the kind's own no,
 * then the yeses, which speak only where the workspace lets policy decide.
 */
function byHarness(
  rules: readonly PolicyRule[],
  action: PolicyAction,
  level: AutonomyLevel,
  mayAllow: boolean,
): Decision | undefined {
  const origin = "the harness's policy";
  const parts = partsVerdict(rules, action);
  if (parts !== undefined && parts.decision !== "allow") return decided(parts.rule, origin, level);
  const rule = rules.find((each) => speaks(each, action));
  if (rule !== undefined && rule.decision !== "allow") return decided(rule, origin, level);
  if (!mayAllow) return undefined;
  if (parts !== undefined) return partsAllowed(parts.rules, origin, level);
  return rule === undefined ? undefined : decided(rule, origin, level);
}
