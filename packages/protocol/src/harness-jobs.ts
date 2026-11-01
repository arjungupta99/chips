/**
 * A harness's own jobs (ADR 0252): what it runs by itself, outside any space, on a schedule of its
 * own. OpenClaw's are its Main agent's Heartbeat, Dreaming and a Skill review for each agent.
 *
 * Nothing about a job is Chips'. A harness that declares `jobs` sends a copy of all of them
 * (`PUT /v1/harnesses/:id/jobs`), whole, and posts each run it finishes (`POST …/jobs/runs`),
 * which Chips keeps for `JOB_RUNS_KEPT_DAYS`. A person's change goes down the harness's socket as
 * a `job.change` frame, and is done when the harness sends its copy again, answering it.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most jobs a harness's copy lists. */
export const HARNESS_JOBS_MAX = 24;
/** The most intervals a job offers a person. */
export const JOB_CHOICES_MAX = 12;
/** The longest interval, in minutes: a year. */
export const JOB_EVERY_MAX = 525_600;
/** The most runs one post carries. */
export const JOB_RUNS_POST_MAX = 200;
/** The most runs one read gives. */
export const JOB_RUNS_READ_MAX = 500;
/** How long Chips keeps a run, in days: a harness that keeps a week can still be read for two. */
export const JOB_RUNS_KEPT_DAYS = 90;
/**
 * How long a change waits for its harness's answer, as a heartbeat's does (ADR 0143). After it the
 * change reads as missed; an answer after it still counts, and a new change may be asked.
 */
export const JOB_CHANGE_WAIT_MS = 60_000;

/** What a job does, for the mark its row wears. */
export const JOB_KINDS = ["heartbeat", "memory", "skills", "other"] as const;
export const jobKind = z.enum(JOB_KINDS);
export type JobKind = z.infer<typeof jobKind>;

/** How a run ended. */
export const JOB_RUN_OUTCOMES = ["done", "failed", "stopped"] as const;
export const jobRunOutcome = z.enum(JOB_RUN_OUTCOMES);
export type JobRunOutcome = z.infer<typeof jobRunOutcome>;

export const jobId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/, "expected a job id")
  .describe(
    "The harness's own id for a job: stable, up to 80 letters, digits, `.`, `_`, `:` or `-`.",
  );

const minutes = z.int().min(1).max(JOB_EVERY_MAX);

const ascending = (choices: readonly number[]): boolean =>
  choices.every((each, at) => at === 0 || each > (choices[at - 1] ?? 0));

const jobFields = {
  job_id: jobId,
  name: z.string().min(1).max(40).describe('What the harness calls it: "Dreaming".'),
  about: z.string().min(1).max(240).describe("What it does, in a sentence, for its page."),
  kind: jobKind.describe("What it does, for its mark: `other` for anything else."),
  every: minutes
    .optional()
    .describe(
      "How often it runs, in minutes. Chips says it in words, with `next_at` for the time of day.",
    ),
  when: z
    .string()
    .min(1)
    .max(60)
    .optional()
    .describe("How often, in the harness's words, for a schedule that is not an interval."),
  next_at: isoTimestamp.optional().describe("When it runs next, while it is on."),
  for_agents: z
    .array(id("agent"))
    .max(200)
    .optional()
    .describe("The harness's agents it runs for, if it runs for some rather than the harness."),
  on: z.boolean().describe("Whether it runs now."),
  editable: z.boolean().describe("Whether a person may switch it from Chips."),
  why_read_only: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Why not, in the harness's words, only when it is not `editable`."),
  choices: z
    .array(minutes)
    .min(1)
    .max(JOB_CHOICES_MAX)
    .refine(ascending, { message: "The intervals go up, each named once." })
    .optional()
    .describe("The intervals a person may pick, in minutes, shortest first, `every` among them."),
};

export const harnessJob = z
  .object(jobFields)
  .refine((job) => job.every !== undefined || job.when !== undefined, {
    path: ["every"],
    message: "Say how often it runs: `every` in minutes, or `when` in words.",
  })
  .refine((job) => job.choices === undefined || job.choices.includes(job.every ?? -1), {
    path: ["choices"],
    message: "`every` is one of `choices`.",
  })
  .refine((job) => job.why_read_only === undefined || !job.editable, {
    path: ["why_read_only"],
    message: "Say why only for a job that can't be switched.",
  });
export type HarnessJob = z.infer<typeof harnessJob>;

const uniqueJobs = (jobs: readonly HarnessJob[]): boolean =>
  new Set(jobs.map((job) => job.job_id)).size === jobs.length;

export const harnessJobsPut = z
  .object({
    jobs: z
      .array(harnessJob)
      .max(HARNESS_JOBS_MAX)
      .refine(uniqueJobs, { message: "Each job is named once." })
      .describe(
        "Every job the harness runs on its own, whole: one left out is gone, runs and all.",
      ),
    answers: id("change")
      .optional()
      .describe("The change this copy answers: made, and these are the jobs as they are now."),
    refuses: z
      .object({
        change_id: id("change"),
        message: z.string().min(1).max(300).optional().describe("Why not, for the person."),
      })
      .optional()
      .describe("A change not made. The copy beside it is the jobs as they are now."),
  })
  .describe("`PUT /v1/harnesses/:id/jobs`: a harness's copy of the jobs it runs on its own.");
export type HarnessJobsPut = z.infer<typeof harnessJobsPut>;

/** The copy as Chips keeps it: what the harness sent, without what it answered. */
export type HarnessJobsCopy = Omit<HarnessJobsPut, "answers" | "refuses">;

export const jobRun = z
  .object({
    job_id: jobId,
    run_id: z.string().min(1).max(160).describe("The harness's own id for the run."),
    started_at: isoTimestamp,
    ended_at: isoTimestamp,
    outcome: jobRunOutcome.describe(
      "`done`, `failed`, or `stopped` when something else ended it, such as a restart.",
    ),
    quiet: z
      .boolean()
      .optional()
      .describe("It did its work and had nothing to say: a heartbeat with nothing for anyone."),
    waited: z.boolean().optional().describe("It waited for an approval that nobody gave."),
    error: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("What went wrong, in the harness's words, for a run that failed or was stopped."),
    agent_id: id("agent").optional().describe("The agent it ran for, when it runs for some."),
    cost_usd: z
      .number()
      .min(0)
      .max(10_000)
      .optional()
      .describe("What it cost, as the harness priced it: absent when the harness doesn't know."),
    tokens: z.int().min(0).optional().describe("Its tokens, in and out."),
    model: z.string().min(1).max(80).optional().describe("The model it ran on, in its words."),
  })
  .refine((run) => Date.parse(run.ended_at) >= Date.parse(run.started_at), {
    path: ["ended_at"],
    message: "A run ends after it starts.",
  })
  .describe("One run of a job, once it ended.");
export type JobRun = z.infer<typeof jobRun>;

export const jobRunsPost = z
  .object({ runs: z.array(jobRun).min(1).max(JOB_RUNS_POST_MAX) })
  .describe(
    "`POST /v1/harnesses/:id/jobs/runs`: runs the harness finished. A run posted again says what it says over what was posted before, and what it leaves out stays: so a run may be posted once more with its cost, and never loses one.",
  );
export type JobRunsPost = z.infer<typeof jobRunsPost>;

export const jobChangeAsk = z
  .object({
    on: z.boolean(),
    every: minutes.optional().describe("One of the job's choices; its own when left out."),
  })
  .describe("`POST /v1/harnesses/:id/jobs/:job/changes`: on or off, and how often.");
export type JobChangeAsk = z.infer<typeof jobChangeAsk>;

export const JOB_CHANGE_STATES = ["waiting", "saved", "failed", "missed"] as const;
export const jobChangeState = z.enum(JOB_CHANGE_STATES);
export type JobChangeState = z.infer<typeof jobChangeState>;

export const jobChangeView = z
  .object({
    change_id: id("change"),
    state: jobChangeState.describe(
      "`missed` once `JOB_CHANGE_WAIT_MS` has passed with no answer; read, never stored.",
    ),
    on: z.boolean(),
    every: minutes.optional(),
    asked_at: isoTimestamp,
    answered_at: isoTimestamp.optional(),
    message: z.string().max(300).optional().describe("The harness's words, for a refusal."),
  })
  .describe("The last change a person asked of a job, and what became of it (ADR 0252).");
export type JobChangeView = z.infer<typeof jobChangeView>;

export const harnessJobView = z
  .object({
    ...jobFields,
    week_usd: z
      .number()
      .min(0)
      .optional()
      .describe("What its runs of the last seven days cost: absent when none of them had a cost."),
    week_runs: z.int().min(0).describe("How many runs it made in the last seven days."),
    runs_total: z.int().min(0).describe("How many of its runs Chips holds."),
    last_run: jobRun.optional(),
    change: jobChangeView.optional(),
  })
  .describe("One job as a person reads it: the harness's copy, what Chips counted, its change.");
export type HarnessJobView = z.infer<typeof harnessJobView>;

export const harnessJobsView = z
  .object({
    harness_id: id("harness"),
    jobs: z.array(harnessJobView),
    read_at: isoTimestamp.describe("When the harness last sent its copy."),
    away: z.boolean().describe("No socket of the harness hears changes now: read, not switched."),
  })
  .describe("`GET /v1/harnesses/:id/jobs`, for the harness's owner or an admin.");
export type HarnessJobsView = z.infer<typeof harnessJobsView>;

export const jobRunsView = z
  .object({
    harness_id: id("harness"),
    job_id: jobId,
    runs: z.array(jobRun).describe("Newest first."),
    more: z.boolean().describe("Whether older runs are left, for `before` the last one's start."),
  })
  .describe("`GET /v1/harnesses/:id/jobs/:job/runs?since=&before=&limit=`.");
export type JobRunsView = z.infer<typeof jobRunsView>;

export const jobChangeFrame = z
  .object({
    frame: z.literal("job.change"),
    change_id: id("change"),
    harness_id: id("harness"),
    job_id: jobId,
    on: z.boolean(),
    every: minutes
      .optional()
      .describe("For a job with choices: one of them, the copy's own when the person named none."),
    asked_by: id("person"),
    asked_at: isoTimestamp,
  })
  .describe(
    "A person switched one of a harness's own jobs, or changed how often it runs (ADR 0252). Sent to a harness's socket that said `jobs` in its `hello`, now or never: it is not in the log. The harness answers with its copy of all its jobs, `answers` or `refuses` naming `change_id`.",
  );
export type JobChangeFrame = z.infer<typeof jobChangeFrame>;
