/**
 * A call a harness has in hand, as a queued turn's bubble draws it (`TaskBubble.tsx`, ADR 0126).
 * The thinking bubble drew its call this way too until 10 October 2026; it says what kind of work
 * a call is now, and draws the calls as a strip (ADR 0147, `CallStrip.tsx`).
 *
 * Drawn by its kind where its tool says one (core's `stepParts`): a terminal and the command, a
 * globe and the address it went to, a glass and what it looked for, a page and the file. What it
 * was given is set in a monospaced face, being code or an address, and an address loses its
 * `https://www.`. A tool of no kind keeps its words, `memory recall · LEGO Technic tipping`, as
 * every call was said before. It wraps inside its pill to as many lines as a thought takes: held
 * to one, it ended in an ellipsis that ate the thing the tool was given (Arjun, 23 September and
 * 1 October 2026).
 */

import type { ToolKind } from "@chipschat/core";
import { stepParts } from "@chipschat/core";
import { Platform, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { BUBBLE, type Palette, RADIUS } from "../ui/tokens";

/** What each kind of call is drawn as. */
const GLYPHS: Readonly<Record<ToolKind, IconName>> = {
  shell: "terminal",
  web: "globe",
  search: "search",
  file: "doc",
};
/** The call's own face: what it was given is code or an address, and reads as one. */
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
/** As many lines as a call may wrap to, which is as many as a thought takes. */
const LINES = 3;
/** The pill's padding above its words, and their line: where a call's first line falls. */
export const CALL_PAD = 2;
export const CALL_LINE = 16;

export function CallPill({
  step,
  palette,
  ink,
  style,
}: {
  readonly step: string;
  readonly palette: Palette;
  /** The words' colour: a quieter grey for a call that is over. */
  readonly ink: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const parts = stepParts(step);
  if (parts === undefined) return null;
  const glyph = parts.kind === undefined ? undefined : GLYPHS[parts.kind];
  // With a glyph for the tool, what it was given is the news; without one, the tool says itself.
  const words =
    glyph === undefined
      ? [parts.tool, parts.target].filter((part) => part !== undefined).join(" · ")
      : (parts.target ?? parts.tool);
  return (
    <View style={[styles.pill, { backgroundColor: palette.surface3 }, style]}>
      {glyph === undefined ? null : (
        <View style={styles.glyph} testID={`call-${parts.kind}`}>
          <Icon name={glyph} size={12} color={ink} />
        </View>
      )}
      <Text
        numberOfLines={LINES}
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.words, { color: ink }]}
      >
        {words}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // A tool reads as a tool: set in a shape, its glyph against its first line, wrapping inside it
  // rather than at the bubble's edge.
  pill: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    borderRadius: RADIUS.sm,
    paddingLeft: 5,
    paddingRight: 7,
    paddingVertical: CALL_PAD,
    flexShrink: 1,
  },
  glyph: { height: CALL_LINE, justifyContent: "center" },
  words: { fontFamily: MONO, fontSize: 11.5, lineHeight: CALL_LINE, flexShrink: 1 },
});
