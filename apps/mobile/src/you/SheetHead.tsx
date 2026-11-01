/**
 * The top of a sheet on You: what it holds, at the left, and the sheet's X at the right, which
 * `Sheet` draws (ADR 0169). A sheet that sends something has its word too — Save — just left of
 * the X: a sheet with a field in it is left by a thumb that has just typed, and the top right is
 * where a phone keeps that word (ADR 0085). The X leaves without it. A sheet that only shows or
 * sets things has no word: Done, which only closed it, went with the X.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CLOSE_ROOM } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

export function SheetHead({
  title,
  action,
  disabled = false,
  busy = false,
}: {
  readonly title: string;
  /** The word that sends what the sheet holds, and what it does. */
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
  readonly disabled?: boolean;
  readonly busy?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {title}
      </Text>
      {action === undefined ? null : busy ? (
        <ActivityIndicator color={palette.ink3} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={12}
          onPress={action.onPress}
        >
          <Text style={[styles.action, { color: disabled ? palette.ink4 : palette.accent }]}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // On the X's line, with its room kept at the right.
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.md,
    minHeight: 22,
    paddingLeft: SPACE.xl,
    paddingRight: CLOSE_ROOM,
    paddingBottom: SPACE.md,
  },
  title: { flexShrink: 1, fontSize: TEXT.lg, fontWeight: "700" },
  action: { fontSize: TEXT.body, fontWeight: "600" },
});
