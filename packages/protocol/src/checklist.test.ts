import { describe, expect, it } from "vitest";
import { CONNECTION_CHECKLIST } from "./checklist.js";
import { eventDefinition } from "./events/catalogue.js";

describe("the connection checklist", () => {
  it("names only events a harness sends, so every row can be earned", () => {
    for (const row of CONNECTION_CHECKLIST) {
      expect(row.types.length).toBeGreaterThan(0);
      for (const type of row.types) {
        expect(eventDefinition(type)?.direction, type).toBe("harness_to_chips");
      }
    }
  });

  it("starts with the three events that make a harness work at all", () => {
    const labels = CONNECTION_CHECKLIST.map((row) => row.label);
    expect(labels).toContain("Messages");
    expect(labels).toContain("Runs");
    expect(labels).toContain("Finished");
    expect(new Set(labels).size).toBe(labels.length);
  });
});
