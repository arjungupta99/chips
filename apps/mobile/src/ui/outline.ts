/**
 * The Chips mark, and an agent's outline (ADR 0089, redrawn by ADR 0096 and ADR 0102): a rounded
 * square with one bite out of its top right corner, and ten round pins, always out where the face
 * has room for them.
 *
 * A person is a circle, a harness a squircle, a channel a square and a space a rounded square; the
 * bite and the pins are what say *agent*, the bite alone at twenty points beside a line of words.
 * Since ADR 0102 it is the first mark's chip again, corners, sharp bite and all, with its pins
 * pulled in short so the chip itself stands bigger in its box.
 *
 * Since ADR 0096 these numbers are the mark itself, not a copy of it: the working mark beside a
 * turn (`ChipPulse`) is drawn from them, the app icons in `assets/` are checked against them, and
 * the web's mark is drawn from the design system's copy. The logo and an agent's face cannot
 * drift apart.
 *
 * Everything is a fraction of the face's side, so one drawing serves every size. The design
 * system keeps the same numbers and the same path in
 * `packages/ui/src/components/face/outline.ts`, for the reason it keeps the library twice: the
 * phone may not reach into `@chipschat/ui`. `outline.vitest.ts` reads that file and fails when the
 * two differ below this comment.
 */

// --- the outline ---

/**
 * The body: its corners, the bite's radius, how far inside the corner the bite's centre sits, and
 * the easing of the two points where bite meets edge. These are the first mark's: a body of 16 in
 * a 24 box, with a bite of radius 4.5 centred 1 inside its corner, and its points left sharp.
 */
export const BITE = { corner: 0.25, radius: 0.281_25, inset: 0.0625, ease: 0 } as const;

/**
 * The pins: how far they stand out of the body, how wide they are, how far they tuck under it,
 * and where each one stands, clockwise from the top. They stand at quarters of each side, as the
 * first mark's did, as thick as its were but standing out little more than half as far. The bite
 * took the third on the top and on the right, so those sides keep two pins each; the foot and the
 * left keep three. The top's and the right's mirror each other across the diagonal through the
 * bite, as the foot's and the left's do.
 */
export const PINS = {
  over: 0.13,
  width: 0.125,
  tuck: 0.04,
  at: [
    ["top-left", "top", 0.25],
    ["top-middle", "top", 0.5],
    ["right-middle", "right", 0.5],
    ["right-lower", "right", 0.75],
    ["foot-right", "foot", 0.75],
    ["foot-middle", "foot", 0.5],
    ["foot-left", "foot", 0.25],
    ["left-lower", "left", 0.75],
    ["left-middle", "left", 0.5],
    ["left-upper", "left", 0.25],
  ],
} as const;

/** The gap between one pin lighting and the next: one turn of the light round them is 1.5 s. */
export const PIN_STEP_MS = 1500 / PINS.at.length;

/** Below this side a face has no room for pins, and says it is working with a dot in the bite. */
export const PINS_FROM = 32;

/**
 * How lit a pin is with no light running round it (ADR 0103): dim, as the pins are between one
 * flash and the next while the agent works. The face beside a line in a room, too small to wear
 * its pins inside its box, wears them round its body instead, and rests them a little less dim.
 * The mark itself, the logo and every app icon, rests its pins a little dim too.
 */
export const PIN_REST = { inside: 0.3, outside: 0.45, mark: 0.55 } as const;

/**
 * How much of a face's box its body takes where it wears its pins. The pins stand inside the box,
 * so an agent, pins and all, is the size a room's face or a person's is in the same place.
 */
export const BODY_WITH_PINS = 1 / (1 + 2 * PINS.over);

/** How much of the body a mark takes, and how far it sits from the centre, away from the bite. */
export const AGENT_MARK = { scale: 0.6, dx: -0.02, dy: 0.02 } as const;

/** The dot that sits in the bite, saying what state the agent is in: its centre and its radius. */
export const BITE_DOT = { cx: 0.89, cy: 0.11, r: 0.11 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/** The bitten body as an SVG path, for a square of `side` whose top left corner is at `x`, `y`. */
export function bittenPath(x: number, y: number, side: number): string {
  const r = BITE.corner * side;
  const rb = BITE.radius * side;
  const d = BITE.inset * side;
  const q = BITE.ease * side;
  const right = x + side;
  const foot = y + side;
  // The bite is a circle a little inside the corner. Each point where it would meet an edge may be
  // eased by a small circle that touches both: the edge at `(fx, y)`, the bite at `(tx, ty)`.
  // With no easing the two points coincide, and the bite meets the edge in a sharp point.
  const cx = right - d;
  const cy = y + d;
  const fx = cx - Math.sqrt((rb + q) ** 2 - (q - d) ** 2);
  const tx = cx + ((fx - cx) * rb) / (rb + q);
  const ty = cy + ((y + q - cy) * rb) / (rb + q);
  // The other point is the first, mirrored in the diagonal through the corner.
  const mx = right - (ty - y);
  const my = y + (right - tx);
  const p = (px: number, py: number) => `${round(px)} ${round(py)}`;
  const arc = (radius: number, sweep: 0 | 1, px: number, py: number) =>
    `A${round(radius)} ${round(radius)} 0 0 ${sweep} ${p(px, py)}`;
  const eased = q > 0;
  return [
    `M${p(x + r, y)}`,
    `H${round(fx)}`,
    ...(eased ? [arc(q, 1, tx, ty)] : []),
    arc(rb, 0, mx, my),
    ...(eased ? [arc(q, 1, right, y + (right - fx))] : []),
    `V${round(foot - r)}`,
    arc(r, 1, right - r, foot),
    `H${round(x + r)}`,
    arc(r, 1, x, foot - r),
    `V${round(y + r)}`,
    arc(r, 1, x + r, y),
    "Z",
  ].join("");
}

/** One pin: a round-ended rod, placed against the face's own box, so it may stand outside it. */
export interface Pin {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The pins of a face of this side, in the order the light goes round: clockwise from the top.
 * Each tucks a little under the body, so there is no seam where it leaves it.
 */
export function pinsOf(side: number): readonly Pin[] {
  const w = PINS.width * side;
  const over = PINS.over * side;
  const tuck = PINS.tuck * side;
  const long = over + tuck;
  return PINS.at.map(([key, edge, at]): Pin => {
    const along = at * side - w / 2;
    switch (edge) {
      case "top":
        return { key, x: along, y: -over, w, h: long };
      case "right":
        return { key, x: side - tuck, y: along, w: long, h: w };
      case "foot":
        return { key, x: along, y: side - tuck, w, h: long };
      default:
        return { key, x: -over, y: along, w: long, h: w };
    }
  });
}

/**
 * A room's face wears the agent's pins while there is work going in it, and only then (ADR 0285).
 * They are the same pins, as thick and as long, but a room has no bite to take any, so there are
 * twelve: three to each side of a square, or one to every thirty degrees of a circle. The whole
 * face draws in a little (`drawn`) so they stand in about the room the ring they replaced took.
 */
export const WORKING_PINS = { count: 12, drawn: 0.9 } as const;

/** The gap between one pin lighting and the next round twelve: the turn still takes 1.5 s. */
export const WORKING_PIN_STEP_MS = 1500 / WORKING_PINS.count;

/** A pin round a working face: its centre against the face's box, its size, which way it points. */
export interface WorkingPin {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  /** Degrees clockwise from pointing straight up. Its length is always `h`, before the turn. */
  readonly turn: number;
}

/**
 * The pins round a working face of this side, in the order the light goes round: clockwise from
 * the top. Each is described pointing up and then turned, so that sliding one along its own length
 * takes it straight under the face and out again, on any side and at any angle.
 */
export function workingPinsOf(side: number, round: boolean): readonly WorkingPin[] {
  const w = PINS.width * side;
  const h = (PINS.over + PINS.tuck) * side;
  // How far a pin's centre stands past the edge it comes out of.
  const stand = ((PINS.over - PINS.tuck) / 2) * side;
  const pin = (index: number, cx: number, cy: number, turn: number): WorkingPin => ({
    key: `pin-${index}`,
    cx,
    cy,
    w,
    h,
    turn,
  });
  if (round) {
    const reach = side / 2 + stand;
    return Array.from({ length: WORKING_PINS.count }, (_, index) => {
      const turn = (index * 360) / WORKING_PINS.count;
      const angle = (turn * Math.PI) / 180;
      return pin(
        index,
        side / 2 + reach * Math.sin(angle),
        side / 2 - reach * Math.cos(angle),
        turn,
      );
    });
  }
  const along = [0.25, 0.5, 0.75].map((at) => at * side);
  const back = [...along].reverse();
  const far = side + stand;
  return [
    ...along.map((at) => [at, -stand, 0] as const),
    ...along.map((at) => [far, at, 90] as const),
    ...back.map((at) => [at, far, 180] as const),
    ...back.map((at) => [-stand, at, 270] as const),
  ].map(([cx, cy, turn], index) => pin(index, cx, cy, turn));
}
