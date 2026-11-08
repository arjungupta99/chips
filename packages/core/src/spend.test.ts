import type { RoomSpend } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import type { Line, Run, Space } from "./model/types.js";
import {
  allJobsWords,
  carryOnWords,
  ceilingOfChoice,
  jobStartWords,
  lastJobWords,
  raisedChoice,
  saveAndCarryOnWords,
  spendChoiceOf,
  spentJobRows,
  spentWords,
  typedCeiling,
} from "./spend.js";

const room = (spendCeiling?: number) => ({ spendCeiling }) as unknown as Space;

describe("what a room allows a job, as a person picks it (ADR 0117)", () => {
  it("is the default until set, a preset, or Other", () => {
    expect(spendChoiceOf(room())).toBe("default");
    expect(spendChoiceOf(room(10))).toBe(10);
    expect(spendChoiceOf(room(7.5))).toBe("other");
  });

  it("sets the default as null, the $3 preset included, and Other's amount when a room may have it", () => {
    expect(ceilingOfChoice("default", "")).toBeNull();
    expect(ceilingOfChoice(3, "")).toBeNull();
    expect(ceilingOfChoice(25, "")).toBe(25);
    expect(ceilingOfChoice("other", "$7.50")).toBe(7.5);
    expect(ceilingOfChoice("other", "7.3")).toBeUndefined();
  });

  it("reads Other's amount in dollars, to the cent, in range", () => {
    expect(typedCeiling("10")).toBe(10);
    expect(typedCeiling(" $ 0.25 ")).toBe(0.25);
    for (const typed of ["", "0", "0.1", "100.25", "abc", "1.255", "-1"]) {
      expect(typedCeiling(typed), typed).toBeUndefined();
    }
  });

  it("says what the job has spent so far, and how many runs said no cost", () => {
    const spend = { ceiling_usd: 3, spent_usd: 1.234, since_seq: 9, uncounted_runs: 0 };
    expect(spentWords(spend)).toBe("This job so far: $1.23");
    expect(spentWords({ ...spend, uncounted_runs: 2 })).toBe(
      "This job so far: $1.23 · 2 runs not counted",
    );
    expect(spentWords(undefined)).toBeUndefined();
  });
});

describe("what a room has spent job by job, and raising its ceiling from the hold (ADR 0282)", () => {
  // 6 November 2026, local noon, so Today is the day these happened.
  const NOW = new Date(2026, 10, 6, 12, 0).getTime();
  const at = (hours: number, minutes: number) =>
    new Date(2026, 10, 6, hours, minutes).toISOString();
  const DIRECTORY: Directory = {
    usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun" },
    usr_dana: { id: "usr_dana", kind: "person", displayName: "Dana" },
    agt_jiro: { id: "agt_jiro", kind: "agent", displayName: "Jiro" },
    agt_rui: { id: "agt_rui", kind: "agent", displayName: "Rui" },
  } as unknown as Directory;
  const step = (status: string, kind = "tool") => ({ kind, status });
  const space = {
    spendCeiling: undefined,
    runs: [
      {
        runId: "run_1",
        steps: [step("done"), step("failed"), step("done", "tick"), step("planned")],
      } as unknown as Run,
    ],
    lines: [
      { id: "ln_ask", runId: undefined },
      { id: "ln_reply", runId: "run_1" },
      { id: "ln_carry", runId: undefined },
    ] as unknown as Line[],
  } as unknown as Space;
  const spend: RoomSpend = {
    ceiling_usd: 3,
    spent_usd: 0,
    since_seq: 28_453,
    uncounted_runs: 0,
    started: { at: at(7, 15), by: "usr_arjun", act: "carry_on" },
    total_usd: 3.096_719,
    jobs: [
      {
        since_seq: 28_262,
        started_at: at(1, 50),
        last_at: at(6, 58),
        spent_usd: 3.096_719,
        uncounted_runs: 0,
        run_ids: ["run_1"],
        by: ["agt_jiro"],
        held: true,
      },
    ],
  };

  it("lists the jobs before this one with who spent, when, the steps, and the line to go to", () => {
    const [row] = spentJobRows(spend, space, DIRECTORY, NOW);
    expect(row).toMatchObject({
      title: "Jiro",
      when: `Today, ${clock(1, 50)} to ${clock(6, 58)} · 2 steps`,
      amount: "$3.10",
      held: true,
      lineId: "ln_reply",
    });
    expect(row?.label).toContain("held at the limit");
    const many = {
      ...spend.jobs?.[0],
      by: ["agt_jiro", "agt_rui", "usr_x", "usr_y"],
      held: false,
      uncounted_runs: 2,
    };
    const [crowd] = spentJobRows({ ...spend, jobs: [many as never] }, space, DIRECTORY, NOW);
    expect(crowd?.title).toBe("Jiro, Rui and 2 more");
    expect(crowd?.when).toContain("2 runs not counted");
    expect(spentJobRows({ ...spend, jobs: undefined }, space, DIRECTORY, NOW)).toEqual([]);
    const quick = {
      ...spend.jobs?.[0],
      started_at: at(6, 58),
      last_at: new Date(2026, 10, 6, 6, 58, 40).toISOString(),
    };
    const [minute] = spentJobRows({ ...spend, jobs: [quick as never] }, space, DIRECTORY, NOW);
    expect(minute?.when).toBe(`Today, ${clock(6, 58)} · 2 steps`);
  });

  it("says the last job on the tile, the total under the list, and what began this one", () => {
    expect(lastJobWords(spend)).toBe("Last job $3.10");
    expect(lastJobWords({ ...spend, jobs: [] })).toBeUndefined();
    expect(allJobsWords(spend)).toBe("$3.10");
    expect(allJobsWords({ ...spend, jobs: [] })).toBeUndefined();
    expect(jobStartWords(spend, DIRECTORY, "usr_arjun", NOW)).toBe(
      `Since you let them carry on at ${clock(7, 15)}`,
    );
    const dana = { ...spend, started: { at: at(7, 15), by: "usr_dana", act: "message" as const } };
    expect(jobStartWords(dana, DIRECTORY, "usr_arjun", NOW)).toBe(
      `Since Dana's message at ${clock(7, 15)}`,
    );
    const yours = { ...dana, started: { ...dana.started, by: "usr_arjun" } };
    expect(jobStartWords(yours, DIRECTORY, "usr_arjun", NOW)).toBe(
      `Since your message at ${clock(7, 15)}`,
    );
    const yesterday = new Date(2026, 10, 5, 21, 2).toISOString();
    const answer = { ...spend, started: { at: yesterday, by: "usr_dana", act: "answer" as const } };
    expect(jobStartWords(answer, DIRECTORY, "usr_arjun", NOW)).toBe(
      `Since Dana answered yesterday at ${clock(21, 2)}`,
    );
    expect(jobStartWords({ ...spend, started: undefined }, DIRECTORY, "usr_arjun")).toBeUndefined();
  });

  it("opens Raise the limit on the next amount up, and words Save for carrying on", () => {
    expect(raisedChoice(room())).toBe(5);
    expect(raisedChoice(room(1))).toBe("default");
    expect(raisedChoice(room(10))).toBe(25);
    expect(raisedChoice(room(40))).toBe("other");
    expect(carryOnWords(room())).toBe("Carry on at $3.00");
    expect(carryOnWords(room(10))).toBe("Carry on at $10.00");
    expect(saveAndCarryOnWords(room(), 5)).toBe("Save $5.00 and carry on");
    expect(saveAndCarryOnWords(room(), null)).toBe("Carry on at $3.00");
    expect(saveAndCarryOnWords(room(10), null)).toBe("Save $3.00 and carry on");
    expect(saveAndCarryOnWords(room(), undefined)).toBe("Save and carry on");
  });
});

/** The time as the reader's zone says it, as the words do. */
function clock(hours: number, minutes: number): string {
  return new Date(2026, 10, 6, hours, minutes).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
