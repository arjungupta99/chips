/**
 * How the panes beside an iPad's list move (ADR 0276), on Reanimated, on the sidebar's timing
 * (`SidebarMotion.tsx`): a third column grows in at the window's right as the page beside it
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

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { DURATION, EASE } from "./SidebarMotion";

/**
 * A box whose width goes to `width` from wherever it stood. Its first width it takes at once, and
 * so does any width while `still`: a window that has turned is laid out at its new size once, as
 * UIKit turns it, not grown into it.
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
  const sized = useAnimatedStyle(
    () => ({ width: at ? width : withTiming(width, { duration: DURATION, easing: EASE }) }),
    [width, at],
  );
  return (
    <Animated.View style={[style, sized]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/**
 * What a column shows, kept while its box shrinks away once it is no longer asked for, so it slides
 * out rather than vanishing; then nothing.
 */
export function useKept<T>(value: T | undefined): T | undefined {
  const [kept, setKept] = useState(value);
  const last = useRef(value);
  if (value !== undefined) last.current = value;
  useEffect(() => {
    if (value !== undefined) {
      setKept(value);
      return;
    }
    const timer = setTimeout(() => setKept(undefined), DURATION);
    return () => clearTimeout(timer);
  }, [value]);
  return value ?? (kept === undefined ? undefined : last.current);
}

/** True on the first drawing only. */
function useFirst(): boolean {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return first.current;
}
