import { describe, expect, it } from "vitest";
import { movedGoal } from "./liftGoal";

describe("movedGoal", () => {
  it("keeps a lift to the foot going to the foot, whatever lands while it goes", () => {
    // The reply's own line and a thinking bubble land; the strip closing takes the foot down.
    expect(movedGoal(0, 129.33)).toBe(0);
    expect(movedGoal(0, 70)).toBe(0);
    expect(movedGoal(0, -54)).toBe(0);
  });

  it("moves a lift to a line's start with the line", () => {
    expect(movedGoal(2400, 129.33)).toBeCloseTo(2529.33);
    expect(movedGoal(2400, -54)).toBe(2346);
  });
});
