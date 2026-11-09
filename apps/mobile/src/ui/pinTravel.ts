/**
 * How a working face's pins come out and go back in (ADR 0285): one clock from nought (every pin
 * under the face) to one (every pin out), and each pin that clock read through its own stretch of
 * it, a step behind the one before, so they leave one after another round the face.
 *
 * It is the bargain `turns.ts` made for the light. The native driver takes points and not an
 * easing function, so the curve is sampled into the interpolation here, and nothing crosses to the
 * JavaScript thread once the clock has started. The clock runs backward to put them away, so the
 * last pin out is the first one in.
 *
 * Pure, so it is tested under Node.
 */

/** How long the pins take to come out, and to go back in, which is a little quicker. */
export const PINS_OUT_MS = 620;
export const PINS_IN_MS = 460;

/** How much of the clock one pin's journey takes; the rest is the pins before it starting. */
const SPAN = 0.46;
/** How much of the clock the face takes to draw in. */
const DRAW_SPAN = 0.6;
/** Straight pieces per curve, fine enough that they can't be seen over a pin's length. */
const SAMPLES = 10;
/** How far past its mark a curve goes before it settles: about a tenth of the journey. */
const PAST = 1.6;

/** Nought to one, a little past one, and back to it: a pin that pops out rather than stops. */
export function settle(t: number): number {
  const left = t - 1;
  return 1 + (PAST + 1) * left ** 3 + PAST * left ** 2;
}

interface Stretch {
  readonly inputRange: number[];
  readonly outputRange: number[];
}

/** A curve between `start` and `end` of the clock, holding its ends outside them. */
function stretch(start: number, end: number, value: (t: number) => number): Stretch {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  const at = (where: number, output: number) => {
    // A pin whose stretch starts the clock, or ends it, would put two points in one place.
    if (inputRange.length > 0 && where <= (inputRange.at(-1) as number)) {
      outputRange[outputRange.length - 1] = output;
      return;
    }
    inputRange.push(where);
    outputRange.push(output);
  };
  at(0, value(0));
  for (let k = 0; k <= SAMPLES; k++) at(start + ((end - start) * k) / SAMPLES, value(k / SAMPLES));
  at(1, value(1));
  return { inputRange, outputRange };
}

/**
 * Where the pin at `index` of `count` stands along its own length as the clock runs: `distance`
 * in toward the face at the start, nothing at the end, and a little further out in between.
 */
export function travelOf(index: number, count: number, distance: number): Stretch {
  const start = (index / (count - 1)) * (1 - SPAN);
  return stretch(start, start + SPAN, (t) => distance * (1 - settle(t)));
}

/** The face's scale as the clock runs: its full size at the start, `drawn` once the pins are out. */
export function drawOf(drawn: number): Stretch {
  return stretch(0, DRAW_SPAN, (t) => 1 - (1 - drawn) * settle(t));
}
