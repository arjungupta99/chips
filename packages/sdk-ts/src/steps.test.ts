/**
 * A bridge's steps, as `chips connect` reads them (ADR 0218): a line each, only when asked for.
 */

import { describe, expect, it } from "vitest";
import { reportStep, STEP_MARK } from "./steps.js";

describe("a bridge's step", () => {
  it("is a line of JSON after the mark, when `chips connect` asked for them", () => {
    const lines: string[] = [];
    const write = (line: string) => void lines.push(line);
    reportStep("joining", {}, { CHIPS_STEPS: "json" }, write);
    reportStep("keeping", { label: "chat.chips.hermes" }, { CHIPS_STEPS: "json" }, write);
    expect(lines).toEqual([
      `${STEP_MARK}{"step":"joining"}\n`,
      `${STEP_MARK}{"step":"keeping","label":"chat.chips.hermes"}\n`,
    ]);
  });

  it("is nothing when nobody asked, and never stops the bridge when nobody reads it", () => {
    const lines: string[] = [];
    reportStep("joining", {}, {}, (line) => void lines.push(line));
    expect(lines).toEqual([]);
    expect(() =>
      reportStep("joining", {}, { CHIPS_STEPS: "json" }, () => {
        throw new Error("EPIPE");
      }),
    ).not.toThrow();
  });
});
