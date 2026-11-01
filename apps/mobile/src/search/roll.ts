/**
 * How Search's hint rolls on the phone (ADR 0137). The words and their pace are core's
 * (`SEARCH_HINT`), the same as the web's; this turns them into what React Native's native driver
 * can carry.
 *
 * - **A column behind a window.** The words stand in a column, the first again at its foot, behind
 *   a window one line high, and the column moves up a line at a time. When it has gone round it
 *   shows the first word again, so the round starts over with no jump.
 * - **One clock.** A round is one clock from nought to one, looped on the native side as the
 *   backdrop's is (`drift.ts`). The native driver takes points, not an easing, so each roll's
 *   spring is sampled into the interpolation here.
 *
 * Pure, so it is tested under Node; the spring comes in from the component, which has React
 * Native's `Easing.bezier`.
 */

import { HINT_ROUND_MS, SEARCH_HINT } from "@chipschat/core";
import type { Curve } from "./drift";

/** Points per roll: at sixteen, the spring's turn past the word is drawn within a point. */
const SAMPLES = 16;

/**
 * Where the column is over a round, in points from where it starts (up is less): still for each
 * word's hold, then a line further up along the spring.
 */
export function roll(line: number, spring: (t: number) => number): Curve {
  const { words, holdMs, rollMs } = SEARCH_HINT;
  const inputRange = [0];
  const outputRange = [0];
  for (let word = 0; word < words.length; word++) {
    const from = word * (holdMs + rollMs) + holdMs;
    for (let sample = 0; sample <= SAMPLES; sample++) {
      const t = sample / SAMPLES;
      inputRange.push((from + t * rollMs) / HINT_ROUND_MS);
      outputRange.push(round(-line * (word + spring(t))));
    }
  }
  return { inputRange, outputRange };
}

const round = (value: number) => Math.round(value * 1000) / 1000 || 0;
