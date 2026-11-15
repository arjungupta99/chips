/**
 * About's Update button (ADR 0296): a gold capsule, solid for this app and soft for the computer.
 * Each time About comes into view with it showing (`ring` counts up), it sends out the dot's ring
 * twice, a glow that widens from behind it and fades, so the eye goes to what to press. `order`
 * starts each button a beat after the one above it. Still with Reduce Motion. React Native's
 * `Animated` on the native driver, as the chip's pins are (`ChipPulse`).
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "../ui/theme";
import { ON_GOLD, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

/** One ring's length, the wait before the first, and the beat between two buttons' rings. */
export const RING_MS = 1050;
export const RING_WAIT_MS = 280;
export const RING_BEAT_MS = 160;

export function UpdateButton({
  label,
  onPress,
  soft = false,
  ring,
  order = 0,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly soft?: boolean;
  /** Counts up each time About comes into view; each new count rings the button. */
  readonly ring: number;
  readonly order?: number;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const out = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still || ring === 0) return;
    const once = Animated.sequence([
      Animated.timing(out, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.timing(out, {
        toValue: 1,
        duration: RING_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    const run = Animated.sequence([
      Animated.delay(RING_WAIT_MS + order * RING_BEAT_MS),
      once,
      once,
    ]);
    run.start();
    return () => run.stop();
  }, [ring, order, still, out]);
  const glow = {
    opacity: out.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 0.6, 0] }),
    transform: [
      { scaleX: out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
      { scaleY: out.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) },
    ],
  };
  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: palette.gold }, glow]}
      />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        testID={testID}
        style={({ pressed }) => [
          styles.capsule,
          { backgroundColor: soft ? palette.goldSoft : palette.gold, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={[styles.label, { color: soft ? palette.goldDeep : ON_GOLD }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center", alignItems: "center" },
  glow: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 999 },
  capsule: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  label: { fontSize: TEXT.sm, fontWeight: "600" },
});
