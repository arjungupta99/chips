/**
 * The pieces a sheet is built from, so that every sheet in the app reads the same: a title, and
 * one card of rows — the design system's mark in a soft circle, a name, and a line under it
 * saying what the row gives. The composer's attach sheet and the line's menu are both these, and
 * differ in what they put on the card.
 */

import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { CLOSE_ROOM } from "./SheetClose";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

/**
 * What the sheet is about, said once at the top: a heading to a screen reader, and one line
 * under it when there is more to say — who said the message, and what. Both stop short of the
 * sheet's X, which stands at the right of the first line (`SheetClose`).
 */
export function SheetTitle({
  children,
  hint,
}: {
  readonly children: string;
  readonly hint?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={styles.title}>
      <Text accessibilityRole="header" style={[styles.titleWords, { color: palette.ink }]}>
        {children}
      </Text>
      {hint === undefined ? null : (
        <Text numberOfLines={1} style={[styles.titleHint, { color: palette.ink3 }]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

/** The choices, in one card: rows parted by hairlines, a pressed row's ground clipped to the corners. */
export function SheetCard({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
      {Children.toArray(children).flatMap((row, at) => {
        if (at === 0) return [row];
        const id = isValidElement(row) ? String(row.key) : "";
        return [
          <View key={`part-${id}`} style={[styles.part, { borderTopColor: palette.line }]} />,
          row,
        ];
      })}
    </View>
  );
}

/**
 * One thing to do: the design system's mark in a soft circle, a name, and under it what it gives.
 * A row that takes something away for good, or out of sight, is red: its name and its mark.
 */
export function SheetRow({
  icon,
  label,
  hint,
  disabled = false,
  danger = false,
  trailing,
  testID,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  /** Read as the row's accessibility hint, so a screen reader hears it once, after the name. */
  readonly hint?: string | undefined;
  readonly disabled?: boolean;
  /** A deletion's row (ADR 0167). */
  readonly danger?: boolean;
  /** What stands at the row's end: the Workspaces sheet's tick, or a count (ADR 0197). */
  readonly trailing?: ReactNode;
  readonly testID?: string | undefined;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const soft = danger ? palette.redSoft : palette.surface2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: danger ? palette.redSoft : palette.surface2 } : null,
        disabled ? styles.off : null,
      ]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[styles.mark, { backgroundColor: pressed && !danger ? palette.surface3 : soft }]}
          >
            <Icon name={icon} color={danger ? palette.red : palette.ink} size={22} />
          </View>
          <View style={styles.words}>
            <Text style={[styles.label, { color: danger ? palette.red : palette.ink }]}>
              {label}
            </Text>
            {hint === undefined ? null : (
              <Text style={[styles.hint, { color: palette.ink3 }]}>{hint}</Text>
            )}
          </View>
          {trailing}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { paddingLeft: SPACE.xs, paddingRight: CLOSE_ROOM, marginBottom: SPACE.md, gap: 2 },
  titleWords: { fontSize: TEXT.lg, fontWeight: "700", letterSpacing: -0.2 },
  titleHint: { fontSize: TEXT.sm },
  card: { borderWidth: 1, borderRadius: RADIUS.lg, overflow: "hidden" },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 64,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
  },
  mark: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  words: { flex: 1, gap: 2 },
  label: { fontSize: TEXT.body, fontWeight: "600" },
  hint: { fontSize: TEXT.sm },
  off: { opacity: 0.5 },
});
