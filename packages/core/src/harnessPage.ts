/**
 * What a harness's page says (ADR 0254, Arjun's B of the mock "Harness page layouts"): where it
 * works, under its head; its first five agents, with See all for the rest; the values at the right
 * of its Set up rows (Context files, When it asks you) and its History row (Recent runs); and its
 * budget. The phone drew these first and kept them in `apps/mobile/src/harnesses/words.ts`; they are
 * here so the desktop's page says the same sentences (ADR 0266). The values of the desk's own
 * Connection rows (Owner, What it sends, What it may do; ADR 0273) are here with them.
 */

import { CONNECTION_CHECKLIST } from "@chipschat/protocol";
import { agoWords } from "./agents.js";
import type { AlwaysRule, AsksGoTo } from "./asking.js";
import type { HarnessGroups } from "./context.js";
import { type Directory, harnessOf, nameOf } from "./events.js";
import { OFFERED } from "./join.js";
import type {
  FleetHarness,
  HarnessConnection,
  HarnessPolicyModel,
  Run,
  RunState,
  Space,
} from "./model/types.js";

/** How many of a harness's agents its page shows before See all opens the rest. */
export const AGENTS_SHOWN = 5;

/**
 * A harness across all of its spaces (ADR 0024): how many terminals are open on it, how many places
 * it works in, and how much of what is waiting on you is its. One with no spaces at all has not been
 * connected to anything yet, and saying that is more use than three zeroes.
 */
export function harnessRollup(entry: FleetHarness | undefined): string {
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

/** Under the head of a harness that was removed: what stays of it. */
export const REMOVED_HARNESS_NOTE = "Removed from the workspace. What it said stays in its spaces.";

/**
 * A harness's runs, the most recent first, across every space this device can see. A run is its
 * agent's since agents (ADR 0087), so it is the harness's when its agent is one of the harness's.
 */
export function harnessRuns(
  spaces: readonly Pick<Space, "runs">[],
  directory: Directory,
  harnessId: string,
  howMany = Number.POSITIVE_INFINITY,
): readonly Run[] {
  return spaces
    .flatMap((space) => space.runs)
    .filter((run) => harnessOf(directory, run.harnessId) === harnessId)
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
    .slice(0, howMany);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What the Recent runs row says at its right: how many began in the last seven days. */
export function runsWeekWords(runs: readonly Pick<Run, "startedAt">[], now: number): string {
  const week = runs.filter(
    (run) => run.startedAt !== undefined && now - Date.parse(run.startedAt) < WEEK_MS,
  ).length;
  return week === 0 ? "None this week" : `${week} this week`;
}

/** How a run ended, or where it is, in the word its row on Recent runs says. */
export const RUN_STATE_WORDS: Readonly<Record<RunState, string>> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * What the Context files row says at its right: how many files its agents share, or, with none
 * shared, how many a new agent is given. Nothing before the set has come.
 */
export function contextValue(groups: HarnessGroups | undefined): string | undefined {
  if (groups === undefined) return undefined;
  if (groups.shared.length > 0) return `${groups.shared.length} shared`;
  if (groups.forNew.length > 0) return `${groups.forNew.length} for new agents`;
  return "None shared";
}

/**
 * What the When it asks you row says at its right: how many things are allowed always, or, with
 * none, who decides its asks.
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

/** The Owner row's value (ADR 0273): "You" for the reader, else the owner's name; nothing for none. */
export function ownerValue(
  directory: Directory,
  ownerId: string | undefined,
  selfId: string | undefined,
): string | undefined {
  if (ownerId === undefined) return undefined;
  return ownerId === selfId ? "You" : nameOf(directory, ownerId);
}

/**
 * The What it sends row's value: how many of the connection checklist's rows have lit, and when it
 * was last heard once it has been ("3 of 9 · heard now", "9 of 9 · heard 4 min ago").
 */
export function sendsValue(connection: HarnessConnection | undefined, now: number): string {
  const seen = new Set(connection?.seen ?? []);
  const lit = CONNECTION_CHECKLIST.filter((row) => row.types.some((type) => seen.has(type)));
  const count = `${lit.length} of ${CONNECTION_CHECKLIST.length}`;
  const at = connection?.lastSeenAt === undefined ? Number.NaN : Date.parse(connection.lastSeenAt);
  if (Number.isNaN(at)) return count;
  const ms = Math.max(0, now - at);
  return `${count} · heard ${ms < 60_000 ? "now" : `${agoWords(ms)} ago`}`;
}

/** The What it may do row's value: how many of the capabilities Chips draws for it may use. */
export function mayDoValue(capabilities: readonly string[] | undefined): string {
  const on = OFFERED.filter((each) => capabilities?.includes(each) === true).length;
  return `${on} of ${OFFERED.length}`;
}
