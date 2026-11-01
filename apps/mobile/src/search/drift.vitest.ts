import {
  BACKDROP_FADE,
  BACKDROP_GLOW,
  BACKDROP_DEPTHS as DEPTHS,
  BACKDROP_PLACES as PLACES,
  type BackdropPlace as Place,
  BACKDROP_SWAY as SWAY,
} from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { breathe, type Curve, climb, fade, sway } from "./drift";

const { from: FADE_FROM, to: FADE_TO } = BACKDROP_FADE;

/** The curve's value at `at`, as the native driver works it out: straight between points. */
function read({ inputRange, outputRange }: Curve, at: number): number {
  for (let i = 1; i < inputRange.length; i++) {
    const from = inputRange[i - 1] as number;
    const to = inputRange[i] as number;
    if (at <= to) {
      const a = outputRange[i - 1] as number;
      const b = outputRange[i] as number;
      return to === from ? b : a + ((b - a) * (at - from)) / (to - from);
    }
  }
  return outputRange.at(-1) as number;
}

const rising = (curve: Curve) =>
  curve.inputRange.every((t, i) => i === 0 || t >= (curve.inputRange[i - 1] as number));

const HEIGHT = 520;
const SIDE = 52;
const near = PLACES[0] as Place;

describe("a face's climb", () => {
  it("starts where its place says and is back there when the round ends", () => {
    for (const place of PLACES) {
      const curve = climb(place, HEIGHT, SIDE);
      expect(rising(curve)).toBe(true);
      const start = HEIGHT - place.start * (HEIGHT + SIDE);
      expect(read(curve, 0)).toBeCloseTo(start);
      expect(read(curve, 1)).toBeCloseTo(start);
    }
  });

  it("goes from under the foot to over the top as many times as its depth climbs", () => {
    const curve = climb(near, HEIGHT, SIDE);
    expect(curve.outputRange.filter((y) => y === -SIDE)).toHaveLength(DEPTHS.near.climbs);
    expect(Math.max(...curve.outputRange)).toBe(HEIGHT);
  });

  it("climbs at one speed: a whole climb takes a round over the climbs", () => {
    const curve = climb(near, HEIGHT, SIDE);
    // Well inside the first climb, which reaches the top a little after 0.1.
    const step = 0.01;
    const speed = (read(curve, 0.02) - read(curve, 0.02 + step)) / step;
    expect(speed).toBeCloseTo((HEIGHT + SIDE) * DEPTHS.near.climbs, 0);
  });
});

describe("a face's fade", () => {
  it("is whole low down and gone at the backdrop's top, where the recents end", () => {
    for (const place of PLACES) {
      const shown = fade(place, HEIGHT, SIDE);
      expect(rising(shown)).toBe(true);
      const position = climb(place, HEIGHT, SIDE);
      const sampled = Array.from({ length: 73 }, (_, i) => i / 72).map((t) => ({
        middle: read(position, t) + SIDE / 2,
        clear: read(shown, t),
      }));
      for (const { clear } of sampled.filter(({ middle }) => middle >= FADE_TO)) {
        expect(clear).toBeCloseTo(1);
      }
      for (const { clear } of sampled.filter(({ middle }) => middle <= 0)) {
        expect(clear).toBeCloseTo(0);
      }
    }
  });

  it("thins out along a straight line between the fade's two edges, not in a step", () => {
    const shown = fade(near, HEIGHT, SIDE);
    // Every point is a face whole or gone: the straight line between two of them is the fade.
    expect(shown.outputRange.every((o) => o === 0 || o === 1)).toBe(true);
    const climbing = climb(near, HEIGHT, SIDE);
    const halfway = shown.inputRange.findIndex((_, i) => i > 0 && shown.outputRange[i] === 0);
    const t =
      ((shown.inputRange[halfway - 1] as number) + (shown.inputRange[halfway] as number)) / 2;
    expect(read(shown, t)).toBeCloseTo(0.5, 1);
    expect(read(climbing, t) + SIDE / 2).toBeCloseTo((FADE_FROM + FADE_TO) / 2, 0);
  });
});

describe("a face's sway", () => {
  it("goes as far each way as it is told and ends a round where it began", () => {
    for (const place of PLACES) {
      const curve = sway(place, SWAY);
      expect(Math.max(...curve.outputRange)).toBeLessThanOrEqual(SWAY);
      expect(Math.min(...curve.outputRange)).toBeGreaterThanOrEqual(-SWAY);
      expect(read(curve, 1)).toBeCloseTo(read(curve, 0));
    }
  });
});

describe("a glow's breath (ADR 0138)", () => {
  const { breaths, small, full } = BACKDROP_GLOW;
  const breath = 1 / breaths;

  it("swells to its full size and settles to its small one, and ends a round where it began", () => {
    for (const place of PLACES) {
      const curve = breathe(place, small, full);
      expect(rising(curve)).toBe(true);
      // Sampled eight times a breath, it comes within 4% of its swing of each end.
      const slack = (full - small) * 0.04;
      expect(Math.abs(Math.min(...curve.outputRange) - small)).toBeLessThan(slack);
      expect(Math.abs(Math.max(...curve.outputRange) - full)).toBeLessThan(slack);
      expect(read(curve, 1)).toBeCloseTo(read(curve, 0), 3);
    }
  });

  it("goes round once a breath, from where its place starts it", () => {
    const place = { ...near, start: 0 };
    const curve = breathe(place, 0, 1);
    expect(read(curve, 0)).toBeCloseTo(0, 3);
    expect(read(curve, breath / 2)).toBeCloseTo(1, 3);
    expect(read(curve, breath)).toBeCloseTo(0, 3);
  });

  it("starts each place at its own point, so the glows don't swell together", () => {
    const starts = new Set(PLACES.map((place) => read(breathe(place, 0, 1), 0).toFixed(2)));
    expect(starts.size).toBeGreaterThan(PLACES.length / 2);
  });
});
