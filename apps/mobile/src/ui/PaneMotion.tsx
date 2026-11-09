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
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { DURATION, EASE, EASED, PANES_HOLD, setLinesWaiting } from "./PadBarMotion";
import { withSteadyTiming } from "./steadySpring";

/**
 * How long the panes wait before they move, in milliseconds: beside a room whose lines take a new
 * width with their words out of sight, until the words have gone (`useWordsLead`, ADR 0279),
 * waiting on the steady clock as the words do; nought elsewhere. What a column shows is kept until
 * it has gone, wait and all.
 *
 * Past that they go on waiting until the lines have taken the new width (`panesWait`). The lead was
 * all they waited for until 8 November 2026, and it takes neither JavaScript nor a layout, where the
 * lines take both: with JavaScript busy, a column came in over the bubbles and they took their new
 * shapes under it later (Arjun's iPad: "the column sometimes overlaps the bubbles, and then bubbles
 * resize later, which looks off").
 */
export const PaneLead = createContext(0);

/**
 * Says whether a room's lines have yet to take the new width the panes beside them are moving for:
 * written from the commit that says so, and the panes set off from the one that draws the lines at
 * that width.
 */
export function panesWait(waiting: boolean): void {
  setLinesWaiting(waiting);
}

/** How long panes asked to move have, at most, before they have got there. */
function moveOf(lead: number): number {
  return lead === 0 ? DURATION : lead + PANES_HOLD.most + DURATION;
}

/**
 * A length the panes move, on the UI thread: to `to` from wherever it stood, once their lead is past
 * (`PaneLead`). Its first it takes at once, and so does any while `still`.
 *
 * It moves when it changes, and at no other time. A width is a layout, so each frame of a move is a
 * commit of the whole tree, and the moves were started by a style that ran again for anything it
 * depended on: every box took its first length at once and then, a render later, set off from there
 * to there, for 0.72 s. Each room opened beside the list has two or three of these boxes, so
 * changing rooms was some forty commits of nothing, each laying out and walking every list on the
 * screen, across the room's first rows (the iPad simulator, 8 November 2026).
 */
function usePaneLength(to: number, still: boolean): SharedValue<number> {
  const lead = useContext(PaneLead);
  const length = useSharedValue(to);
  const stood = useRef(to);
  useEffect(() => {
    if (stood.current === to) return;
    stood.current = to;
    if (still) length.value = to;
    else if (lead === 0) length.value = withTiming(to, { duration: DURATION, easing: EASE });
    else
      length.value = withSteadyTiming(to, {
        ms: DURATION,
        ease: EASED,
        wait: lead,
        hold: PANES_HOLD,
      });
  }, [to, still, lead, length]);
  return length;
}

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
  const length = usePaneLength(width, still);
  const sized = useAnimatedStyle(() => ({ width: length.value }));
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
  const length = usePaneLength(left, false);
  const padded = useAnimatedStyle(() => ({ paddingLeft: length.value }));
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
    const timer = setTimeout(() => setKept(undefined), moveOf(lead));
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
    const timer = setTimeout(() => setGone(true), moveOf(lead));
    return () => clearTimeout(timer);
  }, [hidden, lead]);
  return hidden && gone;
}
