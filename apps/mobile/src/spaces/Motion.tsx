/**
 * The line a card or a link pointed at, flashed once so the eye finds it.
 *
 * How the room moves — a line landing, a bubble giving its time up, the thinking bubble coming
 * and going — is `RoomMotion.tsx`: one transition, on the UI thread, for all of it (ADR 0074).
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

const NATIVE = Platform.OS !== "web";

/** How wide the sweep's band of gold is, and how long it takes to cross the line (ADR 0219). */
const BAND = 180;
const SWEEP_MS = 950;

/**
 * The one flash of the brand's selection colour under the line a card pointed at: half a
 * second full, then gone, so the eye lands where the thumb meant to and nothing stays lit. A band
 * of gold sweeps across it once as it lights (ADR 0219), on the native driver; with Reduce Motion
 * on, the light alone.
 */
export function Flash({
  on,
  pulse = 0,
  id,
  children,
}: {
  readonly on: boolean;
  /** A new number flashes it again while it is still the line: *Go to message* twice onto one line. */
  readonly pulse?: number;
  readonly id: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const glow = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pulse` is how the same line flashes again.
  useEffect(() => {
    if (!on) return;
    glow.setValue(1);
    Animated.timing(glow, {
      toValue: 0,
      duration: 1400,
      delay: 500,
      useNativeDriver: NATIVE,
    }).start();
  }, [on, pulse, glow]);
  if (!on) return <>{children}</>;
  return (
    <View
      style={styles.flash}
      testID={`flash-${id}`}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.glow,
          { backgroundColor: palette.goldSoft, opacity: glow },
        ]}
      />
      {children}
      {/* Over the line, so the band crosses the bubble itself as the web's does. */}
      <Sweep width={width} pulse={pulse} />
    </View>
  );
}

/**
 * The band of gold across the line and its bubble, once, from before its left edge to past its
 * right. It takes no touch, so the card under it still goes and the bubble still lifts.
 */
function Sweep({ width, pulse }: { readonly width: number; readonly pulse: number }) {
  const palette = usePalette();
  const less = useReduceMotion();
  const across = useRef(new Animated.Value(0)).current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pulse` is how the same line sweeps again.
  useEffect(() => {
    if (width === 0 || less) return;
    across.setValue(0);
    Animated.timing(across, {
      toValue: 1,
      duration: SWEEP_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: NATIVE,
    }).start();
  }, [width, pulse, less, across]);
  if (width === 0 || less) return null;
  const translateX = across.interpolate({ inputRange: [0, 1], outputRange: [-BAND, width] });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, styles.clip]}>
      <Animated.View style={[styles.band, { transform: [{ translateX }] }]} testID="flash-sweep">
        {/* A unit box stretched to the band: sizes in per cent go stale on a Fabric re-layout. */}
        <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset={0} stopColor={palette.gold} stopOpacity={0} />
              <Stop offset={0.5} stopColor={palette.gold} stopOpacity={0.45} />
              <Stop offset={1} stopColor={palette.gold} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={1} height={1} fill="url(#sweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flash: { marginHorizontal: -SPACE.sm, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.lg },
  glow: { borderRadius: RADIUS.lg },
  clip: { overflow: "hidden" },
  band: { position: "absolute", top: 0, bottom: 0, width: BAND },
});
