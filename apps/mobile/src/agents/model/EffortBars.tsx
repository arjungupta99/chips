/**
 * An agent's effort as bars (ADR 0141): one per level its harness gives, lowest first, rising, lit
 * gold up to the one it runs at. Small at the right of the model row; big in the sheet, where each
 * bar is a button with its level's name under it (five levels or fewer; above that, only the
 * chosen one's name, big, over them).
 *
 * Flat, as every control is (Arjun: "3d button not looking good"), and the cool goes into motion:
 * when the level moves, the light sweeps along the bars that change, a bar every 50 ms, up when it
 * rises and down when it falls; in the sheet it sweeps up from nothing as the sheet arrives, and
 * the chosen bar stands a little taller on a spring. The gold is a layer over each bar whose
 * opacity moves, which the native driver can carry; a colour cannot be. Reduce Motion lights them
 * at once.
 */

import { NAMED_BARS_MAX, sweepOf } from "@chipschat/core";
import { EFFORT_LEVELS_MAX, type EffortLevel } from "@chipschat/protocol";
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { tick } from "../../ui/haptics";
import { usePalette } from "../../ui/theme";
import { useReduceMotion } from "../../ui/useReduceMotion";

const NATIVE = Platform.OS !== "web";
const LIGHT_MS = 250;
/** How much taller the chosen bar stands in the sheet. */
const AT_GROWS = 0.06;

/** A row's bars, and the sheet's: the shortest's height and the tallest's. */
const ROW = { low: 5, high: 13, width: 3, gap: 2 };
const DIAL = { low: 16, high: 40 };

/** The height of the bar at `at` of `count`, rising evenly from `low` to `high`. */
function heightOf(at: number, count: number, low: number, high: number): number {
  if (count <= 1) return (low + high) / 2;
  return low + ((high - low) * at) / (count - 1);
}

/**
 * Each bar's light, from nought to one, moved when `level` does (`sweepOf`). `fromNothing`: on its
 * first frame none is lit, and the light sweeps up to the level. The bars are kept by place, not
 * by level, so a model with other levels relabels the same bars; one past the model's last has no
 * bar to draw on, and is put out where it stands.
 */
function useSweep(count: number, level: number, fromNothing: boolean): readonly Animated.Value[] {
  const less = useReduceMotion();
  const start = fromNothing && !less ? -1 : level;
  const [lights] = useState(() =>
    Array.from({ length: EFFORT_LEVELS_MAX }, (_, at) => new Animated.Value(at <= start ? 1 : 0)),
  );
  const was = useRef(start);
  useEffect(() => {
    const changes = sweepOf(count, was.current, level);
    was.current = level;
    for (const light of lights.slice(count)) light.setValue(0);
    const moves = changes.map(({ at, on, delay }) => {
      const light = lights[at] as Animated.Value;
      if (less) light.setValue(on);
      return Animated.timing(light, {
        toValue: on,
        duration: LIGHT_MS,
        delay,
        useNativeDriver: NATIVE,
      });
    });
    if (!less && moves.length > 0) Animated.parallel(moves).start();
  }, [count, level, less, lights]);
  return lights;
}

/** The small bars at the right of the model row: decorative, since the row says its level. */
export function RowBars({
  levels,
  level,
  quiet = false,
}: {
  readonly levels: readonly EffortLevel[];
  readonly level: number;
  /** Away or read only: the lit bars in grey. */
  readonly quiet?: boolean;
}) {
  const palette = usePalette();
  const lights = useSweep(levels.length, level, false);
  if (levels.length === 0) return null;
  return (
    <View
      style={[styles.row, { height: ROW.high, gap: ROW.gap }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="model-row-bars"
    >
      {levels.map((_, at) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place, whatever level it shows.
          key={at}
          style={[
            styles.rowBar,
            {
              width: ROW.width,
              height: heightOf(at, levels.length, ROW.low, ROW.high),
              borderRadius: ROW.width / 2,
              backgroundColor: palette.line2,
            },
          ]}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: quiet ? palette.ink4 : palette.gold, opacity: lights[at] ?? 0 },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * The sheet's bars: buttons, rising, each with its level's name under it while there are five or
 * fewer. `off`: Same is on, and the bars show the default's level without taking a press.
 */
export function DialBars({
  levels,
  level,
  off,
  onPick,
}: {
  readonly levels: readonly EffortLevel[];
  readonly level: number;
  readonly off: boolean;
  readonly onPick: (effortId: string) => void;
}) {
  const lights = useSweep(levels.length, level, true);
  const named = levels.length <= NAMED_BARS_MAX;
  return (
    <View
      style={styles.dial}
      accessibilityRole="radiogroup"
      accessibilityLabel="Effort"
      testID="model-levels"
    >
      {levels.map((each, at) => (
        <Step
          // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place, whatever level it shows.
          key={at}
          level={each}
          height={heightOf(at, levels.length, DIAL.low, DIAL.high)}
          light={lights[at]}
          chosen={at === level}
          named={named}
          off={off}
          onPick={onPick}
        />
      ))}
    </View>
  );
}

function Step({
  level,
  height,
  light,
  chosen,
  named,
  off,
  onPick,
}: {
  readonly level: EffortLevel;
  readonly height: number;
  readonly light: Animated.Value | undefined;
  readonly chosen: boolean;
  readonly named: boolean;
  readonly off: boolean;
  readonly onPick: (effortId: string) => void;
}) {
  const palette = usePalette();
  const stands = useStands(chosen);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={level.label}
      accessibilityState={{ checked: chosen, disabled: off }}
      disabled={off}
      onPress={() => {
        if (chosen) return;
        tick();
        onPick(level.id);
      }}
      hitSlop={{ top: 12, bottom: 4 }}
      style={styles.step}
      testID={`model-level-${level.id}`}
    >
      <Animated.View
        style={[
          styles.bar,
          {
            height,
            backgroundColor: palette.surface3,
            transformOrigin: "bottom",
            transform: [{ scaleY: stands }],
          },
        ]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.barLight,
            { backgroundColor: palette.gold, opacity: light ?? 0 },
          ]}
        />
      </Animated.View>
      {named ? (
        <Text
          numberOfLines={1}
          style={[styles.name, { color: chosen ? palette.ink : palette.ink3 }]}
        >
          {level.label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The chosen bar's height, a little over its own, on a spring that overshoots and settles. */
function useStands(chosen: boolean): Animated.AnimatedInterpolation<number> {
  const less = useReduceMotion();
  const [at] = useState(() => new Animated.Value(chosen ? 1 : 0));
  useEffect(() => {
    if (less) return at.setValue(chosen ? 1 : 0);
    Animated.spring(at, {
      toValue: chosen ? 1 : 0,
      friction: 5,
      tension: 160,
      useNativeDriver: NATIVE,
    }).start();
  }, [at, chosen, less]);
  return at.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + AT_GROWS] });
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end" },
  rowBar: { overflow: "hidden" },
  dial: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  step: { flex: 1, alignItems: "stretch", gap: 8 },
  bar: { borderRadius: 7, overflow: "hidden" },
  barLight: { borderRadius: 7 },
  name: { fontSize: 12, fontWeight: "600", textAlign: "center" },
});
