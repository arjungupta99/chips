/**
 * `QuietTimes.tsx` for the web target, which has no time wheel: two fields, From and To. Each
 * keeps what is being typed and hands a time on only once it is whole — a field that only took a
 * complete time could not be typed into at all, since the first keystroke is not one — and
 * neither ever fills in the other.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Field } from "../ui/Field";
import { SPACE } from "../ui/tokens";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function QuietTimes({
  from,
  to,
  onChange,
}: {
  readonly from: string;
  readonly to: string;
  readonly onChange: (next: { readonly from: string; readonly to: string }) => void;
}) {
  const [typedFrom, setFrom] = useState(from);
  const [typedTo, setTo] = useState(to);
  useEffect(() => setFrom(from), [from]);
  useEffect(() => setTo(to), [to]);
  return (
    <View style={styles.times}>
      <View style={styles.time}>
        <Field
          label="From"
          value={typedFrom}
          onChange={(typed) => {
            setFrom(typed);
            if (TIME.test(typed)) onChange({ from: typed, to });
          }}
          placeholder="22:00"
          testID="quiet-from"
        />
      </View>
      <View style={styles.time}>
        <Field
          label="To"
          value={typedTo}
          onChange={(typed) => {
            setTo(typed);
            if (TIME.test(typed)) onChange({ from, to: typed });
          }}
          placeholder="07:00"
          testID="quiet-to"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  times: { flexDirection: "row", gap: SPACE.md, paddingHorizontal: SPACE.lg },
  time: { flex: 1 },
});
