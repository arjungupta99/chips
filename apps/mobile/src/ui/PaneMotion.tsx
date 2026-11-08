/**
 * How the panes beside an iPad's list move (ADR 0276), on Reanimated, on the bar's timing
 * (`PadBarMotion.tsx`): a third column grows in at the window's right as the page beside it
 * narrows, and shrinks away as it widens again; the list steps aside to the left and back. Arjun,
 * 3 November 2026: "the third column appears without any transition, abruptly, please make it
 * smooth transition".
 *
 * A column that comes and goes is a box whose width moves, holding what it shows at its own full
 * width: anchored at the box's left, it slides in from the window's edge as the box grows; anchored
 * at its right, it slides out to the left as the box shrinks. What stands beside it is laid out at
 * each width between, as iPadOS's own columns are.
 *
 * Kept apart because Reanimated cannot be loaded under Jest here: `jest.setup.js` stands a box in
 * with a plain view at its width, and keeps nothing that has gone.
 */

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { DURATION, EASE, EASED } from "./PadBarMotion";
import { withSteadyTiming } from "./steadySpring";

/**
 * How long the panes wait before they move, in milliseconds: beside a room whose lines take a new
 * width with their words out of sight, until the words have gone (`useWordsLead`, ADR 0279),
 * waiting on the steady clock as the words do; nought elsewhere. What a column shows is kept until
 * it has gone, wait and all.
 */
export const PaneLead = createContext(0);

/**
 * A box whose width goes to `width` from wherever it stood, once the panes' lead is past
 * (`PaneLead`). Its first width it takes at once, and so does any width while `still`: a window
 * that has turned is laid out at its new size once, as UIKit turns it, not grown into it.
 */
export function Widening({
  width,
  still = false,
  style,
  testID,
  children,
}: {
  readonly width: number;
  readonly still?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
  readonly children?: ReactNode;
}) {
  const first = useFirst();
  const at = first || still;
  const lead = useContext(PaneLead);
  const sized = useAnimatedStyle(() => {
    if (at) return { width };
    if (lead === 0) return { width: withTiming(width, { duration: DURATION, easing: EASE }) };
    return { width: withSteadyTiming(width, { ms: DURATION, ease: EASED, wait: lead }) };
  }, [width, at, lead]);
  return (
    <Animated.View style={[style, sized]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/**
 * A box whose padding at its left goes to `left` with the panes, once their lead is past
 * (`PaneLead`): a room's foot keeping clear of the bar and the gold + as the list steps aside under
 * them or comes back (`useFootClear`, in `Split.tsx`). Its first padding it takes at once.
 */
export function Clearing({
  left,
  style,
  children,
}: {
  readonly left: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  const first = useFirst();
  const lead = useContext(PaneLead);
  const padded = useAnimatedStyle(() => {
    if (first) return { paddingLeft: left };
    if (lead === 0) return { paddingLeft: withTiming(left, { duration: DURATION, easing: EASE }) };
    return { paddingLeft: withSteadyTiming(left, { ms: DURATION, ease: EASED, wait: lead }) };
  }, [left, first, lead]);
  return <Animated.View style={[style, padded]}>{children}</Animated.View>;
}

/**
 * What a column shows, kept while its box shrinks away once it is no longer asked for, so it slides
 * out rather than vanishing; then nothing.
 */
export function useKept<T>(value: T | undefined): T | undefined {
  const lead = useContext(PaneLead);
  const [kept, setKept] = useState(value);
  const last = useRef(value);
  if (value !== undefined) last.current = value;
  useEffect(() => {
    if (value !== undefined) {
      setKept(value);
      return;
    }
    const timer = setTimeout(() => setKept(undefined), lead + DURATION);
    return () => clearTimeout(timer);
  }, [value, lead]);
  return value ?? (kept === undefined ? undefined : last.current);
}

/**
 * Whether a column that steps aside has gone: once its box has shrunk away, after the panes' lead
 * and their move; and no longer, at once, as it comes back, while its box is still shut. Until then
 * it is still a thumb's and VoiceOver's. Out of their reach from the moment it set off, the iPad's
 * list had its rows rise thirty points under its name as it began to slide (the 13-inch simulator
 * upright, 7 November 2026).
 */
export function useGone(hidden: boolean): boolean {
  const lead = useContext(PaneLead);
  const [gone, setGone] = useState(hidden);
  useEffect(() => {
    if (!hidden) {
      setGone(false);
      return;
    }
    const timer = setTimeout(() => setGone(true), lead + DURATION);
    return () => clearTimeout(timer);
  }, [hidden, lead]);
  return hidden && gone;
}

/** True on the first drawing only. */
function useFirst(): boolean {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return first.current;
}
