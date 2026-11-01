/**
 * A harness's own jobs, as its page draws them (ADR 0252): the "Its own jobs" group on the harness
 * page, a row for each job, the job's own page with its switch, its last fourteen days as bars and
 * its runs, and the switch's save. The same on the phone and the web.
 *
 * The harness sends minutes and dollars; Chips puts them into words itself ("Every night at 3:00
 * AM", "34¢", "$14.39"), in the reader's own time.
 */

import {
  HARNESS_CAPABILITIES,
  type HarnessJobsView,
  type HarnessJobView,
  JOB_CHANGE_WAIT_MS,
  type JobChangeAsk,
  type JobKind,
  type JobRun,
} from "@chipschat/protocol";
import { everyWords, perDay } from "./agentHeartbeat.js";
import { type Directory, harnessOf, nameOf } from "./events.js";
import type { WorkspaceModel } from "./model.js";
import { mayRemoveHarness } from "./removal.js";
import type { Store } from "./store.js";
import { ServerRefused } from "./transport.js";

const MINUTE_MS = 60_000;
const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const DAY_MS = DAY * MINUTE_MS;

/** How many days the job's page draws as bars. */
export const JOB_DAYS = 14;
/** How many runs the job's page lists at first, and adds each time "Show more" is tapped. */
export const JOB_RUNS_PAGE = 20;

/** Whether a harness sends Chips the jobs it runs on its own and takes switches. */
export function takesJobs(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.jobs) ?? false;
}

/**
 * Who sees and switches a harness's own jobs: the people who may restart or remove it, as for its
 * agents' heartbeats (ADR 0143), and only while it declares `jobs`. Anyone else sees no group.
 */
export function mayChangeJobs(
  workspace: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string,
): boolean {
  return (
    takesJobs(directory, harnessId) && mayRemoveHarness(workspace, directory, harnessId, selfId)
  );
}

/** Dollars in words: "34¢", "$14.39", "Under 1¢", "Free", or a dash when nobody knows. */
export function costWords(usd: number | undefined): string {
  if (usd === undefined) return "—";
  if (usd === 0) return "Free";
  if (usd < 0.005) return "Under 1¢";
  if (usd < 0.995) return `${Math.round(usd * 100)}¢`;
  return `$${usd.toFixed(2)}`;
}

/** A clock time, "3:00 AM". */
function clock(at: Date): string {
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const startOfDay = (ms: number): number => {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
};

/** Whether a time of day reads as night: from 9 PM to before 6 AM. */
const night = (at: Date): boolean => at.getHours() >= 21 || at.getHours() < 6;

/**
 * How often a job runs, to open a line: "Every hour", "Every 30 min", "Every night at 3:00 AM",
 * "Every day at 9:00 AM", "Every Thursday at 8:01 PM", "Every 2 days". A daily or weekly job's
 * time is its next run's, in the reader's time; the harness's own words for anything else.
 */
export function scheduleWords(job: Pick<HarnessJobView, "every" | "when" | "next_at">): string {
  const { every } = job;
  if (every === undefined) return job.when ?? "On its own schedule";
  const timed = job.next_at === undefined ? undefined : timedWords(every, new Date(job.next_at));
  if (timed !== undefined) return timed;
  if (every === WEEK) return "Every week";
  if (every === HOUR) return "Every hour";
  const words = everyWords(every);
  return words.startsWith("Once") || words.startsWith("Every") ? words : `Every ${words}`;
}

/** A daily or weekly job at its next run's time: "Every night at 3:00 AM", "Every Thursday at …". */
function timedWords(every: number, next: Date): string | undefined {
  if (every === DAY) return `Every ${night(next) ? "night" : "day"} at ${clock(next)}`;
  if (every !== WEEK) return undefined;
  return `Every ${next.toLocaleDateString("en-US", { weekday: "long" })} at ${clock(next)}`;
}

/** Whom a job runs for, beside its schedule: "for OpenClaw", "for 8 agents", or nothing. */
export function forWords(
  job: Pick<HarnessJobView, "for_agents">,
  directory: Directory,
): string | undefined {
  const agents = job.for_agents ?? [];
  if (agents.length === 0) return undefined;
  if (agents.length === 1) return `for ${nameOf(directory, agents[0] ?? "")}`;
  return `for ${agents.length} agents`;
}

/** When it runs next, after "next": "at 9:54 AM", "tonight at 3:00 AM", "Thursday at 8:01 PM". */
export function nextWords(nextAt: string, now: number): string {
  const at = new Date(nextAt);
  const days = Math.round((startOfDay(at.getTime()) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return `${night(at) && at.getHours() >= 21 ? "tonight " : ""}at ${clock(at)}`;
  if (days === 1) return `${night(at) ? "tonight" : "tomorrow"} at ${clock(at)}`;
  if (days < 7) return `${at.toLocaleDateString("en-US", { weekday: "long" })} at ${clock(at)}`;
  return `on ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** A change still on its way to the harness: the rows show what it asks, saving. */
function waitingChange(job: HarnessJobView) {
  return job.change?.state === "waiting" ? job.change : undefined;
}

/** Whether the job runs, as the rows show it: as asked while a change waits. */
function shownOn(job: HarnessJobView): boolean {
  return waitingChange(job)?.on ?? job.on;
}

/** A job's row in the "Its own jobs" group on the harness page. */
export interface JobRow {
  readonly id: string;
  readonly kind: JobKind;
  readonly name: string;
  /** How often, and for whom: "Every hour, for OpenClaw". */
  readonly sub: string;
  /** At its right: what it cost this week, "Off", or "Saving" while its switch waits. */
  readonly value: string;
  /** Whether its mark is lit: it runs, or is about to. */
  readonly on: boolean;
}

/** A job's schedule and whom it runs for, as one line. */
function scheduleLine(job: HarnessJobView, directory: Directory): string {
  const whom = forWords(job, directory);
  return whom === undefined ? scheduleWords(job) : `${scheduleWords(job)}, ${whom}`;
}

export function jobRows(view: HarnessJobsView, directory: Directory): readonly JobRow[] {
  return view.jobs.map((job) => {
    const on = shownOn(job);
    return {
      id: job.job_id,
      kind: job.kind,
      name: job.name,
      sub: scheduleLine(job, directory),
      value: rowValue(job, on),
      on,
    };
  });
}

/** At a row's right: Saving, Off, this week's cost, or its runs this week when none was priced. */
function rowValue(job: HarnessJobView, on: boolean): string {
  if (waitingChange(job) !== undefined) return "Saving";
  if (!on) return "Off";
  if (job.week_usd !== undefined) return costWords(job.week_usd);
  return job.week_runs > 0 ? `${job.week_runs} ${job.week_runs === 1 ? "run" : "runs"}` : "";
}

/** At the group heading's right: what its jobs cost this week, "$14.90 this week", or nothing. */
export function jobsWeekWords(view: HarnessJobsView): string | undefined {
  const priced = view.jobs.filter((job) => job.week_usd !== undefined);
  if (priced.length === 0) return undefined;
  const sum = priced.reduce((total, job) => total + (job.week_usd ?? 0), 0);
  return `${costWords(sum)} this week`;
}

/** The group's foot. */
export function jobsFoot(harness: string): string {
  return `${harness} runs these by itself, outside your spaces. What they cost isn't in any space's total.`;
}

/** Why a tap does nothing: the harness keeps the job to itself, or is away. */
function hintOf(job: HarnessJobView, harness: string, away: boolean): string | undefined {
  if (!job.editable) return job.why_read_only ?? `Only ${harness} can change this.`;
  if (away) return `${harness} is away`;
  return undefined;
}

/** The job's page, above its days and runs. */
export interface JobPage {
  readonly name: string;
  readonly about: string;
  readonly kind: JobKind;
  /** The switch's row. */
  readonly switch: {
    readonly on: boolean;
    /** "On · next at 9:54 AM", "Off · OpenClaw won't run it", or "Saving to OpenClaw". */
    readonly sub: string;
    readonly saving: boolean;
  };
  /** The Every row, for a job with choices while it is on: its minutes and its words. */
  readonly every:
    | { readonly shows: boolean; readonly minutes: number; readonly value: string }
    | undefined;
  /** How often and for whom, for a job with no choices: "Every night at 3:00 AM". */
  readonly schedule: string;
  /** Away or read only: the rows draw quiet, and a tap shows `hint`. */
  readonly quiet: boolean;
  readonly hint: string | undefined;
}

export function jobPage(
  job: HarnessJobView,
  harness: string,
  away: boolean,
  directory: Directory,
  now: number,
): JobPage {
  const asked = waitingChange(job);
  const on = shownOn(job);
  const savingEvery = asked !== undefined && asked.on === job.on;
  const every = asked?.every ?? job.every;
  const sub =
    asked !== undefined && !savingEvery
      ? `Saving to ${harness}`
      : switchWords(job, on, harness, now);
  return {
    name: job.name,
    about: job.about,
    kind: job.kind,
    switch: { on, sub, saving: asked !== undefined },
    every:
      job.choices === undefined || every === undefined
        ? undefined
        : {
            shows: on,
            minutes: every,
            value: savingEvery ? `Saving to ${harness}` : everyWords(every),
          },
    schedule: scheduleLine(job, directory),
    quiet: away || !job.editable,
    hint: hintOf(job, harness, away),
  };
}

/** Under the switch while nothing is saving: "On · next at 9:54 AM", or what off means. */
function switchWords(job: HarnessJobView, on: boolean, harness: string, now: number): string {
  if (!on) return `Off · ${harness} won't run it`;
  return job.next_at === undefined ? "On" : `On · next ${nextWords(job.next_at, now)}`;
}

/** One of the intervals a job offers, as the Every sheet lists them. */
export interface JobEveryChoice {
  readonly minutes: number;
  readonly label: string;
  readonly sub: string | undefined;
  readonly checked: boolean;
}

export function jobEveryChoices(job: HarnessJobView): readonly JobEveryChoice[] {
  const every = waitingChange(job)?.every ?? job.every;
  return (job.choices ?? []).map((minutes) => ({
    minutes,
    label: everyWords(minutes),
    sub: perDay(minutes),
    checked: minutes === every,
  }));
}

/** One day's bar on the job's page. */
export interface JobDay {
  /** Its start, in the reader's time. */
  readonly at: number;
  /** Under the bars, for the first, middle and last: "Oct 18", "Today". */
  readonly label: string;
  /** What its runs cost: nothing when none of them had a cost. */
  readonly usd: number | undefined;
  readonly runs: number;
  readonly today: boolean;
}

/** The last `days` days, oldest first, each with its runs' count and what they cost. */
export function jobDays(runs: readonly JobRun[], now: number, days = JOB_DAYS): readonly JobDay[] {
  const today = startOfDay(now);
  const out: { at: number; usd: number | undefined; runs: number }[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const at = new Date(today);
    at.setDate(at.getDate() - back);
    out.push({ at: at.getTime(), usd: undefined, runs: 0 });
  }
  for (const run of runs) {
    const day = startOfDay(Date.parse(run.started_at));
    const slot = out.find((each) => each.at === day);
    if (slot === undefined) continue;
    slot.runs += 1;
    if (run.cost_usd !== undefined) slot.usd = (slot.usd ?? 0) + run.cost_usd;
  }
  return out.map((slot) => ({
    ...slot,
    label:
      slot.at === today
        ? "Today"
        : new Date(slot.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    today: slot.at === today,
  }));
}

/** Above the bars: what the days cost in all, and what a run costs. */
export interface DaysSummary {
  /** "$26.18", or "88 runs" when none had a cost. */
  readonly total: string;
  /** "88 runs · 34¢ each", "10 runs", "No runs". */
  readonly sub: string;
}

/** A sum of dollars over days: as `costWords`, with nothing spent as "$0.00". */
const sumWords = (usd: number): string => (usd === 0 ? "$0.00" : costWords(usd));

export function daysSummary(days: readonly JobDay[], runs: readonly JobRun[]): DaysSummary {
  const from = days[0]?.at ?? 0;
  const counted = runs.filter((run) => Date.parse(run.started_at) >= from);
  const priced = counted.filter((run) => run.cost_usd !== undefined);
  const count = `${counted.length} ${counted.length === 1 ? "run" : "runs"}`;
  if (counted.length === 0) return { total: sumWords(0), sub: "No runs" };
  if (priced.length === 0) return { total: count, sub: "What they cost isn't known" };
  const sum = priced.reduce((total, run) => total + (run.cost_usd ?? 0), 0);
  // What a run costs only when each was priced: an average of some would pass for all of them.
  if (priced.length < counted.length) {
    return { total: sumWords(sum), sub: `${count} · cost known for ${priced.length}` };
  }
  const each = sum / priced.length;
  return {
    total: sumWords(sum),
    sub: `${count} · ${each === 0 ? "free" : `${costWords(each)} each`}`,
  };
}

/** How long a run took: "6 s", "15 min", "1 h 5 min". */
export function tookWords(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** When a run started: "Today, 8:54 AM", "Yesterday, 7:53 PM", "Thu, 8:01 PM", "Oct 24, 2:25 PM". */
export function runWhenWords(startedAt: string, now: number): string {
  const at = new Date(startedAt);
  const days = Math.round((startOfDay(now) - startOfDay(at.getTime())) / DAY_MS);
  const day =
    days <= 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : days < 7
          ? at.toLocaleDateString("en-US", { weekday: "short" })
          : at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day}, ${clock(at)}`;
}

/** One run on the job's page. */
export interface RunLine {
  readonly id: string;
  /** "Today, 8:54 AM", with the agent it ran for when the job runs for several. */
  readonly when: string;
  /** How long it took and how it went: "15 s · Nothing to say". */
  readonly sub: string;
  /** What it cost, or a dash. */
  readonly cost: string;
  /** Its dot: done, waited or stopped, failed. */
  readonly tone: "ok" | "warn" | "bad";
}

/** How a run went, in words: nothing for a run that did its work and said something. */
export function outcomeWords(run: JobRun): string | undefined {
  if (run.outcome === "failed") return run.error ?? "Failed";
  if (run.outcome === "stopped")
    return run.error === undefined ? "Stopped" : `Stopped: ${run.error}`;
  if (run.waited === true) return "Waited for an approval";
  if (run.quiet === true) return "Nothing to say";
  return undefined;
}

export function runLine(
  run: JobRun,
  job: Pick<HarnessJobView, "for_agents">,
  directory: Directory,
  now: number,
): RunLine {
  const several = (job.for_agents?.length ?? 0) > 1;
  const whom = several && run.agent_id !== undefined ? ` · ${nameOf(directory, run.agent_id)}` : "";
  const took = tookWords(Date.parse(run.ended_at) - Date.parse(run.started_at));
  const went = outcomeWords(run);
  return {
    id: run.run_id,
    when: `${runWhenWords(run.started_at, now)}${whom}`,
    sub: went === undefined ? took : `${took} · ${went}`,
    cost: costWords(run.cost_usd),
    tone:
      run.outcome === "failed"
        ? "bad"
        : run.outcome === "stopped" || run.waited === true
          ? "warn"
          : "ok",
  };
}

/** The first moment of the oldest day the page draws: what to read runs `since`. */
export function jobDaysSince(now: number, days = JOB_DAYS): string {
  const at = new Date(startOfDay(now));
  at.setDate(at.getDate() - (days - 1));
  return at.toISOString();
}

export type JobSaveState = "saving" | "saved" | "failed" | "missed" | "away";

/** What the switch's row says of a save once it is done, in the product's words. */
export function jobSaveWords(state: JobSaveState, harness: string, message?: string): string {
  switch (state) {
    case "saving":
      return `Saving to ${harness}`;
    case "saved":
      return "Saved";
    case "failed":
      return message ?? `${harness} couldn't change it.`;
    case "missed":
      return `${harness} hasn't answered. It may still change it.`;
    case "away":
      return `${harness} is away`;
  }
}

/** The store's reads and writes the page uses. */
export type JobReads = Pick<Store, "readHarnessJobs" | "changeHarnessJob">;

/** What became of a save: the harness's words for a refusal, and the jobs as they are now. */
export interface JobSaveOutcome {
  readonly state: Exclude<JobSaveState, "saving">;
  readonly message?: string | undefined;
  readonly view?: HarnessJobsView | undefined;
}

export interface JobSaveOptions {
  /** Whether the page is still open: once it is not, nobody is asked again. */
  readonly alive: () => boolean;
  readonly everyMs?: number | undefined;
  /** For the tests: how to wait between reads. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

/**
 * Send a switch down the harness's socket, then read its jobs every `everyMs` until the harness
 * has answered it, or its minute is past and the server says it was missed.
 */
export async function saveJobChange(
  store: JobReads,
  harnessId: string,
  jobId: string,
  ask: JobChangeAsk,
  options: JobSaveOptions,
): Promise<JobSaveOutcome> {
  let changeId: string;
  try {
    changeId = (await store.changeHarnessJob(harnessId, jobId, ask)).change_id;
  } catch (error) {
    if (error instanceof ServerRefused && error.refusal === "harness_away")
      return { state: "away" };
    return { state: "failed", message: String((error as Error)?.message ?? error) };
  }
  const everyMs = options.everyMs ?? 800;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const tries = Math.ceil((JOB_CHANGE_WAIT_MS + 5000) / everyMs);
  for (let at = 0; at < tries && options.alive(); at += 1) {
    await sleep(everyMs);
    const view = await store.readHarnessJobs(harnessId).catch(() => undefined);
    const change = view?.jobs.find((job) => job.job_id === jobId)?.change;
    if (change?.change_id !== changeId || change.state === "waiting") continue;
    return { state: change.state, message: change.message, view };
  }
  return { state: "missed" };
}
