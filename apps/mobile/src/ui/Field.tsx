/**
 * A labelled box to type in. The label is a real label — `accessibilityLabel` on the input, not
 * a line of text near it — so a screen reader says what the box is for when focus lands there.
 */

import { StyleSheet, Text, TextInput, View } from "react-native";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  lines = 1,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string | undefined;
  /** More than one turns it into a text area. */
  readonly lines?: number;
  readonly disabled?: boolean;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.ink2 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.ink3}
        editable={!disabled}
        multiline={lines > 1}
        numberOfLines={lines}
        style={[
          styles.input,
          {
            backgroundColor: palette.surface,
            borderColor: palette.line2,
            color: palette.ink,
            minHeight: lines > 1 ? 44 + 22 * (lines - 1) : 44,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.xs },
  label: { fontSize: TEXT.sm, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    fontSize: TEXT.body,
    textAlignVertical: "top",
  },
});
