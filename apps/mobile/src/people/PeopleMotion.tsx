/**
 * How People, a person's page and Invite someone move (ADR 0209), on Reanimated, in this one file
 * so the screens stay testable under Jest, which cannot load it (`jest.setup.js` stands plain views
 * in for these). Every part is flat: the motion is where the life is.
 *
 * - `PopIn`: a face or a tick that springs up from nothing, after its turn.
 * - `Folding`: a face that grows into a line or folds out of it, staying mounted, so nothing leaves
 *   the tree mid-animation (the exit trap the Read all count found).
 * - `Glides`: a People row that glides to its place as the filter changes, fading in when it comes
 *   back.
 * - `Thumb`: the filter's ink, sliding to the chip picked.
 * - `Lit`: a link's row lit gold as it lands, fading to the others.
 * - `RisesIn`: the card a link opens to, rising into place after the link.
 */

import { type ReactNode, useEffect } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { IOS_SPRING } from "../ui/motion";
import { useReduceMotion } from "../ui/useReduceMotion";

const FOLD = { damping: 16, stiffness: 220, mass: 0.8 } as const;
const MOVES = LinearTransition.springify().damping(20).stiffness(220);
const BACK = FadeIn.duration(220);

export function PopIn({
  delay,
  style,
  children,
}: {
  readonly delay: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  return (
    <Animated.View {...(still ? {} : { entering: ZoomIn.springify().delay(delay) })} style={style}>
      {children}
    </Animated.View>
  );
}

export function Folding({
  on,
  width,
  order,
  children,
}: {
  readonly on: boolean;
  /** Its width open. */
  readonly width: number;
  readonly order: number;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const open = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    open.value = still
      ? withTiming(on ? 1 : 0, { duration: 0 })
      : withDelay(on ? order * 35 : 0, withSpring(on ? 1 : 0, FOLD));
  }, [on, order, still, open]);
  const style = useAnimatedStyle(() => {
    const at = Math.max(0, open.value);
    return {
      width: at * width,
      opacity: Math.min(1, at),
      transform: [{ scale: 0.3 + 0.7 * at }],
    };
  });
  return (
    <Animated.View
      style={[styles.folding, style]}
      accessibilityElementsHidden={!on}
      importantForAccessibility={on ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
}

export function Glides({ children }: { readonly children: ReactNode }) {
  const still = useReduceMotion();
  return (
    <Animated.View {...(still ? {} : { layout: MOVES, entering: BACK })}>{children}</Animated.View>
  );
}

export function Thumb({
  x,
  width,
  height,
  colour,
}: {
  /** Where the chip picked stands, once it has been laid out. */
  readonly x: number | undefined;
  readonly width: number | undefined;
  readonly height: number;
  readonly colour: string;
}) {
  const still = useReduceMotion();
  const left = useSharedValue(0);
  const wide = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (x === undefined || width === undefined) return;
    if (!placed.value || still) {
      left.value = x;
      wide.value = width;
      placed.value = true;
      return;
    }
    left.value = withSpring(x, IOS_SPRING);
    wide.value = withSpring(width, IOS_SPRING);
  }, [x, width, still, left, wide, placed]);
  const style = useAnimatedStyle(() => ({
    width: wide.value,
    transform: [{ translateX: left.value }],
    opacity: placed.value ? 1 : 0,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.thumb, { height, borderRadius: height, backgroundColor: colour }, style]}
    />
  );
}

export function Lit({
  on,
  colour,
  children,
}: {
  readonly on: boolean;
  readonly colour: string;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const glow = useSharedValue(on && !still ? 1 : 0);
  useEffect(() => {
    if (on && !still) glow.value = withDelay(500, withTiming(0, { duration: 1600 }));
  }, [on, still, glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value * 0.3 }));
  return (
    <View>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colour }, style]}
      />
    </View>
  );
}

export function RisesIn({
  style,
  testID,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  return (
    <Animated.View
      {...(still ? {} : { entering: FadeInDown.duration(420).delay(500) })}
      style={style}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  folding: { alignItems: "flex-start" },
  thumb: { position: "absolute", top: 0, left: 0 },
});
