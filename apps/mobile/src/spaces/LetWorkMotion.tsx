/**
 * What moves in the band under a room's bar while an agent works there without asking (ADR 0281):
 * the band dropping in under the bar and fading out once stopped, and its dot breathing, a ring of
 * gold going out from it every two seconds, so the room never looks still while somebody's yes is
 * holding.
 *
 * Each is a transform or an opacity on the UI thread; a person who asked for less motion gets the
 * band at once and a dot that stands still.
 *
 * The ring runs on the native driver, as the room's other lights that never stop do (`useRound`).
 * On Reanimated it was a commit of the whole tree on every frame for as long as the band stood, each
 * laying out and walking every list on the screen, and a room with the band in it was slow to leave
 * and slow to do anything in (the iPad simulator, 8 November 2026).
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * stands plain views in for it.
 */

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  Animated as NativeAnimated,
  Easing as NativeEasing,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { useReduceMotion } from "../ui/useReduceMotion";
import { useRound } from "../ui/useTurns";

/** The mock's ease out, `cubic-bezier(.2, .8, .2, 1)`. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** The same ease out for the ring, which is the native driver's to run. */
const RING_EASE = NativeEasing.bezier(0.2, 0.8, 0.2, 1);
const RING_MS = 2000;

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

/**
 * The hairline along the band's foot counting down what it says after a tap, there and gone on the
 * native driver. Under Reduce Motion it stands still, and the band still goes when its time is up.
 */
export function Hair({ ms, color }: { readonly ms: number; readonly color: string }) {
  const still = useReduceMotion();
  const left = useRef(new NativeAnimated.Value(1)).current;
  useEffect(() => {
    if (still) return;
    const run = NativeAnimated.timing(left, {
      toValue: 0,
      duration: ms,
      easing: NativeEasing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [still, ms, left]);
  return (
    <NativeAnimated.View
      pointerEvents="none"
      style={[styles.hair, { backgroundColor: color, transform: [{ scaleX: left }] }]}
      testID="let-work-hair"
    />
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
  const breathing = !still && !reduce;
  const ring = useRound(RING_MS, breathing, 0, RING_EASE);
  const out = useMemo(
    () => ({
      opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
      transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.75] }) }],
    }),
    [ring],
  );
  return (
    <View style={styles.dotBox}>
      {breathing ? (
        <NativeAnimated.View style={[styles.dot, { backgroundColor: color }, out]} />
      ) : null}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hair: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2, transformOrigin: "left" },
  grow: { flex: 1, minWidth: 0 },
  dotBox: { width: 8, height: 8 },
  dot: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
});
