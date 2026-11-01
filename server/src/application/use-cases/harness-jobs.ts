/**
 * A harness's own jobs (ADR 0252): its copy of the jobs it runs by itself, their runs and what they
 * cost, read and switched by the people who run the harness, as its heartbeats are (ADR 0143).
 *
 * - **A harness sends its copy** of all its jobs, whole, whenever they change; a copy may answer a
 *   change (`answers`) or refuse one (`refuses`). A job left out is forgotten with its runs.
 * - **A harness posts its runs** as it finishes them, a run posted again in place of the one
 *   before. Runs of a job not in its copy are refused; runs older than `JOB_RUNS_KEPT_DAYS` are
 *   let go as new ones come.
 * - **The harness's owner reads them,** or an owner or admin of the workspace: each job with what
 *   its runs of the last week cost, and its runs a page at a time.
 * - **A change** is checked against the job (it may be switched, the interval is one of its
 *   choices), kept as the job's last, and sent down the harness's sockets that hear `jobs`. With
 *   nothing of it to hear, it is refused at once: no queue. The harness's answer closes it; one not
 *   answered in `JOB_CHANGE_WAIT_MS` reads as missed, and a new one may be asked.
 */

import {
  HARNESS_CAPABILITIES,
  type HarnessJob,
  type HarnessJobsPut,
  type HarnessJobView,
  JOB_CHANGE_WAIT_MS,
  JOB_RUNS_KEPT_DAYS,
  JOB_RUNS_READ_MAX,
  type JobChangeAsk,
  type JobChangeFrame,
  type JobChangeView,
  type JobRun,
  type JobRunsPost,
} from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type { HarnessJobRegistry, JobChange, KeptJob } from "../ports/harness-jobs.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** What "this week" is on the harness page: the last seven days. */
const WEEK_MS = 7 * DAY_MS;

export interface HarnessJobsDeps {
  readonly readModels: Pick<ReadModels, "participant">;
  readonly jobs: HarnessJobRegistry;
  readonly sessions: Pick<Sessions, "jobChange" | "hearingJobs">;
  readonly ids: { next: (kind: "change") => string };
  readonly clock: Clock;
}

export interface JobRefusal {
  readonly kind: "not_allowed" | "unknown" | "invalid" | "away" | "waiting";
  readonly message: string;
}

type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: JobRefusal };

const refused = <T>(kind: JobRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});
const ok = <T>(value: T): Answer<T> => ({ ok: true, value });

type Participant = NonNullable<Awaited<ReturnType<ReadModels["participant"]>>>;

/** A live harness, or nothing when it is gone. */
async function harnessNamed(
  deps: HarnessJobsDeps,
  workspaceId: string,
  harnessId: string,
): Promise<Participant | undefined> {
  const found = await deps.readModels.participant(workspaceId, harnessId);
  return found?.kind === "harness" && found.removed_at === null ? found : undefined;
}

const declares = (harness: Participant): boolean =>
  harness.capabilities?.includes(HARNESS_CAPABILITIES.jobs) === true;

/** A harness's jobs a person may read: or why not. */
async function readable(
  deps: HarnessJobsDeps,
  principal: Principal,
  harnessId: string,
): Promise<Answer<{ readonly harness: Participant; readonly jobs: readonly KeptJob[] }>> {
  if (principal.kind !== "person")
    return refused("not_allowed", "A person reads a harness's jobs.");
  const harness = await harnessNamed(deps, principal.workspaceId, harnessId);
  if (harness === undefined) return refused("unknown", "No harness of that id here.");
  if (!ownsHarness(principal, harness)) {
    return refused(
      "not_allowed",
      "A harness's own jobs are for its owner, or an owner or admin of the workspace.",
    );
  }
  const name = harness.display_name;
  if (!declares(harness)) return refused("unknown", `${name} doesn't share its jobs with Chips.`);
  const jobs = await deps.jobs.list(principal.workspaceId, harnessId);
  if (jobs.length === 0) return refused("unknown", `${name} hasn't said what jobs it runs yet.`);
  return ok({ harness, jobs });
}

const away = (deps: HarnessJobsDeps, workspaceId: string, harnessId: string): boolean =>
  deps.sessions.hearingJobs(workspaceId, harnessId) === 0;

function missed(change: JobChange, now: number): boolean {
  return change.state === "waiting" && now - Date.parse(change.askedAt) > JOB_CHANGE_WAIT_MS;
}

/** A change as a person reads it: waiting past its minute is missed. */
export function viewOfJobChange(change: JobChange, now: number): JobChangeView {
  return {
    change_id: change.id as JobChangeView["change_id"],
    state: missed(change, now) ? "missed" : change.state,
    on: change.on,
    ...(change.every === null ? {} : { every: change.every }),
    asked_at: change.askedAt,
    ...(change.answeredAt === null ? {} : { answered_at: change.answeredAt }),
    ...(change.message === null ? {} : { message: change.message }),
  };
}

export interface JobsRead {
  readonly harnessId: string;
  readonly readAt: string;
  readonly away: boolean;
  readonly jobs: readonly HarnessJobView[];
}

export function createReadHarnessJobs(deps: HarnessJobsDeps) {
  return async function readHarnessJobs(input: {
    readonly principal: Principal;
    readonly harnessId: string;
  }): Promise<Answer<JobsRead>> {
    const found = await readable(deps, input.principal, input.harnessId);
    if (!found.ok) return found;
    const { jobs, harness } = found.value;
    const workspaceId = input.principal.workspaceId;
    const now = Date.parse(deps.clock.nowIso());
    const week = new Date(now - WEEK_MS).toISOString();
    const counts = await deps.jobs.counts(workspaceId, harness.id, week);
    return ok({
      harnessId: harness.id,
      readAt: jobs[0]?.readAt ?? deps.clock.nowIso(),
      away: away(deps, workspaceId, harness.id),
      jobs: jobs.map((kept) => {
        const counted = counts.get(kept.said.job_id);
        return {
          ...kept.said,
          ...(counted?.sinceUsd === null || counted === undefined
            ? {}
            : { week_usd: counted.sinceUsd }),
          week_runs: counted?.sinceRuns ?? 0,
          runs_total: counted?.total ?? 0,
          ...(counted?.last === undefined ? {} : { last_run: counted.last }),
          ...(kept.change === null ? {} : { change: viewOfJobChange(kept.change, now) }),
        };
      }),
    });
  };
}

export interface JobRunsRead {
  readonly harnessId: string;
  readonly jobId: string;
  readonly runs: readonly JobRun[];
  readonly more: boolean;
}

export function createReadJobRuns(deps: HarnessJobsDeps) {
  return async function readJobRuns(input: {
    readonly principal: Principal;
    readonly harnessId: string;
    readonly jobId: string;
    readonly since?: string | undefined;
    readonly before?: string | undefined;
    readonly limit?: number | undefined;
  }): Promise<Answer<JobRunsRead>> {
    const found = await readable(deps, input.principal, input.harnessId);
    if (!found.ok) return found;
    if (!found.value.jobs.some((kept) => kept.said.job_id === input.jobId)) {
      return refused("unknown", `${found.value.harness.display_name} has no job of that id.`);
    }
    if (
      [input.since, input.before].some((at) => at !== undefined && Number.isNaN(Date.parse(at)))
    ) {
      return refused("invalid", "`since` and `before` are times, such as 2026-10-31T00:00:00Z.");
    }
    const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 50)), JOB_RUNS_READ_MAX);
    const read = await deps.jobs.runs(input.principal.workspaceId, input.harnessId, input.jobId, {
      ...(input.since === undefined ? {} : { since: new Date(input.since).toISOString() }),
      ...(input.before === undefined ? {} : { before: new Date(input.before).toISOString() }),
      limit,
    });
    return ok({ harnessId: input.harnessId, jobId: input.jobId, ...read });
  };
}

/** Why this change may not be asked of this job, or nothing when it may. */
function changeRefusal(
  kept: KeptJob,
  every: number | undefined,
  harness: string,
  now: string,
): JobRefusal | undefined {
  if (kept.change?.state === "waiting" && !missed(kept.change, Date.parse(now))) {
    return { kind: "waiting", message: `${harness} hasn't answered the last change yet.` };
  }
  const job = kept.said;
  if (!job.editable) {
    const why = job.why_read_only ?? `${job.name} can't be switched from Chips.`;
    return { kind: "invalid", message: why };
  }
  if (every === undefined || job.choices?.includes(every) === true) return undefined;
  return { kind: "invalid", message: `That interval isn't one ${job.name} offers.` };
}

function frameOf(harnessId: string, job: HarnessJob, change: JobChange): JobChangeFrame {
  return {
    frame: "job.change",
    change_id: change.id as JobChangeFrame["change_id"],
    harness_id: harnessId as JobChangeFrame["harness_id"],
    job_id: job.job_id,
    on: change.on,
    ...(change.every === null ? {} : { every: change.every }),
    asked_by: change.askedBy as JobChangeFrame["asked_by"],
    asked_at: change.askedAt,
  };
}

export function createAskJobChange(deps: HarnessJobsDeps) {
  return async function askJobChange(input: {
    readonly principal: Principal;
    readonly harnessId: string;
    readonly jobId: string;
    readonly ask: JobChangeAsk;
  }): Promise<Answer<JobChangeView>> {
    const { principal, harnessId, jobId, ask } = input;
    const found = await readable(deps, principal, harnessId);
    if (!found.ok) return found;
    const { harness, jobs } = found.value;
    const kept = jobs.find((each) => each.said.job_id === jobId);
    if (kept === undefined)
      return refused("unknown", `${harness.display_name} has no job of that id.`);
    const now = deps.clock.nowIso();
    const every = ask.every ?? (kept.said.choices === undefined ? undefined : kept.said.every);
    const refusal = changeRefusal(kept, every, harness.display_name, now);
    if (refusal !== undefined) return { ok: false, error: refusal };

    const change: JobChange = {
      id: deps.ids.next("change"),
      on: ask.on,
      every: every ?? null,
      askedBy: principal.participantId,
      askedAt: now,
      state: "waiting",
      message: null,
      answeredAt: null,
    };
    const workspaceId = principal.workspaceId;
    await deps.jobs.ask(workspaceId, harness.id, jobId, change);
    const sockets = deps.sessions.jobChange(
      workspaceId,
      harness.id,
      frameOf(harness.id, kept.said, change),
    );
    if (sockets === 0) return unheard(deps, workspaceId, harness, change.id, now);
    return ok(viewOfJobChange(change, Date.parse(now)));
  };
}

/** A change nothing of the harness heard: failed at once, and refused as away. */
async function unheard(
  deps: HarnessJobsDeps,
  workspaceId: string,
  harness: Participant,
  changeId: string,
  at: string,
): Promise<Answer<never>> {
  const words = `${harness.display_name} is away, so Chips can't switch it now.`;
  await deps.jobs.answer({
    workspaceId,
    harnessId: harness.id,
    changeId,
    state: "failed",
    message: words,
    at,
  });
  return refused("away", words);
}

/** The harness itself, as the path names it: or why it may not send for it. */
async function sendable(
  deps: HarnessJobsDeps,
  principal: Principal,
  harnessId: string,
): Promise<Answer<Participant>> {
  if (principal.kind !== "harness")
    return refused("not_allowed", "A harness sends the jobs it runs.");
  if (principal.participantId !== harnessId)
    return refused("not_allowed", "Those jobs aren't yours.");
  const harness = await harnessNamed(deps, principal.workspaceId, harnessId);
  if (harness === undefined) return refused("unknown", "No harness of that id here.");
  return ok(harness);
}

/** Whether a change was asked of this harness's jobs. */
async function asked(
  deps: HarnessJobsDeps,
  workspaceId: string,
  harnessId: string,
  changeId: string,
): Promise<boolean> {
  return (await deps.jobs.list(workspaceId, harnessId)).some(
    (kept) => kept.change?.id === changeId,
  );
}

export function createPutHarnessJobs(deps: HarnessJobsDeps) {
  return async function putHarnessJobs(input: {
    readonly principal: Principal;
    readonly harnessId: string;
    readonly put: HarnessJobsPut;
  }): Promise<Answer<{ readonly readAt: string }>> {
    const { principal, harnessId, put } = input;
    const harness = await sendable(deps, principal, harnessId);
    if (!harness.ok) return harness;
    const workspaceId = principal.workspaceId;
    const changeId = put.answers ?? put.refuses?.change_id;
    if (changeId !== undefined && !(await asked(deps, workspaceId, harnessId, changeId))) {
      return refused("invalid", "That change isn't one asked of these jobs.");
    }

    const now = deps.clock.nowIso();
    await deps.jobs.put({ workspaceId, harnessId, jobs: put.jobs, readAt: now });
    if (changeId !== undefined) {
      await deps.jobs.answer({
        workspaceId,
        harnessId,
        changeId,
        state: put.answers === undefined ? "failed" : "saved",
        message: put.refuses?.message ?? null,
        at: now,
      });
    }
    return ok({ readAt: now });
  };
}

export function createPostJobRuns(deps: HarnessJobsDeps) {
  return async function postJobRuns(input: {
    readonly principal: Principal;
    readonly harnessId: string;
    readonly post: JobRunsPost;
  }): Promise<Answer<{ readonly kept: number }>> {
    const { principal, harnessId, post } = input;
    const harness = await sendable(deps, principal, harnessId);
    if (!harness.ok) return harness;
    const workspaceId = principal.workspaceId;
    const known = new Set(
      (await deps.jobs.list(workspaceId, harnessId)).map((kept) => kept.said.job_id),
    );
    const stray = post.runs.find((run) => !known.has(run.job_id));
    if (stray !== undefined) {
      return refused(
        "invalid",
        `No job ${stray.job_id} in your copy: send the copy before its runs.`,
      );
    }
    await deps.jobs.addRuns(workspaceId, harnessId, post.runs);
    const keptFrom = Date.parse(deps.clock.nowIso()) - JOB_RUNS_KEPT_DAYS * DAY_MS;
    await deps.jobs.prune(workspaceId, harnessId, new Date(keptFrom).toISOString());
    return ok({ kept: post.runs.length });
  };
}

export type ReadHarnessJobs = ReturnType<typeof createReadHarnessJobs>;
export type ReadJobRuns = ReturnType<typeof createReadJobRuns>;
export type AskJobChange = ReturnType<typeof createAskJobChange>;
export type PutHarnessJobs = ReturnType<typeof createPutHarnessJobs>;
export type PostJobRuns = ReturnType<typeof createPostJobRuns>;
