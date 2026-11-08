/**
 * What moves on the ask screen (ADR 0280): the pass of light down the command as it opens, the
 * words Always would remember lighting up gold one after another, the hour's strip filling from
 * now to its end, what a choice lets through folding in under it, and Approve turning to a tick.
 *
 * Each is a transform, an opacity or a colour on the UI thread, so nothing is laid out again as it
 * moves; a person who asked for less motion gets each where it ends, at once.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * stands plain views in for it, each drawn as it ends up, and a lit word says so by its testID.
 */

import { type ReactNode, useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { alpha } from "../ui/glassDial";
import { useReduceMotion } from "../ui/useReduceMotion";

/** The mock's ease out, `cubic-bezier(.2, .8, .2, 1)`. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** A word lighting up, and how far behind the one above it the next one starts. */
const LIGHT_MS = 350;
const STAGGER_MS = 70;
/** How strong the gold rim round a lit word is: the mock's 55%. */
const RIM = 0.55;

/** The pass of light: how long it takes down the plate, after the screen has slid in. */
const SWEEP_MS = 1100;
const SWEEP_AFTER_MS = 280;
/** The band's height, as a share of the plate's. */
const BAND = 0.4;

/** The strip filling from now to the end of the hour. */
const FILL_MS = 700;

/** Approve turning to a tick: the word goes up and out, the tick comes up in, and draws itself. */
const ANSWER_SPRING = { stiffness: 260, damping: 22, mass: 1 } as const;
const RISE = 18;
const TICK_LENGTH = 24;
const TICK_MS = 450;
const TICK_AFTER_MS = 150;

/**
 * A run of the words a standing yes remembers (`cd`, `git log`): bold in ink, and under Always
 * gold, in their place in the command, the `order`th one after the plate's first.
 */
export function LitWords({
  text,
  lit,
  order,
  style,
  ink,
  litInk,
  ground,
  rim,
  testID,
}: {
  readonly text: string;
  readonly lit: boolean;
  readonly order: number;
  readonly style: StyleProp<TextStyle>;
  readonly ink: string;
  readonly litInk: string;
  readonly ground: string;
  readonly rim: string;
  readonly testID?: string | undefined;
}) {
  const still = useReduceMotion();
  const on = useSharedValue(lit ? 1 : 0);
  useEffect(() => {
    const to = lit ? 1 : 0;
    if (still) on.value = to;
    // Down the plate as they light; all at once as they go out, since nothing is being read then.
    else if (lit) {
      on.value = withDelay(order * STAGGER_MS, withTiming(1, { duration: LIGHT_MS, easing: EASE }));
    } else on.value = withTiming(0, { duration: LIGHT_MS / 2, easing: EASE });
  }, [lit, order, still, on]);
  const off = alpha(ground, 0);
  const onRim = alpha(rim, RIM);
  const offRim = alpha(rim, 0);
  const behind = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [off, ground]),
    borderColor: interpolateColor(on.value, [0, 1], [offRim, onRim]),
  }));
  const words = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [ink, litInk]),
  }));
  return (
    <Animated.View style={[styles.lit, behind]} testID={testID}>
      <Animated.Text style={[style, words]}>{text}</Animated.Text>
    </Animated.View>
  );
}

/** The pass of light down the plate as the screen opens, once. */
export function Sweep({ color, strength }: { readonly color: string; readonly strength: number }) {
  const still = useReduceMotion();
  const [height, setHeight] = useState(0);
  const at = useSharedValue(0);
  useEffect(() => {
    if (still || height === 0) return;
    at.value = withDelay(SWEEP_AFTER_MS, withTiming(1, { duration: SWEEP_MS, easing: EASE }));
  }, [height, still, at]);
  const band = useAnimatedStyle(() => ({
    opacity: interpolate(at.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(at.value, [0, 1], [-BAND * height, height]) }],
  }));
  if (still) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height)}
    >
      {height === 0 ? null : (
        <Animated.View style={[styles.band, { height: BAND * height }, band]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="plate-sweep" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0} />
                <Stop offset="0.5" stopColor={color} stopOpacity={strength} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#plate-sweep)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/** The hour, filling its strip from now to its end as For an hour is picked. */
export function StripFill({ style }: { readonly style: StyleProp<ViewStyle> }) {
  const still = useReduceMotion();
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = still ? 1 : withTiming(1, { duration: FILL_MS, easing: EASE });
  }, [still, fill]);
  const grown = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  return <Animated.View style={[style, styles.fromLeft, grown]} />;
}

/** What a choice lets through, folding in under it as it is picked and out as another is. */
export function Fold({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(220).delay(60)}
      exiting={FadeOut.duration(120)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Approve's face: its word, and once it is pressed a tick and what was given (`Until 12:09 AM`),
 * on green. The press itself is the caller's.
 */
export function AnswerFace({
  answered,
  word,
  done,
  ground,
  answeredGround,
  ink,
  answeredInk,
  style,
  wordStyle,
}: {
  readonly answered: boolean;
  readonly word: string;
  readonly done: string;
  readonly ground: string;
  readonly answeredGround: string;
  readonly ink: string;
  readonly answeredInk: string;
  readonly style: StyleProp<ViewStyle>;
  readonly wordStyle: StyleProp<TextStyle>;
}) {
  const still = useReduceMotion();
  const at = useSharedValue(answered ? 1 : 0);
  const drawn = useSharedValue(answered ? 1 : 0);
  useEffect(() => {
    const to = answered ? 1 : 0;
    at.value = still ? to : withSpring(to, ANSWER_SPRING);
    drawn.value =
      still || !answered
        ? to
        : withDelay(TICK_AFTER_MS, withTiming(1, { duration: TICK_MS, easing: EASE }));
  }, [answered, still, at, drawn]);
  const face = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      Math.min(1, Math.max(0, at.value)),
      [0, 1],
      [ground, answeredGround],
    ),
  }));
  const leaving = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, at.value),
    transform: [{ translateY: -RISE * at.value }],
  }));
  const arriving = useAnimatedStyle(() => ({
    opacity: Math.min(1, at.value),
    transform: [{ translateY: RISE * (1 - at.value) }],
  }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: TICK_LENGTH * (1 - drawn.value) }));
  return (
    <Animated.View style={[style, face]}>
      <Animated.View style={[styles.layer, leaving]}>
        <Animated.Text style={[wordStyle, { color: ink }]} numberOfLines={1}>
          {word}
        </Animated.Text>
      </Animated.View>
      <Animated.View style={[styles.layer, styles.over, arriving]}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <AnimatedPath
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke={answeredInk}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={TICK_LENGTH}
            animatedProps={tick}
          />
        </Svg>
        <Animated.Text style={[wordStyle, { color: answeredInk }]} numberOfLines={1}>
          {done}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lit: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 2, marginHorizontal: -3 },
  band: { position: "absolute", left: 0, right: 0, top: 0 },
  fromLeft: { transformOrigin: "left" },
  layer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  over: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
});
