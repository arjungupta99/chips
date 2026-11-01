/**
 * One ask on the Asks page (ADR 0255): its mark, its own words, the answer in its colour and who
 * asked where, and its time at the right. The mark is the dot it was on When it asks you, grown to
 * carry a tick, a cross or a clock: green for a yes, a green ring for a yes that stands, red for a
 * no, grey for nobody answering, an amber ring while it waits.
 */

import type { AskEnd, AskRow as Row } from "@chipschat/core";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CodeWords } from "../needs/Asked";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import type { Palette } from "../ui/tokens";
import { SPACE, TEXT } from "../ui/tokens";

/** The mark's side on a row. */
export const ASK_MARK = 28;

/** The answer's ink: green for a yes however it came, red for a no, amber while it waits. */
export function answerInk(end: AskEnd, palette: Palette): string {
  if (end === "no") return palette.redInk;
  if (end === "open") return palette.amberInk;
  if (end === "lapsed") return palette.ink2;
  return palette.greenInk;
}

/** The dot an ask was, grown into a mark. */
export function AskMark({
  end,
  size = ASK_MARK,
}: {
  readonly end: AskEnd;
  readonly size?: number;
}) {
  const palette = usePalette();
  const round = { width: size, height: size, borderRadius: size / 2 };
  const glyph = Math.round(size * 0.62);
  const look = {
    yes: { ground: { backgroundColor: palette.green }, icon: "check", ink: "#ffffff" },
    policy: { ground: { backgroundColor: palette.green }, icon: "check", ink: "#ffffff" },
    own: { ground: { backgroundColor: palette.greenSoft }, icon: "check", ink: palette.greenInk },
    standing: {
      ground: { borderWidth: 2.2, borderColor: palette.green },
      icon: "check",
      ink: palette.green,
    },
    no: { ground: { backgroundColor: palette.red }, icon: "x", ink: "#ffffff" },
    lapsed: { ground: { backgroundColor: palette.ink4 }, icon: "clock", ink: palette.surface },
    open: {
      ground: { borderWidth: 2.5, borderColor: palette.amber },
      icon: undefined,
      ink: palette.amber,
    },
  } as const;
  const { ground, icon, ink } = look[end];
  return (
    <View style={[styles.mark, round, ground]} testID={`ask-mark-${end}`}>
      {icon === undefined ? null : <Icon name={icon} size={glyph} color={ink} weight={2.6} />}
    </View>
  );
}

export const AskRow = memo(function AskRow({
  row,
  onOpen,
}: {
  readonly row: Row;
  readonly onOpen: (row: Row) => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.words}. ${row.answer}. ${row.where}, ${row.time}.`}
      accessibilityHint="Opens the ask whole"
      onPress={() => onOpen(row)}
      testID={`ask-row-${row.approvalId}`}
    >
      {({ pressed }) => (
        <View
          style={[styles.row, { backgroundColor: pressed ? palette.surface2 : palette.surface }]}
        >
          <AskMark end={row.end} />
          <View style={styles.words}>
            <CodeWords words={row.words} style={styles.label} numberOfLines={2} />
            <Text style={[styles.sub, { color: palette.ink3 }]} numberOfLines={1}>
              <Text style={[styles.answer, { color: answerInk(row.end, palette) }]}>
                {row.answer}
              </Text>
              {` · ${row.where}`}
            </Text>
          </View>
          <Text style={[styles.time, { color: palette.ink3 }]}>{row.time}</Text>
        </View>
      )}
    </Pressable>
  );
});

/** Where a row's words start, for the hairlines between rows: past the mark. */
export const ASK_INSET = SPACE.lg + ASK_MARK + SPACE.md;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  mark: { alignItems: "center", justifyContent: "center", marginTop: 1 },
  words: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.3 },
  sub: { fontSize: TEXT.sm },
  answer: { fontWeight: "600" },
  time: { fontSize: TEXT.sm, fontVariant: ["tabular-nums"], marginTop: 1 },
});
