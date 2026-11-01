/**
 * The + by the tab bar, which asks a harness for a new space (`docs/proposals/new-space.md`).
 *
 * The system's own glass, tinted gold, with a dark + on it (Arjun, 24 September 2026: "tinted
 * yellow glass"), which draws its own rim and shadow. It is not the system's *interactive* glass:
 * that swells under a thumb and lays a white light over itself, and the gold went to a pale cream
 * the + could hardly be seen on ("too bright on press", the same night). It swells a little on our
 * own spring instead, and keeps its colour. Where there is no such glass — below iOS 26, with
 * Reduce Transparency on, on Android and the web — it is flat gold with a soft shadow under it and
 * gives a little under the thumb: a solid fill or the system's glass, never a shaded ball (the same
 * day: "3d button not looking good"). What is cool about it is what it does, not what it is made of.
 *
 * The glass is dark mode's only. Over the light page the 70% gold let the white through and
 * painted #f8d56d, a pale sticker at 1.38:1 against the paper (17 October 2026, ADR 0192), so in
 * light the + is the flat gold it is everywhere else, with its shadow.
 *
 * On an iPhone it stands at the end of the bar this app draws (`ui/PhoneBar.tsx`, ADR 0233), as
 * tall as the bar, and shrinks with it while a list is read, on the bar's own spring (`shrink`):
 * 62 points across at rest, 48 shrunk, 4 points lower, as the bar's middle goes.
 */

import { GlassView } from "expo-glass-effect";
import { type Ref, useEffect } from "react";
import { Pressable, type StyleProp, StyleSheet, type View, type ViewStyle } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Path, Svg } from "react-native-svg";
import { barPose } from "../ui/barShape";
import { alpha, useLiquid } from "../ui/Glass";
import { usePalette, useScheme } from "../ui/theme";
import { useReduceMotion } from "../ui/useReduceMotion";
import { PLUS_SIZE } from "./plusRoom";

/**
 * How much gold is in the glass. Less than this and gold over the dark page goes olive; more and
 * nothing of the room shows through, and it reads as the flat fill it replaced (picked on the
 * simulator over the list, 24 September 2026, from 0.3, 0.5, 0.7 and 0.85).
 */
export const PLUS_TINT = 0.7;
/**
 * Whether the + is glass: where the phone has the glass, and in dark only, since over the light
 * page the tint washed out to a pale sticker (ADR 0192). The window it grows into asks the same.
 */
export function usePlusGlass(): boolean {
  const scheme = useScheme();
  return useLiquid() && scheme === "dark";
}
/** The + itself: dark on the gold, whichever the appearance, because the gold does not change. */
const INK = "#231a00";
/**
 * Pressed, the paint gives a little under the thumb and the glass swells a little, as the glass
 * beside it in the bar does; each springs back past where it was.
 */
const PRESSED = 0.84;
const SWELLED = 1.08;
const SPRING = { stiffness: 520, damping: 18, mass: 1 } as const;
/** Stepping aside for a screen's own bar (ADR 0181): quick, and no bounce on the way out. */
const AWAY = { stiffness: 420, damping: 30, mass: 1 } as const;
/** How small it gets as it goes. */
const SHRUNK = 0.5;

export function Plus({
  ref,
  onPress,
  away = false,
  shrink,
  style,
  testID = "new-space",
}: {
  readonly ref?: Ref<View>;
  readonly onPress: () => void;
  /** Stepped aside with the tab bar, for a screen's own bar (ADR 0181): shrunk away, untouchable. */
  readonly away?: boolean;
  /** The bar's shrink on an iPhone, 0 at rest and 1 shrunk (`ui/PhoneBar.tsx`); nothing elsewhere. */
  readonly shrink?: SharedValue<number> | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const glass = usePlusGlass();
  const still = useReduceMotion();
  const scale = useSharedValue(1);
  const here = useSharedValue(away ? 0 : 1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    here.value = still ? (away ? 0 : 1) : withSpring(away ? 0 : 1, AWAY);
  }, [away, still]);
  const pressed = useAnimatedStyle(() => {
    const pose = barPose(shrink?.value ?? 0);
    return {
      opacity: here.value,
      transform: [
        { translateY: pose.plusY },
        { scale: scale.value * (SHRUNK + (1 - SHRUNK) * here.value) * pose.plus },
      ],
    };
  });
  const press = (down: boolean) => {
    if (still) return;
    scale.value = withSpring(down ? (glass ? SWELLED : PRESSED) : 1, SPRING);
  };
  const button = (
    <Pressable
      // Measured by the bar when pressed, which is where the window grows from.
      {...(ref === undefined ? {} : { ref })}
      accessibilityRole="button"
      accessibilityLabel="Create new space"
      onPress={onPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      style={styles.hit}
      testID={testID}
    >
      <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
        <Path d="M12 4.5v15M4.5 12h15" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );

  if (glass) {
    return (
      <Animated.View pointerEvents={away ? "none" : "auto"} style={[styles.round, style, pressed]}>
        <GlassView
          glassEffectStyle="regular"
          tintColor={alpha(palette.gold, PLUS_TINT)}
          colorScheme={scheme}
          style={styles.glass}
        >
          {button}
        </GlassView>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      pointerEvents={away ? "none" : "auto"}
      style={[styles.round, styles.painted, { backgroundColor: palette.gold }, style, pressed]}
    >
      {button}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  round: { width: PLUS_SIZE, height: PLUS_SIZE, borderRadius: PLUS_SIZE / 2 },
  glass: { flex: 1, borderRadius: PLUS_SIZE / 2 },
  painted: {
    // Soft and low, as a thing resting on the page casts: no rim, no highlight, no gradient.
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  hit: { flex: 1, alignItems: "center", justifyContent: "center" },
});
