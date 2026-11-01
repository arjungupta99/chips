/**
 * The detail half of a split: a bar with the name of what is open, and the thing itself under
 * it. On a phone the same thing is a pushed screen and the navigation bar names it; in a split
 * there is no bar, so this draws one, as the platform's own reads (ADR 0177): the name in the
 * middle, at the bar's own size, and a way back at its leading end in glass when the thing open
 * grew from another — a thread from its space, an agent's card from the room it was opened from,
 * its history from its card. Until 16 October 2026 the name stood at the bar's leading edge, a
 * size up, with a "‹" typed in front of it.
 *
 * The bar itself (`PaneBar`) is shared with the room beside the list (`spaces/RoomPane.tsx`),
 * whose name is the room's capsule and floats on glass over the room as a phone's room does.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Capsule } from "./Glass";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";

/** The bar's height without what stands in its middle: the platform's own, a regular width's. */
export const PANE_BAR = 52;

export function Pane({
  title,
  onBack,
  children,
}: {
  readonly title: string;
  /** Present when there is somewhere to go back to inside the pane itself. */
  readonly onBack?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <SafeAreaView edges={TOP_AND_RIGHT} style={[styles.pane, { backgroundColor: palette.bg }]}>
      <PaneBar onBack={onBack} ruled>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
      </PaneBar>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

/**
 * A detail pane's bar: the way back at its leading end, what names the pane in the middle of the
 * whole bar whatever stands at either end, and what stands at its trailing end.
 */
export function PaneBar({
  onBack,
  trailing,
  ruled = false,
  children,
}: {
  readonly onBack?: (() => void) | undefined;
  /** What stands where a navigation bar keeps its right-hand button: the room's connection. */
  readonly trailing?: ReactNode;
  /** A hairline under it, for a bar that stands above its page rather than floating over it. */
  readonly ruled?: boolean;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.bar,
        ruled ? { borderBottomWidth: hairline, borderColor: palette.line } : null,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.middle} pointerEvents="box-none">
        {children}
      </View>
      <View style={styles.end}>
        {onBack === undefined ? null : (
          <PaneButton icon="previous" label="Back" onPress={onBack} testID="pane-back" />
        )}
      </View>
      <View style={[styles.end, styles.trailing]}>{trailing}</View>
    </View>
  );
}

/** A round button of glass in a pane's bar, as the platform draws its own back. */
export function PaneButton({
  icon,
  label,
  onPress,
  testID,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={SPACE.xs}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Capsule style={styles.round} interactive>
        <Icon name={icon} size={20} color={palette.ink} weight={2.2} />
      </Capsule>
    </Pressable>
  );
}

/**
 * What a detail pane says with nothing open in it: in the middle of the pane, a mark over a line,
 * rather than one grey sentence at its top left over an empty page. It is the whole pane, with no
 * bar: there is nothing open to name, and a bar naming the list beside it said "Spaces" twice
 * across the screen, as Mail and Settings do not (the iPad simulator, 16 October 2026).
 */
export function PaneEmpty({
  icon,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.empty, { backgroundColor: palette.bg }]} testID="pane-empty">
      <View style={[styles.emptyMark, { backgroundColor: palette.surface2 }]}>
        <Icon name={icon} size={30} color={palette.ink3} />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.ink2 }]}>{title}</Text>
      <Text style={[styles.emptyLine, { color: palette.ink3 }]}>{children}</Text>
    </View>
  );
}

const TOP_AND_RIGHT = ["top", "right"] as const;
const hairline = StyleSheet.hairlineWidth;
/** A round button's side: a thumb's, and the platform's own glass back. */
const ROUND = 44;

const styles = StyleSheet.create({
  pane: { flex: 1 },
  bar: {
    minHeight: PANE_BAR,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  // The name in the middle of the whole bar, not of what is left between its two ends.
  middle: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ROUND + SPACE.xl,
  },
  end: { minWidth: ROUND, minHeight: ROUND, justifyContent: "center" },
  trailing: { marginLeft: "auto", alignItems: "flex-end" },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: TEXT.body, fontWeight: "600" },
  body: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.xxl,
    paddingBottom: 96,
    gap: SPACE.sm,
  },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACE.sm,
  },
  emptyTitle: { fontSize: TEXT.lg, fontWeight: "600" },
  emptyLine: { fontSize: TEXT.md, textAlign: "center", maxWidth: 380 },
});
