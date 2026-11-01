/**
 * How Universe's Desktop tab moves (ADR 0227's second addendum; Arjun, 24 October 2026: "please
 * also have smooth transitions when buttons are tapped and state changes"). A row's button gives a
 * little under the thumb and springs back, as the + does. What a row says crossfades in place
 * (`ui/Swap.tsx`). What opens under a row (a program's Stop and Run again, its last lines) grows
 * from no height and closes back to none, and the rows and the card round them move to their new
 * places on the same clock and curve (`ui/growing.tsx`), so nothing jumps.
 *
 * With Reduce Motion the presses hold still, and Reanimated leaves its layout transitions out.
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * draws these as the views and the press they are.
 */

import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { CLOSES, GROWS, OPENS } from "../ui/growing";
import { useReduceMotion } from "../ui/useReduceMotion";

/** How far a row's button gives under the thumb, and how it springs back: the +'s spring. */
const PRESSED = 0.92;
const SPRING = { stiffness: 520, damping: 18, mass: 1 } as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** What moves to its new place when something above it opens or closes: the card and its rows. */
export function Moves({
  style,
  testID,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View layout={GROWS} style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}

/** What opens under a row and closes back into it: a program's Stop and Run again, its lines. */
export function Opening({
  style,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View
      entering={OPENS}
      exiting={CLOSES}
      layout={GROWS}
      style={[{ overflow: "hidden" }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** A press that gives a little under the thumb, dimming as it does, and springs back. */
export function Squeeze({
  style,
  children,
  ...press
}: Omit<PressableProps, "style" | "children" | "onPressIn" | "onPressOut"> & {
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const scale = useSharedValue(1);
  const drawn = useAnimatedStyle(() => ({
    opacity: interpolate(scale.value, [PRESSED, 1], [0.8, 1]),
    transform: [{ scale: scale.value }],
  }));
  const to = (down: boolean) => {
    if (still) return;
    scale.value = withSpring(down ? PRESSED : 1, SPRING);
  };
  return (
    <AnimatedPressable
      {...press}
      onPressIn={() => to(true)}
      onPressOut={() => to(false)}
      style={[style, drawn]}
    >
      {children}
    </AnimatedPressable>
  );
}
