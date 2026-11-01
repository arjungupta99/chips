import { describe, expect, it } from "vitest";
import { listed } from "./picking";

// The rows held as they go, and the words for what can't be picked, are core's, and tested there
// (`packages/core/src/picking.test.ts`).
describe("names in a sentence", () => {
  it("lists names as a sentence does", () => {
    expect(listed([])).toBe("");
    expect(listed(["A"])).toBe("A");
    expect(listed(["A", "B", "C"])).toBe("A, B and C");
  });
});
