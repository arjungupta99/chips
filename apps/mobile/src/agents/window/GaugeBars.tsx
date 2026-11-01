/**
 * The window as bars on an agent's page (ADR 0146, layout B): `WINDOW_BARS` bars lit up to how
 * full it is, in the context ring's tone, and the limit it compacts itself at as a marker standing
 * in them, with a flag naming it. A finger drags the marker along the bars, it snaps to the
 * harness's limits as it goes with a click at each, and letting go picks the one under it.
 *
 * Everything that moves is a transform on the UI thread (ADR 0061's rule): the drag, the marker's
 * spring back to a limit, the fill sweeping to a new level, and the lit bars breathing while it
 * compacts. The fill is the lit row clipped by a window that slides, so no frame lays anything out.
 * Bars past the limit and unlit stand shorter: what it never fills before it compacts.
 *
 * Past the fill, faint bars in its last long turn's tone run up to how full that turn got, its top
 * bar held at full strength with a cap, and the turn's words under it in the scale, between the
 * 0 and the window (his pick, way 1 of the peak mock). The top bar lands and the words rise in
 * when they first show, transforms too.
 *
 * Its one Reanimated and gesture import, as `media/Stage.tsx` is the viewer's, so Jest stands in
 * for it (`jest.setup.js`); the drag is the simulator's to show.
 */

import { WINDOW_BARS } from "@chipschat/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as feel from "../../ui/haptics";
import { usePalette } from "../../ui/theme";
import { TEXT } from "../../ui/tokens";

/** Its last long turn, past the fill. */
export interface GaugeGhost {
  /** How many bars it reaches: those past the lit ones draw faint, the last of them held. */
  readonly bars: number;
  /** The faint bars' and the top bar's colour: the ring's tone for how full the turn got. */
  readonly ink: string;
  /** Under the top bar: "Last long turn", then the percent in bold. */
  readonly words: string;
  readonly percent: string;
  readonly wordsInk: string;
}

export interface GaugeBarsProps {
  /** How many bars are lit. */
  readonly lit: number;
  /** The lit bars' colour: the ring's tone for how full it is. */
  readonly ink: string;
  /** Where the marker stands, in percent; nothing draws none. */
  readonly marker: number | undefined;
  /** The limits the marker snaps to, lowest first. */
  readonly choices: readonly number[];
  /** Whether a finger may drag the marker now. */
  readonly drags: boolean;
  /** Away or read only: a tap says why instead. */
  readonly quiet: boolean;
  /** While it compacts, the lit bars breathe. */
  readonly compacting: boolean;
  /** The window, under the bars' far end: "272k". */
  readonly end: string;
  readonly ghost: GaugeGhost | undefined;
  /**
   * The copy was just read: on its first draw the fill climbs from none. Otherwise, kept from
   * before, the fill stands at its level at once (ADR 0238).
   */
  readonly climb?: boolean | undefined;
  readonly onPick: (at: number) => void;
  readonly onQuiet: () => void;
}

const BAR_WIDTH = 4;
const BAR_HEIGHT = 30;
/** How tall a bar past the limit stands, of a full one. */
const PAST = 0.55;
/** The marker's spring to a limit: a little overshoot, as the mock's. */
const SETTLE = { damping: 16, stiffness: 220, mass: 0.7 } as const;
/** The fill's sweep to a new level. */
const SWEEP = { duration: 1100, easing: Easing.out(Easing.cubic) } as const;
/** How strong a faint bar is, of its tone over the card: the mock's mix. */
const FAINT = 0.36;
/** The top bar's landing and its words' rise: a little overshoot, after the fill starts. */
const LAND = { damping: 11, stiffness: 240, mass: 0.7 } as const;
const LAND_AFTER_MS = 280;
/** Room kept at the scale's far end for the window's size, so the words never sit on it. */
const END_ROOM = 36;

/** The bars, by their place along the window. */
const PLACES = Array.from({ length: WINDOW_BARS }, (_, at) => `bar-${at}`);

/** The limit nearest a percent. */
function nearest(choices: readonly number[], percent: number): number {
  "worklet";
  let best = choices[0] ?? percent;
  for (const each of choices) {
    if (Math.abs(each - percent) < Math.abs(best - percent)) best = each;
  }
  return best;
}

/** Where the lit bars end, in points across the row: just past the last lit bar. */
function fillAt(lit: number, width: number): number {
  if (lit <= 0 || width <= 0) return 0;
  if (lit >= WINDOW_BARS) return width;
  const step = (width - BAR_WIDTH) / (WINDOW_BARS - 1);
  return (lit - 1) * step + BAR_WIDTH + (step - BAR_WIDTH) / 2;
}

/** Where a bar ends, in points across the row. */
function barRight(index: number, width: number): number {
  return index * ((width - BAR_WIDTH) / (WINDOW_BARS - 1)) + BAR_WIDTH;
}

/** How a bar under the lit row stands: faint up to the last long turn, its top bar held, shorter past the limit. */
function standOf(
  index: number,
  lit: number,
  marker: number | undefined,
  ghost: GaugeGhost | undefined,
): "faint" | "top" | "past" | "plain" {
  if (ghost !== undefined && index >= lit && index < ghost.bars) {
    return index === ghost.bars - 1 ? "top" : "faint";
  }
  if (marker !== undefined && index >= lit && (index / WINDOW_BARS) * 100 >= marker) return "past";
  return "plain";
}

/** The last long turn's top bar: it lands, a little over, then holds, with its cap above. */
function TopBar({ ink }: { readonly ink: string }) {
  const land = useSharedValue(0);
  useEffect(() => {
    land.value = withDelay(LAND_AFTER_MS, withSpring(1, LAND));
  }, [land]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.3 + 0.7 * land.value }] }));
  return (
    <Animated.View style={[styles.bar, styles.top, { backgroundColor: ink }, style]}>
      <View style={[styles.cap, { backgroundColor: ink }]} />
    </Animated.View>
  );
}

/** Under the top bar, its words rise in, right edge under the bar's, clear of the window's size. */
function GhostWords({ ghost, width }: { readonly ghost: GaugeGhost; readonly width: number }) {
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.value = withDelay(LAND_AFTER_MS + 120, withSpring(1, LAND));
  }, [rise]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.value),
    transform: [{ translateY: (1 - rise.value) * -4 }],
  }));
  const right = Math.min(barRight(ghost.bars - 1, width), width - END_ROOM);
  return (
    <Animated.View
      style={[styles.ghostWords, { width: right }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.scaleWords, { color: ghost.wordsInk }]} numberOfLines={1}>
        {`${ghost.words} `}
        <Text style={styles.bold}>{ghost.percent}</Text>
      </Text>
    </Animated.View>
  );
}

export function GaugeBars(props: GaugeBarsProps) {
  const { lit, ink, marker, choices, drags, quiet, compacting, onPick, onQuiet } = props;
  const { end, ghost, climb = true } = props;
  const palette = usePalette();
  const [width, setWidth] = useState(0);
  // The flag's limit: the marker's, or the one under the finger while it drags.
  const [flag, setFlag] = useState(marker);
  const across = useSharedValue(0);
  const place = useSharedValue(0);
  const shown = useSharedValue(marker ?? 0);
  const fill = useSharedValue(0);
  const breath = useSharedValue(1);

  useEffect(() => {
    across.value = width;
  }, [across, width]);

  // The marker goes where the copy says, unless a finger has it.
  useEffect(() => {
    if (marker === undefined || width <= 0) return;
    setFlag(marker);
    shown.value = marker;
    place.value =
      place.value === 0 ? (marker / 100) * width : withSpring((marker / 100) * width, SETTLE);
  }, [marker, width, place, shown]);

  // The fill sweeps to its level, from none on the first draw of a copy just read; a kept copy's
  // stands at its level from the first frame.
  const placed = useRef(false);
  useEffect(() => {
    const to = fillAt(lit, width);
    if (!placed.current && width > 0) {
      placed.current = true;
      if (!climb) {
        fill.value = to;
        return;
      }
    }
    fill.value = withTiming(to, SWEEP);
  }, [lit, width, fill, climb]);

  useEffect(() => {
    if (compacting) {
      breath.value = withRepeat(
        withTiming(0.35, { duration: 520, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
      return;
    }
    cancelAnimation(breath);
    breath.value = withTiming(1, { duration: 240 });
  }, [compacting, breath]);

  const gesture = useMemo(() => {
    const snap = (at: number) => {
      setFlag(at);
      feel.tick();
    };
    const pan = Gesture.Pan()
      .enabled(drags)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onUpdate((event) => {
        const w = across.value;
        if (w <= 0) return;
        const low = choices[0] ?? 0;
        const high = choices[choices.length - 1] ?? 100;
        const percent = Math.min(high, Math.max(low, (event.x / w) * 100));
        place.value = (percent / 100) * w;
        const at = nearest(choices, percent);
        if (at !== shown.value) {
          shown.value = at;
          scheduleOnRN(snap, at);
        }
      })
      .onEnd(() => {
        place.value = withSpring((shown.value / 100) * across.value, SETTLE);
        scheduleOnRN(onPick, shown.value);
      });
    const tap = Gesture.Tap()
      .enabled(quiet)
      .onEnd(() => {
        scheduleOnRN(onQuiet);
      });
    return Gesture.Race(pan, tap);
  }, [drags, quiet, choices, onPick, onQuiet, across, place, shown]);

  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: place.value - 1 }] }));
  // The window over the lit row slides left by what is unlit; the row inside slides back by the
  // same, so the bars stand still while the window reveals or hides them.
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fill.value - across.value }],
  }));
  const rowStyle = useAnimatedStyle(() => ({
    opacity: breath.value,
    transform: [{ translateX: across.value - fill.value }],
  }));

  const step = (at: number) => {
    const index = choices.indexOf(flag ?? -1);
    const next = choices[Math.max(0, Math.min(choices.length - 1, index + at))];
    if (next !== undefined && next !== flag) onPick(next);
  };

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.bars}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Compacts itself at"
          accessibilityValue={{ text: flag === undefined ? "Only when asked" : `${flag}%` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (quiet) return onQuiet();
            if (!drags) return;
            step(event.nativeEvent.actionName === "increment" ? 1 : -1);
          }}
          testID="window-bars"
        >
          {PLACES.map((place, index) => {
            const stand = standOf(index, lit, marker, ghost);
            if (stand === "top" && ghost !== undefined)
              return <TopBar key={place} ink={ghost.ink} />;
            return (
              <View
                key={place}
                style={[
                  styles.bar,
                  stand === "past" ? styles.past : null,
                  stand === "faint" && ghost !== undefined
                    ? { backgroundColor: ghost.ink, opacity: FAINT }
                    : { backgroundColor: palette.line2 },
                ]}
              />
            );
          })}
          <Animated.View style={[styles.clip, { width }, clipStyle]} pointerEvents="none">
            <Animated.View style={[styles.lit, { width }, rowStyle]}>
              {PLACES.map((place) => (
                <View key={place} style={[styles.bar, { backgroundColor: ink }]} />
              ))}
            </Animated.View>
          </Animated.View>
          {marker === undefined ? null : (
            <Animated.View
              style={[
                styles.marker,
                { backgroundColor: quiet ? palette.ink4 : palette.ink },
                markerStyle,
              ]}
              pointerEvents="none"
              testID="window-marker"
            >
              <View style={[styles.flag, { backgroundColor: quiet ? palette.ink4 : palette.ink }]}>
                <Text
                  style={[styles.flagWords, { color: palette.bg }]}
                >{`${flag ?? marker}%`}</Text>
              </View>
            </Animated.View>
          )}
        </View>
      </GestureDetector>
      <View style={styles.scale}>
        <Text style={[styles.scaleWords, { color: palette.ink3 }]}>0</Text>
        {ghost === undefined || width <= 0 ? null : (
          <GhostWords key={ghost.bars} ghost={ghost} width={width} />
        )}
        <Text style={[styles.scaleWords, { color: palette.ink3 }]}>{end}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bars: {
    height: 62,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  bar: { width: BAR_WIDTH, height: BAR_HEIGHT, borderRadius: BAR_WIDTH / 2 },
  past: { height: BAR_HEIGHT * PAST },
  top: { transformOrigin: "bottom" },
  cap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -6,
    height: 3,
    borderRadius: 1.5,
  },
  clip: { position: "absolute", left: 0, bottom: 0, height: BAR_HEIGHT, overflow: "hidden" },
  lit: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  marker: { position: "absolute", left: 0, top: 2, bottom: -5, width: 2, borderRadius: 1 },
  flag: {
    position: "absolute",
    top: -2,
    left: -22,
    width: 46,
    height: 21,
    borderRadius: 10.5,
    alignItems: "center",
    justifyContent: "center",
  },
  flagWords: { fontSize: TEXT.xs, fontWeight: "700", fontVariant: ["tabular-nums"] },
  scale: { flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  scaleWords: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
  ghostWords: { position: "absolute", left: 0, top: 0, alignItems: "flex-end" },
});
