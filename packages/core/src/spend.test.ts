import { describe, expect, it } from "vitest";
import type { Space } from "./model/types.js";
import { ceilingOfChoice, spendChoiceOf, spentWords, typedCeiling } from "./spend.js";

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
