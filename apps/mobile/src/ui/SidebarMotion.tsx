/**
 * How the iPad's tabs move between the capsule and the sidebar (ADR 0276), on Reanimated: the glass
 * grows up out of the capsule into the sidebar and back, each tab's mark travels from its place in
 * the capsule to its row and back, a few frames after the one before it, and the names, the pinned
 * spaces and the workspaces fade in once there is room for them and out before there is not. One
 * timing for all of it, iOS's own ease out with no bounce, so it reads as one move.
 *
 * Kept apart from `Sidebar.tsx` because Reanimated cannot be loaded under Jest here: `jest.setup.js`
 * stands each of these in with a plain view at its frame, which is what a test reads.
 */

import { type ReactNode, useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, withDelay, withTiming } from "react-native-reanimated";

/**
 * 0.52 s on iOS's ease out, no bounce: the mock's (3 November 2026). The panes beside the list move
 * on it too (`PaneMotion.tsx`).
 */
export const DURATION = 520;
export const EASE = Easing.bezier(0.32, 0.72, 0, 1);

/** Where a moving view stands: its left and top, and its size where that changes too. */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/**
 * A view that goes to its frame from wherever it stood. Its first frame it takes at once: a window
 * that opens on the capsule does not grow one.
 */
export function Moving({
  frame,
  delay = 0,
  style,
  pointerEvents,
  testID,
  children,
}: {
  readonly frame: Frame;
  /** How long after the rest it sets off: the tabs' marks leave one after another. */
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  readonly testID?: string | undefined;
  readonly children?: ReactNode;
}) {
  const still = useFirst();
  const { left, top, width, height } = frame;
  const moving = useAnimatedStyle(() => {
    const to = (value: number) =>
      still ? value : withDelay(delay, withTiming(value, { duration: DURATION, easing: EASE }));
    return {
      left: to(left),
      top: to(top),
      ...(width === undefined ? {} : { width: to(width) }),
      ...(height === undefined ? {} : { height: to(height) }),
    };
  }, [left, top, width, height, delay, still]);
  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[{ position: "absolute" }, style, moving]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

/**
 * What fades as the sidebar opens and shuts: a tab's name, the pinned spaces, the line in the
 * capsule. It comes in late, once the glass has grown round it, and goes at once, before the glass
 * shrinks over it.
 */
export function Fading({
  shown,
  after = 0,
  style,
  pointerEvents,
  children,
}: {
  readonly shown: boolean;
  /** How long after the move begins it comes in. */
  readonly after?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  readonly children?: ReactNode;
}) {
  const still = useFirst();
  const fading = useAnimatedStyle(() => {
    if (still) return { opacity: shown ? 1 : 0 };
    return {
      opacity: shown
        ? withDelay(after, withTiming(1, { duration: 200 }))
        : withTiming(0, { duration: 120 }),
    };
  }, [shown, after, still]);
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, fading]}>
      {children}
    </Animated.View>
  );
}

/** True on the first drawing only. */
function useFirst(): boolean {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return first.current;
}
