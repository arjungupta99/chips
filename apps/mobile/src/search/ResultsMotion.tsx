/**
 * How Search's results come and go on the phone (ADR 0189): core's `searchArrivals` says which
 * rows have just arrived and where each stands in the wave; this moves them, on the UI thread, with
 * Reanimated's layout animations, so a busy JavaScript thread can neither start them late nor stall
 * them, and nothing is rendered per frame.
 *
 * - **A row that arrives** (`Arriving` with an `order`) fades up and rises `rise` points into its
 *   place, a beat after the row above it.
 * - **A row that stays** is moved by its cell (`MovingList`'s `itemLayoutAnimation`) from where it
 *   was drawn to where it now stands, when rows above it come or go.
 * - **A row that goes** fades where it stands while the rows round it close over it, from as
 *   strong as it is drawn: one typed away while it was still fading up does not flash whole first.
 *   Reanimated tells an exit where a view stands but not how strong it is drawn, so a row arrives on
 *   values of its own (`Rising`), which its exit reads.
 * - **A row stands on the page's own ground** while results are listed (`ground`), so a row sliding
 *   down to make room covers the row arriving there and uncovers it as it goes, and a row closing
 *   up covers the one fading where it stood: a later row is drawn over an earlier one. With clear
 *   rows the two were drawn through each other for a tenth of a second (the simulator, 17 October
 *   2026). The recent searches stay clear, over the backdrop's faces (ADR 0136).
 * - **A ghost row** breathes while the messages it stands for are on their way (`Breathing`).
 *
 * A rise and a move are on core's spring, UIKit's own; a fade is a timing on core's Bézier, which
 * lands with no speed left. Reanimated never draws the frame an animation finishes in (ADR 0075),
 * and the frame before the last of either is a hair short of the mark, which no eye sees. With
 * Reduce Motion nothing travels: what comes fades up where it stands, what stays jumps to its
 * place, and the ghosts are still. Reanimated's own answer is read for it (`useReducedMotion`),
 * which it has before the first frame; the app's hook answers a moment later, and a row would
 * already have risen.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * draws the list as a plain list and the rows as they are.
 */

import { arrivalDelay, SEARCH_ARRIVAL } from "@chipschat/core";
import { type ReactNode, type Ref, useEffect, useMemo, useState } from "react";
import type { FlatList, FlatListProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type EntryExitAnimationFunction,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { fade, spring, fadeMs, rise, leaveMs, breathMs, breathLow } = SEARCH_ARRIVAL;
const FADE = Easing.bezier(fade[0], fade[1], fade[2], fade[3]);
const BREATH = Easing.inOut(Easing.sin);
const SPRING = { stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass };

/** How a row that stays goes to its new place. */
const MOVES = LinearTransition.springify()
  .stiffness(spring.stiffness)
  .damping(spring.damping)
  .mass(spring.mass);
/** How a row that goes fades where it stood. */
const LEAVES = FadeOut.duration(leaveMs).easing(FADE).reduceMotion(ReduceMotion.Never);

/**
 * Search's list: a list whose rows are moved by their cells as rows above them come or go. Nothing
 * arrives as the list is first drawn, and nothing fades as it goes with the screen.
 */
export function MovingList<T>(props: FlatListProps<T> & { readonly ref?: Ref<FlatList<T>> }) {
  const less = useReducedMotion();
  return (
    <Animated.FlatList
      {...(props as Omit<FlatListProps<unknown>, "CellRendererComponent">)}
      ref={props.ref as Ref<FlatList<unknown>>}
      {...(less ? {} : { itemLayoutAnimation: MOVES })}
      skipEnteringExitingAnimations
    />
  );
}

interface RowProps {
  /** The page's colour, under a result; nothing, over the backdrop. */
  readonly ground: string | undefined;
  readonly children: ReactNode;
}

/**
 * A row of the results: in on the wave when it has just arrived (`order`, from core's
 * `searchArrivals`), simply there when it was already listed, and faded where it stands as it goes.
 * Which it is is decided as the row is first drawn: on the next change it is no longer arriving, and
 * it keeps the view it has.
 */
export function Arriving({ order, ...row }: RowProps & { readonly order: number | undefined }) {
  const [arrived] = useState(order);
  return arrived === undefined ? <Listed {...row} /> : <Rising order={arrived} {...row} />;
}

function groundOf(ground: string | undefined) {
  return ground === undefined ? undefined : { backgroundColor: ground };
}

/** A row that was listed already: there, and faded where it stands as it goes. */
function Listed({ ground, children }: RowProps) {
  return (
    <Animated.View exiting={LEAVES} style={groundOf(ground)}>
      {children}
    </Animated.View>
  );
}

/**
 * A row in place `order` of the wave: up from `rise` under its place on the spring, fading up, a
 * beat after the row above it; gone before it is all there, it fades from as far as it had come.
 */
function Rising({ order, ground, children }: RowProps & { readonly order: number }) {
  const less = useReducedMotion();
  const shown = useSharedValue(0);
  const lift = useSharedValue(less ? 0 : rise);
  useEffect(() => {
    const delay = arrivalDelay(order);
    // A fade is no travel: it fades with Reduce Motion too.
    const fading = { duration: fadeMs, easing: FADE, reduceMotion: ReduceMotion.Never };
    shown.value = withDelay(delay, withTiming(1, fading));
    if (!less) lift.value = withDelay(delay, withSpring(0, SPRING));
    return () => {
      cancelAnimation(lift);
    };
  }, [order, less, shown, lift]);
  const arriving = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: lift.value }],
  }));
  const exiting = useMemo(() => leavingFrom(shown), [shown]);
  return (
    <Animated.View exiting={exiting} style={[groundOf(ground), arriving]}>
      {children}
    </Animated.View>
  );
}

/** How a row still arriving goes: faded from as strong as it is drawn, in its share of the time. */
function leavingFrom(shown: SharedValue<number>): EntryExitAnimationFunction {
  return () => {
    "worklet";
    const from = shown.value;
    return {
      initialValues: { opacity: from },
      animations: {
        opacity: withTiming(0, {
          duration: Math.max(1, leaveMs * from),
          easing: FADE,
          reduceMotion: ReduceMotion.Never,
        }),
      },
    };
  };
}

/**
 * What breathes while it waits: a ghost row's face and lines, dimming to `breathLow` and back, round
 * and round, `lag` after the ghost above it, so the two breathe in turn. Still with Reduce Motion.
 */
export function Breathing({
  lag,
  style,
  children,
}: {
  readonly lag: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const less = useReducedMotion();
  const strength = useSharedValue(1);
  useEffect(() => {
    if (less) return;
    const half = { duration: breathMs / 2, easing: BREATH };
    strength.value = withDelay(
      lag,
      withRepeat(withSequence(withTiming(breathLow, half), withTiming(1, half)), -1),
    );
    return () => {
      cancelAnimation(strength);
      strength.value = 1;
    };
  }, [less, lag, strength]);
  const breath = useAnimatedStyle(() => ({ opacity: strength.value }));
  return <Animated.View style={[style, breath]}>{children}</Animated.View>;
}
