/**
 * Stop asking's lengths on a harness's Chips's rules page (ADR 0300): 1 hour, 8 hours, until
 * tomorrow, in a row, each a tick under the finger. The web's
 * (`apps/web/src/app/permissions/StopLengths.tsx`) in the phone's terms; the words are core's.
 */

import { SNOOZE_CHIPS, type SnoozeLength, snoozeChipWords } from "@chipschat/core";
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import * as feel from "../../ui/haptics";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import { useReduceMotion } from "../../ui/useReduceMotion";

/** A fold opening or closing, eased as the list's rows are; at once under Reduce Motion. */
export function useFold(): () => void {
  const still = useReduceMotion();
  return () => {
    if (!still) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
}

/** The lengths with an end, in a row. */
export function LengthChips({
  label,
  onPick,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly onPick: (length: SnoozeLength) => void;
  readonly disabled?: boolean;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.chips} accessibilityLabel={label}>
      {SNOOZE_CHIPS.map((length) => (
        <Pressable
          key={length}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={`${label}: ${snoozeChipWords(length)}`}
          disabled={disabled}
          onPress={() => {
            feel.tick();
            onPick(length);
          }}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: palette.line2,
              backgroundColor: pressed ? palette.surface2 : palette.surface,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
          testID={`${testID}-${length}`}
        >
          <Text style={[styles.chipWords, { color: palette.ink }]}>{snoozeChipWords(length)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  chip: {
    minHeight: 36,
    paddingHorizontal: SPACE.md,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWords: { fontSize: TEXT.sm, fontWeight: "600" },
});
