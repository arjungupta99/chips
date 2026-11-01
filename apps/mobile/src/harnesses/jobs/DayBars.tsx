/**
 * A job's last fourteen days as a bar a day (ADR 0252): each bar as tall as what its day cost
 * beside the dearest day's, or as its runs beside the busiest's for a job whose costs aren't known;
 * a dot for a day it didn't run. The newest day it ran is lit in its mark's colour, the rest
 * faint, and a bar tapped is lit instead while the page says that day's words above them.
 *
 * Once the runs are read the bars rise from their feet, oldest first, a transform on the UI thread
 * (ADR 0061's rule); with Reduce Motion they stand at once. Its one Reanimated import, so Jest
 * stands in for it (`jest.setup.js`); the rise is the simulator's to show.
 */

import type { JobDay } from "@chipschat/core";
import { costWords } from "@chipschat/core";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { usePalette } from "../../ui/theme";
import { useReduceMotion } from "../../ui/useReduceMotion";

/** How long the bars take to rise, and how far apart each starts. */
const RISE_MS = 520;
const STAGGER_MS = 28;

/** A bar a day, its height what the day cost beside the dearest; a dot for a day with no run. */
export function DayBars({
  days,
  tint,
  ready,
  picked,
  onPick,
}: {
  readonly days: readonly JobDay[];
  readonly tint: string;
  readonly ready: boolean;
  readonly picked: number | undefined;
  readonly onPick: (at: number) => void;
}) {
  const top = Math.max(...days.map((day) => day.usd ?? 0), 0);
  const most = Math.max(...days.map((day) => day.runs), 1);
  const priced = top > 0;
  const newest = days.reduce((last, day, at) => (day.runs > 0 ? at : last), -1);
  return (
    <View style={styles.bars} testID="job-bars">
      {days.map((day, at) => {
        const share = priced ? (day.usd ?? 0) / top : day.runs / most;
        return (
          <Bar
            key={day.at}
            at={at}
            share={day.runs === 0 ? 0 : Math.max(share, 0.06)}
            ran={day.runs > 0}
            lit={picked === undefined ? at === newest : at === picked}
            tint={tint}
            ready={ready}
            onPress={() => onPick(at)}
            label={`${day.label}: ${day.runs} ${day.runs === 1 ? "run" : "runs"}${day.usd === undefined ? "" : `, ${costWords(day.usd)}`}`}
          />
        );
      })}
    </View>
  );
}

function Bar({
  at,
  share,
  ran,
  lit,
  tint,
  ready,
  onPress,
  label,
}: {
  readonly at: number;
  readonly share: number;
  readonly ran: boolean;
  readonly lit: boolean;
  readonly tint: string;
  readonly ready: boolean;
  readonly onPress: () => void;
  readonly label: string;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const rise = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!ready) return;
    rise.value = still
      ? 1
      : withDelay(
          at * STAGGER_MS,
          withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }),
        );
  }, [ready, still, at, rise]);
  const grows = useAnimatedStyle(() => ({ transform: [{ scaleY: rise.value }] }));
  return (
    <Pressable
      style={styles.slot}
      onPress={ran ? onPress : undefined}
      accessibilityRole={ran ? "button" : undefined}
      accessibilityLabel={label}
      testID={`job-bar-${at}`}
    >
      {ran ? (
        <Animated.View
          style={[
            styles.bar,
            grows,
            { height: `${share * 100}%`, backgroundColor: tint, opacity: lit ? 1 : 0.42 },
          ]}
        />
      ) : (
        <View style={[styles.none, { backgroundColor: palette.line2 }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bars: { height: 92, flexDirection: "row", alignItems: "flex-end", gap: 5 },
  slot: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: {
    width: "100%",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    transformOrigin: "center bottom",
  },
  none: { width: 4, height: 4, borderRadius: 2, marginBottom: 1 },
});
