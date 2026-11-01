/**
 * The sentences the fleet and a profile say. Pure, so they can be checked exactly — these are
 * the words somebody reads before deciding how far to trust a machine, and "3 spaces" reading
 * "3 space" is the kind of thing that makes a product feel unfinished.
 */

import type { FleetHarness, HarnessPolicyModel } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { HARNESS_STATUSES } from "../ui/vocabulary";
import {
  asksValue,
  budgetWords,
  contextValue,
  rollup,
  ruleWords,
  runsWeekWords,
  saysStatus,
  statusOf,
} from "./words";

function entry(over: Partial<FleetHarness> = {}): FleetHarness {
  return {
    harnessId: "har_scout",
    liveSessions: 0,
    sessionCount: 0,
    spaceCount: 0,
    needsYou: 0,
    paused: false,
    ...over,
  };
}

describe("a harness's state", () => {
  it("is idle when it has never run, which is a state and not an absence", () => {
    expect(statusOf(undefined)).toBe("idle");
    expect(statusOf(entry())).toBe("idle");
  });

  it("maps each run state onto the vocabulary", () => {
    const said: ReadonlyArray<[FleetHarness["status"], string]> = [
      ["queued", "thinking"],
      ["running", "working"],
      ["waiting", "waiting"],
      ["done", "done"],
      ["failed", "failed"],
      ["cancelled", "idle"],
    ];
    for (const [status, expected] of said) expect(statusOf(entry({ status }))).toBe(expected);
  });

  it("says waiting for a paused run, because a pause is a person's hand on the brake", () => {
    expect(statusOf(entry({ status: "running", paused: true }))).toBe("waiting");
  });

  it("is drawn only when there is news: never for idle, and never for done", () => {
    expect(HARNESS_STATUSES.filter((status) => !saysStatus(status))).toEqual(["idle", "done"]);
  });

  it("says nothing about a harness that has finished, whose reply is the proof", () => {
    expect(saysStatus(statusOf(entry({ status: "done" })))).toBe(false);
    expect(saysStatus(statusOf(entry({ status: "cancelled" })))).toBe(false);
    expect(saysStatus(statusOf(entry({ status: "running" })))).toBe(true);
    expect(saysStatus(statusOf(entry({ status: "failed" })))).toBe(true);
  });
});

describe("the roll-up", () => {
  it("says a harness has no spaces rather than showing three zeroes", () => {
    expect(rollup(entry())).toBe("No spaces yet");
    expect(rollup(undefined)).toBe("No spaces yet");
  });

  it("counts sessions and spaces, singular and plural", () => {
    expect(rollup(entry({ spaceCount: 1, liveSessions: 1 }))).toBe("1 live session · 1 space");
    expect(rollup(entry({ spaceCount: 3, liveSessions: 2 }))).toBe("2 live sessions · 3 spaces");
  });

  it("says when nothing is open, and adds what is waiting only when something is", () => {
    expect(rollup(entry({ spaceCount: 2 }))).toBe("No live sessions · 2 spaces");
    expect(rollup(entry({ spaceCount: 2, needsYou: 4 }))).toBe(
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

describe("a policy rule in words", () => {
  it("reads like a sentence", () => {
    expect(ruleWords({ match: "email.send", decision: "ask", approvers: ["owner"] })).toBe(
      "email.send → ask owner",
    );
  });

  it("names a role as one", () => {
    expect(
      ruleWords({ match: "payment.*", decision: "ask", approvers: ["role:finance", "owner"] }),
    ).toBe("payment.* → ask the finance or owner");
  });

  it("carries the conditions the rule was written with", () => {
    expect(
      ruleWords({
        match: "email.send",
        when: { external: true, money_usd_over: 100, irreversible: true, risk: ["financial"] },
        decision: "ask",
      }),
    ).toBe("email.send to somewhere outside that cannot be undone over $100 (financial) → ask");
  });

  it("says a plain allow or deny without inventing an approver", () => {
    expect(ruleWords({ match: "file.read", decision: "allow" })).toBe("file.read → allow");
  });

  it("shows a rule from a newer server rather than dropping it from the list", () => {
    // A person judging a harness by its rules should see all of them, including the one this
    // build does not understand.
    expect(ruleWords({ somethingNew: true })).toBe("Anything");
    expect(ruleWords({ match: "email.send" })).toBe("email.send");
  });
});

describe("the rows of a harness's page (ADR 0254)", () => {
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
  });
});
