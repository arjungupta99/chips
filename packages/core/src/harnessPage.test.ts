/**
 * What a harness's page says (ADR 0254, ADR 0266): the same sentences on the phone and the desktop,
 * checked exactly, since "3 spaces" reading "3 space" makes a page feel unfinished.
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import {
  asksValue,
  budgetWords,
  contextValue,
  harnessRollup,
  harnessRuns,
  mayDoValue,
  ownerValue,
  runsWeekWords,
  sendsValue,
} from "./harnessPage.js";
import type { FleetHarness, HarnessPolicyModel, Run } from "./model/types.js";

function entry(over: Partial<FleetHarness> = {}): FleetHarness {
  return {
    harnessId: "hrn_scout",
    liveSessions: 0,
    sessionCount: 0,
    spaceCount: 0,
    needsYou: 0,
    paused: false,
    ...over,
  };
}

describe("where a harness works, under its head", () => {
  it("says it has no spaces rather than showing three zeroes", () => {
    expect(harnessRollup(entry())).toBe("No spaces yet");
    expect(harnessRollup(undefined)).toBe("No spaces yet");
  });

  it("counts sessions and spaces, singular and plural", () => {
    expect(harnessRollup(entry({ spaceCount: 1, liveSessions: 1 }))).toBe(
      "1 live session · 1 space",
    );
    expect(harnessRollup(entry({ spaceCount: 3, liveSessions: 2 }))).toBe(
      "2 live sessions · 3 spaces",
    );
  });

  it("says when nothing is open, and adds what is waiting only when something is", () => {
    expect(harnessRollup(entry({ spaceCount: 2 }))).toBe("No live sessions · 2 spaces");
    expect(harnessRollup(entry({ spaceCount: 2, needsYou: 4 }))).toBe(
      "No live sessions · 2 spaces · 4 waiting on you",
    );
  });
});

describe("the budget line", () => {
  it("is nothing at all when no budget was set", () => {
    expect(budgetWords(undefined)).toBeUndefined();
    expect(budgetWords({ spentUsd: 3 } as HarnessPolicyModel)).toBeUndefined();
  });

  it("says what has gone of what there was", () => {
    expect(budgetWords({ spentUsd: 4.1, budgetUsd: 20 } as HarnessPolicyModel)).toBe(
      "$4.10 of $20.00",
    );
  });
});

describe("its runs", () => {
  const run = (runId: string, harnessId: string, startedAt?: string) =>
    ({ runId, harnessId, startedAt }) as unknown as Run;
  const directory: Directory = {
    hrn_scout: { id: "hrn_scout", kind: "harness", displayName: "Scout" },
    agt_kit: { id: "agt_kit", kind: "agent", displayName: "Kit", harnessId: "hrn_scout" },
    hrn_other: { id: "hrn_other", kind: "harness", displayName: "Other" },
  };

  it("are its agents' too, newest first, across every space", () => {
    const spaces = [
      { runs: [run("a", "agt_kit", "2026-10-30T10:00:00Z"), run("b", "hrn_other")] },
      { runs: [run("c", "hrn_scout", "2026-10-31T10:00:00Z")] },
    ];
    expect(harnessRuns(spaces, directory, "hrn_scout").map((each) => each.runId)).toEqual([
      "c",
      "a",
    ]);
    expect(harnessRuns(spaces, directory, "hrn_scout", 1)).toHaveLength(1);
  });
});

describe("the rows of a harness's page", () => {
  const NOW = Date.parse("2026-10-31T20:00:00.000Z");
  const daysAgo = (days: number) => ({
    startedAt: new Date(NOW - days * 86_400_000).toISOString(),
  });

  it("count the runs begun in the last seven days", () => {
    expect(runsWeekWords([daysAgo(0), daysAgo(3), daysAgo(6.9), daysAgo(8)], NOW)).toBe(
      "3 this week",
    );
    expect(runsWeekWords([daysAgo(9), {}], NOW)).toBe("None this week");
  });

  it("say how many context files are shared, or given to a new agent, once the set has come", () => {
    const row = { name: "x" };
    const groups = (shared: unknown[], forNew: unknown[]) =>
      ({ shared, forNew, sharedFoot: "", newFoot: "" }) as unknown as Parameters<
        typeof contextValue
      >[0];
    expect(contextValue(undefined)).toBeUndefined();
    expect(contextValue(groups([row, row], [row]))).toBe("2 shared");
    expect(contextValue(groups([], [row]))).toBe("1 for new agents");
    expect(contextValue(groups([], []))).toBe("None shared");
  });

  it("say how much is allowed always, or who decides when nothing is", () => {
    expect(asksValue([{ on: true }, { on: true }], { kind: "you" })).toBe("2 allowed always");
    expect(asksValue([{ on: true }, { on: false }], { kind: "you" })).toBe("1 of 2 allowed always");
    expect(asksValue([], { kind: "you" })).toBe("You decide");
    expect(asksValue([], { kind: "owner", name: "Dana" })).toBe("Dana decides");
    expect(asksValue([], { kind: "unknown" })).toBe("A person decides");
  });
});

describe("the desk's Connection rows (ADR 0273)", () => {
  const NOW = Date.parse("2026-11-03T20:00:00.000Z");
  const directory = {
    usr_dana: { id: "usr_dana", kind: "person", displayName: "Dana" },
  } as unknown as Directory;

  it("say who owns it: you, by name, or nothing", () => {
    expect(ownerValue(directory, "usr_dana", "usr_dana")).toBe("You");
    expect(ownerValue(directory, "usr_dana", "usr_arjun")).toBe("Dana");
    expect(ownerValue(directory, undefined, "usr_arjun")).toBeUndefined();
  });

  it("count the checklist's lit rows, once each, and say when it was last heard", () => {
    const heard = (ago: number) => new Date(NOW - ago).toISOString();
    expect(sendsValue(undefined, NOW)).toBe("0 of 9");
    // A run that failed lights Finished, as one that completed does: one row, not two.
    const seen = ["message.post", "run.started", "run.completed", "run.failed"];
    expect(sendsValue({ harnessId: "h", seen, lastSeenAt: heard(20_000) }, NOW)).toBe(
      "3 of 9 · heard now",
    );
    expect(sendsValue({ harnessId: "h", seen, lastSeenAt: heard(4 * 60_000) }, NOW)).toBe(
      "3 of 9 · heard 4 min ago",
    );
    expect(sendsValue({ harnessId: "h", seen, lastSeenAt: "not a time" }, NOW)).toBe("3 of 9");
  });

  it("count what it may do of what Chips draws, leaving out what it declared that is no switch", () => {
    expect(mayDoValue(undefined)).toBe("0 of 12");
    expect(mayDoValue(["autonomy", "restarts", "tools"])).toBe("2 of 12");
  });
});
