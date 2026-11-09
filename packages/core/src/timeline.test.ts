/**
 * The run panel's rail, from real event shapes: a plan's steps stay rows; everything else that
 * is not a milestone folds into a stretch.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ClientEvent } from "./events.js";
import { buildModel, type Run, type Space } from "./model.js";
import { hasTimeline, runDoing, runTimeline, saidMidRun, spaceDoing } from "./timeline.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const at = (second: number): string => `2026-09-05T16:00:${String(second).padStart(2, "0")}.000Z`;

/** A step logged as a harness with no plan logs it: started, then done, with a title. */
function call(
  seq: number,
  id: string,
  title: string,
  second: number,
  status = "done",
): ClientEvent[] {
  return [
    fixture("step.log", seq, { step_id: id, status: "started", title, ts: at(second) }),
    ...(status === "started"
      ? []
      : [
          fixture("step.log", seq + 1, {
            step_id: id,
            status,
            title: undefined,
            ts: at(second + 1),
            ...(status === "failed" ? { error: "exit 1" } : {}),
          }),
        ]),
  ];
}

function runOf(events: ClientEvent[]): Run {
  const run = buildModel(events).spaces[0]?.run;
  if (run === undefined) throw new Error("no run");
  return run;
}

/** A run with no plan: what Jacobian sends. */
function unplanned(): ClientEvent[] {
  return [fixture("space.created", 1), fixture("run.started", 2, { plan: undefined, ts: at(0) })];
}

describe("the rail of a planned run", () => {
  it("is the plan's own steps, with the one waiting on an approval marked", () => {
    const run = runOf([
      fixture("space.created", 1),
      fixture("run.started", 2),
      fixture("step.log", 3),
      fixture("approval.request", 4),
    ]);
    expect(
      runTimeline(run).map((entry) => [entry.kind, entry.kind === "step" ? entry.status : ""]),
    ).toEqual([
      ["step", "done"],
      ["step", "planned"],
      ["step", "now"],
      ["step", "planned"],
    ]);
    // The approval belongs to a plan step, so it is that step's row and not one of its own.
    expect(runTimeline(run).some((entry) => entry.kind === "approval")).toBe(false);
    const waiting = runTimeline(run)[2];
    expect(waiting).toMatchObject({ kind: "step", note: "needs your approval" });
  });
});

describe("the rail of a run with no plan", () => {
  it("folds the ordinary calls into stretches between the moments that matter", () => {
    const run = runOf([
      ...unplanned(),
      ...call(10, "s1", "Bash · pnpm check", 1),
      ...call(12, "s2", "Bash · git status", 3),
      ...call(14, "s3", "Read · README.md", 5),
      fixture("context.usage", 16, { compacted: true, ts: at(7) }),
      ...call(17, "s4", "Bash · pnpm test", 8),
      ...call(19, "s5", "Edit · store.ts", 10, "failed"),
      fixture("approval.request", 21, {
        step_id: undefined,
        approval_id: "apr_01K4ZQPX000000000000000099",
        ts: at(12),
      }),
      fixture("approval.resolved", 22, {
        approval_id: "apr_01K4ZQPX000000000000000099",
        decision: "approved",
        resolved_by: "usr_1",
        ts: at(13),
      }),
      ...call(23, "s6", "Bash · pnpm check", 14),
      ...call(25, "s7", "Bash · pnpm e2e", 16, "started"),
    ]);
    const rail = runTimeline(run);
    expect(rail.map((entry) => entry.kind)).toEqual([
      "stretch",
      "checkpoint",
      "stretch",
      "step",
      "approval",
      "stretch",
      "step",
    ]);
    expect(rail[0]).toMatchObject({ count: 3, startedAt: at(1), endedAt: at(6), tool: "Bash" });
    expect(rail[1]).toMatchObject({ kind: "checkpoint", at: at(7) });
    expect(rail[2]).toMatchObject({ count: 1, tool: "Bash" });
    expect(rail[3]).toMatchObject({
      kind: "step",
      title: "Edit · store.ts",
      status: "failed",
      note: "exit 1",
    });
    expect(rail[4]).toMatchObject({
      kind: "approval",
      actionKind: "email.send",
      at: at(12),
      resolved: expect.objectContaining({ decision: "approved", by: "usr_1" }),
    });
    expect(rail[5]).toMatchObject({ count: 1 });
    expect(rail[6]).toMatchObject({
      kind: "step",
      title: "Bash · pnpm e2e",
      status: "now",
      since: at(16),
    });
  });

  it("names no tool for a stretch nobody's tool dominates, and says how a run ended badly", () => {
    const run = runOf([
      ...unplanned(),
      ...call(10, "s1", "Bash · a", 1),
      ...call(12, "s2", "Read · b", 3),
      ...call(14, "s3", "Edit · c", 5),
      fixture("run.failed", 16, { error: "The model is down.", ts: at(7) }),
    ]);
    const rail = runTimeline(run);
    expect(rail).toHaveLength(2);
    expect(rail[0]).toMatchObject({ kind: "stretch", count: 3 });
    expect(rail[0]).not.toHaveProperty("tool");
    expect(rail[1]).toMatchObject({ kind: "ended", error: "The model is down.", at: at(7) });
    // A run a person stopped needs no row: they know, and the pill says so.
    const stopped = runOf([
      ...unplanned(),
      ...call(10, "s1", "Bash · a", 1),
      fixture("run.cancel", 12, { ts: at(3) }),
    ]);
    expect(runTimeline(stopped).map((entry) => entry.kind)).toEqual(["stretch"]);
  });

  it("is a question and its answer when a harness asked, and is empty before anything happened", () => {
    expect(runTimeline(runOf(unplanned()))).toEqual([]);
    const run = runOf([
      ...unplanned(),
      fixture("question.ask", 10, { ts: at(2) }),
      fixture("question.answered", 11, { ts: at(3) }),
    ]);
    expect(runTimeline(run)).toEqual([
      expect.objectContaining({
        kind: "question",
        at: at(2),
        answered: expect.objectContaining({ timedOut: false }),
      }),
    ]);
  });
});

describe("what a run is doing", () => {
  it("is the call underway, the reasoning, and how many calls it has made", () => {
    const run = runOf([
      ...unplanned(),
      ...call(10, "s1", "memory_recall · Santa Barbara cafes", 1),
      fixture("run.status", 12, { verb_phrase: "Inferring the route", ts: at(3) }),
      ...call(13, "s2", "web_search · Tamar hours", 4, "started"),
    ]);
    expect(runDoing(run)).toMatchObject({
      harnessId: run.harnessId,
      verb: "Inferring the route",
      step: "web_search · Tamar hours",
      calls: 2,
      startedAt: at(0),
      thought: { phase: "reading", words: "Inferring the route", at: at(3) },
      made: [
        { stepId: "s1", status: "done" },
        { stepId: "s2", status: "started" },
      ],
    });
  });

  it("is nothing once the answer has landed, which is the whole point of it", () => {
    const run = runOf([
      ...unplanned(),
      ...call(10, "s1", "memory_recall · the trip", 1),
      fixture("run.completed", 12, { ts: at(3) }),
    ]);
    expect(runDoing(run)).toBeUndefined();
  });

  it("is nothing while a person is being waited on, or while the run is paused", () => {
    const waiting = runOf([...unplanned(), fixture("approval.request", 10, { ts: at(2) })]);
    expect(waiting.state).toBe("waiting");
    expect(runDoing(waiting)).toBeUndefined();
    const paused = runOf([...unplanned(), fixture("run.pause", 10, { ts: at(2) })]);
    expect(runDoing(paused)).toBeUndefined();
  });

  it("is a run that has started and called nothing yet, and nothing at all without a run", () => {
    expect(runDoing(runOf(unplanned()))).toEqual({
      harnessId: expect.any(String),
      runId: expect.any(String),
      verb: undefined,
      step: undefined,
      calls: 0,
      startedAt: at(0),
      thought: undefined,
      made: [],
    });
    expect(runDoing(undefined)).toBeUndefined();
  });
});

describe("what the harnesses in a room are doing", () => {
  /** The fixture's harness, and a second one working in the same room. */
  const SCOUT = "hrn_01K4ZQPX000000000000000004";
  const TREE = "hrn_01K4ZQPX00000000000000000T";

  /** A run of `harness`'s begun at `second`, with no plan, as Jacobian's and OpenClaw's are. */
  function begun(seq: number, runId: string, harness: string, second: number): ClientEvent {
    return fixture("run.started", seq, {
      run_id: runId,
      actor: { kind: "harness", id: harness },
      plan: undefined,
      ts: at(second),
    });
  }

  function said(seq: number, runId: string, harness: string, verb: string): ClientEvent {
    return fixture("run.status", seq, {
      run_id: runId,
      actor: { kind: "harness", id: harness },
      verb_phrase: verb,
    });
  }

  function answered(seq: number, runId: string, harness: string, second: number): ClientEvent {
    return fixture("run.completed", seq, {
      run_id: runId,
      actor: { kind: "harness", id: harness },
      ts: at(second),
    });
  }

  function doingIn(events: ClientEvent[]) {
    const space = buildModel([fixture("space.created", 1), ...events]).spaces[0];
    if (space === undefined) throw new Error("no space");
    return spaceDoing(space);
  }

  it("is one for each harness at work, the first to work in the room first", () => {
    const doing = doingIn([begun(2, "run_s", SCOUT, 0), begun(3, "run_t", TREE, 2)]);
    expect(doing.map((each) => each.harnessId)).toEqual([SCOUT, TREE]);
  });

  it("counts a run waiting on an ask nobody can see yet, and only for the harness named", () => {
    const built = buildModel([
      fixture("space.created", 1),
      begun(2, "run_s", SCOUT, 0),
      begun(3, "run_t", TREE, 1),
    ]).spaces[0] as Space;
    const space = {
      ...built,
      runs: built.runs.map((run) => ({ ...run, state: "waiting" as const })),
    };
    expect(spaceDoing(space)).toEqual([]);
    expect(spaceDoing(space, new Set([SCOUT])).map((each) => each.harnessId)).toEqual([SCOUT]);
  });

  it("keeps the one still working when the other answers (the OpenClaw test, finding 22)", () => {
    // Jacobian began, OpenClaw began 1.7 s later and answered four seconds after that, and the
    // bubble went with it while Jacobian worked on.
    const doing = doingIn([
      begun(2, "run_s", SCOUT, 0),
      said(3, "run_s", SCOUT, "Reading the thread"),
      begun(4, "run_t", TREE, 2),
      answered(5, "run_t", TREE, 6),
    ]);
    expect(doing).toMatchObject([{ harnessId: SCOUT, verb: "Reading the thread", calls: 0 }]);
    expect(doing).toHaveLength(1);
  });

  it("is what a harness's newest run is doing, and nothing once that one has answered", () => {
    const both = [
      begun(2, "run_1", SCOUT, 0),
      said(3, "run_1", SCOUT, "Reading the thread"),
      begun(4, "run_2", SCOUT, 2),
      said(5, "run_2", SCOUT, "Looking up the hours"),
    ];
    expect(doingIn(both)).toMatchObject([
      { harnessId: SCOUT, verb: "Looking up the hours", calls: 0 },
    ]);
    expect(doingIn(both)).toHaveLength(1);
    // An older run the harness never ended pins nothing: some say `running` for ever.
    expect(doingIn([...both, answered(6, "run_2", SCOUT, 4)])).toEqual([]);
  });

  it("keeps a harness's place when it starts another turn while it works", () => {
    const doing = doingIn([
      begun(2, "run_s1", SCOUT, 0),
      begun(3, "run_t", TREE, 1),
      begun(4, "run_s2", SCOUT, 2),
    ]);
    expect(doing.map((each) => each.harnessId)).toEqual([SCOUT, TREE]);
  });

  it("leaves out a harness a person paused, or one waiting on somebody", () => {
    const doing = doingIn([
      begun(2, "run_s", SCOUT, 0),
      begun(3, "run_t", TREE, 1),
      fixture("run.pause", 4, { run_id: "run_s", ts: at(2) }),
    ]);
    expect(doing.map((each) => each.harnessId)).toEqual([TREE]);
    const asking = doingIn([
      begun(2, "run_s", SCOUT, 0),
      begun(3, "run_t", TREE, 1),
      fixture("approval.request", 4, { run_id: "run_t", ts: at(2) }),
    ]);
    expect(asking.map((each) => each.harnessId)).toEqual([SCOUT]);
  });
});

describe("what a harness said in a run still at work (ADR 0147, point 12)", () => {
  const begun = fixture("run.started", 2, { plan: undefined, ts: at(0) });
  const reply = fixture("message.post", 3, { ts: at(9) });
  const lines = (events: ClientEvent[]) =>
    saidMidRun(buildModel([fixture("space.created", 1), ...events]).spaces[0] as Space);

  it("is the reply before its run closes, which a room holds back", () => {
    expect(lines([begun, reply])).toEqual([reply["id"]]);
  });

  it("is nothing once the run has closed on it, or for a line from no run", () => {
    expect(lines([begun, reply, fixture("run.completed", 4, { ts: at(10) })])).toEqual([]);
    expect(lines([begun, fixture("message.post", 3, { run_id: undefined })])).toEqual([]);
  });

  it("is nothing while the run is paused or waiting on somebody", () => {
    expect(lines([begun, reply, fixture("run.pause", 4)])).toEqual([]);
  });
});

describe("whether the rail is worth a section (ADR 0046)", () => {
  it("is not, for a run that is nothing but calls — Jacobian's — even while a call is underway", () => {
    const calls = [
      ...unplanned(),
      ...call(10, "s1", "memory_recall", 1),
      ...call(12, "s2", "web_search", 3),
      ...call(14, "s3", "web_search", 5, "started"),
    ];
    expect(hasTimeline(runOf(calls))).toBe(false);
    expect(hasTimeline(runOf([...calls, fixture("run.completed", 16, { ts: at(8) })]))).toBe(false);
  });

  it("is, for a plan, a checkpoint, an ask, a failed call or a failure", () => {
    expect(hasTimeline(runOf([fixture("space.created", 1), fixture("run.started", 2)]))).toBe(true);
    expect(
      hasTimeline(runOf([...unplanned(), fixture("context.usage", 10, { compacted: true })])),
    ).toBe(true);
    expect(
      hasTimeline(
        runOf([
          ...unplanned(),
          fixture("approval.request", 10, {
            step_id: undefined,
            approval_id: "apr_01K4ZQPX000000000000000099",
          }),
        ]),
      ),
    ).toBe(true);
    expect(hasTimeline(runOf([...unplanned(), ...call(10, "s1", "Edit", 1, "failed")]))).toBe(true);
    expect(hasTimeline(runOf([...unplanned(), fixture("run.failed", 10)]))).toBe(true);
  });
});
