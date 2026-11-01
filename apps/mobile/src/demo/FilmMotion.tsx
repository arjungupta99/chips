/**
 * What moves round the film's video (ADR 0217): the chapter bar filling, what fades up over it,
 * and the side of the film a tap went to, lit a moment. A segment fills on a linear clock from where the video stands to its end, over the time it
 * has left, so it moves between the video's time updates rather than in steps; the one playing
 * glows, and one just finished gives a little jump. With Reduce Motion a finished segment does not
 * jump, and nothing fades.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * draws these as what they hold.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";

/** How high a finished segment jumps, and how long it takes to get there. */
const JUMP = 2.4;
const JUMP_MS = 200;
const BOUNCE = { stiffness: 260, damping: 12, mass: 1 } as const;

/**
 * One segment of the chapter bar: a track, and its fill from the left. `fill` is where the video
 * stands; while `running`, it goes on to the end over `ms`. Once `done` turns true, as the chapter
 * finishes, it gives a little jump.
 */
export function SegmentFill({
  fill,
  running,
  ms,
  glow,
  done,
  reduced,
  track,
  color,
}: {
  readonly fill: number;
  readonly running: boolean;
  readonly ms: number;
  readonly glow: boolean;
  readonly done: boolean;
  readonly reduced: boolean;
  readonly track: string;
  readonly color: string;
}) {
  const [width, setWidth] = useState(0);
  const at = useSharedValue(fill);
  const tall = useSharedValue(1);
  useEffect(() => {
    at.value =
      running && ms > 0
        ? withSequence(
            withTiming(fill, { duration: 0 }),
            withTiming(1, { duration: ms, easing: Easing.linear }),
          )
        : withTiming(fill, { duration: reduced ? 0 : 120 });
  }, [fill, running, ms, reduced, at]);
  const was = useRef(done);
  useEffect(() => {
    const finished = done && !was.current;
    was.current = done;
    if (!finished || reduced) return;
    tall.value = withSequence(
      withTiming(JUMP, { duration: JUMP_MS, easing: Easing.out(Easing.quad) }),
      withSpring(1, BOUNCE),
    );
  }, [done, reduced, tall]);
  const filled = useAnimatedStyle(
    () => ({ transform: [{ translateX: (at.value - 1) * width }] }),
    [width],
  );
  const jumping = useAnimatedStyle(() => ({ transform: [{ scaleY: tall.value }] }));
  return (
    <Animated.View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.segment, glow ? [styles.glow, { shadowColor: color }] : null, jumping]}
    >
      <View style={[styles.track, { backgroundColor: track }]}>
        <Animated.View style={[styles.fillBar, { backgroundColor: color }, filled]} />
      </View>
    </Animated.View>
  );
}

/** How long a fade up takes; a fade down takes half. */
const FADE_MS = 420;

/** What fades up as it comes and down as it goes: the lock screen, the end card. */
export function Fades({
  reduced,
  style,
  children,
}: {
  readonly reduced: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View
      {...(reduced
        ? {}
        : {
            entering: FadeIn.duration(FADE_MS),
            exiting: FadeOut.duration(FADE_MS / 2),
          })}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** How long a tap's side stays lit, coming up and going. */
const FLASH_IN_MS = 90;
const FLASH_OUT_MS = 430;

/**
 * The side of the film a tap went to, lit a moment with which way it went (ADR 0217's addendum of
 * 26 October): on, back to the start, or back one. `at` changes on every tap, so two taps on the
 * same side light it twice. Nothing with Reduce Motion: the bar says where the film went.
 */
export function Flash({
  side,
  icon,
  at,
  reduced,
}: {
  readonly side: "left" | "right";
  readonly icon: IconName;
  readonly at: number;
  readonly reduced: boolean;
}) {
  const lit = useSharedValue(0);
  useEffect(() => {
    if (at === 0 || reduced) return;
    lit.value = withSequence(
      withTiming(1, { duration: FLASH_IN_MS }),
      withTiming(0, { duration: FLASH_OUT_MS, easing: Easing.out(Easing.quad) }),
    );
  }, [at, reduced, lit]);
  const shown = useAnimatedStyle(() => ({ opacity: lit.value }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.flash, side === "left" ? styles.flashLeft : styles.flashRight, shown]}
    >
      <View style={styles.flashDisc}>
        <Icon name={icon} size={20} color="#ffffff" weight={2.2} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  segment: { flex: 1, height: 4, shadowOffset: { width: 0, height: 0 } },
  glow: { shadowOpacity: 0.7, shadowRadius: 5 },
  track: { flex: 1, borderRadius: 2, overflow: "hidden" },
  fillBar: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 2 },
  flash: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "46%",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  flashLeft: { left: 0, alignItems: "flex-start" },
  flashRight: { right: 0, alignItems: "flex-end" },
  flashDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
});
