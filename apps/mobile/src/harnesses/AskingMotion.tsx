/**
 * What moves in When it asks you (ADR 0195): the ask travelling from the harness to whoever its
 * asks go to, the promises' marks, and the dots popping in. Each is on the UI thread, one loop for
 * the flight and one for the marks; with Reduce Motion the ask rests halfway and nothing moves.
 *
 * Apart from the section (`Asking.tsx`) so the section's words and its list can be rendered under
 * Jest, where Reanimated cannot be required: `jest.setup.js` stands in for this file with plain
 * views that keep its test ids. That they move is the simulator's to show.
 */

import type { AskDot, AskingPromise } from "@chipschat/core";
import { useEffect, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Circle, Line, Path, Rect, Svg } from "react-native-svg";
import { Avatar } from "../ui/Avatar";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

/** One flight of the ask, there and back. */
const FLIGHT_MS = 5200;
/** One turn of the promises' marks. */
const MARKS_MS = 6000;
const ASK_WIDTH = 34;
/** How far short of the face the ask lands, so its ring has room. */
const LANDING_GAP = 10;

/** A clock from nought to one, again and again, on the UI thread; resting under Reduce Motion. */
function useLoop(ms: number, rest: number): SharedValue<number> {
  const still = useReduceMotion();
  const t = useSharedValue(still ? rest : 0);
  useEffect(() => {
    if (still) {
      t.value = rest;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
  }, [still, ms, rest, t]);
  return t;
}

/** Where the ask is along its flight: there by 38%, held, back by 86%, faded by 94%. */
const FLY_AT = [0, 0.08, 0.38, 0.46, 0.56, 0.86, 0.94, 1];
const FLY_X = [0, 0, 1, 1, 1, 0, 0, 0];

/**
 * The harness's face, the path, and the face of whoever its asks go to, with the ask between. On
 * You's Allowed always the left end is the workspace's harnesses, up to three faces overlapped.
 */
export function Hero({
  harness,
  also = [],
  label,
  person,
  personName,
  face,
}: {
  readonly harness: string;
  /** More harnesses behind the first, drawn smaller and overlapped. */
  readonly also?: readonly string[];
  /** Under the left end, when it is not the one harness's name. */
  readonly label?: string | undefined;
  /** Under the second face: `You`, or the owner's name. */
  readonly person: string;
  /** Whose face it is, for its initials. */
  readonly personName: string;
  readonly face: Parameters<typeof Avatar>[0]["icon"];
}) {
  const palette = usePalette();
  const t = useLoop(FLIGHT_MS, 0.42);
  const width = useSharedValue(0);
  const ask = useAnimatedStyle(() => {
    const far = Math.max(0, width.value - ASK_WIDTH - LANDING_GAP);
    return {
      opacity: interpolate(t.value, [0, 0.08, 0.86, 0.94, 1], [0, 1, 1, 0, 0]),
      borderColor: interpolateColor(t.value, [0.5, 0.56], [palette.amber, palette.green]),
      transform: [
        { translateX: interpolate(t.value, FLY_AT, FLY_X) * far },
        { scale: interpolate(t.value, [0, 0.08, 0.38, 0.46, 0.56, 1], [0.6, 1, 1, 0.92, 1, 1]) },
      ],
    };
  });
  const bars = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0.5, 0.56], [palette.amber, palette.green]),
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.36, 0.42, 0.6, 1], [0, 0, 1, 0, 0]),
    transform: [
      { scale: interpolate(t.value, [0, 0.36, 0.42, 0.6, 1], [0.85, 0.85, 1, 1.12, 1.12]) },
    ],
  }));
  const yes = useAnimatedStyle(() => {
    const shown = interpolate(t.value, [0, 0.48, 0.54, 0.84, 0.92, 1], [0, 0, 1, 1, 0, 0]);
    return { opacity: shown, transform: [{ scale: 0.4 + 0.6 * shown }] };
  });
  return (
    <View
      style={styles.hero}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="asking-hero"
    >
      <View style={[styles.end, also.length > 0 ? styles.wide : null]}>
        {also.length === 0 ? (
          <Avatar name={harness} kind="harness" size="lg" decorative />
        ) : (
          <View style={styles.stack}>
            {[harness, ...also].map((name, at) => (
              <View key={name} style={at === 0 ? null : styles.behind}>
                <Avatar name={name} kind="harness" size="md" decorative />
              </View>
            ))}
          </View>
        )}
        <Text style={[styles.endName, { color: palette.ink3 }]} numberOfLines={1}>
          {label ?? harness}
        </Text>
      </View>
      <View
        style={styles.path}
        onLayout={(event: LayoutChangeEvent) => {
          width.value = event.nativeEvent.layout.width;
        }}
      >
        <Svg style={StyleSheet.absoluteFill} height={48}>
          <Line
            x1="0"
            y1="24"
            x2="100%"
            y2="24"
            stroke={palette.line2}
            strokeWidth={2}
            strokeDasharray="2 4"
          />
        </Svg>
        <Animated.View style={[styles.ask, { backgroundColor: palette.surface }, ask]}>
          <Animated.View style={[styles.bar, bars]} />
          <Animated.View style={[styles.bar, styles.short, bars]} />
        </Animated.View>
      </View>
      <View style={styles.end}>
        <View>
          <Animated.View style={[styles.ring, { borderColor: palette.amber }, ring]} />
          <Avatar name={personName} kind="person" size="lg" icon={face} decorative />
          <Animated.View
            style={[
              styles.yes,
              { backgroundColor: palette.green, borderColor: palette.surface },
              yes,
            ]}
          >
            <Svg
              width={11}
              height={11}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth={3.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="m5 12.5 4.5 4.5L19 7.5" />
            </Svg>
          </Animated.View>
        </View>
        <Text style={[styles.endName, { color: palette.ink3 }]} numberOfLines={1}>
          {person}
        </Text>
      </View>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One loop for every promise's mark, so they move together. */
export function useMarks(): SharedValue<number> {
  return useLoop(MARKS_MS, 0.3);
}

/**
 * A promise's mark, the phone's own in the icon set's box and stroke: a hand that waves now and
 * then; a window whose tick draws itself; a clock whose hand turns.
 */
export function PromiseMark({
  id,
  ink,
  t,
}: {
  readonly id: AskingPromise["id"];
  readonly ink: string;
  readonly t: SharedValue<number>;
}) {
  const wave = useAnimatedStyle(() => ({
    transform: [
      { translateY: 8 },
      {
        rotate: `${interpolate(t.value, [0, 0.7, 0.74, 0.78, 0.82, 0.86, 1], [0, 0, -12, 9, -7, 0, 0])}deg`,
      },
      { translateY: -8 },
    ],
  }));
  const tick = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(t.value, [0, 0.2, 0.32, 0.88, 1], [12, 12, 0, 0, 12]),
  }));
  const hand = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 360}deg` }] }));
  const stroke = {
    fill: "none",
    stroke: ink,
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  if (id === "big") {
    return (
      <Animated.View style={wave}>
        <Svg width={20} height={20} viewBox="0 0 24 24" {...stroke}>
          <Path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-1V5a1.5 1.5 0 0 1 3 0v5m0 0V6a1.5 1.5 0 0 1 3 0v6m0-3.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.2L4.5 14.6a1.6 1.6 0 0 1 2.4-2.1L7 12.6" />
        </Svg>
      </Animated.View>
    );
  }
  if (id === "window") {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" {...stroke}>
        <Rect x={3} y={4.5} width={18} height={15} rx={3.5} />
        <Path d="M3 9h18" />
        <AnimatedPath d="m8.5 14.2 2.3 2.3 4.7-4.7" strokeDasharray="12" animatedProps={tick} />
      </Svg>
    );
  }
  return (
    <View>
      <Svg width={20} height={20} viewBox="0 0 24 24" {...stroke}>
        <Circle cx={12} cy={12} r={8.5} />
        <Path d="M12 12l3.2 1.9" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, hand]}>
        <Svg width={20} height={20} viewBox="0 0 24 24" {...stroke}>
          <Path d="M12 12V6.8" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** One dot per ask, popping in one after another as the section is first drawn. */
export function DotRow({ dots }: { readonly dots: readonly AskDot[] }) {
  const still = useReduceMotion();
  const [count] = useState(() => dots.length);
  const p = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    p.value = withTiming(1, { duration: 300 + count * 45, easing: Easing.out(Easing.quad) });
  }, [still, count, p]);
  return (
    <View style={styles.dots}>
      {dots.map((dot, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a dot's place is the ask's order.
        <Dot key={at} dot={dot} at={at} of={dots.length} p={p} />
      ))}
    </View>
  );
}

function Dot({
  dot,
  at,
  of,
  p,
}: {
  readonly dot: AskDot;
  readonly at: number;
  readonly of: number;
  readonly p: SharedValue<number>;
}) {
  const palette = usePalette();
  const style = useAnimatedStyle(() => {
    const from = at / (of + 6);
    const shown = interpolate(p.value, [from, from + 6 / (of + 6)], [0, 1], "clamp");
    return { opacity: shown, transform: [{ scale: shown }] };
  });
  const fill = {
    yes: { backgroundColor: palette.green },
    session: { borderWidth: 2.5, borderColor: palette.green },
    no: { backgroundColor: palette.red },
    open: { borderWidth: 2.5, borderColor: palette.amber },
    lapsed: { backgroundColor: palette.ink4 },
  }[dot];
  return <Animated.View style={[styles.dot, fill, style]} testID={`asking-dot-${dot}`} />;
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.xs,
    paddingVertical: SPACE.sm,
  },
  end: { width: 64, alignItems: "center", gap: SPACE.xs },
  wide: { width: 92 },
  stack: { flexDirection: "row", height: 58, alignItems: "center" },
  behind: { marginLeft: -14 },
  endName: { fontSize: TEXT.xs, fontWeight: "600" },
  path: { flex: 1, height: 48, justifyContent: "center" },
  ask: {
    position: "absolute",
    left: 0,
    width: ASK_WIDTH,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 6,
  },
  bar: { height: 2.5, borderRadius: 2 },
  short: { width: "60%" },
  ring: {
    position: "absolute",
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: 999,
    borderWidth: 2.5,
  },
  yes: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
