import { describe, expect, it } from "vitest";
import { AUTONOMY_LEVELS, autonomyInfo, autonomyLabel, isAutonomyLevel } from "./autonomy.js";
import { contextLabel, contextPercent, contextTone } from "./context.js";
import { HARNESS_STATUSES, ringTone, STATUS, statusLabel } from "./status.js";
import { TIER, TIERS } from "./tiers.js";

describe("the status vocabulary", () => {
  it("has seven states, each with a word and a colour", () => {
    expect(HARNESS_STATUSES).toHaveLength(7);
    for (const status of HARNESS_STATUSES) {
      expect(STATUS[status].label.length).toBeGreaterThan(0);
      expect(["neutral", "blue", "amber", "red", "green"]).toContain(STATUS[status].tone);
    }
  });

  it("carries the verb phrase only while working", () => {
    expect(statusLabel("working", "Drafting the reply…")).toBe("Working · Drafting the reply…");
    expect(statusLabel("working")).toBe("Working");
    expect(statusLabel("waiting", "Drafting the reply…")).toBe("Waiting on you");
  });

  it("gives an idle harness no ring, and every other state its colour", () => {
    expect(ringTone("idle")).toBeUndefined();
    expect(ringTone(undefined)).toBeUndefined();
    expect(ringTone("working")).toBe("blue");
    expect(ringTone("waiting")).toBe("amber");
    expect(ringTone("blocked")).toBe("red");
    expect(ringTone("done")).toBe("green");
  });

  it("never uses gold for a status", () => {
    for (const status of HARNESS_STATUSES) expect(STATUS[status].tone).not.toBe("gold");
  });
});

describe("the autonomy levels", () => {
  it("run from L0 to L3, in order", () => {
    expect(AUTONOMY_LEVELS.map((info) => info.level)).toEqual([0, 1, 2, 3]);
  });

  it("reads as the run panel shows it", () => {
    expect(autonomyLabel(2)).toBe("L2 · Ask when it matters");
    expect(autonomyLabel(0)).toBe("L0 · Observe");
    expect(autonomyInfo(3).name).toBe("Autonomous, report back");
  });

  it("recognises only the four levels", () => {
    expect([0, 1, 2, 3].every(isAutonomyLevel)).toBe(true);
    expect(isAutonomyLevel(4)).toBe(false);
    expect(isAutonomyLevel("2")).toBe(false);
  });
});

describe("the tiers of attention", () => {
  it("are three, from decide now to FYI", () => {
    expect(TIERS).toEqual(["decide", "review", "fyi"]);
    expect(TIER.decide.label).toBe("Decide now");
    expect(TIER.review.tone).toBe("blue");
    expect(TIER.fyi.tone).toBe("neutral");
  });
});

describe("the context ring", () => {
  it("is neutral to 70, amber to 90, red past that", () => {
    expect(contextTone(0)).toBe("neutral");
    expect(contextTone(69)).toBe("neutral");
    expect(contextTone(70)).toBe("warn");
    expect(contextTone(89)).toBe("warn");
    expect(contextTone(90)).toBe("hot");
    expect(contextTone(100)).toBe("hot");
  });

  it("turns tokens into a whole, clamped percentage", () => {
    expect(contextPercent(82_000, 200_000)).toBe(41);
    expect(contextPercent(250_000, 200_000)).toBe(100);
    expect(contextPercent(0, 200_000)).toBe(0);
    expect(contextPercent(10, 0)).toBe(0);
  });

  it("says what a screen reader hears", () => {
    expect(contextLabel(41)).toBe("Context 41% full");
  });
});
