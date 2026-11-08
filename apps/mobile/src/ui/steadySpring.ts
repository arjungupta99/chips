/**
 * The app's spring on a clock of its own, which a frame moves by at most `STEADY_FRAME_MS`
 * (core's, which the room's clock keeps too; `springShare`, in core, says where the spring is at any
 * moment of it).
 *
 * A frame the phone could not draw holds what is moving where it was rather than skipping it on
 * to where the wall clock says. What sets a move going is usually a mount — the viewer's first
 * open after a cold start, a line landing in the room — and a mount can take fifty milliseconds of
 * the UI thread just after the move has been let go: on the clock every other animation keeps, the
 * first frame anyone saw was already a third of the way there (the viewer, Arjun, 22 September
 * 2026; the room, the simulator, 25 September 2026). The frame after a stall is late too, and its
 * timestamp is the vsync it missed, so the step after it was a leap as well. What a stall costs on
 * this clock is that long a pause, and never a jump.
 */

import { glideAt, type Spring, STEADY_FRAME_MS, springShare } from "@chipschat/core";
import {
  type AnimatableValue,
  type Animation,
  type AnimationCallback,
  defineAnimation,
} from "react-native-reanimated";
import { IOS_SPRING } from "./motion";

interface SteadySpring extends Animation<SteadySpring> {
  from: number;
  last: number;
  elapsed: number;
  current: number;
}

/** A spring to `to`, the app's own unless another is given, on the steady clock. */
export function withSteadySpring(
  to: number,
  callback?: AnimationCallback,
  spring: Spring = IOS_SPRING,
): number {
  "worklet";
  return defineAnimation<SteadySpring>(to, () => {
    "worklet";
    const onStart = (animation: SteadySpring, value: AnimatableValue, now: number) => {
      animation.from = Number(value);
      animation.current = Number(value);
      animation.last = now;
      animation.elapsed = 0;
    };
    const onFrame = (animation: SteadySpring, now: number) => {
      animation.elapsed += Math.min(STEADY_FRAME_MS, Math.max(0, now - animation.last));
      animation.last = now;
      const { share, settled } = springShare(spring, animation.elapsed);
      animation.current = animation.from + (to - animation.from) * share;
      return settled;
    };
    return {
      onStart,
      onFrame,
      from: to,
      last: 0,
      elapsed: 0,
      current: to,
      callback,
    } as SteadySpring;
  }) as unknown as number;
}

interface SteadyTiming extends Animation<SteadyTiming> {
  from: number;
  last: number;
  elapsed: number;
  current: number;
}

/** How a steady timing goes: over `ms`, eased by `ease`, after `wait`, all on the steady clock. */
export interface SteadyTimingConfig {
  readonly ms: number;
  /** A function a worklet can call (`Easing.bezierFn`). */
  readonly ease: (share: number) => number;
  readonly wait?: number;
}

/**
 * A timing to `to` on the steady clock. A short fade let go with a mount is all of it, or none of
 * it, by the first frame that draws it on the clock every other animation keeps: a room's frost (ADR
 * 0279, since gone), a sixty millisecond fade let go with the details' pane, was whole in its first
 * frame (the simulator, 5 November 2026). On this one a frame the phone could not draw is a frame of it.
 */
export function withSteadyTiming(
  to: number,
  { ms, ease, wait = 0 }: SteadyTimingConfig,
  callback?: AnimationCallback,
): number {
  "worklet";
  return defineAnimation<SteadyTiming>(to, () => {
    "worklet";
    const onStart = (animation: SteadyTiming, value: AnimatableValue, now: number) => {
      animation.from = Number(value);
      animation.current = Number(value);
      animation.last = now;
      animation.elapsed = 0;
    };
    const onFrame = (animation: SteadyTiming, now: number) => {
      animation.elapsed += Math.min(STEADY_FRAME_MS, Math.max(0, now - animation.last));
      animation.last = now;
      const share = Math.min(1, Math.max(0, animation.elapsed - wait) / ms);
      animation.current = animation.from + (to - animation.from) * ease(share);
      return share >= 1;
    };
    return {
      onStart,
      onFrame,
      from: to,
      last: 0,
      elapsed: 0,
      current: to,
      callback,
    } as SteadyTiming;
  }) as unknown as number;
}

interface Glide extends Animation<Glide> {
  from: number;
  last: number;
  elapsed: number;
  current: number;
}

/**
 * Something let go at `velocity` points a second, slowing as a scroll view does and kept between
 * `low` and `high` by the app's spring past either edge (`glideAt`, in core), on the steady clock.
 * Set from a gesture, never in a style: a style would be handed `low`.
 */
export function withGlide(
  velocity: number,
  low: number,
  high: number,
  callback?: AnimationCallback,
): number {
  "worklet";
  return defineAnimation<Glide>(low, () => {
    "worklet";
    const onStart = (animation: Glide, value: AnimatableValue, now: number) => {
      animation.from = Number(value);
      animation.current = Number(value);
      animation.last = now;
      animation.elapsed = 0;
    };
    const onFrame = (animation: Glide, now: number) => {
      animation.elapsed += Math.min(STEADY_FRAME_MS, Math.max(0, now - animation.last));
      animation.last = now;
      const glide = glideAt(IOS_SPRING, animation.from, velocity, low, high, animation.elapsed);
      animation.current = glide.at;
      return glide.settled;
    };
    return {
      onStart,
      onFrame,
      from: low,
      last: 0,
      elapsed: 0,
      current: low,
      callback,
    } as Glide;
  }) as unknown as number;
}
