/**
 * Universe's mark (ADR 0227): four rings round a gold sun, a blue, green, coral and violet planet
 * on them, the icon at a room's top right and at the head of its sheet. Arjun's pick on the mock,
 * "A looks good". The rings take the ink the bar is drawn in; the sun and planets keep their own
 * colours, each with a thin edge of the ground it stands on, so they read apart from the rings.
 */

import { useEffect, useRef } from "react";
import { Animated, type ColorValue, Easing, StyleSheet, Text, View } from "react-native";
import { Circle, Ellipse, Svg } from "react-native-svg";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

const RX = 10.4;
const RY = 3;
const RINGS = [0, 45, 90, 135] as const;
/** Where each ring's planet stands along it, in degrees round the ring: spread so none touch. */
const ALONG = [205, 340, 25, 160] as const;
const PLANETS = ["#3b82f6", "#10b981", "#f2545b", "#8b5cf6"] as const;
export const SUN = "#f7b81f";

/** A planet's place: on its ring, which is turned about the middle of the 24-point box. */
function placeOf(ring: number, along: number): { readonly x: number; readonly y: number } {
  const turn = (ring * Math.PI) / 180;
  const at = (along * Math.PI) / 180;
  const x = RX * Math.cos(at);
  const y = RY * Math.sin(at);
  return {
    x: 12 + x * Math.cos(turn) - y * Math.sin(turn),
    y: 12 + x * Math.sin(turn) + y * Math.cos(turn),
  };
}

const PLACES = RINGS.map((ring, at) => ({
  ...placeOf(ring, ALONG[at] ?? 0),
  colour: PLANETS[at] ?? SUN,
}));

export function UniverseMark({
  size = 22,
  ink,
  ground,
}: {
  readonly size?: number;
  /** The rings' colour: the ink the words beside it are in. */
  readonly ink: ColorValue;
  /** What it stands on, for the sun's and planets' edges. */
  readonly ground: ColorValue;
}) {
  const line = size <= 24 ? 1.15 : 0.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {RINGS.map((ring) => (
        <Ellipse
          key={ring}
          cx={12}
          cy={12}
          rx={RX}
          ry={RY}
          transform={`rotate(${ring} 12 12)`}
          fill="none"
          stroke={ink}
          strokeWidth={line}
          opacity={0.55}
        />
      ))}
      <Circle cx={12} cy={12} r={3.5} fill={SUN} stroke={ground} strokeWidth={1} />
      {PLACES.map((place) => (
        <Circle
          key={place.colour}
          cx={place.x}
          cy={place.y}
          r={2.05}
          fill={place.colour}
          stroke={ground}
          strokeWidth={0.9}
        />
      ))}
    </Svg>
  );
}

/** Each planet's time round its ring while Universe reads, in milliseconds: each its own pace. */
const PERIODS = [2600, 3400, 2200, 3000] as const;
/** Points round a ring for the planet to travel through: enough that the path reads as a curve. */
const STEPS = 48;
const PLANET = 2.05;

/**
 * The mark with its planets travelling their rings, while Universe reads the space and its start
 * page opens (Arjun's pick on the mock, 24 October 2026: "Orbit loading motion looks good"). The
 * rings and the sun are drawn once; each planet is a view moved round its ring on the native
 * driver, so the motion costs the JavaScript thread nothing while the page it waits for arrives.
 * With Reduce Motion on, the mark stands still.
 */
export function OrbitingMark({
  size = 80,
  ink,
  ground,
}: {
  readonly size?: number;
  readonly ink: ColorValue;
  readonly ground: ColorValue;
}) {
  const still = useReduceMotion();
  const scale = size / 24;
  const turns = useRef(PERIODS.map(() => new Animated.Value(0))).current;
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loops = [
      ...turns.map((turn, at) =>
        Animated.loop(
          Animated.timing(turn, {
            toValue: 1,
            duration: PERIODS[at] ?? 3000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breath, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    ];
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [still, turns, breath]);
  const sun = 3.5 * scale;
  const planet = PLANET * scale;
  return (
    <View style={{ width: size, height: size }} testID="universe-orbit">
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        {RINGS.map((ring) => (
          <Ellipse
            key={ring}
            cx={12}
            cy={12}
            rx={RX}
            ry={RY}
            transform={`rotate(${ring} 12 12)`}
            fill="none"
            stroke={ink}
            strokeWidth={0.8}
            opacity={0.55}
          />
        ))}
      </Svg>
      <Animated.View
        style={[
          styles.body,
          {
            left: size / 2 - sun,
            top: size / 2 - sun,
            width: sun * 2,
            height: sun * 2,
            borderRadius: sun,
            backgroundColor: SUN,
            borderColor: ground,
            borderWidth: scale,
            transform: [
              { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
          },
        ]}
      />
      {RINGS.map((ring, at) => {
        const along = ALONG[at] ?? 0;
        const turn = turns[at] ?? new Animated.Value(0);
        const inputRange = Array.from({ length: STEPS + 1 }, (_, step) => step / STEPS);
        const angles = inputRange.map((step) => ((along + step * 360) * Math.PI) / 180);
        return (
          // The ring's own turn, about the middle; the planet goes round the ring inside it.
          <View
            key={ring}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${ring}deg` }] }]}
          >
            <Animated.View
              style={[
                styles.body,
                {
                  left: size / 2 - planet,
                  top: size / 2 - planet,
                  width: planet * 2,
                  height: planet * 2,
                  borderRadius: planet,
                  backgroundColor: PLANETS[at] ?? SUN,
                  borderColor: ground,
                  borderWidth: 0.9 * scale,
                  transform: [
                    {
                      translateX: turn.interpolate({
                        inputRange,
                        outputRange: angles.map((angle) => RX * Math.cos(angle) * scale),
                      }),
                    },
                    {
                      translateY: turn.interpolate({
                        inputRange,
                        outputRange: angles.map((angle) => RY * Math.sin(angle) * scale),
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * The planets going round with what is happening under them, in the middle of what it fills: while
 * Universe reads the space, and while a page of the project opens, in Universe or the page sheet.
 */
export function UniverseReading({ words }: { readonly words: string }) {
  const palette = usePalette();
  return (
    <View style={styles.reading} testID="universe-reading" accessibilityLabel={words}>
      <OrbitingMark ink={palette.ink} ground={palette.bg} />
      <Text style={[styles.readingWords, { color: palette.ink3 }]}>{words}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { position: "absolute" },
  reading: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.md },
  readingWords: { fontSize: TEXT.md },
});
