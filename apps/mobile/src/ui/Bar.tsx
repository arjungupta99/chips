/**
 * A bar: how much of something has been used. The budget on a harness's profile, the context a
 * run has eaten.
 *
 * It goes amber past three quarters and red at the line, because a budget bar that stays the
 * same colour until it stops working tells a person nothing while there is still time to act.
 * The number is always drawn beside it: a colour on its own is not a reading.
 */

import { StyleSheet, Text, View } from "react-native";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

export function Bar({
  used,
  of,
  label,
  caption,
}: {
  readonly used: number;
  readonly of: number;
  /** What is being measured: `Budget`, `Context`. */
  readonly label: string;
  /** The reading in words: `$4.10 of $20`, `48k of 200k tokens`. */
  readonly caption: string;
}) {
  const palette = usePalette();
  const share = of <= 0 ? 0 : Math.min(1, Math.max(0, used / of));
  const colour = share >= 1 ? palette.red : share >= 0.75 ? palette.amber : palette.blue;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${caption}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      style={styles.group}
    >
      <View style={styles.heading}>
        <Text style={[styles.label, { color: palette.ink2 }]}>{label}</Text>
        <Text style={[styles.caption, { color: palette.ink3 }]}>{caption}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: palette.surface3 }]}>
        <View style={[styles.fill, { backgroundColor: colour, width: `${share * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.xs },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { fontSize: TEXT.sm, fontWeight: "600" },
  caption: { fontSize: TEXT.sm },
  track: { height: 6, borderRadius: RADIUS.pill, overflow: "hidden" },
  fill: { height: 6, borderRadius: RADIUS.pill },
});
