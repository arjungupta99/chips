import { describe, expect, it } from "vitest";
import { roundMs, type Turns, turnOf } from "./turns";

// React Native's quad easings, written out: nothing under Vitest may import React Native.
const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const out = (t: number) => 1 - (1 - t) * (1 - t);
const into = (t: number) => t * t;

/** The dots on a lane's row, as `Dots.tsx` has them. */
const BREATHS: Turns = {
  count: 3,
  stepMs: 160,
  riseMs: 320,
  fallMs: 320,
  low: 0.3,
  high: 1,
  rise: inOut,
  fall: inOut,
};

/** What the old chain of timings would have shown at `ms` into a round, for the light at `index`. */
function timed(turns: Turns, index: number, ms: number): number {
  const start = index * turns.stepMs;
  const span = turns.high - turns.low;
  if (ms <= start) return turns.low;
  if (ms <= start + turns.riseMs) return turns.low + span * turns.rise((ms - start) / turns.riseMs);
  const down = ms - start - turns.riseMs;
  if (down <= turns.fallMs) return turns.high - span * turns.fall(down / turns.fallMs);
  return turns.low;
}

/** The interpolation's value at `at`, as the native driver works it out: straight between points. */
function read(range: ReturnType<typeof turnOf>, at: number): number {
  const { inputRange, outputRange } = range;
  for (let i = 1; i < inputRange.length; i++) {
    const from = inputRange[i - 1] as number;
    const to = inputRange[i] as number;
    if (at <= to) {
      const a = outputRange[i - 1] as number;
      const b = outputRange[i] as number;
      return a + ((b - a) * (at - from)) / (to - from);
    }
  }
  return outputRange.at(-1) as number;
}

describe("lights that take turns on one clock", () => {
  it("makes a round of the last light's start and its whole breath", () => {
    expect(roundMs(BREATHS)).toBe(960);
  });

  it("gives the native driver a range that only ever goes forward, from nought to one", () => {
    for (let index = 0; index < BREATHS.count; index++) {
      const { inputRange, outputRange } = turnOf(BREATHS, index);
      expect(inputRange[0]).toBe(0);
      expect(inputRange.at(-1)).toBe(1);
      expect(outputRange).toHaveLength(inputRange.length);
      for (let i = 1; i < inputRange.length; i++) {
        expect(inputRange[i]).toBeGreaterThan(inputRange[i - 1] as number);
      }
    }
  });

  it("draws each light as the chain of timings drew it, to within a percent", () => {
    const round = roundMs(BREATHS);
    for (let index = 0; index < BREATHS.count; index++) {
      const range = turnOf(BREATHS, index);
      for (let ms = 0; ms <= round; ms += 4) {
        expect(Math.abs(read(range, ms / round) - timed(BREATHS, index, ms))).toBeLessThan(0.01);
      }
    }
  });

  it("starts and ends every light at rest, so one round runs into the next without a jump", () => {
    for (let index = 0; index < BREATHS.count; index++) {
      const { outputRange } = turnOf(BREATHS, index);
      expect(outputRange[0]).toBe(0.3);
      expect(outputRange.at(-1)).toBe(0.3);
    }
  });

  it("carries the working mark's quick light and slow letting go", () => {
    const pins: Turns = {
      count: 10,
      stepMs: 150,
      riseMs: 130,
      fallMs: 260,
      low: 0,
      high: 1,
      rise: out,
      fall: into,
    };
    const round = roundMs(pins);
    expect(round).toBe(1740);
    for (let index = 0; index < pins.count; index++) {
      const range = turnOf(pins, index);
      expect(read(range, (index * 150 + 130) / round)).toBeCloseTo(1, 5);
      for (let ms = 0; ms <= round; ms += 5) {
        expect(Math.abs(read(range, ms / round) - timed(pins, index, ms))).toBeLessThan(0.01);
      }
    }
  });
});
