/** A harness's own jobs, as its page draws them (ADR 0252). Times are the reader's own. */

import type { HarnessJobsView, HarnessJobView, JobChangeView, JobRun } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { Directory, Participant } from "./events.js";
import {
  costWords,
  daysSummary,
  forWords,
  jobDays,
  jobDaysSince,
  jobEveryChoices,
  jobPage,
  jobRows,
  jobSaveWords,
  jobsFoot,
  jobsWeekWords,
  mayChangeJobs,
  nextWords,
  outcomeWords,
  runLine,
  runWhenWords,
  saveJobChange,
  scheduleWords,
  takesJobs,
  tookWords,
} from "./harnessJobs.js";
import { buildModel } from "./model.js";
import { ServerRefused } from "./transport.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const CLAW = "hrn_01K4ZQPX0000000000000CLAW0";
const MAIN = "agt_01K4ZQPX0000000000000MAIN0";
const FEN = "agt_01K4ZQPX00000000000000FEN0";
const CHANGE = "chg_01K4ZQPX00000000000CHANGE";

const claw = (more: Partial<Participant> = {}): Participant => ({
  id: CLAW,
  kind: "harness",
  displayName: "OpenClaw",
  ownerId: ARJUN,
  capabilities: ["agents", "jobs"],
  ...more,
});
const directory = (more: Partial<Participant> = {}): Directory => ({
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [CLAW]: claw(more),
  [MAIN]: { id: MAIN, kind: "agent", harnessId: CLAW, displayName: "OpenClaw" },
  [FEN]: { id: FEN, kind: "agent", harnessId: CLAW, displayName: "Fen" },
});
const workspace = buildModel(
  Object.entries({ [ARJUN]: "owner", [DANA]: "member" }).map(([id, role], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: "2026-10-31T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

/** Saturday 31 October 2026, 9:41 AM, in the reader's time. */
const NOW = new Date(2026, 9, 31, 9, 41).getTime();
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const heartbeat = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "heartbeat:main",
  name: "Heartbeat",
  about: "Every hour Main looks over its work and writes in Home only when something needs you.",
  kind: "heartbeat",
  every: 60,
  next_at: at(31, 9, 54),
  for_agents: [MAIN],
  on: true,
  editable: true,
  choices: [15, 30, 60, 120, 240, 720, 1440],
  week_usd: 14.39,
  week_runs: 42,
  runs_total: 416,
  ...more,
});
const dreaming = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "dreaming",
  name: "Dreaming",
  about: "Each night OpenClaw keeps what matters from its agents' day in their memory.",
  kind: "memory",
  every: 1440,
  next_at: at(32, 3),
  on: true,
  editable: true,
  week_usd: 0.3,
  week_runs: 3,
  runs_total: 31,
  ...more,
});
const skills = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "skill-review",
  name: "Skill review",
  about: "Once a week OpenClaw writes down an agent's ways of working worth keeping as skills.",
  kind: "skills",
  every: 10_080,
  next_at: at(36, 20, 1),
  for_agents: [MAIN, FEN],
  on: true,
  editable: true,
  week_runs: 2,
  runs_total: 9,
  ...more,
});
const view = (jobs: HarnessJobView[] = [heartbeat(), dreaming(), skills()]): HarnessJobsView => ({
  harness_id: CLAW,
  jobs,
  read_at: at(31, 9),
  away: false,
});
const run = (more: Partial<JobRun> = {}): JobRun => ({
  job_id: "heartbeat:main",
  run_id: "r1",
  started_at: at(31, 8, 54),
  ended_at: new Date(new Date(2026, 9, 31, 8, 54, 15).getTime()).toISOString(),
  outcome: "done",
  quiet: true,
  cost_usd: 0.342,
  ...more,
});

describe("who sees a harness's own jobs (ADR 0252)", () => {
  it("is the people who run it, while it declares jobs", () => {
    expect(takesJobs(directory(), CLAW)).toBe(true);
    expect(takesJobs(directory(), MAIN)).toBe(true);
    expect(mayChangeJobs(workspace, directory(), CLAW, ARJUN)).toBe(true);
    expect(mayChangeJobs(workspace, directory(), CLAW, DANA)).toBe(false);
    expect(mayChangeJobs(workspace, directory({ capabilities: ["agents"] }), CLAW, ARJUN)).toBe(
      false,
    );
  });
});

describe("the words", () => {
  it("say a cost in cents, then dollars", () => {
    expect(costWords(0.342)).toBe("34¢");
    expect(costWords(14.39)).toBe("$14.39");
    expect(costWords(0.996)).toBe("$1.00");
    expect(costWords(0.001)).toBe("Under 1¢");
    expect(costWords(0)).toBe("Free");
    expect(costWords(undefined)).toBe("—");
  });

  it("say how often in the reader's time, a daily or weekly job at its next run's", () => {
    expect(scheduleWords(heartbeat())).toBe("Every hour");
    expect(scheduleWords(heartbeat({ every: 30 }))).toBe("Every 30 min");
    expect(scheduleWords(heartbeat({ every: 240 }))).toBe("Every 4 hours");
    expect(scheduleWords(dreaming())).toBe("Every night at 3:00 AM");
    expect(scheduleWords(dreaming({ next_at: at(32, 9) }))).toBe("Every day at 9:00 AM");
    expect(scheduleWords(skills())).toBe("Every Thursday at 8:01 PM");
    expect(scheduleWords(skills({ next_at: undefined }))).toBe("Every week");
    expect(scheduleWords(dreaming({ next_at: undefined }))).toBe("Once a day");
    expect(scheduleWords(dreaming({ every: undefined, when: "Weekdays at 9" }))).toBe(
      "Weekdays at 9",
    );
  });

  it("say whom a job runs for", () => {
    expect(forWords(heartbeat(), directory())).toBe("for OpenClaw");
    expect(forWords(skills(), directory())).toBe("for 2 agents");
    expect(forWords(dreaming(), directory())).toBeUndefined();
  });

  it("say when it runs next", () => {
    expect(nextWords(at(31, 9, 54), NOW)).toBe("at 9:54 AM");
    expect(nextWords(at(31, 22), NOW)).toBe("tonight at 10:00 PM");
    expect(nextWords(at(32, 3), NOW)).toBe("tonight at 3:00 AM");
    expect(nextWords(at(32, 9), NOW)).toBe("tomorrow at 9:00 AM");
    expect(nextWords(at(36, 20, 1), NOW)).toBe("Thursday at 8:01 PM");
    expect(nextWords(at(45, 9), NOW)).toBe("on Nov 14");
  });

  it("say how long a run took, and when it started", () => {
    expect(tookWords(6000)).toBe("6 s");
    expect(tookWords(1_810_000)).toBe("30 min");
    expect(tookWords(3_900_000)).toBe("1 h 5 min");
    expect(runWhenWords(at(31, 8, 54), NOW)).toBe("Today, 8:54 AM");
    expect(runWhenWords(at(30, 19, 53), NOW)).toBe("Yesterday, 7:53 PM");
    expect(runWhenWords(at(29, 20, 1), NOW)).toBe("Thu, 8:01 PM");
    expect(runWhenWords(at(24, 14, 25), NOW)).toBe("Oct 24, 2:25 PM");
  });

  it("say how a run went", () => {
    expect(outcomeWords(run())).toBe("Nothing to say");
    expect(outcomeWords(run({ quiet: false }))).toBeUndefined();
    expect(outcomeWords(run({ waited: true }))).toBe("Waited for an approval");
    expect(outcomeWords(run({ outcome: "stopped", error: "OpenClaw restarted" }))).toBe(
      "Stopped: OpenClaw restarted",
    );
    expect(outcomeWords(run({ outcome: "failed", error: "The model was overloaded." }))).toBe(
      "The model was overloaded.",
    );
  });
});

describe("the group on the harness page", () => {
  it("lists each job with how often, for whom, and what it cost this week", () => {
    expect(jobRows(view(), directory())).toEqual([
      {
        id: "heartbeat:main",
        kind: "heartbeat",
        name: "Heartbeat",
        sub: "Every hour, for OpenClaw",
        value: "$14.39",
        on: true,
      },
      {
        id: "dreaming",
        kind: "memory",
        name: "Dreaming",
        sub: "Every night at 3:00 AM",
        value: "30¢",
        on: true,
      },
      {
        id: "skill-review",
        kind: "skills",
        name: "Skill review",
        sub: "Every Thursday at 8:01 PM, for 2 agents",
        value: "2 runs",
        on: true,
      },
    ]);
  });

  it("says Off, and Saving while a switch waits, as the switch asked", () => {
    const waiting: JobChangeView = {
      change_id: CHANGE,
      state: "waiting",
      on: false,
      asked_at: at(31, 9, 40),
    };
    const rows = jobRows(
      view([heartbeat({ on: false }), dreaming({ change: waiting }), skills({ week_runs: 0 })]),
      directory(),
    );
    expect(rows.map((row) => [row.value, row.on])).toEqual([
      ["Off", false],
      ["Saving", false],
      ["", true],
    ]);
  });

  it("carries the week's total on its heading, and says what the jobs are under it", () => {
    expect(jobsWeekWords(view())).toBe("$14.69 this week");
    expect(jobsWeekWords(view([skills()]))).toBeUndefined();
    expect(jobsFoot("OpenClaw")).toBe(
      "OpenClaw runs these by itself, outside your spaces. What they cost isn't in any space's total.",
    );
  });
});

describe("the job's page", () => {
  it("says when it runs next, and offers its intervals while it is on", () => {
    const page = jobPage(heartbeat(), "OpenClaw", false, directory(), NOW);
    expect(page.switch).toEqual({ on: true, sub: "On · next at 9:54 AM", saving: false });
    expect(page.every).toEqual({ shows: true, minutes: 60, value: "1 hour" });
    expect(page.quiet).toBe(false);
    expect(jobEveryChoices(heartbeat()).find((each) => each.checked)).toMatchObject({
      minutes: 60,
      label: "1 hour",
      sub: "about 24 a day",
    });
  });

  it("is off, with no intervals, and has no Every row for a job without choices", () => {
    const off = jobPage(heartbeat({ on: false }), "OpenClaw", false, directory(), NOW);
    expect(off.switch.sub).toBe("Off · OpenClaw won't run it");
    expect(off.every?.shows).toBe(false);
    const dream = jobPage(dreaming(), "OpenClaw", false, directory(), NOW);
    expect(dream.every).toBeUndefined();
    expect(dream.switch.sub).toBe("On · next tonight at 3:00 AM");
    expect(dream.schedule).toBe("Every night at 3:00 AM");
  });

  it("saves what a waiting change asks: the switch, or the interval", () => {
    const asked = (on: boolean, every?: number): JobChangeView => ({
      change_id: CHANGE,
      state: "waiting",
      on,
      ...(every === undefined ? {} : { every }),
      asked_at: at(31, 9, 40),
    });
    const switching = jobPage(
      heartbeat({ change: asked(false, 60) }),
      "OpenClaw",
      false,
      directory(),
      NOW,
    );
    expect(switching.switch).toEqual({ on: false, sub: "Saving to OpenClaw", saving: true });
    const timing = jobPage(
      heartbeat({ change: asked(true, 120) }),
      "OpenClaw",
      false,
      directory(),
      NOW,
    );
    expect(timing.switch.sub).toBe("On · next at 9:54 AM");
    expect(timing.every).toEqual({ shows: true, minutes: 120, value: "Saving to OpenClaw" });
  });

  it("is quiet, and says why, while the harness is away or keeps the job to itself", () => {
    expect(jobPage(dreaming(), "OpenClaw", true, directory(), NOW)).toMatchObject({
      quiet: true,
      hint: "OpenClaw is away",
    });
    const kept = dreaming({ editable: false, why_read_only: "Set in OpenClaw's own settings." });
    expect(jobPage(kept, "OpenClaw", false, directory(), NOW)).toMatchObject({
      quiet: true,
      hint: "Set in OpenClaw's own settings.",
    });
  });
});

describe("the days and the runs", () => {
  const runs = [
    run(),
    run({ run_id: "r2", started_at: at(31, 7, 54), ended_at: at(31, 7, 55) }),
    run({ run_id: "r3", started_at: at(30, 20, 54), ended_at: at(30, 20, 55) }),
    run({ run_id: "free", started_at: at(20, 20), ended_at: at(20, 20, 1), cost_usd: 0 }),
    run({ run_id: "old", started_at: at(10, 20), ended_at: at(10, 20, 1) }),
  ];

  it("are fourteen days, oldest first, each with its runs and what they cost", () => {
    const days = jobDays(runs, NOW);
    expect(days).toHaveLength(14);
    expect(days[0]?.label).toBe("Oct 18");
    expect(days.at(-1)).toMatchObject({ label: "Today", today: true, runs: 2, usd: 0.684 });
    expect(days.at(-2)).toMatchObject({ runs: 1, usd: 0.342, today: false });
    expect(days.find((day) => day.label === "Oct 20")).toMatchObject({ runs: 1, usd: 0 });
    expect(days.find((day) => day.label === "Oct 25")).toMatchObject({ runs: 0, usd: undefined });
    expect(jobDaysSince(NOW)).toBe(new Date(2026, 9, 18).toISOString());
  });

  it("are summed above the bars, with what a run costs", () => {
    expect(daysSummary(jobDays(runs, NOW), runs)).toEqual({
      total: "$1.03",
      sub: "4 runs · 26¢ each",
    });
    const unpriced = runs.map(({ cost_usd: _cost, ...rest }) => rest);
    expect(daysSummary(jobDays(unpriced, NOW), unpriced)).toEqual({
      total: "4 runs",
      sub: "What they cost isn't known",
    });
    expect(daysSummary(jobDays([], NOW), [])).toEqual({ total: "$0.00", sub: "No runs" });
    const some = runs.map((each, index) => {
      const { cost_usd: _cost, ...rest } = each;
      return index === 0 ? each : rest;
    });
    expect(daysSummary(jobDays(some, NOW), some)).toEqual({
      total: costWords(runs[0]?.cost_usd),
      sub: "4 runs · cost known for 1",
    });
  });

  it("each say when, how long, how it went and what it cost, and whom for a job of several", () => {
    expect(runLine(run(), heartbeat(), directory(), NOW)).toEqual({
      id: "r1",
      when: "Today, 8:54 AM",
      sub: "15 s · Nothing to say",
      cost: "34¢",
      tone: "ok",
    });
    const waited = run({
      job_id: "skill-review",
      started_at: at(29, 20, 1),
      ended_at: at(29, 20, 31),
      agent_id: FEN,
      waited: true,
      cost_usd: 0.091,
    });
    expect(runLine(waited, skills(), directory(), NOW)).toEqual({
      id: "r1",
      when: "Thu, 8:01 PM · Fen",
      sub: "30 min · Waited for an approval",
      cost: "9¢",
      tone: "warn",
    });
    const failed = run({ outcome: "failed", error: "Overloaded.", cost_usd: undefined });
    expect(runLine(failed, heartbeat(), directory(), NOW)).toMatchObject({
      cost: "—",
      tone: "bad",
    });
  });
});

describe("saving a switch", () => {
  const answered = (state: JobChangeView["state"], message?: string): HarnessJobsView =>
    view([
      dreaming({
        on: false,
        change: {
          change_id: CHANGE,
          state,
          on: false,
          asked_at: at(31, 9, 40),
          ...(message === undefined ? {} : { message }),
        },
      }),
    ]);
  const store = (reads: HarnessJobsView[], refuse?: Error) => ({
    changeHarnessJob: async () => {
      if (refuse !== undefined) throw refuse;
      return { change_id: CHANGE, state: "waiting", on: false, asked_at: at(31, 9, 40) } as const;
    },
    readHarnessJobs: async () => reads.shift() ?? answered("waiting"),
  });
  const quick = { alive: () => true, everyMs: 1, sleep: async () => undefined };

  it("waits for the harness's answer, and gives back the jobs as they are", async () => {
    const outcome = await saveJobChange(
      store([answered("waiting"), answered("saved")]),
      CLAW,
      "dreaming",
      { on: false },
      quick,
    );
    expect(outcome.state).toBe("saved");
    expect(outcome.view?.jobs[0]?.on).toBe(false);
  });

  it("carries a refusal's words, and says the harness is away when nothing of it hears", async () => {
    const failed = await saveJobChange(
      store([answered("failed", "Not while it dreams.")]),
      CLAW,
      "dreaming",
      { on: false },
      quick,
    );
    expect(failed).toMatchObject({ state: "failed", message: "Not while it dreams." });
    const away = await saveJobChange(
      store(
        [],
        new ServerRefused("OpenClaw is away", 422, {
          error: { code: "invalid_event", refusal: "harness_away" },
        }),
      ),
      CLAW,
      "dreaming",
      { on: false },
      quick,
    );
    expect(away.state).toBe("away");
    expect(jobSaveWords("away", "OpenClaw")).toBe("OpenClaw is away");
  });

  it("is missed once its minute has passed with no answer", async () => {
    const outcome = await saveJobChange(
      store([]),
      CLAW,
      "dreaming",
      { on: false },
      {
        ...quick,
        everyMs: 30_000,
      },
    );
    expect(outcome.state).toBe("missed");
    expect(jobSaveWords("missed", "OpenClaw")).toBe(
      "OpenClaw hasn't answered. It may still change it.",
    );
  });
});
