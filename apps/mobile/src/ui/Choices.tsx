/**
 * A list of things to pick from: how far a yes reaches, who to hand an ask to, what a harness
 * asked. One choice or several, laid out in a row when the options are two or three short words
 * and in a column when they are sentences.
 *
 * Each row is a radio or a checkbox to a screen reader — which it is, and which one is chosen,
 * both spoken — because a tick drawn in a corner is not information anybody else can get at.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

export interface Choice {
  readonly value: string;
  readonly label: string;
  readonly description?: string | undefined;
  /** Said under it in amber: an agent that can't answer now (ADR 0083). */
  readonly warning?: string | undefined;
}

export function Choices({
  label,
  options,
  chosen,
  onChoose,
  many = false,
  row = false,
  disabled = false,
}: {
  readonly label: string;
  readonly options: readonly Choice[];
  readonly chosen: readonly string[];
  readonly onChoose: (value: string) => void;
  /** Several may be picked at once. */
  readonly many?: boolean;
  readonly row?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <View
      accessibilityRole={many ? undefined : "radiogroup"}
      accessibilityLabel={label}
      style={row ? styles.row : styles.column}
    >
      {options.map((option) => (
        <One
          key={option.value}
          option={option}
          on={chosen.includes(option.value)}
          many={many}
          row={row}
          disabled={disabled}
          onPress={() => onChoose(option.value)}
        />
      ))}
    </View>
  );
}

function One({
  option,
  on,
  many,
  row,
  disabled,
  onPress,
}: {
  readonly option: Choice;
  readonly on: boolean;
  readonly many: boolean;
  readonly row: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole={many ? "checkbox" : "radio"}
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={
        option.warning === undefined ? option.label : `${option.label}, ${option.warning}`
      }
      {...(option.description === undefined ? {} : { accessibilityHint: option.description })}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        row ? styles.inRow : null,
        {
          backgroundColor: on ? palette.surface2 : palette.surface,
          borderColor: on ? palette.ink3 : palette.line,
        },
        disabled ? styles.off : null,
      ]}
    >
      <Text
        style={[styles.label, { color: palette.ink, fontWeight: on ? "700" : "600" }]}
        numberOfLines={row ? 1 : undefined}
      >
        {option.label}
      </Text>
      {option.description === undefined ? null : (
        <Text style={[styles.description, { color: palette.ink3 }]}>{option.description}</Text>
      )}
      {option.warning === undefined ? null : (
        <Text style={[styles.description, { color: palette.amberInk }]}>{option.warning}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { gap: SPACE.sm },
  row: { flexDirection: "row", gap: SPACE.sm },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 2,
  },
  inRow: { flex: 1, alignItems: "center" },
  off: { opacity: 0.5 },
  label: { fontSize: TEXT.md },
  description: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
});
