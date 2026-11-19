/**
 * The gold marks that say something is new (ADR 0227's addendum of 17 November 2026), drawn with
 * React Native's `Animated` on the native driver, as the segmented control's tile is:
 *
 * - `NewDot`, on a word's shoulder: 8 pt of gold in a rim of what it stands on. It comes in once
 *   what it is on has settled, with one gold ring going out, then holds still; it goes out at once.
 * - `CornerDot`, on a mark's corner, as Media's and Files' new files wear it: it pops in.
 * - `Rings`, round a capsule button: a gold ring goes out from its edge, as many times as asked.
 *
 * With Reduce Motion each is simply there or not, and no ring goes out.
 */

import { useEffect, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { usePalette } from "./theme";
import { useReduceMotion } from "./useReduceMotion";

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
/** A pop with a little give past its size, for a dot arriving. */
const POP = { stiffness: 420, damping: 17, mass: 1 } as const;
/** How long a ring takes to go out. */
const RING_MS = 1150;
/** How long a dot takes to go. */
const OUT_MS = 200;

/** The dot's gold, and the rim round it. */
const DOT = 8;
const RIM = 2;

/**
 * The dot on a word's shoulder: lit, it comes in after `waitMs` with one ring; unlit, it goes out.
 * Placed by the caller (`style`), absolutely, at the word's top right.
 */
export function NewDot({
  lit,
  rim,
  waitMs = 0,
  style,
  testID,
}: {
  readonly lit: boolean;
  /** What it stands on, drawn round it so it reads cut out of the word's ground. */
  readonly rim: string;
  readonly waitMs?: number;
  readonly style?: object;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const [size] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) {
      size.setValue(lit ? 1 : 0);
      ring.setValue(0);
      return;
    }
    if (!lit) {
      const out = Animated.timing(size, {
        toValue: 0,
        duration: OUT_MS,
        easing: EASE,
        useNativeDriver: true,
      });
      out.start();
      return () => out.stop();
    }
    ring.setValue(0);
    const arrive = Animated.sequence([
      Animated.delay(waitMs),
      Animated.parallel([
        Animated.spring(size, { toValue: 1, ...POP, useNativeDriver: true }),
        Animated.timing(ring, {
          toValue: 1,
          duration: RING_MS,
          easing: EASE,
          useNativeDriver: true,
        }),
      ]),
    ]);
    arrive.start();
    return () => arrive.stop();
  }, [lit, still, waitMs, size, ring]);
  return (
    <View pointerEvents="none" style={[styles.place, style]} testID={testID}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: palette.gold },
          {
            opacity: ring.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.95, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 3.6] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: palette.gold, borderColor: rim },
          {
            opacity: size.interpolate({
              inputRange: [0, 0.3],
              outputRange: [0, 1],
              extrapolate: "clamp",
            }),
            transform: [{ scale: size }],
          },
        ]}
      />
    </View>
  );
}

/** The gold dot on a mark's corner: it pops in after `waitMs`, and is gone when unlit. */
export function CornerDot({
  lit,
  rim,
  waitMs = 0,
  testID,
}: {
  readonly lit: boolean;
  readonly rim: string;
  readonly waitMs?: number;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const [size] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still || !lit) {
      size.setValue(lit ? 1 : 0);
      return;
    }
    const pop = Animated.sequence([
      Animated.delay(waitMs),
      Animated.spring(size, { toValue: 1, ...POP, useNativeDriver: true }),
    ]);
    pop.start();
    return () => pop.stop();
  }, [lit, still, waitMs, size]);
  if (!lit) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.corner,
        { backgroundColor: palette.gold, borderColor: rim, transform: [{ scale: size }] },
      ]}
      testID={testID}
    />
  );
}

/**
 * A gold ring going out from a capsule's edge `times` times, starting after `waitMs`: an even 13 pt
 * all round, so the capsule's own shape grows. Laid over the capsule, filling it.
 */
export function Rings({
  times,
  waitMs = 0,
  radius,
}: {
  readonly times: number;
  readonly waitMs?: number;
  readonly radius: number;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const [go] = useState(() => new Animated.Value(0));
  const [box, setBox] = useState({ width: 0, height: 0 });
  const playing = !still && times > 0 && box.width > 0;
  useEffect(() => {
    if (!playing) return;
    go.setValue(0);
    const once = Animated.timing(go, {
      toValue: 1,
      duration: 1050,
      easing: EASE,
      useNativeDriver: true,
    });
    const all = Animated.sequence([
      Animated.delay(waitMs),
      Animated.loop(once, { iterations: times, resetBeforeIteration: true }),
    ]);
    all.start();
    return () => all.stop();
  }, [playing, times, waitMs, go]);
  const laid = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((was) => (was.width === width && was.height === height ? was : { width, height }));
  };
  const spread = 13;
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={laid}
      style={[
        StyleSheet.absoluteFill,
        styles.rings,
        { borderRadius: radius, borderColor: palette.gold },
        playing
          ? {
              opacity: go.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.75, 0] }),
              transform: [
                {
                  scaleX: go.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, (box.width + spread * 2) / box.width],
                  }),
                },
                {
                  scaleY: go.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, (box.height + spread * 2) / Math.max(box.height, 1)],
                  }),
                },
              ],
            }
          : { opacity: 0 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  place: { position: "absolute", width: DOT + RIM * 2, height: DOT + RIM * 2 },
  dot: {
    width: DOT + RIM * 2,
    height: DOT + RIM * 2,
    borderRadius: (DOT + RIM * 2) / 2,
    borderWidth: RIM,
  },
  ring: {
    position: "absolute",
    top: RIM,
    left: RIM,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
  },
  corner: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  rings: { borderWidth: 2 },
});
