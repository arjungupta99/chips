/**
 * How an iPad's bar moves (ADR 0276), on Reanimated: folding down to the tab in front over a narrow
 * room and opening out again, the glass shrinking round the tab in front and growing back, each
 * tab's mark travelling to its place a few frames after the one before it, and the tabs that go
 * fading out before the glass closes over them and in once it has grown round them. One timing for
 * all of it, iOS's own ease out with no bounce, so it reads as one move. Until 5 November 2026 it
 * also grew the sidebar up out of the capsule.
 *
 * Kept apart from `PadBar.tsx` because Reanimated cannot be loaded under Jest here: `jest.setup.js`
 * stands each of these in with a plain view at its frame, which is what a test reads.
 */

import { type ReactNode, useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { type SteadyHold, withSteadyTiming } from "./steadySpring";

/**
 * 0.52 s on iOS's ease out, no bounce: the mock's (3 November 2026). The panes beside the list move
 * on it too (`PaneMotion.tsx`).
 */
export const DURATION = 520;
export const EASE = Easing.bezier(0.32, 0.72, 0, 1);
/** The same curve, as a function a worklet can call: the steady clock's (`withSteadyTiming`). */
export const EASED = Easing.bezierFn(0.32, 0.72, 0, 1);
/**
 * What the panes and the bar go on waiting for once their lead is past: a room's lines to take their
 * new width (`useHeldWidth`, ADR 0279), which takes JavaScript and a layout where the lead takes
 * neither. Read on the UI thread, so one for the app rather than a value handed down a tree that
 * would be drawn again for it. Eight tenths of a second is well past any layout a room asks for:
 * nothing waits on the lines for ever.
 */
const linesWaiting = makeMutable(false);
export const PANES_HOLD: SteadyHold = {
  held: () => {
    "worklet";
    return linesWaiting.value;
  },
  most: 800,
};

/** Says whether a room's lines have yet to take their new width (`PANES_HOLD`). */
export function setLinesWaiting(waiting: boolean): void {
  linesWaiting.value = waiting;
}
/** How long the tabs that go take to fade, and those that come. */
const FADE_OUT = 120;
const FADE_IN = 200;
/** A fade's even pace, as a worklet can call it. */
const LINEAR = (share: number) => {
  "worklet";
  return share;
};

/** Where a moving view stands: its left and top, and its size where that changes too. */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/**
 * A view that goes to its frame from wherever it stood. Its first frame it takes at once: a window
 * that opens on the bar does not grow one.
 */
export function Moving({
  frame,
  delay = 0,
  wait = 0,
  style,
  pointerEvents,
  testID,
  children,
}: {
  readonly frame: Frame;
  /** How long after the rest it sets off: the tabs' marks move one after another. */
  readonly delay?: number;
  /**
   * How long the whole bar waits before it moves: the panes' lead, where it folds or opens out
   * because they move (`Foot.lead`), on the steady clock the panes wait on.
   */
  readonly wait?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  readonly testID?: string | undefined;
  readonly children?: ReactNode;
}) {
  const still = useFirst();
  const { left, top, width, height } = frame;
  // Held before its own delay, so the marks still set off one after another.
  const hold = { ...PANES_HOLD, at: wait };
  const moving = useAnimatedStyle(() => {
    const to = (value: number) => {
      if (still) return value;
      if (wait === 0) {
        return withDelay(delay, withTiming(value, { duration: DURATION, easing: EASE }));
      }
      return withSteadyTiming(value, { ms: DURATION, ease: EASED, wait: wait + delay, hold });
    };
    return {
      left: to(left),
      top: to(top),
      ...(width === undefined ? {} : { width: to(width) }),
      ...(height === undefined ? {} : { height: to(height) }),
    };
  }, [left, top, width, height, delay, wait, still]);
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
 * What fades as the bar folds and opens out: the tabs that are not in front. It comes in late, once
 * the glass has grown round it, and goes at once, before the glass shrinks over it.
 */
export function Fading({
  shown,
  after = 0,
  wait = 0,
  style,
  pointerEvents,
  children,
}: {
  readonly shown: boolean;
  /** How long after the move begins it comes in. */
  readonly after?: number;
  /** How long the bar waits before it moves (`Moving`'s `wait`). */
  readonly wait?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  readonly children?: ReactNode;
}) {
  const still = useFirst();
  const hold = { ...PANES_HOLD, at: wait };
  const fading = useAnimatedStyle(() => {
    if (still) return { opacity: shown ? 1 : 0 };
    if (wait > 0) {
      return {
        opacity: shown
          ? withSteadyTiming(1, { ms: FADE_IN, ease: LINEAR, wait: wait + after, hold })
          : withSteadyTiming(0, { ms: FADE_OUT, ease: LINEAR, wait, hold }),
      };
    }
    return {
      opacity: shown
        ? withDelay(after, withTiming(1, { duration: FADE_IN }))
        : withTiming(0, { duration: FADE_OUT }),
    };
  }, [shown, after, wait, still]);
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
