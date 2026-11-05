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

import type { ReactNode, RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useDuo } from "./duo";
import { Capsule } from "./Glass";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { useSides, useSplitSide } from "./Split";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";
import { useTabTop } from "./windowInsets";

/** The bar's height without what stands in its middle: the platform's own, a regular width's. */
export const PANE_BAR = 52;

export function Pane({
  title,
  onBack,
  onClose,
  action,
  grouped,
  children,
}: {
  readonly title: string;
  /** Present when there is somewhere to go back to inside the pane itself. */
  readonly onBack?: (() => void) | undefined;
  /** Present when the pane is a third column that can be shut (ADR 0276): a × at its trailing end. */
  readonly onClose?: (() => void) | undefined;
  /** A form's Save or Send at the bar's trailing end, as a pushed page's navigation bar holds it. */
  readonly action?: PaneAction | undefined;
  /** A page of inset groups under it, as You's are: the bar stands on their ground. */
  readonly grouped?: true | undefined;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const ground = grouped ? palette.grouped : palette.bg;
  const { back, close } = useEnds(onBack, onClose);
  // Padded with the window's top and its own right edge's inset, never a safe-area view's, which
  // kept the iPhone Duo's column a second time beside it (`Screen`'s `Page`).
  const top = useTabTop();
  const { right } = useSides();
  // A split's detail stops short of the iPhone Duo's column, and the split's ground is under it:
  // the page's own, so beside a grouped pane it stood as a stripe of another colour (the simulator,
  // 2 November 2026). The pane's ground runs on under the column, as a page's runs to the screen's
  // edge.
  const duo = useDuo();
  const under = useSplitSide() === "detail" && duo.side === "right" ? duo.column : 0;
  return (
    <View style={[styles.pane, { backgroundColor: ground, paddingTop: top, paddingRight: right }]}>
      {under === 0 || !grouped ? null : (
        <View
          pointerEvents="none"
          style={[styles.under, { right: -under, width: under, backgroundColor: ground }]}
        />
      )}
      <PaneBar
        onBack={back}
        ruled
        ends={action === undefined ? 1 : 2}
        trailing={<PaneEnd action={action} onClose={close} />}
      >
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
      </PaneBar>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/**
 * A third level's × shuts its column; where it stands in the detail's place, because the window has
 * no room for a third column, it is the way back (ADR 0276).
 */
function useEnds(
  onBack: (() => void) | undefined,
  onClose: (() => void) | undefined,
): { readonly back: (() => void) | undefined; readonly close: (() => void) | undefined } {
  const third = useSplitSide() === "third";
  return { back: onBack ?? (third ? undefined : onClose), close: third ? onClose : undefined };
}

/**
 * A detail pane's bar: the way back at its leading end, what names the pane in the middle of the
 * whole bar whatever stands at either end, and what stands at its trailing end. Either end may hold
 * two round buttons, and the middle keeps clear of both (`ends`).
 */
export function PaneBar({
  onBack,
  leading,
  trailing,
  ends = 1,
  ruled = false,
  children,
}: {
  readonly onBack?: (() => void) | undefined;
  /** What stands after the way back: a room's way to put the list away (ADR 0256). */
  readonly leading?: ReactNode;
  /** What stands where a navigation bar keeps its right-hand button: the room's connection. */
  readonly trailing?: ReactNode;
  /**
   * How many round buttons the fuller end holds, which the name in the middle keeps clear of: Open
   * in Spaces is as wide as four (`PaneWordsButton`).
   */
  readonly ends?: number;
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
      <View
        style={[styles.middle, { paddingHorizontal: ends * ROUND + (ends - 1) * GAP + SPACE.xl }]}
        pointerEvents="box-none"
      >
        {children}
      </View>
      <View style={[styles.end, styles.ends]}>
        {onBack === undefined ? null : (
          <PaneButton icon="previous" label="Back" onPress={onBack} testID="pane-back" />
        )}
        {leading}
      </View>
      <View style={[styles.end, styles.ends, styles.trailing]}>{trailing}</View>
    </View>
  );
}

/** What stands at a pane's trailing end: a form's Save, and a third column's ×. */
function PaneEnd({
  action,
  onClose,
}: {
  readonly action: PaneAction | undefined;
  readonly onClose: (() => void) | undefined;
}) {
  if (action === undefined && onClose === undefined) return null;
  return (
    <>
      {action === undefined ? null : <PaneActionButton action={action} />}
      {onClose === undefined ? null : (
        <PaneButton icon="x" label="Close" onPress={onClose} testID="pane-close" />
      )}
    </>
  );
}

/** A form's word at a pane's trailing end: Save, or Send. */
export interface PaneAction {
  readonly label: string;
  readonly onPress: () => void;
  /** Nothing to save yet: the word stands greyed, as a navigation bar's does. */
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
}

function PaneActionButton({ action }: { readonly action: PaneAction }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled === true }}
      disabled={action.disabled}
      hitSlop={SPACE.sm}
      onPress={action.onPress}
      testID={action.testID}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text
        style={[styles.actionLabel, { color: action.disabled ? palette.ink4 : palette.accent }]}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

/** A round button of glass in a pane's bar, as the platform draws its own back. */
export function PaneButton({
  icon,
  label,
  onPress,
  on = false,
  anchor,
  testID,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  /** What it shows is showing: a space's details beside the room. The mark is the accent then. */
  readonly on?: boolean;
  /** For a popover it opens to stand beside it (`Sheet`'s `from`). */
  readonly anchor?: RefObject<View | null> | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <Pressable
      ref={anchor}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={SPACE.xs}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Capsule style={styles.round} interactive>
        <Icon name={icon} size={20} color={on ? palette.accent : palette.ink} weight={2.2} />
      </Capsule>
    </Pressable>
  );
}

/**
 * A button of words in glass in a pane's bar: Open in Spaces over a room seen from a search (ADR
 * 0256).
 */
export function PaneWordsButton({
  label,
  icon,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly icon: IconName;
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
      <Capsule style={styles.words} interactive>
        <Text numberOfLines={1} style={[styles.wordsLabel, { color: palette.ink }]}>
          {label}
        </Text>
        <Icon name={icon} size={15} color={palette.ink2} weight={2.4} />
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

const hairline = StyleSheet.hairlineWidth;
/** A round button's side: a thumb's, and the platform's own glass back. */
const ROUND = 44;
/** Between two round buttons at one end. */
const GAP = SPACE.sm;

const styles = StyleSheet.create({
  pane: { flex: 1 },
  under: { position: "absolute", top: 0, bottom: 0 },
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
  },
  end: { minWidth: ROUND, minHeight: ROUND, justifyContent: "center" },
  ends: { flexDirection: "row", alignItems: "center", gap: GAP },
  trailing: { marginLeft: "auto" },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  words: {
    height: ROUND,
    borderRadius: ROUND / 2,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    paddingLeft: SPACE.lg,
    paddingRight: SPACE.md,
  },
  wordsLabel: { fontSize: TEXT.md, fontWeight: "600", flexShrink: 1 },
  action: { minHeight: ROUND, justifyContent: "center", paddingHorizontal: SPACE.xs },
  actionLabel: { fontSize: TEXT.body, fontWeight: "600" },
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
