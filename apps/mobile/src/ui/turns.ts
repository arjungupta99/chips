/**
 * Lights that take turns, on one clock (24 September 2026).
 *
 * The dots on a lane's row and the pins of the working mark were each a loop of a stagger of
 * in-and-out timings, and React Native cannot loop a sequence on the native driver: it runs the
 * loop on the JavaScript thread instead. Every breath of every dot ended with a hop to JS to start
 * the next, so whenever that thread was busy — a reply coming in, a room drawing rows as it
 * scrolls — the next breath started late and the lights hung, which on the phone reads as the room
 * dropping frames (Arjun, 24 September 2026).
 *
 * Now a whole round is one clock from nought to one, looped on the native side, and each light is
 * that clock read through the light's own stretch of it. The native driver takes points, not an
 * easing function, so each curve is sampled into the interpolation here — finely enough that the
 * straight pieces cannot be seen at the size of a dot. Nothing crosses to JS once a round starts.
 *
 * Pure, so it is tested under Node; the easings come in from the component, which has React
 * Native's.
 */

export interface Turns {
  /** How many lights take turns. */
  readonly count: number;
  /** How long after the one before it each light starts. */
  readonly stepMs: number;
  /** How long a light takes to come up, and to go down again. */
  readonly riseMs: number;
  readonly fallMs: number;
  /** A light at rest, and at its brightest. */
  readonly low: number;
  readonly high: number;
  /** The shape of the way up and the way down, over nought to one. */
  readonly rise: (t: number) => number;
  readonly fall: (t: number) => number;
}

/** Straight pieces per curve: at eight, a quad in-out is never more than a percent off. */
const SAMPLES = 8;

/** One round: the last light's start, then its whole way up and down. */
export function roundMs(turns: Turns): number {
  return (turns.count - 1) * turns.stepMs + turns.riseMs + turns.fallMs;
}

/**
 * Where on the round's clock the light at `index` is lit, and how brightly: an interpolation that
 * holds `low` until its turn, rises, falls, and holds `low` again to the round's end.
 */
export function turnOf(
  turns: Turns,
  index: number,
): { readonly inputRange: number[]; readonly outputRange: number[] } {
  const round = roundMs(turns);
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  const at = (ms: number, value: number) => {
    const where = ms / round;
    // A light whose turn starts the round, or ends it, would put two points in one place.
    if (inputRange.length > 0 && where <= (inputRange.at(-1) as number)) {
      outputRange[outputRange.length - 1] = value;
      return;
    }
    inputRange.push(where);
    outputRange.push(value);
  };
  const start = index * turns.stepMs;
  const peak = start + turns.riseMs;
  const span = turns.high - turns.low;
  at(0, turns.low);
  at(start, turns.low);
  for (let k = 1; k <= SAMPLES; k++) {
    at(start + (turns.riseMs * k) / SAMPLES, turns.low + span * turns.rise(k / SAMPLES));
  }
  for (let k = 1; k <= SAMPLES; k++) {
    at(peak + (turns.fallMs * k) / SAMPLES, turns.high - span * turns.fall(k / SAMPLES));
  }
  at(round, turns.low);
  return { inputRange, outputRange };
}
