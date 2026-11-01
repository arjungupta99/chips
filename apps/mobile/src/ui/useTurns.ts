/**
 * The clock lights that take turns run on (`turns.ts`): one timing from nought to one, looped on
 * the native side, and each light that clock read through its own stretch of the round. Nothing
 * goes back to the JavaScript thread between rounds, so a busy JS thread cannot hold a light up.
 *
 * Only while `running`: stopped, the clock goes back to the start and the caller draws its lights
 * still, at whatever brightness still means for it.
 *
 * `delayMs` holds the first round back, so faces drawn together can run one after another rather
 * than in step: the Agents tab's blank faces while the agents are on their way (`Arriving`).
 */

import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { roundMs, type Turns, turnOf } from "./turns";

const NATIVE = Platform.OS !== "web";

export function useTurns(
  turns: Turns,
  running: boolean,
  delayMs = 0,
): readonly Animated.AnimatedInterpolation<number>[] {
  const clock = useRound(roundMs(turns), running, delayMs);
  return useMemo(
    () =>
      Array.from({ length: turns.count }, (_, index) => clock.interpolate(turnOf(turns, index))),
    [clock, turns],
  );
}

/**
 * The clock itself, for what keeps time with a round of lights without being one: the sparks on
 * the connection's board, which leave their pins as the pins light (`Circuit.tsx`). Started in the
 * same commit as the lights' own, it runs in step with them.
 */
export function useRound(duration: number, running: boolean, delayMs = 0): Animated.Value {
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Every round starts where this one does, so it must start at the top: a clock stopped half
    // way and started again would go round the second half for ever.
    clock.setValue(0);
    if (!running) return;
    // A single timing, so `loop` hands the whole thing to the native driver rather than
    // restarting it from JS at the end of every round.
    const round = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: NATIVE,
      }),
    );
    if (delayMs <= 0) {
      round.start();
      return () => round.stop();
    }
    const held = setTimeout(() => round.start(), delayMs);
    return () => {
      clearTimeout(held);
      round.stop();
    };
  }, [clock, duration, running, delayMs]);
  return clock;
}
