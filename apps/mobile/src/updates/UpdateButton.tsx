/**
 * About's Update button (ADR 0296, addendum of 17 November 2026): a gold capsule, solid for this
 * app and soft for the computer, that glows on the update dot's breath for as long as it shows.
 *
 * When the dot was tapped, the button is drawn at the dot's size and unseen while the dot flies
 * to it (`DotFlight`), says where it stands if it is the first (`order` 0), and grows out of the
 * dot as it lands; one under it grows a beat later, a light passes over each once, and then they
 * glow (`updateButtonTimes`). Opened any other way, About shows it at rest, glowing. With Reduce
 * Motion it neither grows nor breathes, and keeps a still glow. React Native's `Animated` on the
 * native driver, as the dot's is.
 */

import { UPDATE_MOTION, updateButtonTimes } from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { usePalette } from "../ui/theme";
import { ON_GOLD, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { flights, useDotFlight } from "./flight";

const bezier = (curve: readonly [number, number, number, number]) => Easing.bezier(...curve);
/** How long the glow takes to come up the first time. */
const GLOW_IN_MS = 600;

export function UpdateButton({
  label,
  onPress,
  soft = false,
  order = 0,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly soft?: boolean;
  /** Where it stands among About's update buttons: 0 for the first, which the dot flies to. */
  readonly order?: number;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const flight = useDotFlight();
  // Drawn while the dot is on its way: it waits at the dot's size, unseen, to grow out of it.
  const [seeded] = useState(() => flight.stage === "up");
  const grow = useRef(new Animated.Value(seeded ? 0 : 1)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const lit = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const at = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const playing = useRef<Animated.CompositeAnimation | undefined>(undefined);

  // The first button says where it stands, so the dot can fly to it: once laid out, or when the
  // dot is tapped while About already shows it.
  const aim = useCallback(() => {
    const now = flights.now();
    if (order !== 0 || now.stage !== "up") return;
    at.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) flights.aim(now.id, { x: x + width / 2, y: y + height / 2 });
    });
  }, [order]);
  useEffect(() => {
    if (flight.stage === "up") aim();
  }, [flight.stage, aim]);
  const laidOut = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
    aim();
  };

  // What it does once: grow out of the dot as it lands (or at once if it missed), then the light,
  // then the glow; at rest, only the glow.
  const ended = flight.stage === "landed" || flight.stage === "missed" || flight.stage === "rest";
  const landed = flight.stage === "landed";
  useEffect(() => {
    if (still) {
      playing.current?.stop();
      playing.current = undefined;
      grow.setValue(1);
      lit.setValue(1);
      breathe.setValue(0.5);
      return;
    }
    if (playing.current !== undefined) return;
    if (seeded && !ended) return;
    playing.current = arrival(scheduleOf(seeded, landed, order), { grow, sweep, lit, breathe });
    playing.current.start();
  }, [still, seeded, ended, landed, order, grow, lit, breathe, sweep]);
  useEffect(() => () => playing.current?.stop(), []);

  // The glow is the shadow of a gold capsule behind the button that swells to a hair past its edge
  // at the top of each breath (the web's spread, which a shadow here hasn't), so it reads as light,
  // not a band.
  const halo = {
    opacity: Animated.multiply(
      lit,
      breathe.interpolate({ inputRange: [0, 1], outputRange: soft ? [0.28, 0.7] : [0.4, 1] }),
    ),
    transform: [
      { scaleX: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.03] }) },
      { scaleY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.08] }) },
    ],
  };
  const body = {
    opacity: grow.interpolate({ inputRange: [0, 0.2], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [
      {
        scale: grow.interpolate({ inputRange: [0, 1], outputRange: [UPDATE_MOTION.seedScale, 1] }),
      },
    ],
  };
  const words = {
    opacity: grow.interpolate({
      inputRange: [0.45, 0.9],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
  };
  const band = {
    transform: [
      {
        translateX: sweep.interpolate({
          inputRange: [0, 1],
          outputRange: [-1.2 * size.width, 1.2 * size.width],
        }),
      },
    ],
  };
  return (
    <View ref={at} style={styles.wrap} onLayout={laidOut} collapsable={false}>
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: palette.gold, shadowColor: palette.gold }, halo]}
        testID={testID === undefined ? undefined : `${testID}-glow`}
      />
      <Animated.View style={body} testID={testID === undefined ? undefined : `${testID}-body`}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={testID}
          style={({ pressed }) => [
            styles.capsule,
            { backgroundColor: soft ? palette.goldSoft : palette.gold, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {size.width > 0 && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, band]}>
              <Svg width={size.width} height={size.height}>
                <Defs>
                  <LinearGradient
                    id={soft ? "update-sweep-soft" : "update-sweep"}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0.27"
                  >
                    <Stop offset="0.25" stopColor="#fff" stopOpacity={0} />
                    <Stop offset="0.5" stopColor="#fff" stopOpacity={soft ? 0.6 : 0.75} />
                    <Stop offset="0.75" stopColor="#fff" stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect
                  width={size.width}
                  height={size.height}
                  fill={soft ? "url(#update-sweep-soft)" : "url(#update-sweep)"}
                />
              </Svg>
            </Animated.View>
          )}
          <Animated.Text
            style={[styles.label, { color: soft ? palette.goldDeep : ON_GOLD }, words]}
          >
            {label}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** When, from the dot landing (or About opening), a button grows, has its light and glows. */
interface Schedule {
  readonly growAt: number | undefined;
  readonly sweepAt: number | undefined;
  readonly glowAt: number;
}

/**
 * Grown out of a dot that landed: core's times. Out of one that missed: at once, with no light.
 * Drawn at rest: nothing but the glow, from the start.
 */
function scheduleOf(seeded: boolean, landed: boolean, order: number): Schedule {
  if (!seeded) return { growAt: undefined, sweepAt: undefined, glowAt: 0 };
  if (landed) return updateButtonTimes(order);
  return { growAt: 0, sweepAt: undefined, glowAt: UPDATE_MOTION.growMs };
}

const after = (ms: number, motion: Animated.CompositeAnimation) =>
  Animated.sequence([Animated.delay(ms), motion]);

/** The button's arrival on the native driver: its grow and light where it has them, then the glow, for good. */
function arrival(
  at: Schedule,
  values: {
    readonly grow: Animated.Value;
    readonly sweep: Animated.Value;
    readonly lit: Animated.Value;
    readonly breathe: Animated.Value;
  },
): Animated.CompositeAnimation {
  const timing = (
    value: Animated.Value,
    duration: number,
    easing: (t: number) => number,
    toValue = 1,
  ) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
  const swell = (to: number) =>
    timing(values.breathe, UPDATE_MOTION.breatheMs / 2, Easing.inOut(Easing.sin), to);
  const parts = [
    after(
      at.glowAt,
      Animated.parallel([
        timing(values.lit, GLOW_IN_MS, Easing.out(Easing.cubic)),
        Animated.loop(Animated.sequence([swell(1), swell(0)])),
      ]),
    ),
  ];
  if (at.growAt !== undefined) {
    parts.push(
      after(at.growAt, timing(values.grow, UPDATE_MOTION.growMs, bezier(UPDATE_MOTION.grow))),
    );
  }
  if (at.sweepAt !== undefined) {
    parts.push(
      after(at.sweepAt, timing(values.sweep, UPDATE_MOTION.sweepMs, bezier(UPDATE_MOTION.ease))),
    );
  }
  return Animated.parallel(parts);
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center", alignItems: "center" },
  glow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  capsule: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, overflow: "hidden" },
  label: { fontSize: TEXT.sm, fontWeight: "600" },
});
