/**
 * An inset group, the way a phone's own Settings lays out a screen of them (ADR 0085): small
 * capitals over a rounded card of rows, a label at the left of each row and what it says at the
 * right, hairlines between the rows that start where the words do, and a footnote under the card
 * for what a row cannot say in two words.
 *
 * A row that opens something wears a chevron, and only such a row. WP5 took the chevrons off You
 * when no row there opened anything, because a chevron is a promise the next tap keeps; now the
 * rows that hold a longer setting open it in a sheet, and the chevron says so.
 */

import { Children, isValidElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OnGround } from "./ground";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";

/** A row's mark: the side of the tile it stands on. */
export const MARK = 30;

/** How far in a row's words start when it wears a mark: the mark and the gap after it. */
export const MARKED_INSET = SPACE.lg + MARK + SPACE.md;

/**
 * The small capitals over a group, and anything that stands at their right in plain case: where an
 * agent's context came from, and when (ADR 0135).
 */
export function GroupHeading({
  children,
  trailing,
}: {
  readonly children: string;
  readonly trailing?: ReactNode;
}) {
  const palette = usePalette();
  const heading = (
    <Text
      accessibilityRole="header"
      style={[
        styles.heading,
        trailing === undefined ? null : styles.inLine,
        { color: palette.ink3 },
      ]}
    >
      {children}
    </Text>
  );
  if (trailing === undefined) return heading;
  return (
    <View style={styles.headingLine}>
      {heading}
      {trailing}
    </View>
  );
}

/** What a group's rows cannot say themselves, under the card. */
export function GroupFoot({
  children,
  tone,
  testID,
}: {
  readonly children: ReactNode;
  /** A problem's colour, for a line that says what is wrong rather than what is so. */
  readonly tone?: string | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <Text style={[styles.foot, { color: tone ?? palette.ink3 }]} testID={testID}>
      {children}
    </Text>
  );
}

/**
 * The card. Its children are rows, or anything else that stands in a row's place; a hairline goes
 * between each two, in from the left by `inset` — past the marks, in a group whose rows wear them.
 */
export function Group({
  children,
  inset = SPACE.lg,
  testID,
}: {
  readonly children: ReactNode;
  readonly inset?: number;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, { backgroundColor: palette.surface }]} testID={testID}>
      <OnGround kind="card">
        {rows.map((row, index) => (
          <View key={row.key ?? index}>
            {index === 0 ? null : (
              <View style={[styles.hairline, { left: inset, backgroundColor: palette.line2 }]} />
            )}
            {row}
          </View>
        ))}
      </OnGround>
    </View>
  );
}

/** The rounded square a row's mark stands on: the phone's own Settings' coloured tiles. */
export function RowMark({
  icon,
  tint,
  ink,
}: {
  readonly icon: IconName;
  /** The tile. The surface's own quiet grey when absent. */
  readonly tint?: string | undefined;
  readonly ink?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.mark, { backgroundColor: tint ?? palette.surface3 }]}>
      <Icon name={icon} size={19} color={ink ?? palette.ink2} />
    </View>
  );
}

/**
 * A row's ink: a setting's, an act's, one that takes something away, a quieter line, or a setting
 * that can't be changed now (an agent's model while its harness is away, ADR 0141).
 */
type Tone = "plain" | "accent" | "danger" | "quiet" | "off";

interface RowProps {
  readonly label: string;
  /** How many lines the label may take. As many as it needs, unless said. */
  readonly labelLines?: number | undefined;
  /** The line under the label: words, or words set in more than one way (a file's name, then its line). */
  readonly sub?: ReactNode;
  /** How many lines it may take. Two, unless said. */
  readonly subLines?: number;
  /** What the setting is at, in a word or two, before the chevron. */
  readonly value?: string | undefined;
  readonly mark?: ReactNode;
  /** A control in the value's place — a switch, a tag, a button. */
  readonly trailing?: ReactNode;
  readonly onPress?: (() => void) | undefined;
  /** An act rather than a setting: the accent's colour, or red for one that takes something away. */
  readonly tone?: Tone;
  readonly testID?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  /** Drawn under the row's words and over its ground: the gold a saved file's row flashes. */
  readonly under?: ReactNode;
}

/**
 * One row: a mark, a label and a line under it, and at the right what it says or the control that
 * changes it. Pressable when it opens something, which is also when it wears the chevron.
 */
export function GroupRow(props: RowProps) {
  const { label, value, trailing, onPress, testID, accessibilityLabel } = props;
  if (onPress === undefined) {
    return (
      <View
        testID={testID}
        accessible={trailing === undefined}
        accessibilityLabel={accessibilityLabel}
      >
        <RowBody {...props} pressed={false} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (value === undefined ? label : `${label}, ${value}`)
      }
      accessibilityHint={props.accessibilityHint}
      onPress={onPress}
      testID={testID}
    >
      {({ pressed }) => <RowBody {...props} pressed={pressed} />}
    </Pressable>
  );
}

/** What a row draws: the same whether it is pressed, only its ground darkening under a thumb. */
function RowBody({
  label,
  labelLines,
  sub,
  subLines = 2,
  value,
  mark,
  trailing,
  onPress,
  tone = "plain",
  under,
  pressed,
}: RowProps & { readonly pressed: boolean }) {
  const palette = usePalette();
  const ink = {
    danger: palette.red,
    accent: palette.accent,
    quiet: palette.ink2,
    off: palette.ink4,
    plain: palette.ink,
  }[tone];
  const centred = tone === "danger" && mark === undefined;
  return (
    <View
      style={[
        styles.row,
        centred ? styles.centred : null,
        { backgroundColor: pressed ? palette.surface2 : palette.surface },
      ]}
    >
      {under}
      {mark}
      <View style={centred ? null : styles.words}>
        <Text
          style={[
            styles.label,
            { color: ink },
            tone === "accent" || tone === "danger" ? styles.act : null,
          ]}
          numberOfLines={labelLines}
        >
          {label}
        </Text>
        {sub === undefined ? null : (
          <Text style={[styles.sub, { color: palette.ink3 }]} numberOfLines={subLines}>
            {sub}
          </Text>
        )}
      </View>
      {value === undefined ? null : (
        <Text style={[styles.value, { color: palette.ink3 }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      {trailing}
      {onPress === undefined || tone !== "plain" ? null : (
        <Icon name="next" size={16} color={palette.ink4} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingTop: SPACE.xxl,
    paddingBottom: SPACE.sm,
  },
  headingLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingTop: SPACE.xxl,
    paddingBottom: SPACE.sm,
  },
  inLine: { flex: 1, padding: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  foot: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingTop: SPACE.sm,
  },
  group: { marginHorizontal: SPACE.lg, borderRadius: 22, overflow: "hidden" },
  hairline: { position: "absolute", top: 0, right: 0, height: StyleSheet.hairlineWidth, zIndex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
  },
  centred: { justifyContent: "center" },
  words: { flex: 1, minWidth: 0 },
  label: { fontSize: TEXT.body },
  act: { fontWeight: "500" },
  sub: { fontSize: TEXT.sm, marginTop: 1 },
  value: { fontSize: TEXT.body, flexShrink: 1, maxWidth: "58%", textAlign: "right" },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
