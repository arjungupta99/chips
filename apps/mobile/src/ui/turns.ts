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
  /**
   * The lights stand in a ring and the light goes on round it: the first comes up one step after
   * the last, as any comes up after the one before, while the last is still going down. Left out,
   * they stand in a row, and the last has gone down before the first comes up again.
   */
  readonly ring?: boolean;
}

/** Straight pieces per curve: at eight, a quad in-out is never more than a percent off. */
const SAMPLES = 8;

/** One round: a step for each light of a ring; along a row, the last's start and its whole breath. */
export function roundMs(turns: Turns): number {
  if (turns.ring === true) return turns.count * turns.stepMs;
  return (turns.count - 1) * turns.stepMs + turns.riseMs + turns.fallMs;
}

/** How lit a light is, `ms` after it started to come up. */
function levelAt(turns: Turns, ms: number): number {
  const span = turns.high - turns.low;
  if (ms <= 0 || ms >= turns.riseMs + turns.fallMs) return turns.low;
  if (ms <= turns.riseMs) return turns.low + span * turns.rise(ms / turns.riseMs);
  return turns.high - span * turns.fall((ms - turns.riseMs) / turns.fallMs);
}

/** The moments of a light's breath the interpolation is given, from its start. */
function breathOf(turns: Turns): number[] {
  const steps = Array.from({ length: SAMPLES }, (_, k) => (k + 1) / SAMPLES);
  return [
    0,
    ...steps.map((part) => turns.riseMs * part),
    ...steps.map((part) => turns.riseMs + turns.fallMs * part),
  ];
}

/**
 * Where on the round's clock the light at `index` is lit, and how brightly: an interpolation that
 * holds `low` until its turn, rises, falls, and holds `low` again to the round's end. Round a ring,
 * what is left of a late light's breath at the round's end is at the start of the clock, so the
 * clock's two ends read the same and going back to nought shows nothing.
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
  const moments = breathOf(turns);
  const atTheEnd = levelAt(turns, round - start);
  at(0, atTheEnd);
  for (const ms of moments) {
    if (start + ms > round) at(start + ms - round, levelAt(turns, ms));
  }
  for (const ms of moments) {
    if (start + ms <= round) at(start + ms, levelAt(turns, ms));
  }
  at(round, atTheEnd);
  return { inputRange, outputRange };
}
