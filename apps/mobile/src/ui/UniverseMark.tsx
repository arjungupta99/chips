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

/** The rings' stroke, in the 24-point box: heavier at a bar's size, where a hairline fades. */
function ringLine(size: number): number {
  return size <= 32 ? 1.15 : 0.8;
}

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
  const line = ringLine(size);
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
  return (
    <MovingMark
      size={size}
      ink={ink}
      ground={ground}
      turns={turns}
      sun={breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })}
      testID="universe-orbit"
    />
  );
}

/**
 * A sun or a planet, as the still mark draws one: a disc with an edge of the ground it stands on. A
 * circle of the SVG's, since a view's rounded corners at four points drew a planet as a square (the
 * simulator, 3 November 2026).
 */
function Body({
  r,
  edge,
  fill,
  ground,
}: {
  readonly r: number;
  readonly edge: number;
  readonly fill: ColorValue;
  readonly ground: ColorValue;
}) {
  const reach = r + edge / 2;
  return (
    <Svg width={reach * 2} height={reach * 2}>
      <Circle cx={reach} cy={reach} r={r} fill={fill} stroke={ground} strokeWidth={edge} />
    </Svg>
  );
}

/**
 * The mark with its sun and planets as views, moved on the native driver: each planet round its ring
 * by its `turns` value, from where it stands (0) once round to the same place (1), and the sun by
 * `sun`, its scale. The Orbit and the bar's calling mark both draw it.
 */
function MovingMark({
  size,
  ink,
  ground,
  turns,
  sun: sunScale,
  line = ringLine(size),
  testID,
}: {
  readonly size: number;
  readonly ink: ColorValue;
  readonly ground: ColorValue;
  readonly turns: readonly Animated.Value[];
  readonly sun?: Animated.AnimatedInterpolation<number> | undefined;
  /** The rings' stroke, in the 24-point box: that of the size it is shown at, by default its own. */
  readonly line?: number | undefined;
  readonly testID?: string | undefined;
}) {
  const scale = size / 24;
  const sun = 3.5 * scale;
  const planet = PLANET * scale;
  // Each body's reach past its middle, its edge included, as the still mark's circles have.
  const sunReach = sun + scale / 2;
  const planetReach = planet + (0.9 * scale) / 2;
  return (
    <View style={{ width: size, height: size }} testID={testID}>
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
            strokeWidth={line}
            opacity={0.55}
          />
        ))}
      </Svg>
      <Animated.View
        style={[
          styles.body,
          {
            left: size / 2 - sunReach,
            top: size / 2 - sunReach,
            transform: sunScale === undefined ? [] : [{ scale: sunScale }],
          },
        ]}
      >
        <Body r={sun} edge={scale} fill={SUN} ground={ground} />
      </Animated.View>
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
                  left: size / 2 - planetReach,
                  top: size / 2 - planetReach,
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
            >
              <Body r={planet} edge={0.9 * scale} fill={PLANETS[at] ?? SUN} ground={ground} />
            </Animated.View>
          </View>
        );
      })}
    </View>
  );
}

/** Each planet's time once round its ring when Universe calls: the Orbit's paces, quicker. */
const ONCE = [1000, 1250, 900, 1150] as const;
/** How much larger the mark grows as it calls. */
// 1.4 on the mock; at the bar's edges a planet going round at 1.4 reached past the room the bar
// gives its button.
const GROWN = 1.3;
/** Half a pulse while Universe waits to be opened, in milliseconds. */
const PULSE = 700;

/** A move on the native driver, eased as a breath unless said otherwise. */
function toward(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (at: number) => number = Easing.inOut(Easing.sin),
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
}

/** Out to `to` and back to 1, over and over, until stopped. */
function pulsing(value: Animated.Value, to: number): Animated.CompositeAnimation {
  return Animated.loop(Animated.sequence([toward(value, to, PULSE), toward(value, 1, PULSE)]));
}

/**
 * The bar's mark, which calls the reader while the project has a change they haven't opened
 * Universe at (`calling`, the change; ADR 0227's addendum). Arjun's pick on the mock, 3 November
 * 2026, "A · Orbit once": the mark grows, its planets go once round their rings, and it settles;
 * then it pulses until Universe is opened. A newer change while it calls goes round again. With
 * Reduce Motion on it fades and comes back instead, without moving.
 */
export function CallingMark({
  size = 26,
  ink,
  ground,
  calling,
}: {
  readonly size?: number;
  readonly ink: ColorValue;
  readonly ground: ColorValue;
  readonly calling: string | undefined;
}) {
  const still = useReduceMotion();
  const turns = useRef(ONCE.map(() => new Animated.Value(0))).current;
  const grow = useRef(new Animated.Value(1)).current;
  const shade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (calling === undefined) return;
    const motion = still
      ? pulsing(shade, 0.4)
      : Animated.sequence([
          Animated.parallel([
            ...turns.map((turn, at) =>
              toward(turn, 1, ONCE[at] ?? 1000, Easing.bezier(0.45, 0, 0.2, 1)),
            ),
            Animated.sequence([
              toward(grow, GROWN, 260, Easing.out(Easing.cubic)),
              Animated.delay(750),
              toward(grow, 0.94, 180, Easing.inOut(Easing.cubic)),
              toward(grow, 1, 110, Easing.out(Easing.cubic)),
            ]),
          ]),
          pulsing(grow, 1.22),
        ]);
    motion.start();
    return () => {
      motion.stop();
      // Once round is where it began, so the planets stand where they always do.
      for (const turn of turns) turn.setValue(0);
      grow.setValue(1);
      shade.setValue(1);
    };
  }, [calling, still, turns, grow, shade]);
  // Drawn at its grown size and shown smaller at rest: an SVG made larger by a transform is
  // stretched from its drawn pixels, and the rings blurred at the grow's height (the simulator, 3
  // November 2026).
  const drawn = size * GROWN;
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          width: drawn,
          height: drawn,
          margin: (size - drawn) / 2,
          opacity: shade,
          transform: [{ scale: Animated.divide(grow, GROWN) }],
        }}
        testID="universe-calling"
      >
        <MovingMark size={drawn} ink={ink} ground={ground} turns={turns} line={ringLine(size)} />
      </Animated.View>
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
