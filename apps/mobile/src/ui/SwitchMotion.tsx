/**
 * How Spaces moves while the workspace in front changes (ADR 0197's addendum, his "A · hold, then
 * the rows rise", 19 October 2026). The one drawn stays, dimmed, while the next reads its cache
 * (`Settling`), its name already the next one's with a gold line sweeping under it (`Sweep`). Once
 * the next takes over, its rows rise into place a beat apart (`RiseIn`), on the wave Search's
 * results arrive on (ADR 0189): a fade on core's Bézier, a rise on UIKit's spring, the second row a
 * beat after the first. A workspace's rows rise a little further than a result does, since a whole
 * screen is arriving rather than a line of it.
 *
 * With Reduce Motion nothing travels or sweeps: rows fade up where they stand, and the line is still.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * draws these as what they hold.
 */

import { arrivalDelay, SEARCH_ARRIVAL } from "@chipschat/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type LayoutAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { fade, spring, fadeMs, staggered } = SEARCH_ARRIVAL;
const FADE = Easing.bezier(fade[0], fade[1], fade[2], fade[3]);
const SPRING = { stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass };

/** How far under its place a row of the workspace taking over starts. */
const RISE = 18;
/** How strong the workspace being replaced is drawn while the next reads its cache. */
const DIMMED = 0.3;
/** How long it takes to dim, and the line to come: soon enough to answer the tap, not a flash. */
const DIM_MS = 220;
/** One pass of the line's bar, from off its left end to off its right. */
const SWEEP_MS = 900;
/** The bar's share of the line. */
const BAR = 0.3;

/**
 * A row of the workspace that has just taken over: up from under its place on the spring, fading
 * up, a beat after the row above it, as it is mounted. Rows past the wave's length rise with its
 * last.
 *
 * An entering animation, so that what React holds for the row is where it rests. It was an animated
 * style first, whose first value React kept as the row's own: none of it, 18 points down. Anything
 * that drew the row again from React's props put it back there for good, though the rise had ended,
 * and the sheet opened over a workspace just switched to did, row by row (Arjun's iPhone, 19 October
 * 2026: "space tab is rendering blank"; the simulator, rows risen to 1 and drawn at 0).
 */
export function RiseIn({
  order,
  children,
}: {
  readonly order: number;
  readonly children: ReactNode;
}) {
  const less = useReducedMotion();
  const entering = useRef(
    riseFrom(arrivalDelay(Math.min(order, staggered - 1)), less ? 0 : RISE),
  ).current;
  return <Animated.View entering={entering}>{children}</Animated.View>;
}

/** The rise from `by` points under its place, `delay` after the wave starts. */
function riseFrom(delay: number, by: number): () => LayoutAnimation {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: by }] },
      animations: {
        // A fade is no travel: it fades with Reduce Motion too.
        opacity: withDelay(
          delay,
          withTiming(1, { duration: fadeMs, easing: FADE, reduceMotion: ReduceMotion.Never }),
        ),
        transform: [{ translateY: by === 0 ? 0 : withDelay(delay, withSpring(0, SPRING)) }],
      },
    };
  };
}

/**
 * What the workspace being replaced shows, dimmed while `busy` and out of reach of a tap; back to
 * full strength if the switch is given up before the next was ready.
 */
export function Settling({
  busy,
  style,
  children,
}: {
  readonly busy: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const strength = useSharedValue(1);
  useEffect(() => {
    strength.value = withTiming(busy ? DIMMED : 1, {
      duration: DIM_MS,
      easing: FADE,
      reduceMotion: ReduceMotion.Never,
    });
  }, [busy, strength]);
  const dimmed = useAnimatedStyle(() => ({ opacity: strength.value }));
  return (
    <Animated.View pointerEvents={busy ? "none" : "auto"} style={[style, dimmed]}>
      {children}
    </Animated.View>
  );
}

/**
 * The line under the name of a workspace on its way: a gold bar sweeping across a faint track,
 * round and round, until that workspace takes over and the screen it is drawn on goes.
 */
export function Sweep({
  color,
  track,
  style,
  testID,
}: {
  readonly color: string;
  readonly track: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
}) {
  const less = useReducedMotion();
  const [width, setWidth] = useState(0);
  const shown = useSharedValue(0);
  const at = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, {
      duration: DIM_MS,
      easing: FADE,
      reduceMotion: ReduceMotion.Never,
    });
  }, [shown]);
  useEffect(() => {
    if (less || width === 0) return;
    at.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(at);
    };
  }, [less, width, at]);
  const coming = useAnimatedStyle(() => ({ opacity: shown.value }));
  const moving = useAnimatedStyle(
    () => ({ transform: [{ translateX: -width * BAR + at.value * width * (1 + BAR) }] }),
    [width],
  );
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: track }, style, coming]}
    >
      <Animated.View
        style={[
          styles.bar,
          { backgroundColor: color, width: less ? width : width * BAR },
          less ? null : moving,
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  bar: { height: 3, borderRadius: 2 },
});
