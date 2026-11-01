import { describe, expect, it } from "vitest";
import { actionMatters, HOT_RISK } from "./matters.js";

describe("whether an action matters (ADR 0195)", () => {
  it("matters when it leaves the workspace, spends, or cannot be undone", () => {
    expect(actionMatters({ external: true })).toBe(true);
    expect(actionMatters({ irreversible: true })).toBe(true);
    expect(actionMatters({ money_usd: 0.01 })).toBe(true);
  });

  it("matters when it carries a hot risk class, and not for the others", () => {
    for (const risk of HOT_RISK) expect(actionMatters({ risk: [risk] })).toBe(true);
    expect(actionMatters({ risk: ["privacy", "legal", "irreversible"] })).toBe(false);
  });

  it("does not matter when it says nothing, or says it is small", () => {
    expect(actionMatters({})).toBe(false);
    expect(actionMatters({ external: false, irreversible: false, money_usd: 0, risk: [] })).toBe(
      false,
    );
  });
});
