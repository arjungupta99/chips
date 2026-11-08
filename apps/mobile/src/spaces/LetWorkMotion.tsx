/**
 * What moves in the band under a room's bar while an agent works there without asking (ADR 0281):
 * the band dropping in under the bar and fading out once stopped, and its dot breathing, a ring of
 * gold going out from it every two seconds, so the room never looks still while somebody's yes is
 * holding.
 *
 * Each is a transform or an opacity on the UI thread; a person who asked for less motion gets the
 * band at once and a dot that stands still.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * stands plain views in for it.
 */

import { type ReactNode, useEffect } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useReduceMotion } from "../ui/useReduceMotion";

/** The mock's ease out, `cubic-bezier(.2, .8, .2, 1)`. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** One band, dropping in under the bar and fading as it goes; the others move to make room. */
export function BandIn({
  children,
  style,
  testID,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  return (
    <Animated.View
      entering={FadeInUp.duration(260).easing(EASE)}
      exiting={FadeOut.duration(180)}
      layout={LinearTransition.duration(220).easing(EASE)}
      style={style}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

/** The words in a band changing, from working to stopped, crossing over in place. */
export function BandWords({
  children,
  wordsKey,
}: {
  readonly children: ReactNode;
  readonly wordsKey: string;
}) {
  return (
    <Animated.View key={wordsKey} entering={FadeIn.duration(200)} style={styles.grow}>
      {children}
    </Animated.View>
  );
}

/** The dot at the band's start, and the ring that goes out from it. */
export function Pulse({ color, still }: { readonly color: string; readonly still: boolean }) {
  const reduce = useReduceMotion();
  const ring = useSharedValue(0);
  const breathing = !still && !reduce;
  useEffect(() => {
    ring.value = 0;
    if (breathing) ring.value = withRepeat(withTiming(1, { duration: 2000, easing: EASE }), -1);
  }, [breathing, ring]);
  const out = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - ring.value),
    transform: [{ scale: 1 + 1.75 * ring.value }],
  }));
  return (
    <View style={styles.dotBox}>
      {breathing ? <Animated.View style={[styles.dot, { backgroundColor: color }, out]} /> : null}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  dotBox: { width: 8, height: 8 },
  dot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
});
