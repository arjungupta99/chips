/**
 * How much of a link's time is left, as a ring (ADR 0209): full as it is made, empty as it runs
 * out, amber near its end. It draws itself in from empty the first time it shows, so a list of
 * links reads as clocks running rather than as icons. A dashed ghost of a face sits inside: the
 * person the link is waiting for.
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { usePalette } from "../ui/theme";
import { useReduceMotion } from "../ui/useReduceMotion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function LifeRing({
  left,
  ending,
  size = 40,
  testID,
}: {
  /** From 1, as made, to 0, run out. */
  readonly left: number;
  /** Near its end (`linkEnding`): the ring goes amber. */
  readonly ending: boolean;
  readonly size?: number;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const round = 2 * Math.PI * radius;
  const target = round * (1 - Math.max(0.03, Math.min(1, left)));
  const offset = useRef(new Animated.Value(still ? target : round)).current;
  useEffect(() => {
    if (still) {
      offset.setValue(target);
      return;
    }
    Animated.timing(offset, {
      toValue: target,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [offset, target, still]);
  return (
    <View style={{ width: size, height: size }} testID={testID}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={palette.line}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ending ? palette.amber : palette.green}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${round} ${round}`}
          strokeDashoffset={offset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>
        <View
          style={[
            styles.ghost,
            { width: size - 12, height: size - 12, borderRadius: size, borderColor: palette.ink4 },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: "center", justifyContent: "center" },
  ghost: { borderWidth: 1.5, borderStyle: "dashed" },
});
