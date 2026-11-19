import { describe, expect, it } from "vitest";
import { chipsRulesOn } from "./written-rules.js";

const none = {
  harnessRules: false,
  harnessLevel: false,
  harnessHold: false,
  workspaceRules: false,
  workspaceHold: false,
};

describe("a harness's Chips's rules switch (ADR 0300)", () => {
  it("reads as set, and never set, on only where something of Chips's would stop working", () => {
    expect(chipsRulesOn(true, none)).toBe(true);
    expect(chipsRulesOn(false, { ...none, harnessRules: true })).toBe(false);
    expect(chipsRulesOn(undefined, none)).toBe(false);
    expect(chipsRulesOn(null, { ...none, harnessRules: true })).toBe(true);
    expect(chipsRulesOn(undefined, { ...none, harnessHold: true })).toBe(true);
    expect(chipsRulesOn(undefined, { ...none, harnessLevel: true })).toBe(true);
    expect(chipsRulesOn(undefined, { ...none, workspaceRules: true })).toBe(true);
    expect(chipsRulesOn(undefined, { ...none, workspaceHold: true })).toBe(true);
  });
});
