/**
 * A harness's own jobs on the desktop (ADR 0252, the mock's layout A): the "Its own jobs" group on
 * its card for the people who run it and nobody else, each job's row in core's words, and the
 * job's page — its hero, its switch that saves when flipped, the Every menu, the fourteen days as
 * bars, and its runs twenty at a time. Driven through the Agents tab's harness cards, so the store
 * reaches the group as it does in the app. OpenClaw sends three jobs; Main is its Main agent.
 */

import {
  buildModel,
  type ClientEvent,
  type Directory,
  daysSummary,
  jobDays,
  ServerRefused,
} from "@chipschat/core";
import type { HarnessJobsView, HarnessJobView, JobChangeAsk, JobRun } from "@chipschat/protocol";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forget } from "../context/memory.ts";
import { Harnesses } from "../Harnesses.tsx";
import type { JobsReads } from "./JobsGroup.tsx";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const CLAW = "hrn_01K4ZQPX0000000000000CLAW";
const MAIN = "agt_01K4ZQPX0000000000000MAIN";
const FEN = "agt_01K4ZQPX00000000000000FEN";
/** Long enough for a save's first read, 800 ms after the change is sent. */
const SAVED = { timeout: 2500 };
const HOUR_MS = 3_600_000;

const joined = (id: string, role: string, seq: number): ClientEvent =>
  ({
    seq,
    type: "person.joined",
    id: `evt_${seq}`,
    ts: "2026-10-31T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id === ARJUN ? "Arjun" : "Dana",
    role,
  }) as unknown as ClientEvent;
const model = buildModel([joined(ARJUN, "owner", 1), joined(DANA, "member", 2)]);

function directory(capabilities: readonly string[] = ["agents", "jobs"]): Directory {
  return {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
    [CLAW]: { id: CLAW, kind: "harness", displayName: "OpenClaw", ownerId: ARJUN, capabilities },
    [MAIN]: { id: MAIN, kind: "agent", harnessId: CLAW, displayName: "Main", lead: true },
    [FEN]: { id: FEN, kind: "agent", harnessId: CLAW, displayName: "Fen" },
  } as Directory;
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const heartbeat = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "heartbeat:main",
  name: "Heartbeat",
  about: "Every hour Main looks over its work and writes in Home only when something needs you.",
  kind: "heartbeat",
  every: 60,
  next_at: new Date(Date.now() + 13 * 60_000).toISOString(),
  for_agents: [MAIN],
  on: true,
  editable: true,
  choices: [15, 30, 60, 120, 240],
  week_usd: 14.39,
  week_runs: 42,
  runs_total: 45,
  ...more,
});
const dreaming = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "dreaming",
  name: "Dreaming",
  about: "Each night OpenClaw keeps what matters from its agents' day in their memory.",
  kind: "memory",
  every: 1440,
  on: true,
  editable: true,
  week_usd: 0.3,
  week_runs: 3,
  runs_total: 0,
  ...more,
});
const skills = (more: Partial<HarnessJobView> = {}): HarnessJobView => ({
  job_id: "skill-review",
  name: "Skill review",
  about: "Once a week OpenClaw writes down an agent's ways of working worth keeping as skills.",
  kind: "skills",
  every: 10_080,
  for_agents: [MAIN, FEN],
  on: false,
  editable: true,
  week_runs: 0,
  runs_total: 0,
  ...more,
});
const viewOf = (
  jobs: HarnessJobView[] = [heartbeat(), dreaming(), skills()],
  more: Partial<HarnessJobsView> = {},
): HarnessJobsView => ({
  harness_id: CLAW,
  jobs,
  read_at: ago(60_000),
  away: false,
  ...more,
});

/** The Heartbeat's last 45 checks, an hour apart: the newest a quiet 34¢, one stopped, one failed. */
const checks: JobRun[] = Array.from({ length: 45 }, (_, at) => {
  const started = Date.now() - at * HOUR_MS - 47 * 60_000;
  return {
    job_id: "heartbeat:main",
    run_id: `r${at}`,
    started_at: new Date(started).toISOString(),
    ended_at: new Date(started + 15_000).toISOString(),
    outcome: at === 3 ? "stopped" : at === 5 ? "failed" : "done",
    ...(at === 3 ? { error: "OpenClaw restarted" } : {}),
    quiet: true,
    ...(at === 5 ? {} : { cost_usd: 0.342 }),
  };
});

/** A store whose harness answers each change at once: as asked, or refused in its words. */
function reads(first: HarnessJobsView, runs: readonly JobRun[] = checks, refuse?: string) {
  let now = first;
  const asked: JobChangeAsk[] = [];
  const windows: { since?: string; before?: string; limit?: number }[] = [];
  const store = {
    asked,
    windows,
    readHarnessJobs: async () => now,
    readJobRuns: async (
      _harnessId: string,
      jobId: string,
      window: { since?: string; before?: string; limit?: number } = {},
    ) => {
      windows.push(window);
      const mine = runs
        .filter((run) => run.job_id === jobId)
        .filter((run) => window.since === undefined || run.started_at >= window.since)
        .filter((run) => window.before === undefined || run.started_at < window.before)
        .sort((a, b) => b.started_at.localeCompare(a.started_at));
      const limit = window.limit ?? 500;
      return {
        harness_id: CLAW,
        job_id: jobId,
        runs: mine.slice(0, limit),
        more: mine.length > limit,
      };
    },
    changeHarnessJob: async (_harnessId: string, jobId: string, ask: JobChangeAsk) => {
      asked.push(ask);
      const change = {
        change_id: `chg_${asked.length}`,
        asked_at: new Date().toISOString(),
        answered_at: new Date().toISOString(),
        on: ask.on,
        ...(ask.every === undefined ? {} : { every: ask.every }),
      };
      now = {
        ...now,
        jobs: now.jobs.map((job) =>
          job.job_id !== jobId
            ? job
            : refuse === undefined
              ? {
                  ...job,
                  on: ask.on,
                  every: ask.every ?? job.every,
                  change: { ...change, state: "saved" },
                }
              : { ...job, change: { ...change, state: "failed", message: refuse } },
        ),
      } as HarnessJobsView;
      return { ...change, state: "waiting" as const };
    },
  };
  return store satisfies JobsReads;
}

function page(
  jobs: JobsReads,
  options: { selfId?: string; capabilities?: readonly string[] } = {},
) {
  return render(
    <Harnesses
      model={model}
      directory={directory(options.capabilities)}
      serverUrl="http://127.0.0.1:4431"
      onOpen={vi.fn()}
      onAdd={vi.fn()}
      selfId={options.selfId ?? ARJUN}
      jobs={jobs}
    />,
  );
}

const rowOf = (jobId: string) => screen.getByTestId(`job-row-${jobId}`);
const words = (jobId: string) => ({
  name: within(rowOf(jobId)).getByText(/./, { selector: ".ctx-row-title" }).textContent,
  sub: within(rowOf(jobId)).getByTestId("job-row-sub").textContent,
  value: within(rowOf(jobId)).queryByTestId("job-row-value")?.textContent ?? "",
});
const toggle = () => screen.getByRole("switch", { name: "Heartbeat" }) as HTMLInputElement;
const sub = () => screen.getByTestId("job-switch-sub").textContent;

async function open(jobId: string) {
  fireEvent.click(await screen.findByTestId(`job-row-${jobId}`));
  return await screen.findByTestId("job-hero");
}

describe("Its own jobs on a harness's card", () => {
  it("lists each job in core's words for the people who run it, with the week at the heading", async () => {
    page(reads(viewOf()));
    await screen.findByTestId("jobs-group");
    expect(screen.getByTestId("jobs-week").textContent).toBe("$14.69 this week");
    expect(words("heartbeat:main")).toEqual({
      name: "Heartbeat",
      sub: "Every hour, for Main",
      value: "$14.39",
    });
    expect(words("dreaming")).toEqual({ name: "Dreaming", sub: "Once a day", value: "30¢" });
    expect(words("skill-review")).toEqual({
      name: "Skill review",
      sub: "Every week, for 2 agents",
      value: "Off",
    });
    expect(rowOf("skill-review").querySelector(".job-mark")?.getAttribute("data-on")).toBe("false");
    expect(screen.getByTestId("jobs-foot").textContent).toBe(
      "OpenClaw runs these by itself, outside your spaces. What they cost isn't in any space's total.",
    );
  });

  it("is nothing for a member, for a harness that sends no jobs, or for one that has none (404)", async () => {
    const store = reads(viewOf());
    const member = page(store, { selfId: DANA });
    await screen.findByTestId("harness-card");
    expect(screen.queryByTestId("jobs-group")).toBeNull();
    expect(screen.queryByTestId("jobs-waiting")).toBeNull();
    member.unmount();
    const without = page(store, { capabilities: ["agents"] });
    await screen.findByTestId("harness-card");
    expect(screen.queryByTestId("jobs-group")).toBeNull();
    without.unmount();
    page({
      ...store,
      readHarnessJobs: async () => {
        throw new ServerRefused("Not found", 404, { error: { code: "not_found" } });
      },
    });
    await waitFor(() => expect(screen.queryByTestId("jobs-waiting")).toBeNull());
    expect(screen.queryByTestId("jobs-group")).toBeNull();
  });

  it("stands blank in its place until the first copy comes", async () => {
    page({
      ...reads(viewOf()),
      readHarnessJobs: () => new Promise<HarnessJobsView>(() => undefined),
    });
    expect((await screen.findByTestId("jobs-waiting")).getAttribute("aria-busy")).toBe("true");
  });
});

describe("a job's page", () => {
  it("shows its hero, its switch, fourteen days as bars, and its runs twenty at a time", async () => {
    const store = reads(viewOf());
    page(store);
    const hero = await open("heartbeat:main");
    expect(hero.textContent).toContain("Heartbeat");
    expect(hero.textContent).toContain("Every hour Main looks over its work");
    expect(toggle().checked).toBe(true);
    expect(sub()).toMatch(/^On · next at /);
    expect((screen.getByRole("combobox", { name: "Every" }) as HTMLSelectElement).value).toBe("60");

    const bars = screen.getByTestId("job-bars");
    expect(bars.querySelectorAll(".jobs-day")).toHaveLength(14);
    await waitFor(() => expect(bars.querySelectorAll("button.jobs-day").length).toBeGreaterThan(0));
    expect(bars.querySelectorAll('[data-lit="true"]')).toHaveLength(1);
    const since = store.windows[0]?.since ?? "";
    const fortnight = checks.filter((run) => run.started_at >= since);
    const summary = daysSummary(jobDays(fortnight, Date.now()), fortnight);
    expect(screen.getByTestId("job-total").textContent).toBe(summary.total);
    expect(screen.getByTestId("job-total-sub").textContent).toBe(summary.sub);
    expect(store.windows.slice(0, 2)).toEqual([
      { since: store.windows[0]?.since, limit: 500 },
      { limit: 20 },
    ]);

    await screen.findByTestId("job-run-r0");
    expect(screen.getByTestId("job-runs-total").textContent).toBe("45 in all");
    expect(screen.getAllByTestId(/^job-run-r/)).toHaveLength(20);
    expect(screen.getByTestId("job-run-r0").textContent).toMatch(/15 s · Nothing to say34¢$/);
    expect(screen.getByTestId("job-run-r3").textContent).toContain("Stopped: OpenClaw restarted");
    expect(
      screen.getByTestId("job-run-r5").querySelector(".jobs-run-dot")?.getAttribute("data-tone"),
    ).toBe("bad");
    expect(screen.getByTestId("job-run-r5").querySelector(".jobs-run-cost")?.textContent).toBe("—");

    fireEvent.click(screen.getByTestId("job-runs-more"));
    await waitFor(() => expect(screen.getAllByTestId(/^job-run-r/)).toHaveLength(40));
    expect(store.windows.at(-1)).toEqual({ before: checks[19]?.started_at, limit: 20 });
    fireEvent.click(screen.getByTestId("job-runs-more"));
    await waitFor(() => expect(screen.getAllByTestId(/^job-run-r/)).toHaveLength(45));
    expect(screen.queryByTestId("job-runs-more")).toBeNull();
    expect(screen.getByTestId("job-foot").textContent).toBe(
      "The same switch as Heartbeat on Main's page.",
    );
  });

  it("says a day pointed at above the bars, and goes back to the card", async () => {
    page(reads(viewOf()));
    await open("heartbeat:main");
    const bars = screen.getByTestId("job-bars");
    await waitFor(() => expect(bars.querySelectorAll("button.jobs-day").length).toBeGreaterThan(0));
    const days = [...bars.querySelectorAll("button.jobs-day")];
    const first = days[0] as HTMLElement;
    fireEvent.mouseEnter(first);
    expect(first.getAttribute("data-lit")).toBe("true");
    expect(screen.getByTestId("job-total-sub").textContent).toMatch(/ · \d+ runs?$/);
    fireEvent.mouseLeave(first);
    expect(days.at(-1)?.getAttribute("data-lit")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "‹ Agents" }));
    await screen.findByTestId("jobs-group");
    expect(screen.queryByTestId("job-page")).toBeNull();
  });

  it("says When and for whom for a job with no intervals, and that it hasn't run", async () => {
    page(reads(viewOf()));
    await open("skill-review");
    expect(screen.queryByTestId("job-every")).toBeNull();
    expect(screen.getByTestId("job-when").textContent).toBe("WhenEvery week");
    expect(screen.getByTestId("job-for").textContent).toBe("For2 agents");
    expect(sub()).toBe("Off · OpenClaw won't run it");
    expect((await screen.findByTestId("job-runs-none")).textContent).toBe(
      "Skill review hasn't run yet.",
    );
    expect(screen.getByTestId("job-total").textContent).toBe("$0.00");
    expect(screen.getByTestId("job-bars").querySelectorAll(".jobs-dot")).toHaveLength(14);
  });
});

describe("switching a job", () => {
  it("saves a flip, says Saving to the harness meanwhile, and shows what it is now", async () => {
    const store = reads(viewOf());
    page(store);
    await open("heartbeat:main");
    fireEvent.click(toggle());
    expect(sub()).toBe("Saving to OpenClaw");
    expect(toggle().disabled).toBe(true);
    await waitFor(() => expect(sub()).toBe("Off · OpenClaw won't run it"), SAVED);
    expect(store.asked).toEqual([{ on: false }]);
    expect(toggle().checked).toBe(false);
    expect(screen.queryByTestId("job-every")).toBeNull();
    expect(screen.getByTestId("job-hero").querySelector(".job-mark")?.getAttribute("data-on")).toBe(
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "‹ Agents" }));
    await screen.findByTestId("jobs-group");
    expect(words("heartbeat:main").value).toBe("Off");
  });

  it("saves an interval picked from Every", async () => {
    const store = reads(viewOf());
    page(store);
    await open("heartbeat:main");
    const every = screen.getByRole("combobox", { name: "Every" }) as HTMLSelectElement;
    expect([...every.options].map((option) => option.textContent)).toContain("2 hours");
    fireEvent.change(every, { target: { value: "120" } });
    expect(screen.getByTestId("job-every").textContent).toContain("Saving to OpenClaw");
    await waitFor(() => expect(store.asked).toEqual([{ on: true, every: 120 }]), SAVED);
    await waitFor(
      () =>
        expect((screen.getByRole("combobox", { name: "Every" }) as HTMLSelectElement).value).toBe(
          "120",
        ),
      SAVED,
    );
  });

  it("says why under the switch when the harness refuses, and keeps what holds", async () => {
    page(reads(viewOf(), checks, "Not while it dreams."));
    await open("heartbeat:main");
    fireEvent.click(toggle());
    await waitFor(() => expect(sub()).toBe("Not while it dreams."), SAVED);
    expect(toggle().checked).toBe(true);
  });

  it("is quiet while the harness is away, and says why", async () => {
    page(reads(viewOf(undefined, { away: true })));
    await open("heartbeat:main");
    expect(toggle().disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Every" }) as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("job-hint").textContent).toBe("OpenClaw is away");
  });
});

beforeEach(() => forget());
