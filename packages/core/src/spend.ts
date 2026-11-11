/**
 * What a room allows a job, as a person sets it (ADR 0117, Arjun's C): five amounts and Other,
 * the default among them, and No cap for a room that lasts (ADR 0292), and what the job has spent
 * so far against the one picked. In core so the phone's room sheet and the desktop's (ADR 0151)
 * offer the same amounts in the same words.
 *
 * And what the room has spent job by job (ADR 0282, Arjun's C of the mock "Spend in Chips
 * explain", 6 November 2026): the last job on the tile, the jobs before this one on the page with
 * the room's total, and the banner's way to a higher ceiling that lets the agents carry on with it.
 */

import {
  DEFAULT_SPEND_CEILING_USD,
  dollars,
  isSpendCeiling,
  type JobSpend,
  NO_SPEND_CEILING,
  type RoomSpend,
  SPEND_CEILING_MAX,
  SPEND_CEILING_MIN,
  type SpendCeilingSetting,
  type SpentJob,
} from "@chipschat/protocol";
import { askDay, askTime } from "./asksSoFar.js";
import { type Directory, nameOf } from "./events.js";
import type { Run, Space } from "./model/types.js";

/** The amounts offered at a tap, the default among them; Other takes any other. */
export const SPEND_PRESETS: readonly number[] = [1, DEFAULT_SPEND_CEILING_USD, 5, 10, 25];

/** What is picked: the default, one of the presets, another amount typed in, or No cap. */
export type SpendChoice = "default" | number | "other" | typeof NO_SPEND_CEILING;

/** What the room's ceiling is picked as now: the default when nobody set one. */
export function spendChoiceOf(space: Space): SpendChoice {
  const usd = space.spendCeiling;
  if (usd === undefined) return "default";
  if (usd === NO_SPEND_CEILING) return NO_SPEND_CEILING;
  return SPEND_PRESETS.includes(usd) ? usd : "other";
}

/** No cap's name on its tile and the room's, and what it means under it (ADR 0292). */
export const NO_CAP = "No cap";
export const NO_CAP_UNDER = "Chips never holds them";

/** A room's ceiling in words: "$3.00", or "No cap". */
export function ceilingWords(ceiling: number | typeof NO_SPEND_CEILING): string {
  return ceiling === NO_SPEND_CEILING ? NO_CAP : dollars(ceiling);
}

/**
 * The most an older server allows a job, one that takes no No cap (ADR 0292): its hello says no
 * `spend_no_cap`, and it refuses an amount past this.
 */
const OLDER_SPEND_CEILING_MAX = 100;

/** The most Other takes from this server: $1,000, or $100 from one older than No cap. */
function mostOf(noCap: boolean): number {
  return noCap ? SPEND_CEILING_MAX : OLDER_SPEND_CEILING_MAX;
}

/**
 * An amount typed into Other, when it is one a room may have: "$7.50", "7.5", "10", "1,000". Up to
 * $100 only, for a server that takes no No cap.
 */
export function typedCeiling(typed: string, noCap = true): number | undefined {
  const bare = typed.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(bare)) return undefined;
  const usd = Number(bare);
  return isSpendCeiling(usd) && usd <= mostOf(noCap) ? usd : undefined;
}

/**
 * What a choice sets the room to: an amount, `null` for the default, `"none"` for No cap, or
 * nothing when Other's amount is not one a room may have. The default's own amount, picked, is the
 * default.
 */
export function ceilingOfChoice(
  choice: SpendChoice,
  typed: string,
  noCap = true,
): SpendCeilingSetting | undefined {
  if (choice === "default" || choice === DEFAULT_SPEND_CEILING_USD) return null;
  if (choice === "other") return typedCeiling(typed, noCap);
  return choice;
}

/** What Other's field says it takes, from a server that takes No cap or one older. */
export function spendRangeWords(noCap = true): string {
  return `From ${dollars(SPEND_CEILING_MIN)} to ${dollars(mostOf(noCap))}, in steps of 25¢.`;
}

/** What Other's field says it takes. */
export const SPEND_RANGE_WORDS = spendRangeWords();

/**
 * What Other's field says under it: what it takes, and, once the amount typed is not one, that it
 * is not, so that Save greyed out is never left to explain itself. Past the most, the way to more
 * is No cap (ADR 0292), where the server takes it. An amount half typed ("7.") is not wrong yet.
 */
export function typedHint(
  typed: string,
  noCap = true,
): { readonly words: string; readonly wrong: boolean } {
  const range = spendRangeWords(noCap);
  const bare = typed.replace(/[$\s,]/g, "");
  if (bare === "" || /^\d+\.$/.test(bare) || typedCeiling(typed, noCap) !== undefined) {
    return { words: range, wrong: false };
  }
  const usd = Number(bare);
  const most = mostOf(noCap);
  if (!Number.isFinite(usd) || usd <= most) return { words: range, wrong: true };
  const more = noCap ? ` For more, pick ${NO_CAP}.` : "";
  return { words: `Other goes up to ${dollars(most)}.${more}`, wrong: true };
}

/** What the setting does, said on its page (ADR 0118: Chips holds the agents at it). */
export const SPEND_HELP =
  "When a job here has spent this much, Chips holds the agents: they start nothing new until somebody lets them carry on. A job starts with the last thing a person did in the space.";

/**
 * Under the room's Spend per job row: "This job so far: $1.23", and runs that said no cost. For
 * somebody who sees the amount but doesn't set it (ADR 0196), who does first: "Arjun sets it ·
 * this job so far: $1.23".
 */
export function spentWords(
  spend: Pick<JobSpend, "spent_usd" | "uncounted_runs"> | undefined,
  setBy?: string | undefined,
): string | undefined {
  const sets = setBy === undefined ? undefined : `${setBy} sets it`;
  if (spend === undefined) return sets;
  const so = `${sets === undefined ? "This" : `${sets} · this`} job so far: ${dollars(spend.spent_usd)}`;
  const n = spend.uncounted_runs;
  return n === 0 ? so : `${so} · ${n === 1 ? "1 run" : `${n} runs`} not counted`;
}

/** The banner's way to a higher ceiling, for whoever may set one (ADR 0282). */
export const RAISE_LIMIT = "Raise the limit";

const NO_CAP_CARRY_ON = "Carry on with no cap";

/**
 * The banner's way on at the ceiling there is: "Carry on at $3.00" (ADR 0282), or "Carry on with
 * no cap" once somebody took it off while the agents were held (ADR 0292).
 */
export function carryOnWords(space: Space): string {
  const ceiling = space.spendCeiling ?? DEFAULT_SPEND_CEILING_USD;
  return ceiling === NO_SPEND_CEILING ? NO_CAP_CARRY_ON : `Carry on at ${dollars(ceiling)}`;
}

/**
 * What Raise the limit opens on: the next amount up from the room's ceiling, or the room's own
 * past the last of them.
 */
export function raisedChoice(space: Space): SpendChoice {
  const now = space.spendCeiling ?? DEFAULT_SPEND_CEILING_USD;
  if (now === NO_SPEND_CEILING) return NO_SPEND_CEILING;
  const next = SPEND_PRESETS.find((usd) => usd > now);
  if (next === undefined) return spendChoiceOf(space);
  return next === DEFAULT_SPEND_CEILING_USD ? "default" : next;
}

/**
 * Save's words on the page Raise the limit opened, which lets the agents carry on too: "Save $5.00
 * and carry on", "Carry on at $3.00" with the room's own amount picked, or "Carry on with no cap".
 */
export function saveAndCarryOnWords(space: Space, target: SpendCeilingSetting | undefined): string {
  if (target === undefined) return "Save and carry on";
  if (target === NO_SPEND_CEILING) return NO_CAP_CARRY_ON;
  if (target === (space.spendCeiling ?? null)) return carryOnWords(space);
  return `Save ${dollars(target ?? DEFAULT_SPEND_CEILING_USD)} and carry on`;
}

/** Save's word once what is picked is what was just saved. */
export const SAVED_WORD = "Saved";

/** Save on Spend per job: whether it may be pressed, and its words. */
export interface SpendSave {
  readonly ready: boolean;
  readonly words: string;
}

/**
 * Save on Spend per job, which stays open once saved (ADR 0292, 11 November addendum): ready while
 * what is picked is an amount the room may have and not what the room has, and "Saved", grey, once
 * it is what was just saved, until something else is picked. From Raise the limit the room's own
 * amount still lets the agents carry on, and the words say so.
 */
export function spendSave(input: {
  readonly space: Space;
  readonly target: SpendCeilingSetting | undefined;
  readonly carryOn: boolean;
  readonly busy: boolean;
  /** What this page saved last, when it has. */
  readonly saved: { readonly usd: SpendCeilingSetting } | undefined;
}): SpendSave {
  const { space, target, carryOn, busy, saved } = input;
  if (carryOn) {
    return { ready: target !== undefined && !busy, words: saveAndCarryOnWords(space, target) };
  }
  const justSaved = saved !== undefined && target === saved.usd;
  const changes = target !== undefined && target !== (space.spendCeiling ?? null);
  return { ready: changes && !busy && !justSaved, words: justSaved ? SAVED_WORD : "Save" };
}

/** "Last job $3.10" on the room's Spend per job tile, once a job before this one spent. */
export function lastJobWords(spend: RoomSpend | undefined): string | undefined {
  const last = spend?.jobs?.[0];
  return last === undefined ? undefined : `Last job ${dollars(last.spent_usd)}`;
}

/**
 * What began the room's present job, under This job so far: "Since you let them carry on at 7:15
 * AM", "Since Dana's message yesterday at 9:02 PM". Nothing from a server that doesn't say.
 */
export function jobStartWords(
  spend: RoomSpend | undefined,
  directory: Directory,
  selfId: string,
  now: number = Date.now(),
): string | undefined {
  const started = spend?.started;
  if (started === undefined) return undefined;
  const day = askDay(started.at, now);
  const when = day === "Today" ? "" : `${day === "Yesterday" ? "yesterday" : day} `;
  return `Since ${startWords(started, directory, selfId)} ${when}at ${askTime(started.at)}`;
}

/** What a person did, or a brief, that began the job: "you let them carry on", "Dana's message". */
function startWords(
  started: NonNullable<RoomSpend["started"]>,
  directory: Directory,
  selfId: string,
): string {
  const you = started.by === selfId;
  const who = started.by === undefined ? "somebody" : you ? "you" : nameOf(directory, started.by);
  switch (started.act) {
    case "carry_on":
      return `${who} let them carry on`;
    case "message":
      return you ? "your message" : `${who}'s message`;
    case "answer":
      return `${who} answered`;
    case "brief":
      return "a brief came in";
    default:
      return `${who} acted`;
  }
}

/** One of the jobs before this one, as the Spend per job page lists them (ADR 0282). */
export interface SpentJobRow {
  readonly key: string;
  /** Whose runs spent it: "Jiro", "Jiro and Rui", "Jiro, Rui and 2 more". */
  readonly title: string;
  /** "Today, 1:50 AM to 6:58 AM · 54 steps", and runs that said no cost. */
  readonly when: string;
  readonly amount: string;
  /** Chips held the agents at the ceiling in it. */
  readonly held: boolean;
  /** The newest line that closed one of its runs, which a tap on the row goes to. */
  readonly lineId?: string | undefined;
  /** All of it in one sentence, for a screen reader. */
  readonly label: string;
}

/** The held mark on a job's row, and what it means. */
export const HELD_WORD = "Held";

/**
 * How many of the jobs before this one Spend per job lists (Arjun, 11 November 2026: "truncate it
 * after 10"); See all opens the rest on a page of their own, read a page at a time.
 */
export const JOBS_SHOWN = 10;
/** The list's heading, and the page See all (`SEE_ALL`, the asks' own word) opens. */
export const JOBS_BEFORE = "Jobs before this one";

/**
 * Whether Spend per job offers See all: more jobs before this one than it lists, and a server that
 * reads them a page at a time. Absent until a hello has said, as for the others.
 */
export function offersAllJobs(spend: RoomSpend | undefined, keeps: boolean | undefined): boolean {
  const count = spend?.jobs_count ?? spend?.jobs?.length ?? 0;
  return count > JOBS_SHOWN && keeps !== false && spend?.jobs_count !== undefined;
}

/** The jobs before this one that spent, newest first, as rows. */
export function spentJobRows(
  spend: RoomSpend | undefined,
  space: Space,
  directory: Directory,
  now: number = Date.now(),
): readonly SpentJobRow[] {
  return jobRowsOf(spend?.jobs ?? [], space, directory, now);
}

/** Jobs as rows: the list's, or a page of them that See all read (ADR 0292 addendum). */
export function jobRowsOf(
  jobs: readonly SpentJob[],
  space: Space,
  directory: Directory,
  now: number = Date.now(),
): readonly SpentJobRow[] {
  return jobs.map((job) => spentJobRow(job, space, directory, now));
}

function spentJobRow(job: SpentJob, space: Space, directory: Directory, now: number): SpentJobRow {
  const ids = new Set(job.run_ids);
  const runs = space.runs.filter((run) => ids.has(run.runId));
  const steps = runs.reduce((sum, run) => sum + stepsOf(run), 0);
  const day = askDay(job.started_at, now);
  const from = `${day}, ${askTime(job.started_at)}`;
  const to =
    askDay(job.last_at, now) === day
      ? askTime(job.last_at)
      : `${askDay(job.last_at, now)}, ${askTime(job.last_at)}`;
  // Begun and ended in the same minute, it is one time.
  const span = to === askTime(job.started_at) ? from : `${from} to ${to}`;
  const parts = [
    span,
    steps === 0 ? undefined : steps === 1 ? "1 step" : `${steps} steps`,
    job.uncounted_runs === 0
      ? undefined
      : job.uncounted_runs === 1
        ? "1 run not counted"
        : `${job.uncounted_runs} runs not counted`,
  ].filter((part) => part !== undefined);
  const title = namesWords(job.by.map((id) => nameOf(directory, id)));
  const amount = dollars(job.spent_usd);
  const when = parts.join(" · ");
  const line = [...space.lines]
    .reverse()
    .find((each) => each.runId !== undefined && ids.has(each.runId));
  return {
    key: String(job.since_seq),
    title,
    when,
    amount,
    held: job.held,
    lineId: line?.id,
    label: `${title}, ${amount}${job.held ? ", held at the limit" : ""}, ${when}`,
  };
}

/** The steps a run's receipt counts: what it did, not the ticks on its rail nor a plan. */
function stepsOf(run: Run): number {
  return run.steps.filter((step) => step.kind !== "tick" && step.status !== "planned").length;
}

/** "Jiro", "Jiro and Rui", "Jiro, Rui and 2 more". */
function namesWords(names: readonly string[]): string {
  if (names.length === 0) return "An agent";
  if (names.length === 1) return names[0] as string;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The foot of the page's list: what every job in the room has spent, once one before this did. */
export function allJobsWords(spend: RoomSpend | undefined): string | undefined {
  if (spend?.total_usd === undefined || (spend.jobs ?? []).length === 0) return undefined;
  return dollars(spend.total_usd);
}

/** The foot's name. */
export const ALL_JOBS = "All jobs here";
