/**
 * The board the connection's mark stands on in its sheet (ADR 0251): a trace out of every pin to a
 * pad, a spark down each trace as its pin lights, and the pads flashing as the sparks arrive.
 *
 * The traces start where the pins end, worked out from the outline itself (`outline.ts`), so a
 * redrawn mark takes its board with it. From each pin a trace runs out, bends once or twice at
 * forty-five degrees the way a printed circuit's do, and ends in a pad. Which way each bends was
 * drawn by hand, in the mock Arjun chose: the bite takes the top right corner, so the traces fan
 * away from it on the top and the right, and the foot and the left mirror each other.
 *
 * The sparks run on the pins' own clock (`ROUND` in `ChipPulse.tsx`): a spark leaves its pin as the
 * pin lights. The native driver takes points, not functions, so each spark's way along its trace is
 * written out here as an interpolation of that clock: where it is at each bend, how bright it is,
 * and when its pad flashes. The last pins light late in the round and their sparks land in the
 * next one, so a track may run over the end of the clock and finish at its start (`loopTrack`).
 *
 * Pure, so it is tested under Node.
 */

import { BODY_WITH_PINS, PINS, pinsOf } from "./outline";

/** The board's box, and the box of the mark at its middle. */
export const BOARD = { width: 360, height: 264, mark: 108 } as const;

/** A pad's radius, and its hole's. */
export const PAD = { r: 4.6, hole: 1.7 } as const;

type PinKey = (typeof PINS.at)[number][0];
type Edge = (typeof PINS.at)[number][1];
type Point = readonly [x: number, y: number];

/** A step of a trace: how far it goes away from the body, and how far along the body's side. */
type Move = readonly [out: number, along: number];

/**
 * Each trace's way from its pin to its pad. Along a side is rightwards on the top and the foot,
 * and downwards on the left and the right, the way `pinsOf` counts its quarters.
 */
const ROUTES: Readonly<Record<PinKey, readonly Move[]>> = {
  "top-left": [
    [16, 0],
    [22, -22],
    [0, -58],
    [18, -18],
  ],
  "top-middle": [
    [26, 0],
    [18, 18],
    [0, 36],
    [16, 16],
  ],
  "right-middle": [
    [26, 0],
    [20, -20],
    [56, 0],
  ],
  "right-lower": [
    [16, 0],
    [18, 18],
    [70, 0],
  ],
  "foot-right": [
    [14, 0],
    [20, 20],
    [0, 52],
    [18, 18],
  ],
  "foot-middle": [[60, 0]],
  "foot-left": [
    [14, 0],
    [20, -20],
    [0, -52],
    [18, -18],
  ],
  "left-lower": [
    [16, 0],
    [18, 18],
    [70, 0],
  ],
  "left-middle": [[110, 0]],
  "left-upper": [
    [26, 0],
    [20, -20],
    [56, 0],
  ],
};

const OUT: Readonly<Record<Edge, Point>> = {
  top: [0, -1],
  right: [1, 0],
  foot: [0, 1],
  left: [-1, 0],
};
const ALONG: Readonly<Record<Edge, Point>> = {
  top: [1, 0],
  right: [0, 1],
  foot: [1, 0],
  left: [0, 1],
};

/** One trace: its corners from the pin's end to the pad's centre, its length, and its path. */
export interface Trace {
  readonly key: PinKey;
  readonly points: readonly Point[];
  readonly length: number;
  readonly d: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The ten traces, in the order the light goes round the pins: clockwise from the top. */
export function tracesOf(): readonly Trace[] {
  const side = BOARD.mark * BODY_WITH_PINS;
  const left = BOARD.width / 2 - side / 2;
  const top = BOARD.height / 2 - side / 2;
  const pins = pinsOf(side);
  return PINS.at.map(([key, edge], index): Trace => {
    const pin = pins[index] as (typeof pins)[number];
    // The pin's outer end, at the middle of its rounded tip.
    const start: Point =
      edge === "top"
        ? [left + pin.x + pin.w / 2, top + pin.y]
        : edge === "foot"
          ? [left + pin.x + pin.w / 2, top + pin.y + pin.h]
          : edge === "right"
            ? [left + pin.x + pin.w, top + pin.y + pin.h / 2]
            : [left + pin.x, top + pin.y + pin.h / 2];
    const points: Point[] = [start];
    let length = 0;
    for (const [out, along] of ROUTES[key]) {
      const [x, y] = points.at(-1) as Point;
      points.push([
        x + OUT[edge][0] * out + ALONG[edge][0] * along,
        y + OUT[edge][1] * out + ALONG[edge][1] * along,
      ]);
      length += Math.hypot(out, along);
    }
    const d = `M${points.map(([x, y]) => `${round2(x)} ${round2(y)}`).join("L")}`;
    return { key, points, length, d };
  });
}

/** An interpolation of a clock from nought to one, as the native driver takes it. */
export interface Track {
  readonly inputRange: number[];
  readonly outputRange: number[];
}

/** A value at a moment of the round, in milliseconds from its start. */
export type Key = readonly [ms: number, value: number];

/** The keys' value at `ms`, straight between them and held beyond them. */
function valueAt(keys: readonly Key[], ms: number): number {
  const first = keys[0] as Key;
  if (ms <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const [b, vb] = keys[i] as Key;
    if (ms <= b) {
      const [a, va] = keys[i - 1] as Key;
      return b === a ? vb : va + ((vb - va) * (ms - a)) / (b - a);
    }
  }
  return (keys.at(-1) as Key)[1];
}

/**
 * Keys over one round of a clock `roundMs` long, as an interpolation of it: held at the first value
 * before them and the last after them. Keys that run past the end of the round finish at its start,
 * since the round comes again; held values then meet in the gap between, which is where a spark is
 * dark, so whatever a track does there cannot be seen. The keys must take less than a round.
 */
export function loopTrack(roundMs: number, keys: readonly Key[]): Track {
  const laps = Math.floor((keys[0] as Key)[0] / roundMs);
  const shifted = keys.map(([ms, value]): Key => [ms - laps * roundMs, value]);
  const last = (shifted.at(-1) as Key)[0];
  const points: Key[] = [];
  if (last <= roundMs) {
    points.push([0, (shifted[0] as Key)[1]], ...shifted, [roundMs, (shifted.at(-1) as Key)[1]]);
  } else {
    const atEnd = valueAt(shifted, roundMs);
    const over = shifted.filter(([ms]) => ms > roundMs).map(([ms, v]): Key => [ms - roundMs, v]);
    const within = shifted.filter(([ms]) => ms <= roundMs);
    points.push([0, atEnd], ...over, ...within, [roundMs, atEnd]);
  }
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [ms, value] of points) {
    const where = ms / roundMs;
    // Two points in one place are one point, the later one: the native driver wants every point
    // after the one before it.
    if (inputRange.length > 0 && where <= (inputRange.at(-1) as number)) {
      outputRange[outputRange.length - 1] = value;
      continue;
    }
    inputRange.push(where);
    outputRange.push(value);
  }
  return { inputRange, outputRange };
}

/** How the sparks keep time with the pins, in milliseconds. */
export interface Timing {
  /** One round of the pins' clock. */
  readonly roundMs: number;
  /** How long after one pin the next one lights. */
  readonly stepMs: number;
  /** How long a spark takes from its pin to its pad. */
  readonly travelMs: number;
}

/** How long a spark takes to come up at its pin, and to go out at its pad. */
const SPARK_IN_MS = 50;
const SPARK_OUT_MS = 70;

/**
 * Where the spark from the pin at `index` is over a round, and how bright: it leaves as the pin
 * lights, runs at an even speed to the pad, and goes out there. `lagMs` puts it that far behind,
 * for the fainter sparks that trail it.
 */
export function sparkOf(
  trace: Trace,
  index: number,
  timing: Timing,
  lagMs = 0,
): { readonly x: Track; readonly y: Track; readonly opacity: Track } {
  const leaves = index * timing.stepMs + lagMs;
  let gone = 0;
  const xs: Key[] = [];
  const ys: Key[] = [];
  trace.points.forEach(([x, y], at) => {
    if (at > 0) {
      const [px, py] = trace.points[at - 1] as Point;
      gone += Math.hypot(x - px, y - py);
    }
    const ms = leaves + (timing.travelMs * gone) / trace.length;
    xs.push([ms, x]);
    ys.push([ms, y]);
  });
  const lands = leaves + timing.travelMs;
  const opacity: Key[] = [
    [leaves, 0],
    [leaves + SPARK_IN_MS, 1],
    [lands, 1],
    [lands + SPARK_OUT_MS, 0],
  ];
  return {
    x: loopTrack(timing.roundMs, xs),
    y: loopTrack(timing.roundMs, ys),
    opacity: loopTrack(timing.roundMs, opacity),
  };
}

/** The pad at the end of the trace from the pin at `index`: lit as its spark lands, then let go. */
export function padOf(index: number, timing: Timing): Track {
  const lands = index * timing.stepMs + timing.travelMs;
  return loopTrack(timing.roundMs, [
    [lands - 20, 0],
    [lands + 40, 1],
    [lands + 420, 0],
  ]);
}

/**
 * The board's dotted ground, the holes a bare circuit board is drilled with: a dot every `pitch`,
 * fading out from the middle, in three bands of brightness so it is three paths, not hundreds of
 * circles. Each band is one path of tiny circles.
 */
export function groundOf(
  pitch = 13,
  r = 0.9,
): readonly { readonly d: string; readonly opacity: number }[] {
  const bands = [
    { reach: 0.45, opacity: 1, d: [] as string[] },
    { reach: 0.75, opacity: 0.55, d: [] as string[] },
    { reach: 1, opacity: 0.22, d: [] as string[] },
  ];
  const cx = BOARD.width / 2;
  const cy = BOARD.height / 2;
  for (let y = pitch / 2; y < BOARD.height; y += pitch) {
    for (let x = pitch / 2; x < BOARD.width; x += pitch) {
      const far = Math.hypot((x - cx) / cx, (y - cy) / cy);
      const band = bands.find((b) => far <= b.reach);
      band?.d.push(
        `M${round2(x - r)} ${round2(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
      );
    }
  }
  return bands.map(({ d, opacity }) => ({ d: d.join(""), opacity }));
}
