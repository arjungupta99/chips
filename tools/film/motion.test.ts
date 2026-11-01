/**
 * The film's motion maths (ADR 0217), on made-up grey frames: a list of bubbles on the room's
 * ground, moved and changed as a room's list is when a line arrives.
 */

import { describe, expect, it } from "vitest";
import {
  arrivalAt,
  changedRuns,
  changesOf,
  fitShift,
  GROUND,
  headerDiff,
  loneJumps,
  meanDiffs,
  SPAN,
  spring,
} from "./motion.mjs";

interface Gray {
  readonly w: number;
  readonly h: number;
  readonly g: Float32Array;
}

const W = 120;
const H = 400;
const BAND = { top: 40, bottom: 360 };

/**
 * A frame: the ground, bubbles (textured rows) between `from` and `to`, and over them a header of
 * its own above the band, as a room's list scrolls under its header.
 */
function frame(
  bubbles: readonly (readonly [number, number])[],
  { header = 0, offset = 0 } = {},
): Gray {
  const g = new Float32Array(W * H).fill(GROUND);
  for (const [from, to] of bubbles) {
    for (let y = Math.max(from, 0); y < to; y += 1) {
      for (let x = 20; x < 100; x += 1) {
        const ty = y - from + offset;
        g[y * W + x] = 40 + ((x * 7 + ty * 13) % 180);
      }
    }
  }
  for (let y = 0; y < 30; y += 1) for (let x = 0; x < W; x += 1) g[y * W + x] = 60 + header;
  return { w: W, h: H, g };
}

/** The same bubbles, `by` rows higher, as after a line arrives under them. */
const up = (bubbles: readonly (readonly [number, number])[], by: number) =>
  bubbles.map(([from, to]) => [from - by, to - by] as const);

describe("an arrival's spring", () => {
  it("starts near still and lands exactly on its last frame", () => {
    expect(spring(1)).toBeLessThan(0.05);
    expect(spring(SPAN)).toBe(1);
    expect(spring(SPAN + 5)).toBe(1);
  });

  it("only ever moves forward", () => {
    for (let f = 1; f < SPAN; f += 1) expect(spring(f + 1)).toBeGreaterThanOrEqual(spring(f));
  });

  it("lets a bubble dip to the ground before the new one comes up", () => {
    expect(arrivalAt(4).out).toBe(1);
    expect(arrivalAt(2).in).toBe(0);
    expect(arrivalAt(12).in).toBe(1);
  });
});

describe("where a shot's state changed at once", () => {
  it("finds a change with nothing moving either side", () => {
    const diffs = [0, 0, 0, 9, 0, 0, 0];
    expect(changesOf(diffs, 8)).toEqual([4]);
  });

  it("leaves alone a change the app moved itself, over many frames", () => {
    const diffs = [0, 2, 5, 9, 7, 4, 2, 1, 0];
    expect(changesOf(diffs, 10)).toEqual([]);
  });

  it("finds a change landing over two frames at its first, as a page popped back lands", () => {
    const diffs = [0, 0, 0, 8.2, 12.7, 0, 0, 0];
    expect(changesOf(diffs, 9)).toEqual([4]);
  });

  it("finds a change landing as a sheet comes to rest", () => {
    const diffs = [0, 1.6, 5.3, 11.9, 6.3, 3.5, 2.8, 10, 0, 4, 5.2, 3.6, 1.3, 0];
    expect(changesOf(diffs, 15)).toEqual([8]);
  });

  it("finds a jump on a screen that never sits still", () => {
    const diffs = [0.8, 0.9, 8.5, 0.7, 0.8];
    expect(changesOf(diffs, 6)).toEqual([3]);
  });

  it("reads ffmpeg's measure whole, so a face's glow a few pixels wide is no change", () => {
    const printed = [
      "frame:0    pts:0       pts_time:0",
      "lavfi.signalstats.YAVG=0",
      "frame:1    pts:1       pts_time:0.04",
      "lavfi.signalstats.YAVG=11.7334",
      "frame:2    pts:2       pts_time:0.08",
      "lavfi.signalstats.YAVG=1.89147e-05",
      "frame:3    pts:3       pts_time:0.12",
      "lavfi.signalstats.YAVG=0",
    ].join("\n");
    const diffs = meanDiffs(printed);
    expect(diffs).toEqual([0, 11.7334, 1.891_47e-5, 0]);
    expect(changesOf([0, 0, ...diffs.slice(2), 0, 0], 7)).toEqual([]);
  });
});

describe("how far the list moved", () => {
  const before = [
    [60, 120],
    [140, 220],
    [240, 300],
  ] as const;

  it("finds a list moved up as a line arrives under it", () => {
    const after = frame([...up(before, 40), [260, 300]]);
    expect(fitShift(frame(before), after, BAND, 100).shift).toBe(40);
  });

  it("finds a list moved down as a line goes", () => {
    const after = frame(up(before, -30));
    expect(fitShift(frame(before), after, BAND, 100).shift).toBe(-30);
  });

  it("finds nothing moved for a change in place", () => {
    // The last bubble says less: shorter, where it stood.
    const after = frame([...before.slice(0, 2), [240, 270]]);
    expect(fitShift(frame(before), after, BAND, 100).shift).toBe(0);
  });

  it("tells a new screen by its header", () => {
    expect(headerDiff(frame(before), frame(up(before, 40)), { top: 0, bottom: 30 })).toBe(0);
    expect(headerDiff(frame(before), frame(before, { header: 50 }), { top: 0, bottom: 30 })).toBe(
      50,
    );
  });
});

describe("the rows that changed", () => {
  const before = [
    [60, 120],
    [140, 220],
    [240, 300],
  ] as const;

  it("is only the new line, under what moved up", () => {
    const after = frame([...up(before, 40), [280, 330]]);
    const found = changedRuns(frame(before), after, BAND, 40, 1);
    expect(found.shift).toBe(40);
    // The moved bubbles end at 260; the new one is 280 to 330, and nothing above it changed.
    for (const [y0] of found.runs) expect(y0).toBeGreaterThanOrEqual(260);
    expect(found.runs.some(([y0, y1]) => y0 <= 280 && y1 >= 330)).toBe(true);
  });

  it("sets a rough shift to the pixel it is", () => {
    const after = frame([...up(before, 40), [280, 330]]);
    expect(changedRuns(frame(before), after, BAND, 37, 1).shift).toBe(40);
  });

  it("takes a moved line drawn a pixel off as unchanged", () => {
    // Each bubble drawn a row lower than an exact move would put it.
    const after = frame(up(before, 39));
    const found = changedRuns(frame(before), after, BAND, 40, 1);
    const inside = found.runs.filter(([y0, y1]) => y1 > BAND.top + 2 && y0 < 240);
    expect(inside).toEqual([]);
  });
});

describe("a film's jumps", () => {
  it("are frames that change far more than both sides", () => {
    expect(loneJumps([0.1, 0.2, 9, 0.2, 0.1])).toEqual([2]);
  });

  it("are not a ramp, nor a change too small to see", () => {
    expect(loneJumps([1, 3, 6, 9, 6, 3, 1])).toEqual([]);
    expect(loneJumps([0, 0, 1.5, 0, 0])).toEqual([]);
  });
});
