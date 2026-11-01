/**
 * A card: a surface with a line around it and a sixteen-point corner. A warm border makes it a
 * decision — the one warm thing on the screen — and a decided one keeps its shape and cools to
 * green or red, so the eye can find what it answered without reading a word.
 *
 * The corner was the design system's fourteen until 12 September 2026 (WP5). Sixteen is what iOS
 * rounds a grouped list at, so a card, the group of rows under a heading and the list of rooms
 * are one shape down the whole app, and the sheet that rises over them is the next size up.
 *
 * The web draws the tone with a border plus a four-pixel glow. Here the glow is a border two
 * pixels wide instead: React Native's shadows are platform-specific and a spread-only shadow is
 * not expressible on Android at all, and a thicker border reads the same at arm's length.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { usePalette } from "./theme";
import { RADIUS, SPACE } from "./tokens";

export type CardTone = "default" | "ask" | "approved" | "denied";

export function Card({
  tone = "default",
  padding = "md",
  style,
  testID,
  children,
}: {
  readonly tone?: CardTone;
  readonly padding?: "none" | "sm" | "md" | "lg";
  readonly style?: ViewStyle | undefined;
  readonly testID?: string | undefined;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const edges = {
    default: { borderColor: palette.line, borderWidth: 1 },
    ask: { borderColor: palette.amber, borderWidth: 2 },
    approved: { borderColor: palette.green, borderWidth: 2 },
    denied: { borderColor: palette.red, borderWidth: 2 },
  } as const;
  const padded = {
    none: 0,
    sm: SPACE.md,
    md: SPACE.lg,
    lg: SPACE.xl,
  } as const;
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: palette.surface, padding: padded[padding] },
        edges[tone],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xxl, gap: SPACE.sm },
});
