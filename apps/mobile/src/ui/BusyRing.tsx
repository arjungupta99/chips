/**
 * The light that runs round a room's face while there is work going in it (ADR 0090).
 *
 * The ring is state (blueprint, Look), and it was a still border: a harness-named room wore a
 * blue outline while its run went, and a room with a title of its own wore nothing at all, so a
 * list of fifty rooms said nothing about which of them was busy. The same ring, travelling, says
 * it from across the room — and the row's words say it too, because state is a colour *and* a
 * word, never a colour alone (`vocabulary.ts`).
 *
 * It follows the face's own shape — a circle round a person, a squircle round a harness, a
 * rounded square round a channel — without a path for each. The band is the one thing the clip
 * leaves: a box two points proud of the face, cut to the face's corner, with the face itself
 * standing opaque in the middle of it. A fat arc turning inside that clip is cut to the band
 * wherever it is, so the light runs round a corner exactly as it runs along an edge.
 *
 * The turn is a rotation and nothing else, which is what the native driver can carry (`ChipPulse`
 * for the same bargain, and ADR 0061 for what animating anything else under a scrolling list
 * costs). With Reduce Motion on, the ring is simply lit and still: the same ring, saying the same
 * thing.
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReduceMotion } from "./useReduceMotion";

/** One turn of the ring. Slower than the mark's circuit: this one is seen out of the corner of an eye. */
const TURN_MS = 2600;
/** How far the ring stands proud of the face, and so how thick the band is. */
export const RING = 2;
/** What the band is worth where the light is not. */
const TRACK = 0.22;
/**
 * The arc, as fractions of the circle it is struck on: the head bright, two lengths of tail
 * behind it. A light with a tail has a direction; an even arc going round is a hoop.
 */
const COMET = [
  { at: 0, length: 0.1, opacity: 1 },
  { at: 0.1, length: 0.1, opacity: 0.55 },
  { at: 0.2, length: 0.12, opacity: 0.25 },
] as const;

export function BusyRing({
  side,
  corner,
  tone,
}: {
  /** The side of the face this runs round. */
  readonly side: number;
  /** The face's own corner, which the band takes two points further out. */
  readonly corner: number;
  /** The status colour, which is the tone of the state the ring is saying. */
  readonly tone: string;
}) {
  const less = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (less) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: TURN_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [less, spin]);
  const box = side + RING * 2;
  // Struck well inside the band and drawn fat enough to cover it at every angle, corners and
  // all: what shows is whatever the clip and the face leave of it, which is the band itself.
  const radius = side * 0.58;
  const thick = side * 0.3;
  const round = Math.PI * 2 * radius;
  const reach = (radius + thick / 2) * 2;
  return (
    <View
      testID="busy-ring"
      pointerEvents="none"
      style={[
        styles.band,
        { width: box, height: box, borderRadius: corner + RING, top: -RING, left: -RING },
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: RING, borderColor: tone, opacity: TRACK, borderRadius: corner + RING },
        ]}
      />
      {less ? null : (
        <Animated.View
          style={{
            position: "absolute",
            width: reach,
            height: reach,
            left: (box - reach) / 2,
            top: (box - reach) / 2,
            transform: [
              {
                rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
              },
            ],
          }}
        >
          <Svg width={reach} height={reach}>
            {COMET.map((part) => (
              <Circle
                key={part.at}
                cx={reach / 2}
                cy={reach / 2}
                r={radius}
                fill="none"
                stroke={tone}
                strokeOpacity={part.opacity}
                strokeWidth={thick}
                strokeDasharray={`${round * part.length} ${round * (1 - part.length)}`}
                strokeDashoffset={-round * part.at}
              />
            ))}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Outside the face's box, so a face that wears one is the same size in a row as one that does
  // not, and the band is cut to the shape it stands round.
  band: { position: "absolute", overflow: "hidden" },
});
