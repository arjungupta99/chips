/**
 * When quiet hours start and end: two tiles, From and To, and under them the system's own time
 * wheel turning whichever tile is chosen (ADR 0085). The wheel is the phone's, so a time is set
 * the way every other time on this phone is set; what stood here before were two boxes a time
 * had to be typed into, digit by digit, that took nothing until it was whole.
 *
 * On Android the wheel is not drawn in place — the platform's time picker is a dialog — so a tile
 * opens it. `QuietTimes.web.tsx` is two fields, for the web target, which has no wheel at all.
 */

import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as feel from "../ui/haptics";
import { usePalette, useScheme } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { clockWords } from "./words";

/** `22:00` as a date today, which is what the picker holds. */
function dateOf(time: string): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  return at;
}

/** And back. */
function timeOf(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export function QuietTimes({
  from,
  to,
  onChange,
}: {
  readonly from: string;
  readonly to: string;
  readonly onChange: (next: { readonly from: string; readonly to: string }) => void;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const [editing, setEditing] = useState<"from" | "to">("from");
  const set = (which: "from" | "to", time: string) =>
    onChange(which === "from" ? { from: time, to } : { from, to: time });
  const open = (which: "from" | "to") => {
    feel.tap();
    setEditing(which);
    if (Platform.OS !== "android") return;
    DateTimePickerAndroid.open({
      value: dateOf(which === "from" ? from : to),
      mode: "time",
      // The phone's own 12- or 24-hour clock, as the tiles say the time in: told 24 hours, the
      // dialog read 22:00 over a tile saying 10:00 PM (the emulator, 16 October 2026).
      // A time set, and only that: Cancel and a tap beside the dialog leave the tile as it was.
      onValueChange: (_event, at) => set(which, timeOf(at)),
    });
  };
  return (
    <View style={styles.body}>
      <View style={styles.tiles}>
        <Tile label="From" time={from} on={editing === "from"} onPress={() => open("from")} />
        <Tile label="To" time={to} on={editing === "to"} onPress={() => open("to")} />
      </View>
      {Platform.OS === "android" ? null : (
        <View style={[styles.wheel, { backgroundColor: palette.surface }]}>
          <DateTimePicker
            testID="quiet-wheel"
            value={dateOf(editing === "from" ? from : to)}
            mode="time"
            display="spinner"
            minuteInterval={5}
            themeVariant={scheme}
            textColor={palette.ink}
            onValueChange={(_event, at) => set(editing, timeOf(at))}
          />
        </View>
      )}
    </View>
  );
}

function Tile({
  label,
  time,
  on,
  onPress,
}: {
  readonly label: string;
  readonly time: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${clockWords(time)}`}
      accessibilityState={{ selected: on }}
      testID={`quiet-${label.toLowerCase()}`}
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: palette.surface, borderColor: on ? palette.accent : "transparent" },
      ]}
    >
      <Text style={[styles.tileLabel, { color: palette.ink3 }]}>{label}</Text>
      <Text style={[styles.tileTime, { color: palette.ink }]}>{clockWords(time)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  tiles: { flexDirection: "row", gap: SPACE.sm },
  tile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: SPACE.sm + 2,
  },
  tileLabel: { fontSize: TEXT.xs },
  tileTime: { fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"] },
  wheel: { borderRadius: 22, overflow: "hidden", alignItems: "center" },
});
