import { HINT_ROUND_MS, SEARCH_HINT } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import type { Curve } from "./drift";
import { roll } from "./roll";

const LINE = 30;
const { words, holdMs, rollMs } = SEARCH_HINT;

/** The curve's value at `ms` into the round, as the native driver works it out. */
function at({ inputRange, outputRange }: Curve, ms: number): number {
  const t = ms / HINT_ROUND_MS;
  for (let i = 1; i < inputRange.length; i++) {
    const from = inputRange[i - 1] as number;
    const to = inputRange[i] as number;
    if (t <= to) {
      const a = outputRange[i - 1] as number;
      const b = outputRange[i] as number;
      return to === from ? b : a + ((t - from) / (to - from)) * (b - a);
    }
  }
  return outputRange.at(-1) as number;
}

/** A spring like the hint's: past the end a little four fifths of the way, and back. */
const overshoot = (t: number) => t + 0.5 * Math.sin(Math.PI * t) * t;

describe("roll", () => {
  const curve = roll(LINE, overshoot);

  it("runs over the whole round, never going back", () => {
    expect(curve.inputRange[0]).toBe(0);
    expect(curve.inputRange.at(-1)).toBeCloseTo(1, 9);
    expect(curve.inputRange.length).toBe(curve.outputRange.length);
    for (let i = 1; i < curve.inputRange.length; i++) {
      expect(curve.inputRange[i]).toBeGreaterThan(curve.inputRange[i - 1] as number);
    }
  });

  it("holds each word, then rolls a line up to the next", () => {
    words.forEach((_, word) => {
      const start = word * (holdMs + rollMs);
      expect(at(curve, start + 1)).toBeCloseTo(-LINE * word, 6);
      expect(at(curve, start + holdMs)).toBeCloseTo(-LINE * word, 6);
      expect(at(curve, start + holdMs + rollMs)).toBeCloseTo(-LINE * (word + 1), 6);
    });
  });

  it("ends on the first word again, at the column's foot", () => {
    expect(at(curve, HINT_ROUND_MS)).toBe(-LINE * words.length);
    expect(curve.outputRange[0]).toBe(0);
  });

  it("goes a little past each word on the way, as the spring does", () => {
    const mid = holdMs + rollMs * 0.8;
    expect(at(curve, mid)).toBeLessThan(-LINE);
  });

  it("draws a plain roll with no spring as a straight line", () => {
    const plain = roll(LINE, (t) => t);
    expect(at(plain, holdMs + rollMs / 2)).toBeCloseTo(-LINE / 2, 6);
  });
});
