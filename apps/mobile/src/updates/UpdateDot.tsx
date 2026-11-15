/**
 * The update dot (ADR 0296): a gold dot at the top of the tabs, centred under the island, that says
 * an update waits and opens About.
 *
 * It drops in from the island with a spring and sends out one ring as it lands, then swells and
 * glows about every three seconds for as long as it is lit. With Reduce Motion it is simply there.
 * It is drawn over the four tabs from their layout, so a screen pushed over them, a room or About
 * itself, covers it. On a wide iPad it stands over the middle of the list's column, where the
 * tab's title is, rather than over the pane beside it. The dot is 10 points; the target is 44.
 * React Native's `Animated` on the native driver, as the chip's pins are (`ChipPulse`).
 */

import { DOT_LABEL } from "@chipschat/core";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useLayout } from "../ui/layout";
import { listWidth } from "../ui/Split";
import { usePalette } from "../ui/theme";
import { useReduceMotion } from "../ui/useReduceMotion";
import { useTabTop } from "../ui/windowInsets";
import { useUpdates } from "./updates";

export const DOT_SIZE = 10;
const TARGET = 44;
/** How far under the top of the safe area the dot's centre stands: between the island and the title. */
const BELOW_TOP = 6;
/** One swell and back. */
export const BREATHE_MS = 3400;
const RING_MS = 1150;

export function UpdateDot() {
  const { dot, ownerLit } = useUpdates();
  // A release, or for the owner a bridge or a night that needs them (ADR 0297).
  if (dot === undefined && !ownerLit) return null;
  return <Lit key={dot?.version ?? "needs"} />;
}

/**
 * The dot's motion: it lands with a spring and one ring, then swells and glows about every three
 * seconds. Still with Reduce Motion. `ringTo` is how far the ring spreads: in a row, no wider than
 * the glow, so it never reaches the chevron (ADR 0297).
 */
function useDotMotion(ringTo: number) {
  const still = useReduceMotion();
  const land = useRef(new Animated.Value(still ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) {
      land.setValue(1);
      return;
    }
    const swell = (to: number) =>
      Animated.timing(breathe, {
        toValue: to,
        duration: BREATHE_MS / 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    const run = Animated.parallel([
      Animated.spring(land, {
        toValue: 1,
        damping: 11,
        stiffness: 160,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(320),
        Animated.timing(ring, {
          toValue: 1,
          duration: RING_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(1200),
        Animated.loop(Animated.sequence([swell(1), swell(0)])),
      ]),
    ]);
    run.start();
    return () => run.stop();
  }, [still, land, ring, breathe]);

  const body = {
    opacity: land.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: land.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) },
      {
        scale: Animated.multiply(
          land.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.24] }),
        ),
      },
    ],
  };
  const halo = {
    opacity: Animated.multiply(
      land,
      breathe.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.58] }),
    ),
    transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1.7, 2.3] }) }],
  };
  const ringStyle = {
    opacity: ring.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 0.95, 0] }),
    transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, ringTo] }) }],
  };
  return { body, halo, ringStyle };
}

/** The ring, the glow and the dot, drawn over one another at the middle of their box. */
function DotMarks(props: { readonly ringTo: number }) {
  const palette = usePalette();
  const { body, halo, ringStyle } = useDotMotion(props.ringTo);
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.dot, styles.ring, { borderColor: palette.gold }, ringStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.dot, { backgroundColor: palette.gold }, halo]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.dot, styles.core, { backgroundColor: palette.gold }, body]}
      />
    </>
  );
}

/**
 * The dot at the end of a row in About's Needs update list, and on a bridge's line that needs the
 * owner (ADR 0297): the same dot, in a box as wide as its glow at its fullest, so neither the
 * glow nor its ring reaches the row's chevron.
 */
export function NeedsDot() {
  return (
    <View style={styles.needs} accessibilityLabel="Needs update" accessible testID="needs-dot">
      <DotMarks ringTo={2.3} />
    </View>
  );
}

function Lit() {
  const router = useRouter();
  const top = useTabTop();
  const { width } = useWindowDimensions();
  const { wide } = useLayout();
  const centre = wide ? listWidth(width) / 2 : width / 2;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.place, { top: top + BELOW_TOP - TARGET / 2, left: centre - TARGET / 2 }]}
    >
      <Pressable
        onPress={() => router.push("/about")}
        accessibilityRole="button"
        accessibilityLabel={DOT_LABEL}
        style={styles.target}
        testID="update-dot"
      >
        <DotMarks ringTo={3.8} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  place: { position: "absolute", width: TARGET, height: TARGET },
  target: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  dot: {
    position: "absolute",
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  ring: { borderWidth: 1.5 },
  needs: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  core: {
    shadowColor: "#f7c431",
    shadowOpacity: 0.7,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
