import { describe, expect, it } from "vitest";
import { BODY_WITH_PINS, PINS } from "./outline";
import {
  BOARD,
  groundOf,
  type Key,
  loopTrack,
  PAD,
  padOf,
  sparkOf,
  type Timing,
  type Track,
  tracesOf,
} from "./traces";

/** The pins' round in `ChipPulse.tsx`: ten pins 150 ms apart, each up in 130 and down in 260. */
const TIMING: Timing = { roundMs: 10 * 150, stepMs: 150, travelMs: 520 };

/** A track's value at `at` of the clock, as the native driver works it out: straight between points. */
function read(track: Track, at: number): number {
  const { inputRange, outputRange } = track;
  if (at <= (inputRange[0] as number)) return outputRange[0] as number;
  for (let i = 1; i < inputRange.length; i++) {
    const to = inputRange[i] as number;
    if (at <= to) {
      const from = inputRange[i - 1] as number;
      const a = outputRange[i - 1] as number;
      const b = outputRange[i] as number;
      return a + ((b - a) * (at - from)) / (to - from);
    }
  }
  return outputRange.at(-1) as number;
}

/** The clock's reading `ms` into a round, for a moment that may be in the next one. */
const clock = (ms: number) => (ms % TIMING.roundMs) / TIMING.roundMs;

type Segment = readonly [readonly [number, number], readonly [number, number]];

function crosses([a, b]: Segment, [c, d]: Segment): boolean {
  const turn = (p: readonly number[], q: readonly number[], r: readonly number[]) =>
    Math.sign(
      ((q[0] as number) - (p[0] as number)) * ((r[1] as number) - (p[1] as number)) -
        ((q[1] as number) - (p[1] as number)) * ((r[0] as number) - (p[0] as number)),
    );
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

describe("the board's traces", () => {
  const traces = tracesOf();
  const side = BOARD.mark * BODY_WITH_PINS;
  const body = {
    left: BOARD.width / 2 - side / 2,
    top: BOARD.height / 2 - side / 2,
    right: BOARD.width / 2 + side / 2,
    foot: BOARD.height / 2 + side / 2,
  };

  it("runs one out of every pin, in the order the light goes round them", () => {
    expect(traces.map((t) => t.key)).toEqual(PINS.at.map(([key]) => key));
  });

  /** Where a pin on `edge`, `at` that far along it, ends: a pin's length out from the body. */
  function pinEnd(edge: (typeof PINS.at)[number][1], at: number): readonly [number, number] {
    const over = PINS.over * side;
    const across = body.left + at * side;
    const down = body.top + at * side;
    const ends = {
      top: [across, body.top - over],
      foot: [across, body.foot + over],
      right: [body.right + over, down],
      left: [body.left - over, down],
    } as const;
    return ends[edge];
  }

  it("starts each one where its pin ends, a pin's length out from the body", () => {
    for (const [index, [, edge, at]] of PINS.at.entries()) {
      const [x, y] = (traces[index] as (typeof traces)[number]).points[0] as readonly [
        number,
        number,
      ];
      const [ex, ey] = pinEnd(edge, at);
      expect(x).toBeCloseTo(ex, 6);
      expect(y).toBeCloseTo(ey, 6);
    }
  });

  it("keeps every pad on the board, clear of its edges", () => {
    for (const trace of traces) {
      const [x, y] = trace.points.at(-1) as readonly [number, number];
      expect(x - PAD.r).toBeGreaterThan(4);
      expect(y - PAD.r).toBeGreaterThan(4);
      expect(x + PAD.r).toBeLessThan(BOARD.width - 4);
      expect(y + PAD.r).toBeLessThan(BOARD.height - 4);
    }
  });

  it("never crosses another trace", () => {
    const segments = traces.map((t) =>
      t.points.slice(1).map((p, i): Segment => [t.points[i] as Segment[0], p]),
    );
    const meets = (a: readonly Segment[], b: readonly Segment[]) =>
      a.some((s) => b.some((t) => crosses(s, t)));
    for (let a = 0; a < segments.length; a++) {
      for (let b = a + 1; b < segments.length; b++) {
        expect(meets(segments[a] as Segment[], segments[b] as Segment[])).toBe(false);
      }
    }
  });

  it("never runs back over the body", () => {
    const inside = ([x, y]: readonly [number, number]) =>
      x > body.left && x < body.right && y > body.top && y < body.foot;
    for (const trace of traces) expect(trace.points.some(inside)).toBe(false);
  });

  it("knows each one's length, which a spark's even speed is worked out from", () => {
    for (const trace of traces) {
      const walked = trace.points.slice(1).reduce((sum, [x, y], i) => {
        const [px, py] = trace.points[i] as readonly [number, number];
        return sum + Math.hypot(x - px, y - py);
      }, 0);
      expect(trace.length).toBeCloseTo(walked, 6);
    }
  });
});

describe("a track over the round", () => {
  it("reads the keys at their moments, and holds the first and last beyond them", () => {
    const keys: Key[] = [
      [300, 0],
      [400, 10],
      [600, 4],
    ];
    const track = loopTrack(1000, keys);
    expect(read(track, 0)).toBe(0);
    expect(read(track, 0.3)).toBe(0);
    expect(read(track, 0.4)).toBeCloseTo(10, 6);
    expect(read(track, 0.5)).toBeCloseTo(7, 6);
    expect(read(track, 0.9)).toBeCloseTo(4, 6);
  });

  it("finishes at the start of the round keys that run past its end", () => {
    const keys: Key[] = [
      [800, 0],
      [1000, 1],
      [1200, 1],
      [1300, 0],
    ];
    const track = loopTrack(1000, keys);
    expect(read(track, 0.8)).toBeCloseTo(0, 6);
    expect(read(track, 0.9)).toBeCloseTo(0.5, 6);
    expect(read(track, 0)).toBeCloseTo(1, 6);
    expect(read(track, 0.1)).toBeCloseTo(1, 6);
    expect(read(track, 0.25)).toBeCloseTo(0.5, 6);
    expect(read(track, 0.5)).toBeCloseTo(0, 6);
  });

  it("puts keys that start in the next round where they fall in it", () => {
    const track = loopTrack(1000, [
      [1100, 0],
      [1200, 1],
      [1300, 0],
    ]);
    expect(read(track, 0.2)).toBeCloseTo(1, 6);
    expect(read(track, 0.6)).toBeCloseTo(0, 6);
  });

  it("gives the native driver every point after the one before it, from nought to one", () => {
    const tracks = tracesOf().flatMap((trace, index) => {
      const spark = sparkOf(trace, index, TIMING);
      return [spark.x, spark.y, spark.opacity, padOf(index, TIMING)];
    });
    for (const { inputRange, outputRange } of tracks) {
      expect(inputRange[0]).toBe(0);
      expect(inputRange.at(-1)).toBe(1);
      expect(outputRange).toHaveLength(inputRange.length);
      for (let i = 1; i < inputRange.length; i++) {
        expect(inputRange[i] as number).toBeGreaterThan(inputRange[i - 1] as number);
      }
    }
  });
});

describe("a spark", () => {
  const traces = tracesOf();

  it("leaves its pin as the pin lights, and lands on the pad when its run is over", () => {
    for (const [index, trace] of traces.entries()) {
      const spark = sparkOf(trace, index, TIMING);
      const leaves = index * TIMING.stepMs;
      const [sx, sy] = trace.points[0] as readonly [number, number];
      const [ex, ey] = trace.points.at(-1) as readonly [number, number];
      // Just after it leaves, and just before it lands: a spark at a key's very moment may be read
      // from the far side of a wrap, which is the same place.
      expect(read(spark.x, clock(leaves + 1))).toBeCloseTo(sx, 0);
      expect(read(spark.y, clock(leaves + 1))).toBeCloseTo(sy, 0);
      expect(read(spark.x, clock(leaves + TIMING.travelMs - 1))).toBeCloseTo(ex, 0);
      expect(read(spark.y, clock(leaves + TIMING.travelMs - 1))).toBeCloseTo(ey, 0);
    }
  });

  it("is lit while it runs and dark once it has landed, the last pins' too", () => {
    for (const [index, trace] of traces.entries()) {
      const spark = sparkOf(trace, index, TIMING);
      const leaves = index * TIMING.stepMs;
      expect(read(spark.opacity, clock(leaves + TIMING.travelMs / 2))).toBe(1);
      expect(read(spark.opacity, clock(leaves + TIMING.travelMs + 200))).toBe(0);
      expect(read(spark.opacity, clock(leaves - 40 + TIMING.roundMs))).toBe(0);
    }
  });

  it("goes along its trace at one speed, so halfway in time is halfway along", () => {
    const trace = traces[8] as (typeof traces)[number];
    const spark = sparkOf(trace, 8, TIMING);
    const [sx] = trace.points[0] as readonly [number, number];
    const halfway = clock(8 * TIMING.stepMs + TIMING.travelMs / 2);
    expect(read(spark.x, halfway)).toBeCloseTo(sx - trace.length / 2, 3);
  });

  it("trails a fainter spark behind it by the lag it is given", () => {
    const trace = traces[2] as (typeof traces)[number];
    const lead = sparkOf(trace, 2, TIMING);
    const tail = sparkOf(trace, 2, TIMING, 40);
    const at = 2 * TIMING.stepMs + 200;
    expect(read(tail.x, clock(at + 40))).toBeCloseTo(read(lead.x, clock(at)), 6);
  });
});

describe("a pad", () => {
  it("lights as its spark lands and is dark again before its pin's next turn", () => {
    for (let index = 0; index < PINS.at.length; index++) {
      const pad = padOf(index, TIMING);
      const lands = index * TIMING.stepMs + TIMING.travelMs;
      expect(read(pad, clock(lands + 40))).toBeCloseTo(1, 6);
      expect(read(pad, clock(lands + 500))).toBe(0);
      expect(read(pad, clock(index * TIMING.stepMs))).toBe(0);
    }
  });
});

describe("the board's ground", () => {
  it("is three bands of dots, brightest in the middle", () => {
    const bands = groundOf();
    expect(bands).toHaveLength(3);
    for (const band of bands) expect(band.d.length).toBeGreaterThan(0);
    expect(bands.map((b) => b.opacity)).toEqual(
      [...bands.map((b) => b.opacity)].sort((a, b) => b - a),
    );
  });
});
