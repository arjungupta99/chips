/**
 * A room a person asked a harness for is "New space" until the harness names it
 * (`askedName`, `docs/proposals/new-space.md`). When the name comes while the room is open, the
 * new name slides up into the capsule as the old one leaves it, and a sweep of gold crosses the
 * capsule once: the one moment the room changes its name without anybody in it renaming it.
 * Reduce Motion keeps the crossfade and leaves the travel and the sweep out. When it happens is
 * `useNamed` (`useNamed.ts`).
 */

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { BarTitle } from "../ui/BarTitle";
import { usePalette } from "../ui/theme";
import { RADIUS } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

const SLIDE_MS = 420;
const SWEEP_MS = 950;
/** How far the names travel, in points: one leaves up as the other comes up from below. */
const TRAVEL = 16;
const EASE = Easing.bezier(0.3, 0.8, 0.3, 1);

/** The room's name and who is in it, with the new name arriving over the old at each naming. */
export function ArrivingTitle({
  title,
  subtitle,
  warning,
  named,
}: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** "1 can't answer", in amber after the subtitle (ADR 0083). */
  readonly warning?: string | undefined;
  readonly named: number;
}) {
  const still = useReduceMotion();
  const last = useRef(title);
  const [leaving, setLeaving] = useState<string | undefined>(undefined);
  const settled = useSharedValue(1);
  const played = useRef(0);
  // Before the every-render effect below: `last` still holds the name that was on screen. Once
  // for each naming, whatever else changes the title.
  useEffect(() => {
    if (named === played.current) return;
    played.current = named;
    // The eye gets the sweep; a screen reader is told the name.
    AccessibilityInfo.announceForAccessibility(`Named ${title}`);
    setLeaving(last.current);
    settled.value = 0;
    settled.value = withTiming(1, { duration: SLIDE_MS, easing: EASE }, (finished) => {
      if (finished) runOnJS(setLeaving)(undefined);
    });
  }, [named, settled, title]);
  useEffect(() => {
    last.current = title;
  });
  const coming = useAnimatedStyle(() => ({
    opacity: settled.value,
    transform: [{ translateY: still ? 0 : TRAVEL * (1 - settled.value) }],
  }));
  const going = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, settled.value * 1.4),
    transform: [{ translateY: still ? 0 : -TRAVEL * settled.value }],
  }));
  return (
    <View>
      <Animated.View style={coming}>
        <BarTitle title={title} subtitle={subtitle} warning={warning} />
      </Animated.View>
      {leaving === undefined ? null : (
        <Animated.View style={[styles.going, going]} pointerEvents="none">
          <BarTitle title={leaving} subtitle={subtitle} warning={warning} />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The gold that crosses the name's capsule when the room is named. It stands over the capsule's
 * whole face, clipped to its shape, and is nothing at all between namings.
 */
export function Sweep({ named }: { readonly named: number }) {
  const palette = usePalette();
  const still = useReduceMotion();
  const [width, setWidth] = useState(0);
  const across = useSharedValue(-1);
  useEffect(() => {
    if (named === 0 || still) return;
    across.value = -1;
    across.value = withTiming(1, { duration: SWEEP_MS, easing: Easing.bezier(0.3, 0.6, 0.3, 1) });
  }, [named, still, across]);
  const band = useAnimatedStyle(() => ({
    opacity: across.value > -1 && across.value < 1 ? 1 : 0,
    transform: [{ translateX: across.value * width * 1.2 }],
  }));
  return (
    <View
      style={styles.sweep}
      pointerEvents="none"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width === 0 ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, band]}>
          <Svg width={width} height="100%">
            <Defs>
              <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0.3" stopColor={palette.gold} stopOpacity={0} />
                <Stop offset="0.5" stopColor={palette.gold} stopOpacity={0.42} />
                <Stop offset="0.7" stopColor={palette.gold} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={width} height="100%" fill="url(#sweep)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  going: { position: "absolute", top: 0, left: 0, right: 0 },
  sweep: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
  },
});
