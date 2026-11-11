/**
 * What the fleet says about a harness, in words. Pure, because these are sentences a person
 * reads at a glance and they should be the same sentences the desktop uses.
 */

import type {
  AlwaysRule,
  AsksGoTo,
  FleetHarness,
  HarnessGroups,
  HarnessPolicyModel,
  Run,
  RunState,
  Snapshot,
} from "@chipschat/core";
import { harnessOf } from "@chipschat/core";
import type { HarnessStatus } from "../ui/vocabulary";

/**
 * A run's state as the status vocabulary's. A harness with no run at all is idle: it has
 * nothing going on, which is a state and not an absence.
 */
export function statusOf(entry: FleetHarness | undefined): HarnessStatus {
  if (entry?.status === undefined) return "idle";
  // Paused is a person's hand on the brake, not the harness's own state, and the fleet says so.
  if (entry.paused) return "waiting";
  const table: Readonly<Record<RunState, HarnessStatus>> = {
    queued: "thinking",
    running: "working",
    waiting: "waiting",
    paused: "waiting",
    done: "done",
    failed: "failed",
    cancelled: "idle",
  };
  return table[entry.status];
}

/**
 * Whether the fleet draws a status at all (ADR 0050 rule 1, as the room follows it): a harness
 * with something going on says so, and one that is idle or has finished says nothing. Done was a
 * green pill that stayed for good, which is a screen full of congratulations nobody asked for;
 * the row beneath is the proof. It governs the ring as well as the pill, because state on this
 * app is always a colour *and* a word, and a green ring with no word beside it is decoration.
 */
export function saysStatus(status: HarnessStatus): boolean {
  return status !== "idle" && status !== "done";
}

/**
 * A harness across all of its spaces (ADR 0024): how many terminals are open on it, how many
 * places it works in, and how much of what is waiting on you is its. One with no spaces at all has not been
 * connected to anything yet, and saying that is more use than three zeroes.
 */
export function rollup(entry: FleetHarness | undefined): string {
  if (entry === undefined || entry.spaceCount === 0) return "No spaces yet";
  const sessions =
    entry.liveSessions === 0
      ? "No live sessions"
      : `${entry.liveSessions} live ${entry.liveSessions === 1 ? "session" : "sessions"}`;
  return [
    sessions,
    `${entry.spaceCount} ${entry.spaceCount === 1 ? "space" : "spaces"}`,
    ...(entry.needsYou === 0 ? [] : [`${entry.needsYou} waiting on you`]),
  ].join(" · ");
}

/** How many of a harness's agents its page shows before See all opens the rest (ADR 0254). */
export const AGENTS_SHOWN = 5;

/**
 * A harness's runs, the most recent first, across every space this device can see. A run is its
 * agent's since agents (ADR 0087), so it is the harness's when its agent is one of the harness's;
 * matching the run's own id alone missed every run after the upgrade (found 30 September 2026).
 */
export function harnessRuns(
  snapshot: Snapshot,
  harnessId: string,
  howMany = Number.POSITIVE_INFINITY,
): readonly Run[] {
  return snapshot.model.spaces
    .flatMap((space) => space.runs)
    .filter((run) => harnessOf(snapshot.directory, run.harnessId) === harnessId)
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
    .slice(0, howMany);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What the Recent runs row says at its right (ADR 0254): how many began in the last seven days. */
export function runsWeekWords(runs: readonly Pick<Run, "startedAt">[], now: number): string {
  const week = runs.filter(
    (run) => run.startedAt !== undefined && now - Date.parse(run.startedAt) < WEEK_MS,
  ).length;
  return week === 0 ? "None this week" : `${week} this week`;
}

/**
 * What the Context files row says at its right (ADR 0254): how many files its agents share, or,
 * with none shared, how many a new agent is given. Nothing before the set has come.
 */
export function contextValue(groups: HarnessGroups | undefined): string | undefined {
  if (groups === undefined) return undefined;
  if (groups.shared.length > 0) return `${groups.shared.length} shared`;
  if (groups.forNew.length > 0) return `${groups.forNew.length} for new agents`;
  return "None shared";
}

/**
 * What the When it asks you row says at its right (ADR 0254): how many things are allowed always,
 * or, with none, who decides its asks.
 */
export function asksValue(rules: readonly Pick<AlwaysRule, "on">[], to: AsksGoTo): string {
  if (rules.length > 0) {
    const on = rules.filter((rule) => rule.on).length;
    return on === rules.length ? `${on} allowed always` : `${on} of ${rules.length} allowed always`;
  }
  if (to.kind === "you") return "You decide";
  return to.kind === "owner" ? `${to.name} decides` : "A person decides";
}

/** The budget line under the bar: what has gone, of what there was. */
export function budgetWords(policy: HarnessPolicyModel | undefined): string | undefined {
  if (policy?.budgetUsd === undefined) return undefined;
  return `$${policy.spentUsd.toFixed(2)} of $${policy.budgetUsd.toFixed(2)}`;
}

/**
 * A policy rule as one line: `payment.* over $100 → ask the owner`. Rules are meant to read
 * like sentences, and this is the sentence.
 *
 * It reads what is there rather than insisting on a shape. The fold keeps a rule verbatim as
 * the protocol sent it, and a rule from a newer server should appear in the list a person is
 * judging a harness by rather than be silently dropped from it.
 */
export function ruleWords(rule: Readonly<Record<string, unknown>>): string {
  const match = text(rule["match"]) ?? "Anything";
  const decision = text(rule["decision"]);
  const who = names(rule["approvers"]);
  const tail = [decision, who].filter((each) => each !== undefined).join(" ");
  return `${[match, ...conditions(rule["when"])].join(" ")}${tail === "" ? "" : ` → ${tail}`}`;
}

/** The extra conditions on an action's flags, as the clauses that follow the action. */
function conditions(when: unknown): readonly string[] {
  if (typeof when !== "object" || when === null) return [];
  const flags = when as Record<string, unknown>;
  const over = flags["money_usd_over"];
  const risk = flags["risk"];
  return [
    ...(flags["external"] === true ? ["to somewhere outside"] : []),
    ...(flags["irreversible"] === true ? ["that cannot be undone"] : []),
    ...(typeof over === "number" ? [`over $${over}`] : []),
    ...(Array.isArray(risk) && risk.length > 0 ? [`(${risk.map(String).join(", ")})`] : []),
  ];
}

/** Who may answer, when the decision is to ask. `owner`, `any`, `role:finance`, a person's id. */
function names(approvers: unknown): string | undefined {
  if (!Array.isArray(approvers) || approvers.length === 0) return undefined;
  return approvers.map((each) => String(each).replace(/^role:/, "the ")).join(" or ");
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
