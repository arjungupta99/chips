/**
 * The connection's mark, large, on a circuit board: what its sheet shows above the words (ADR 0251).
 *
 * The mark is `ChipPulse` drawn at its size, and from each of its ten pins a trace runs out to a
 * pad (`traces.ts`). While the phone is reaching its server, a spark leaves each pin as the pin
 * lights and runs down its trace, and the pad flashes as it lands. Not connected, the board goes
 * dim under a red mark, which shakes once as it turns. Connected again, the green spreads out from
 * the mark along every trace to its pad, and every pin is lit.
 *
 * Everything that moves moves on the native driver, the change from one look to another included,
 * because that change comes when the app is busiest: the connection has just dropped or just come
 * back, and the JavaScript thread is catching up with it. The sparks and the pads are plain views
 * read off the pins' own clock (`useRound`), started in the same commit as the pins', so they keep
 * step with them. The board dims and the sparks fade as opacities, and the green is a still
 * drawing uncovered by a growing circle (`Reveal`). Nothing is mounted or taken away as the look
 * changes, and no drawing is drawn again but the mark's own body (31 October 2026: "when the
 * animation switches from yellow to green / red, there are some significant frame drops", when
 * the green was a stroke's dash moved from JavaScript, twenty drawings redrawn every frame, and
 * the sparks' thirty views came and went with each change).
 *
 * With Reduce Motion on, nothing runs: no sparks, the mark rests as it does everywhere, and the
 * green and the dimming are simply there.
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { Circle, Path, Svg } from "react-native-svg";
import { ChipPulse, ROUND } from "./ChipPulse";
import { fromOklch, toOklch } from "./lit";
import { BODY_WITH_PINS } from "./outline";
import { usePalette, useScheme } from "./theme";
import { light } from "./tokens";
import { BOARD, groundOf, PAD, padOf, sparkOf, type Timing, type Track, tracesOf } from "./traces";
import { roundMs } from "./turns";
import { useReduceMotion } from "./useReduceMotion";
import { useRound } from "./useTurns";

/** What the board is saying: reaching the server, not reaching it, or through again. */
export type BoardLook = "reaching" | "failed" | "back";

const NATIVE = Platform.OS !== "web";

const TIMING: Timing = { roundMs: roundMs(ROUND), stepMs: ROUND.stepMs, travelMs: 520 };
const TRACES = tracesOf();
const GROUND = groundOf();

/**
 * The board is worked out in the mock's own units (`BOARD`) and shown at four fifths of them
 * (Arjun, 31 October 2026: "make this chips + spikes graphic, 20% smaller"). Each part is drawn at
 * the smaller size, none shrunk after it was drawn: the traces through the drawing's `viewBox`, the
 * mark at its size, the sparks and pads placed in points.
 */
const SHOWN = 0.8;
const SIZE = {
  width: BOARD.width * SHOWN,
  height: BOARD.height * SHOWN,
  mark: BOARD.mark * SHOWN,
  pad: PAD.r * SHOWN,
  hole: PAD.hole * SHOWN,
};
const VIEW_BOX = `0 0 ${BOARD.width} ${BOARD.height}`;

/**
 * How far the green has to spread, in points: from the middle to the outside of the farthest pad.
 * It starts at the body's edge, under the mark, so it leaves the pins as it shows.
 */
const REACH =
  (Math.max(
    ...TRACES.flatMap((trace) =>
      trace.points.map(([x, y]) => Math.hypot(x - BOARD.width / 2, y - BOARD.height / 2)),
    ),
  ) +
    PAD.r +
    2) *
  SHOWN;
const FROM = (SIZE.mark * BODY_WITH_PINS) / 2 / REACH;

/**
 * Each spark is a bright head and two fainter sparks trailing it, so it reads as a streak: how far
 * behind each runs, how big it is, and how bright.
 */
const STREAK = [
  { lagMs: 0, size: 5.6, bright: 1 },
  { lagMs: 34, size: 4.2, bright: 0.55 },
  { lagMs: 68, size: 3.2, bright: 0.3 },
] as const;

/** A track's points moved or scaled: a dot is placed by its corner, not its centre. */
const shift = (track: Track, by: number): Track => ({
  inputRange: track.inputRange,
  outputRange: track.outputRange.map((value) => value + by),
});
const scale = (track: Track, by: number): Track => ({
  inputRange: track.inputRange,
  outputRange: track.outputRange.map((value) => value * by),
});

/** Every dot of every streak, worked out once and in points: the board is always the same board. */
const DOTS = TRACES.flatMap((trace, index) =>
  STREAK.map(({ lagMs, size: drawn, bright }, place) => {
    const spark = sparkOf(trace, index, TIMING, lagMs);
    const size = drawn * SHOWN;
    return {
      key: `${trace.key}-${place}`,
      size,
      head: place === 0,
      x: shift(scale(spark.x, SHOWN), -size / 2),
      y: shift(scale(spark.y, SHOWN), -size / 2),
      opacity: scale(spark.opacity, bright),
    };
  }),
);
/** Each pad where the drawing has it (`x`, `y`), and where its flash stands, in points. */
const PADS = TRACES.map((trace, index) => {
  const [x, y] = trace.points.at(-1) as readonly [number, number];
  return {
    key: trace.key,
    x,
    y,
    left: x * SHOWN - SIZE.pad,
    top: y * SHOWN - SIZE.pad,
    lit: padOf(index, TIMING),
  };
});

/**
 * The spark's colour on a light sheet: the gold sunk a step, since the gold itself is nearly as
 * light as the paper it would run across. On a dark sheet the gold is bright enough as it is.
 */
const SPARK_ON_PAPER = (() => {
  const [lightness, chroma, hue] = toOklch(light.gold);
  return fromOklch([lightness - 0.1, chroma, hue]);
})();

/** How the traces read at rest: faint lines on the sheet, fainter while it cannot connect. */
const TRACE_INK = 0.13;
const GROUND_INK = 0.1;
const DIM = 0.55;

/** How long the sparks take to go or come, and the board to dim or brighten, as the look changes. */
const FADE_MS = 200;
/** The red mark's one shake as it turns red: a few quick swings, smaller each time. */
const SHAKE_MS = 480;
const SHAKE = {
  inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  outputRange: [0, -1, 3, -5, 5, -5, 5, -5, 3, -1, 0],
};
const FILL_MS = 520;

export function Circuit({
  look,
  testID = "connection-board",
}: {
  readonly look: BoardLook;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const spark = useScheme() === "dark" ? palette.gold : SPARK_ON_PAPER;
  const still = useReduceMotion();
  const sparks = useSparks(look === "reaching", still);
  const clock = useRound(TIMING.roundMs, sparks.running);
  const fill = useFill(look === "back", still);
  const lit = useEase(look === "failed" ? DIM : 1, still);
  const shake = useShake(look === "failed", still);
  const body = look === "failed" ? palette.red : look === "back" ? palette.green : palette.gold;

  // Read off the clock once per board: interpolations are nodes the native driver keeps.
  const moving = useMemo(
    () => ({
      dots: DOTS.map((dot) => ({
        ...dot,
        style: {
          opacity: clock.interpolate(dot.opacity),
          transform: [
            { translateX: clock.interpolate(dot.x) },
            { translateY: clock.interpolate(dot.y) },
          ],
        },
      })),
      pads: PADS.map((pad) => ({ ...pad, opacity: clock.interpolate(pad.lit) })),
    }),
    [clock],
  );

  return (
    <View
      style={styles.board}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: lit }]}>
        <Svg width={SIZE.width} height={SIZE.height} viewBox={VIEW_BOX}>
          {GROUND.map((band) => (
            <Path
              key={band.opacity}
              d={band.d}
              fill={palette.ink}
              fillOpacity={GROUND_INK * band.opacity}
            />
          ))}
          {TRACES.map((trace) => (
            <Path
              key={trace.key}
              d={trace.d}
              fill="none"
              stroke={palette.ink}
              strokeOpacity={TRACE_INK}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {PADS.map((pad) => (
            <Circle
              key={pad.key}
              cx={pad.x}
              cy={pad.y}
              r={PAD.r}
              fill={palette.grouped}
              stroke={palette.ink}
              strokeOpacity={TRACE_INK}
              strokeWidth={2.2}
            />
          ))}
        </Svg>
      </Animated.View>
      <Reveal fill={fill} testID={`${testID}-flood`}>
        <Svg width={SIZE.width} height={SIZE.height} viewBox={VIEW_BOX}>
          {TRACES.map((trace) => (
            <Path
              key={trace.key}
              d={trace.d}
              fill="none"
              stroke={palette.green}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {PADS.map((pad) => (
            <Circle key={pad.key} cx={pad.x} cy={pad.y} r={PAD.r} fill={palette.green} />
          ))}
          {PADS.map((pad) => (
            <Circle
              key={`${pad.key}-hole`}
              cx={pad.x}
              cy={pad.y}
              r={PAD.hole}
              fill={palette.grouped}
            />
          ))}
        </Svg>
      </Reveal>
      {still ? null : (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: sparks.shown }]}
          testID={`${testID}-sparks`}
        >
          {moving.pads.map((pad) => (
            <Animated.View
              key={pad.key}
              style={[
                styles.pad,
                {
                  left: pad.left,
                  top: pad.top,
                  backgroundColor: spark,
                  shadowColor: spark,
                },
                { opacity: pad.opacity },
              ]}
            >
              <View style={[styles.hole, { backgroundColor: palette.grouped }]} />
            </Animated.View>
          ))}
          {moving.dots.map((dot) => (
            <Animated.View
              key={dot.key}
              style={[
                styles.dot,
                {
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  backgroundColor: spark,
                },
                dot.head ? [styles.glow, { shadowColor: spark }] : null,
                dot.style,
              ]}
            />
          ))}
        </Animated.View>
      )}
      <View style={styles.middle}>
        <Animated.View style={{ transform: [{ translateX: shake.interpolate(SHAKE) }] }}>
          <ChipPulse
            gold={body}
            ink={palette.ink3}
            lit={palette.ink}
            working={look === "reaching"}
            allLit={look === "back"}
            size={SIZE.mark}
          />
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * A still drawing uncovered by a circle growing from the middle of the board: the green spreading
 * out from the mark along every trace, all of it on the native driver. The circle is a clip,
 * scaled up, and what it holds is scaled down by as much again, so the drawing stands still and is
 * never stretched: only the edge of the clip moves.
 */
function Reveal({
  fill,
  testID,
  children,
}: {
  readonly fill: Animated.Value;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const grown = useMemo(() => {
    const size = fill.interpolate({ inputRange: [0, 1], outputRange: [FROM, 1] });
    return {
      size,
      back: Animated.divide(1, size),
      // Nothing at all at nought, not even the circle the green starts from under the mark.
      shown: fill.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 1, 1] }),
    };
  }, [fill]);
  return (
    <Animated.View
      style={[styles.reveal, { opacity: grown.shown, transform: [{ scale: grown.size }] }]}
      testID={testID}
    >
      <Animated.View style={[styles.revealed, { transform: [{ scale: grown.back }] }]}>
        <View style={styles.revealedBoard}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Whether the sparks are shown, and whether their clock runs. They fade rather than vanish, and
 * keep running while they fade, so a spark half way down its trace goes out where it is rather
 * than jumping back to the start of its round. The clock starts in the same commit as the look
 * that asks for it, as the pins' does, or the sparks would leave a frame behind their pins.
 */
function useSparks(
  reaching: boolean,
  still: boolean,
): { readonly shown: Animated.Value; readonly running: boolean } {
  const shown = useRef(new Animated.Value(reaching && !still ? 1 : 0)).current;
  const [was, setWas] = useState(reaching);
  const [fading, setFading] = useState(false);
  if (reaching !== was) {
    setWas(reaching);
    setFading(!reaching);
  }
  useEffect(() => {
    const motion = Animated.timing(shown, {
      toValue: reaching ? 1 : 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    });
    motion.start(({ finished }) => {
      if (finished && !reaching) setFading(false);
    });
    return () => motion.stop();
  }, [shown, reaching]);
  return { shown, running: (reaching || fading) && !still };
}

/** The green's progress: run once as the board turns green, there at once without motion. */
function useFill(on: boolean, still: boolean): Animated.Value {
  const fill = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (!on || still) {
      fill.setValue(on ? 1 : 0);
      return;
    }
    fill.setValue(0);
    const motion = Animated.timing(fill, {
      toValue: 1,
      duration: FILL_MS,
      easing: Easing.bezier(0.25, 0.7, 0.3, 1),
      useNativeDriver: NATIVE,
    });
    motion.start();
    return () => motion.stop();
  }, [fill, on, still]);
  return fill;
}

/** A value eased to where it is asked to be, or put there at once without motion. */
function useEase(to: number, still: boolean): Animated.Value {
  const value = useRef(new Animated.Value(to)).current;
  useEffect(() => {
    if (still) {
      value.setValue(to);
      return;
    }
    const motion = Animated.timing(value, {
      toValue: to,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    });
    motion.start();
    return () => motion.stop();
  }, [value, to, still]);
  return value;
}

/**
 * The shake, once, when the board turns red while it is on screen. Not when it opens red: a sheet
 * rising on a shaking mark would be saying it twice.
 */
function useShake(failed: boolean, still: boolean): Animated.Value {
  const shake = useRef(new Animated.Value(0)).current;
  const was = useRef(failed);
  useEffect(() => {
    const turned = failed && !was.current;
    was.current = failed;
    if (!turned || still) return;
    shake.setValue(0);
    const motion = Animated.timing(shake, {
      toValue: 1,
      duration: SHAKE_MS,
      easing: Easing.linear,
      useNativeDriver: NATIVE,
    });
    motion.start();
    return () => motion.stop();
  }, [shake, failed, still]);
  return shake;
}

const styles = StyleSheet.create({
  board: { width: SIZE.width, height: SIZE.height },
  middle: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" },
  // The clip: a circle as wide as the green must spread, centred on the board.
  reveal: {
    position: "absolute",
    left: SIZE.width / 2 - REACH,
    top: SIZE.height / 2 - REACH,
    width: REACH * 2,
    height: REACH * 2,
    borderRadius: REACH,
    overflow: "hidden",
  },
  revealed: { width: REACH * 2, height: REACH * 2 },
  // The drawing, back where the board has it.
  revealedBoard: {
    position: "absolute",
    left: REACH - SIZE.width / 2,
    top: REACH - SIZE.height / 2,
    width: SIZE.width,
    height: SIZE.height,
  },
  dot: { position: "absolute", left: 0, top: 0 },
  // A spark's light on the board round it. iOS draws it; elsewhere the spark is simply bright.
  glow: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 * SHOWN },
  pad: {
    position: "absolute",
    width: SIZE.pad * 2,
    height: SIZE.pad * 2,
    borderRadius: SIZE.pad,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5 * SHOWN,
  },
  hole: { width: SIZE.hole * 2, height: SIZE.hole * 2, borderRadius: SIZE.hole },
});
