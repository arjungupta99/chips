import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HARNESS_JOBS_MAX,
  harnessJobsPut,
  harnessJobsView,
  JOB_RUNS_POST_MAX,
  jobChangeAsk,
  jobChangeFrame,
  jobRunsPost,
} from "./harness-jobs.js";

const MAIN = "agt_01JB0000000000000000000000";

/** OpenClaw's three, as its bridge sends them (31 October 2026). */
const heartbeat = (extra: Record<string, unknown> = {}) => ({
  job_id: "heartbeat:main",
  name: "Heartbeat",
  about: "Every hour Main looks over its work and writes in Home only when something needs you.",
  kind: "heartbeat",
  every: 60,
  next_at: "2026-10-31T16:54:00.000Z",
  for_agents: [MAIN],
  on: true,
  editable: true,
  choices: [15, 30, 60, 120, 240, 720, 1440],
  ...extra,
});
const dreaming = {
  job_id: "dreaming",
  name: "Dreaming",
  about: "Each night OpenClaw keeps what matters from its agents' day in their memory.",
  kind: "memory",
  every: 1440,
  next_at: "2026-11-01T10:00:00.000Z",
  on: true,
  editable: true,
};
const skills = {
  job_id: "skill-review",
  name: "Skill review",
  about: "Once a week OpenClaw writes down an agent's ways of working worth keeping as skills.",
  kind: "skills",
  every: 10_080,
  for_agents: [MAIN],
  on: true,
  editable: true,
};

const run = (extra: Record<string, unknown> = {}) => ({
  job_id: "heartbeat:main",
  run_id: "manual:heartbeat-main:1793462087000:1",
  started_at: "2026-10-31T15:54:03.000Z",
  ended_at: "2026-10-31T15:54:18.000Z",
  outcome: "done",
  quiet: true,
  agent_id: MAIN,
  cost_usd: 0.342,
  tokens: 68_212,
  model: "claude-opus-5-5",
  ...extra,
});

describe("a harness's own jobs, as it sends them (ADR 0252)", () => {
  it("takes OpenClaw's three", () => {
    const put = harnessJobsPut.safeParse({ jobs: [heartbeat(), dreaming, skills] });
    expect(put.success).toBe(true);
  });

  it("takes a job that says a run of it is going now, and keeps when it began", () => {
    const going = { ...dreaming, running_since: "2026-11-01T10:00:04.000Z" };
    const put = harnessJobsPut.safeParse({ jobs: [heartbeat(), going] });
    expect(put.success && put.data.jobs[1]?.running_since).toBe("2026-11-01T10:00:04.000Z");
    expect(put.success && put.data.jobs[0]?.running_since).toBeUndefined();
    // When it began is a time, not words.
    expect(
      harnessJobsPut.safeParse({ jobs: [{ ...dreaming, running_since: "just now" }] }).success,
    ).toBe(false);
  });

  it("takes none at all, for a harness whose jobs are all gone", () => {
    expect(harnessJobsPut.safeParse({ jobs: [] }).success).toBe(true);
  });

  it("asks how often a job runs, in minutes or in words", () => {
    const { every: _every, ...none } = dreaming;
    expect(harnessJobsPut.safeParse({ jobs: [none] }).success).toBe(false);
    expect(harnessJobsPut.safeParse({ jobs: [{ ...none, when: "Weekdays at 9" }] }).success).toBe(
      true,
    );
  });

  it("keeps an interval among its choices, and the choices in order", () => {
    expect(harnessJobsPut.safeParse({ jobs: [heartbeat({ every: 45 })] }).success).toBe(false);
    expect(harnessJobsPut.safeParse({ jobs: [heartbeat({ choices: [60, 30] })] }).success).toBe(
      false,
    );
  });

  it("says why only for a job that can't be switched", () => {
    const why = { why_read_only: "Set in OpenClaw's own settings." };
    expect(harnessJobsPut.safeParse({ jobs: [heartbeat(why)] }).success).toBe(false);
    expect(
      harnessJobsPut.safeParse({ jobs: [heartbeat({ ...why, editable: false })] }).success,
    ).toBe(true);
  });

  it("names each job once, and lists twenty-four at most", () => {
    expect(harnessJobsPut.safeParse({ jobs: [dreaming, dreaming] }).success).toBe(false);
    const many = Array.from({ length: HARNESS_JOBS_MAX + 1 }, (_, at) => ({
      ...dreaming,
      job_id: `job-${at}`,
    }));
    expect(harnessJobsPut.safeParse({ jobs: many }).success).toBe(false);
  });

  it("refuses a job id that is not one", () => {
    expect(harnessJobsPut.safeParse({ jobs: [{ ...dreaming, job_id: "../x" }] }).success).toBe(
      false,
    );
    expect(harnessJobsPut.safeParse({ jobs: [{ ...dreaming, job_id: "" }] }).success).toBe(false);
  });

  it("answers a change, or refuses it with words", () => {
    const answers = { jobs: [heartbeat({ on: false })], answers: "chg_01JB0000000000000000000000" };
    expect(harnessJobsPut.safeParse(answers).success).toBe(true);
    const refuses = {
      jobs: [heartbeat()],
      refuses: { change_id: "chg_01JB0000000000000000000000", message: "Not now." },
    };
    expect(harnessJobsPut.safeParse(refuses).success).toBe(true);
  });
});

describe("a job's runs (ADR 0252)", () => {
  it("takes a run with its cost, and one whose cost isn't known", () => {
    const { cost_usd: _cost, tokens: _tokens, model: _model, ...unpriced } = run();
    expect(jobRunsPost.safeParse({ runs: [run(), unpriced] }).success).toBe(true);
  });

  it("takes a run stopped by a restart, and one that waited for an approval", () => {
    const stopped = run({ outcome: "stopped", error: "OpenClaw restarted." });
    const waited = run({ job_id: "skill-review", waited: true, quiet: true });
    expect(jobRunsPost.safeParse({ runs: [stopped, waited] }).success).toBe(true);
  });

  it("refuses a run that ends before it starts, or a cost below nothing", () => {
    expect(
      jobRunsPost.safeParse({ runs: [run({ ended_at: "2026-10-31T15:00:00.000Z" })] }).success,
    ).toBe(false);
    expect(jobRunsPost.safeParse({ runs: [run({ cost_usd: -1 })] }).success).toBe(false);
  });

  it("carries one to two hundred runs a post", () => {
    expect(jobRunsPost.safeParse({ runs: [] }).success).toBe(false);
    const many = Array.from({ length: JOB_RUNS_POST_MAX + 1 }, (_, at) =>
      run({ run_id: `r${at}` }),
    );
    expect(jobRunsPost.safeParse({ runs: many }).success).toBe(false);
  });
});

describe("a person's change of a job (ADR 0252)", () => {
  it("is on or off, and an interval when it has one", () => {
    expect(jobChangeAsk.safeParse({ on: false }).success).toBe(true);
    expect(jobChangeAsk.safeParse({ on: true, every: 120 }).success).toBe(true);
    expect(jobChangeAsk.safeParse({ every: 120 }).success).toBe(false);
  });

  it("goes down as the job.change fixture says", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../fixtures/frames/job.change.json", import.meta.url), "utf8"),
    );
    expect(jobChangeFrame.safeParse(fixture).success).toBe(true);
    expect(jobChangeFrame.safeParse({ ...fixture, job_id: "a b" }).success).toBe(false);
  });

  it("is read back with the copy, what Chips counted, and what became of it", () => {
    const view = harnessJobsView.safeParse({
      harness_id: "hrn_01JB0000000000000000000000",
      read_at: "2026-10-31T16:00:00.000Z",
      away: false,
      jobs: [
        {
          ...heartbeat(),
          week_usd: 14.39,
          week_runs: 42,
          runs_total: 416,
          last_run: run(),
          change: {
            change_id: "chg_01JB0000000000000000000000",
            state: "saved",
            on: true,
            asked_at: "2026-10-31T16:00:00.000Z",
            answered_at: "2026-10-31T16:00:02.000Z",
          },
        },
        { ...dreaming, week_runs: 3, runs_total: 31 },
      ],
    });
    expect(view.success).toBe(true);
  });
});
