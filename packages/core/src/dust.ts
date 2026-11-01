/**
 * A message deleted, breaking into dust (ADR 0167): what the phone and the desktop both draw.
 *
 * A wipe crosses the bubble from its left edge in `WIPE_MS`, and as it passes each speck of the
 * bubble lets go and drifts up and to the right on a breeze, fading and shrinking as it goes. Undo
 * is the same clock run backwards: the specks fly in and the bubble forms again from its right.
 * The specks are made here once, in the bubble's own unit square, so each platform only places
 * them on the box it measured and paints them in the bubble's colours.
 */

/** How long the wipe takes to cross the bubble. */
export const WIPE_MS = 520;
/** How much later than the wipe a speck may let go. */
const JITTER_MS = 70;
/** How long a speck lives once it has let go. */
const LIFE_MS: readonly [number, number] = [600, 1000];
/** From the first frame to the last speck gone. */
export const DUST_MS = WIPE_MS + JITTER_MS + LIFE_MS[1];
/** How many specks a bubble breaks into. */
export const SPECKS = 220;
/** The wipe's edge is this soft, in points either side, where a platform can draw it so. */
export const WIPE_SOFT = 10;
/** How long Undo is offered after a message is deleted for oneself. */
export const UNDO_MS = 5000;

/** One speck: where in the bubble it was, when it lets go, and how it moves after. */
export interface Speck {
  /** Across and down the bubble, nought to one. */
  readonly u: number;
  readonly v: number;
  /** Its side, in points. */
  readonly size: number;
  /** When it lets go, in ms from the start, and how long it lives after. */
  readonly at: number;
  readonly life: number;
  /** Points a second, and points a second a second. Up is negative. */
  readonly vx: number;
  readonly vy: number;
  readonly ax: number;
  readonly ay: number;
  readonly wobble: number;
  /** Painted the words' ink, rather than the bubble's ground. */
  readonly ink: boolean;
  /** Lighter or darker than the ground, by this much of 255. */
  readonly shade: number;
}

/** Where a speck is, how big and how seen, at a moment; `undefined` while it is still bubble or gone. */
export interface SpeckNow {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly opacity: number;
}

/**
 * The specks of a bubble of the given size, laid out on a grid with a little play so the cover is
 * even: exactly `count` of them, since on the phone each is a view. `random` is the platform's, or
 * a seeded one in a test.
 */
export function makeSpecks(
  box: { readonly width: number; readonly height: number },
  random: () => number = Math.random,
  count: number = SPECKS,
): Speck[] {
  const between = (a: number, b: number) => a + random() * (b - a);
  const ratio = box.height <= 0 ? 1 : box.width / box.height;
  const cols = Math.max(4, Math.round(Math.sqrt(count * ratio)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const specks: Speck[] = [];
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const u = (col + random()) / cols;
      const v = (row + random()) / rows;
      // The words sit inside the bubble's padding; some specks there are the ink's.
      const inWords = u > 0.05 && u < 0.85 && v > 0.2 && v < 0.8;
      specks.push({
        u,
        v,
        size: between(2.6, 4.6),
        at: u * WIPE_MS + between(0, JITTER_MS),
        life: between(LIFE_MS[0], LIFE_MS[1]),
        vx: between(30, 150),
        vy: -between(50, 170),
        ax: between(40, 170),
        ay: -between(30, 130),
        wobble: between(0, Math.PI * 2),
        ink: inWords && random() < 0.3,
        shade: between(-18, 22),
      });
    }
  }
  // The grid rounds up; the specks over are taken out evenly, so no part of the bubble is thin.
  const over = specks.length - count;
  if (over <= 0) return specks;
  const out = new Set(
    Array.from({ length: over }, (_, at) => Math.floor((at * specks.length) / over)),
  );
  return specks.filter((_, at) => !out.has(at));
}

/** A speck at `t` ms, on a bubble whose box starts at `x`, `y` and is `width` by `height`. */
export function speckAt(
  speck: Speck,
  t: number,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): SpeckNow | undefined {
  const tau = t - speck.at;
  if (tau <= 0 || tau >= speck.life) return undefined;
  const k = tau / 1000;
  const p = tau / speck.life;
  return {
    x:
      box.x +
      speck.u * box.width +
      speck.vx * k +
      0.5 * speck.ax * k * k +
      Math.sin(speck.wobble + tau / 90) * 1.2,
    y: box.y + speck.v * box.height + speck.vy * k + 0.5 * speck.ay * k * k,
    size: speck.size * (1 - 0.45 * p),
    opacity: 1 - p ** 1.6,
  };
}

/** How far the wipe has crossed the bubble at `t` ms: nought before it starts, one once it has. */
export function wipedAt(t: number): number {
  return Math.min(1, Math.max(0, t / WIPE_MS));
}
