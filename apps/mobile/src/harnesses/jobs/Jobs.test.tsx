/**
 * A harness's own jobs on the phone (ADR 0252, the mock's layout A): "Its own jobs" on its page, a
 * row a job that opens the job's own page; and that page's switch, which saves when flipped, its
 * Every row, its last fourteen days as bars under what they cost, and its runs a page at a time.
 */

import type { Snapshot, Store } from "@chipschat/core";
import type { HarnessJobsView, HarnessJobView, JobChangeAsk, JobRun } from "@chipschat/protocol";
import { act, fireEvent, render as renderBare, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { forget } from "../../context/memory";
import { agentsSnapshot, ME } from "../../testing/agents";
import { fakeStore } from "../../testing/fixtures";
import { JobPage } from "./JobPage";
import { JobsGroup } from "./JobsGroup";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const HARNESS = "hrn_openclaw";
/** Saturday 31 October 2026, 9:41 AM, in the reader's time. */
const NOW = new Date(2026, 9, 31, 9, 41);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

/** The workspace with OpenClaw declaring its jobs; without, it sends none. */
function snapshot(declares = true): Snapshot {
  const base = agentsSnapshot();
  const harness = base.directory[HARNESS];
  return {
    ...base,
    directory: {
      ...base.directory,
      [HARNESS]: { ...harness, capabilities: declares ? ["agents", "jobs"] : ["agents"] },
    },
  } as Snapshot;
}

const heartbeat = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "heartbeat:main",
  name: "Heartbeat",
  about: "Every hour OpenClaw looks over its work and writes only when something needs you.",
  kind: "heartbeat",
  every: 60,
  next_at: at(31, 9, 54),
  for_agents: ["agt_main"],
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
  week_runs: 3,
  runs_total: 31,
  ...more,
});
const viewOf = (jobs: HarnessJobView[] = [heartbeat(), dreaming()]): HarnessJobsView => ({
  harness_id: HARNESS,
  jobs,
  read_at: at(31, 9),
  away: false,
});

/** A check an hour from 8:54 this morning back, each 34¢ and quiet. */
function checks(count: number, from = 0): JobRun[] {
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(2026, 9, 31, 8 - (from + index), 54).getTime();
    return {
      job_id: "heartbeat:main",
      run_id: `r${from + index}`,
      started_at: new Date(start).toISOString(),
      ended_at: new Date(start + 15_000).toISOString(),
      outcome: "done" as const,
      quiet: true,
      cost_usd: 0.342,
    };
  });
}

/** A store whose harness answers each change at once, as asked or refusing it. */
function storeWith(first: HarnessJobsView, runs: JobRun[] = [], opts: { refuse?: string } = {}) {
  const store = fakeStore(snapshot());
  let now = first;
  const asked: JobChangeAsk[] = [];
  const reads: { before?: string; limit?: number }[] = [];
  return Object.assign(store, {
    asked,
    reads,
    readHarnessJobs: async () => now,
    readJobRuns: async (
      _harness: string,
      jobId: string,
      query: { since?: string; before?: string; limit?: number },
    ) => {
      reads.push({
        ...(query.before === undefined ? {} : { before: query.before }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      });
      const mine = runs.filter(
        (run) =>
          run.job_id === jobId &&
          (query.since === undefined || run.started_at >= query.since) &&
          (query.before === undefined || run.started_at < query.before),
      );
      const limit = query.limit ?? 50;
      return {
        harness_id: HARNESS,
        job_id: jobId,
        runs: mine.slice(0, limit),
        more: mine.length > limit,
      };
    },
    changeHarnessJob: async (_harness: string, jobId: string, ask: JobChangeAsk) => {
      asked.push(ask);
      const change = {
        change_id: "chg_01K4ZQPX0000000000000000C1",
        asked_at: at(31, 9, 41),
        on: ask.on,
        ...(ask.every === undefined ? {} : { every: ask.every }),
      };
      now = {
        ...now,
        jobs: now.jobs.map((job) =>
          job.job_id !== jobId
            ? job
            : opts.refuse === undefined
              ? {
                  ...job,
                  on: ask.on,
                  every: ask.every ?? job.every,
                  change: { ...change, state: "saved" as const },
                }
              : { ...job, change: { ...change, state: "failed" as const, message: opts.refuse } },
        ),
      };
      return { ...change, state: "waiting" as const };
    },
  });
}

async function showGroup(store: Store, snap = snapshot(), onOpen?: (job: string) => void) {
  await render(
    <JobsGroup
      store={store}
      snapshot={snap}
      harnessId={HARNESS}
      selfId={ME}
      focus={0}
      onOpen={onOpen}
    />,
  );
  await settle();
}

async function showPage(store: Store, jobId = "heartbeat:main") {
  await render(
    <JobPage
      store={store}
      snapshot={snapshot()}
      harnessId={HARNESS}
      jobId={jobId}
      selfId={ME}
      focus={0}
    />,
  );
  await settle();
}

/** Lets the reads, and a save's reads 800 ms apart, run. */
async function settle(ms = 1000) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  forget();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe("Its own jobs on a harness's page", () => {
  it("lists each job with how often, for whom, and this week's cost, under the week's total", async () => {
    await showGroup(storeWith(viewOf([heartbeat(), dreaming({ on: false })])));
    expect(screen.getByText("Its own jobs")).toBeTruthy();
    expect(screen.getByTestId("jobs-week")).toHaveTextContent("$14.39 this week");
    expect(screen.getByTestId("job-heartbeat:main")).toHaveTextContent(/Heartbeat/);
    expect(screen.getByTestId("job-heartbeat:main")).toHaveTextContent(/Every hour/);
    expect(screen.getByTestId("job-heartbeat:main")).toHaveTextContent(/\$14\.39/);
    expect(screen.getByTestId("job-dreaming")).toHaveTextContent(/Off/);
    expect(
      screen.getByText(
        "OpenClaw runs these by itself, outside your spaces. What they cost isn't in any space's total.",
      ),
    ).toBeTruthy();
  });

  it("opens a job's page from its row", async () => {
    const opened: string[] = [];
    await showGroup(storeWith(viewOf()), snapshot(), (job) => opened.push(job));
    await fireEvent.press(screen.getByTestId("job-dreaming"));
    expect(opened).toEqual(["dreaming"]);
  });

  it("is not there for a harness that sends no jobs, or for one that has none", async () => {
    await showGroup(storeWith(viewOf()), snapshot(false));
    expect(screen.queryByText("Its own jobs")).toBeNull();
    await showGroup(storeWith(viewOf([])));
    expect(screen.queryByText("Its own jobs")).toBeNull();
  });
});

describe("a job's page", () => {
  it("names the job large and what it does, and says when it runs next", async () => {
    await showPage(storeWith(viewOf(), checks(3)));
    expect(screen.getByTestId("job-hero")).toHaveTextContent(/Heartbeat/);
    expect(screen.getByTestId("job-hero")).toHaveTextContent(/looks over its work/);
    expect(screen.getByTestId("job-switch-row")).toHaveTextContent(/On · next at 9:54 AM/);
    expect(screen.getByTestId("job-every")).toHaveTextContent(/1 hour/);
  });

  it("turns it off from the switch, keeping its interval", async () => {
    const store = storeWith(viewOf());
    await showPage(store);
    await fireEvent(screen.getByTestId("job-switch"), "valueChange", false);
    expect(screen.getByTestId("job-switch-row")).toHaveTextContent(/Saving to OpenClaw/);
    await settle();
    expect(store.asked).toEqual([{ on: false, every: 60 }]);
    expect(screen.getByTestId("job-switch-row")).toHaveTextContent(/Off · OpenClaw won't run it/);
    expect(screen.queryByTestId("job-every")).toBeNull();
  });

  it("picks an interval from the sheet, which saves it", async () => {
    const store = storeWith(viewOf());
    await showPage(store);
    await fireEvent.press(screen.getByTestId("job-every"));
    await fireEvent.press(screen.getByTestId("heartbeat-every-240"));
    await settle();
    expect(store.asked).toEqual([{ on: true, every: 240 }]);
    expect(screen.getByTestId("job-every")).toHaveTextContent(/4 hours/);
  });

  it("says a refusal under the switch a moment, and the switch goes back", async () => {
    await showPage(storeWith(viewOf(), [], { refuse: "Config is read-only." }));
    await fireEvent(screen.getByTestId("job-switch"), "valueChange", false);
    await settle();
    expect(screen.getByTestId("job-switch-row")).toHaveTextContent(/Config is read-only/);
    await settle(4000);
    expect(screen.getByTestId("job-switch-row")).toHaveTextContent(/On · next/);
  });

  it("says when and for whom a job without intervals runs", async () => {
    await showPage(storeWith(viewOf()), "dreaming");
    expect(screen.getByTestId("job-when")).toHaveTextContent(/Every night at 3:00 AM/);
    expect(screen.queryByTestId("job-every")).toBeNull();
  });

  it("is quiet and says why for a job the harness keeps to itself", async () => {
    const kept = dreaming({ editable: false, why_read_only: "Set in openclaw.json by hand." });
    await showPage(storeWith(viewOf([kept])), "dreaming");
    expect(screen.getByTestId("job-switch").props["disabled"]).toBe(true);
    expect(screen.getByTestId("job-hint")).toHaveTextContent(/Set in openclaw\.json by hand/);
  });

  it("shows the fourteen days as bars under what they cost, and a day's own when tapped", async () => {
    await showPage(storeWith(viewOf(), checks(3)));
    expect(screen.getByTestId("job-summary")).toHaveTextContent(/\$1\.03/);
    expect(screen.getByTestId("job-summary")).toHaveTextContent(/3 runs · 34¢ each/);
    expect(screen.getAllByTestId(/^job-bar-/)).toHaveLength(14);
    await fireEvent.press(screen.getByTestId("job-bar-13"));
    expect(screen.getByTestId("job-summary")).toHaveTextContent(/Today · 3 runs/);
    await fireEvent.press(screen.getByTestId("job-bar-13"));
    expect(screen.getByTestId("job-summary")).toHaveTextContent(/\$1\.03/);
  });

  it("lists its runs with how they went and what each cost, then more a page at a time", async () => {
    const store = storeWith(viewOf(), checks(26));
    await showPage(store);
    expect(screen.getByText("416 in all")).toBeTruthy();
    expect(screen.getByTestId("job-run-r0")).toHaveTextContent(/Today, 8:54 AM/);
    expect(screen.getByTestId("job-run-r0")).toHaveTextContent(/15 s · Nothing to say/);
    expect(screen.getByTestId("job-run-r0")).toHaveTextContent(/34¢/);
    expect(screen.getAllByTestId(/^job-run-r/)).toHaveLength(20);
    await fireEvent.press(screen.getByTestId("job-runs-more"));
    await settle();
    expect(screen.getAllByTestId(/^job-run-r/)).toHaveLength(26);
  });

  it("says a job that hasn't run yet has no runs", async () => {
    await showPage(storeWith(viewOf()), "dreaming");
    expect(screen.getByTestId("job-summary")).toHaveTextContent(/No runs/);
    expect(screen.getByText("Dreaming hasn't run yet.")).toBeTruthy();
  });
});
