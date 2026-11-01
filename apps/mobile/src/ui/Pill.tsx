/**
 * A pill: a word with a dot, in one of the five status colours. State is always a colour plus a
 * word, never colour alone, and the dot is the colour half.
 *
 * The web's `pulse` dot animates. This one does not: the working state is already carried by
 * the word, an animation running behind a list of twenty harnesses is a battery cost a phone
 * feels, and Reanimated on the UI thread for a 7-pixel circle is not a trade worth making. The
 * `pulse` kind is kept in the vocabulary and drawn as `hollow` here, so nothing has to special-
 * case it and the drift test still passes.
 */

import { StyleSheet, Text, View } from "react-native";
import { usePalette } from "./theme";
import { type Palette, RADIUS, SPACE, TEXT } from "./tokens";
import { type DotKind, type HarnessStatus, STATUS, statusLabel, type Tone } from "./vocabulary";

/** The dot's colour, and the pill's background and ink, for each tone. */
export function toneOf(palette: Palette, tone: Tone) {
  const table = {
    neutral: { dot: palette.gray, background: palette.surface2, ink: palette.ink2 },
    blue: { dot: palette.blue, background: palette.blueSoft, ink: palette.blueInk },
    amber: { dot: palette.amber, background: palette.amberSoft, ink: palette.amberInk },
    red: { dot: palette.red, background: palette.redSoft, ink: palette.redInk },
    green: { dot: palette.green, background: palette.greenSoft, ink: palette.greenInk },
  } as const;
  return table[tone];
}

export function Dot({
  tone = "neutral",
  kind = "solid",
}: {
  readonly tone?: Tone;
  readonly kind?: DotKind;
}) {
  const colour = toneOf(usePalette(), tone).dot;
  const filled = kind === "solid";
  return (
    <View
      style={[
        styles.dot,
        filled
          ? { backgroundColor: colour }
          : { borderColor: colour, borderWidth: 2, backgroundColor: "transparent" },
      ]}
    />
  );
}

export function Pill({
  tone = "neutral",
  dot = "none",
  children,
}: {
  readonly tone?: Tone;
  /** `none` for a pill that is a label rather than a state. */
  readonly dot?: DotKind | "none";
  readonly children: string;
}) {
  const { background, ink } = toneOf(usePalette(), tone);
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      {dot !== "none" && <Dot tone={tone} kind={dot} />}
      <Text style={[styles.word, { color: ink }]}>{children}</Text>
    </View>
  );
}

/** The pill for the seven harness states, with the verb phrase when one is working. */
export function StatusPill({
  status,
  verbPhrase,
}: {
  readonly status: HarnessStatus;
  readonly verbPhrase?: string | undefined;
}) {
  const style = STATUS[status];
  return (
    <Pill tone={style.tone} dot={style.dot}>
      {statusLabel(status, verbPhrase)}
    </Pill>
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  word: { fontSize: TEXT.xs, fontWeight: "600", lineHeight: TEXT.xs + SPACE.xs },
});
