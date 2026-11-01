/**
 * How a face moves through its place in Search's backdrop, on the phone (ADR 0136). The places,
 * their pace and which face each wears are core's (`searchBackdrop.ts`), the same as the web's;
 * this turns a place into what React Native's native driver can carry.
 *
 * - **One clock.** A whole round is one clock from nought to one, looped on the native side, as
 *   the lights that take turns are (`ui/turns.ts`), and every face reads where it is from that
 *   clock. Every climb and every sway goes a whole number of times round in a round, so a face is
 *   where it started when the clock comes back to nought.
 * - **Points, not easings.** The native driver takes points and draws straight lines between
 *   them: a climb is a straight line already, the fade is straight once the moments it starts and
 *   ends are points of their own, and a sway is a sine sampled finely enough that its corners
 *   cannot be seen over a face's few points of travel. The glow's breath (ADR 0138) is a sine
 *   sampled the same way.
 *
 * Pure, so it is tested under Node; `Backdrop.tsx` hands these to `Animated`.
 */

import { BACKDROP_DEPTHS, BACKDROP_FADE, BACKDROP_GLOW, type BackdropPlace } from "@chipschat/core";

/** An interpolation of the clock, as `Animated` takes it. */
export interface Curve {
  readonly inputRange: number[];
  readonly outputRange: number[];
}

/** A gap too small to see between the top of one climb and the foot of the next. */
const JUMP = 1e-6;

/**
 * Where the face's top edge is, in points down from the backdrop's top, over a round: from just
 * under the backdrop's foot (`height`) to just over its top, a whole number of times. The jump
 * from the top back to the foot happens while the face is faded out.
 */
export function climb(place: BackdropPlace, height: number, side: number): Curve {
  const times = BACKDROP_DEPTHS[place.depth].climbs;
  const at = (up: number) => height - up * (height + side);
  const inputRange = [0];
  const outputRange = [at(place.start)];
  for (let turn = 1; turn <= times; turn++) {
    const top = (turn - place.start) / times;
    inputRange.push(top, top + JUMP);
    outputRange.push(at(1), at(0));
  }
  inputRange.push(1);
  outputRange.push(at(place.start));
  return { inputRange, outputRange };
}

/** How much of the face shows with its top edge at `y`: none near the backdrop's top, all below. */
export function clearAt(y: number, side: number): number {
  const middle = y + side / 2;
  const { from, to } = BACKDROP_FADE;
  return Math.min(1, Math.max(0, (middle - from) / (to - from)));
}

/**
 * How much of the face shows over a round. The climb is straight between its points, so the
 * fade is too once the moments it crosses the two edges of the fade are added as points of
 * their own.
 */
export function fade(place: BackdropPlace, height: number, side: number): Curve {
  const { inputRange: times, outputRange: ys } = climb(place, height, side);
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  const add = (t: number, y: number) => {
    if (inputRange.length > 0 && t <= (inputRange.at(-1) as number)) return;
    inputRange.push(t);
    outputRange.push(clearAt(y, side));
  };
  // The tops of the face at which it is gone, and at which it is whole.
  const edges = [BACKDROP_FADE.from - side / 2, BACKDROP_FADE.to - side / 2];
  for (let i = 0; i < times.length; i++) {
    const t = times[i] as number;
    const y = ys[i] as number;
    add(t, y);
    if (i === times.length - 1) break;
    const t2 = times[i + 1] as number;
    const y2 = ys[i + 1] as number;
    const crossings = edges
      .filter((edge) => (edge - y) * (edge - y2) < 0)
      .map((edge) => ({ t: t + ((edge - y) / (y2 - y)) * (t2 - t), y: edge }))
      .sort((a, b) => a.t - b.t);
    for (const crossing of crossings) add(crossing.t, crossing.y);
  }
  return { inputRange, outputRange };
}

/** Points per sway: at eight, a sine nine points wide is never more than a point off. */
const SAMPLES = 8;

/** The face's sway over a round, as a sine of the given size: points across, or degrees of tip. */
export function sway(place: BackdropPlace, size: number): Curve {
  const steps = place.sways * SAMPLES;
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let step = 0; step <= steps; step++) {
    inputRange.push(step / steps);
    const turn = step / SAMPLES + place.swayStart;
    outputRange.push(round(size * Math.sin(turn * Math.PI * 2)));
  }
  return { inputRange, outputRange };
}

/**
 * The glow's breath over a round (ADR 0138), from `from` to `to` and back, `BACKDROP_GLOW.breaths`
 * times: slow at each end, as a breath is. Each place starts at its own point in a breath (its
 * `start`), so no two glows swell together. Its size, or its strength.
 */
export function breathe(place: BackdropPlace, from: number, to: number): Curve {
  const steps = BACKDROP_GLOW.breaths * SAMPLES;
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let step = 0; step <= steps; step++) {
    inputRange.push(step / steps);
    const turn = step / SAMPLES + place.start;
    outputRange.push(round(from + ((to - from) * (1 - Math.cos(turn * Math.PI * 2))) / 2));
  }
  return { inputRange, outputRange };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
