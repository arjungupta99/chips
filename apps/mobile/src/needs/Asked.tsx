/**
 * What an approval asks, drawn the same on its card in the room and on its own screen (ADR
 * 0142): the question, what a yes does, how long a yes lasts, and the preview drawn by its
 * format.
 *
 * The question is the harness's own sentence, `Turn off the Robinhood connector?`. A harness
 * that sends none is headed by its preview's title, else by the action's kind (`askHeadline`), so
 * nothing older stops drawing; it just reads as it did before.
 *
 * On the card the preview is held to a few lines, since a card that runs off the screen hides the
 * cards under it; its own screen shows all of it.
 */

import type { Approval } from "@chipschat/core";
import { askHeadline } from "@chipschat/core";
import { StyleSheet, Text, type TextStyle, View } from "react-native";
import { CodeBlock, Markdown } from "../spaces/Markdown";
import { Pill } from "../ui/Pill";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/** How tall the preview may stand on a card before it is cut: about six lines of prose. */
const CARD_PREVIEW = 132;

/**
 * A headline with its `code` spans set in mono, at the headline's own size, since a question so
 * often names a command: `Run \`date\`?`. The rest of Markdown has no place in one line.
 */
export function Headline({
  approval,
  style,
  numberOfLines,
}: {
  readonly approval: Approval;
  readonly style: TextStyle;
  readonly numberOfLines?: number;
}) {
  return (
    <CodeWords
      words={askHeadline(approval)}
      style={style}
      numberOfLines={numberOfLines}
      testID="ask-headline"
    />
  );
}

/** Words with their `code` spans in mono: a headline's, and an ask's row on the Asks page. */
export function CodeWords({
  words,
  style,
  numberOfLines,
  testID,
}: {
  readonly words: string;
  readonly style: TextStyle;
  readonly numberOfLines?: number | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const parts = words.split(/(`[^`]+`)/);
  return (
    <Text style={[style, { color: palette.ink }]} numberOfLines={numberOfLines} testID={testID}>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          // A split's pieces have no ids, and their order is the sentence's.
          // biome-ignore lint/suspicious/noArrayIndexKey: a piece is only ever itself.
          <Text key={index} style={[styles.code, { backgroundColor: palette.surface2 }]}>
            {part.slice(1, -1)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** What a yes does, when the harness said. */
export function Effect({ approval }: { readonly approval: Approval }) {
  const palette = usePalette();
  if (approval.effect === undefined) return null;
  return (
    <Text style={[styles.effect, { color: palette.ink2 }]} testID="ask-effect">
      {approval.effect}
    </Text>
  );
}

/** Once, or until it is taken back: the one thing about a yes that changes how much to read. */
export function Lasts({ approval }: { readonly approval: Approval }) {
  if (approval.lasts === undefined) return null;
  const standing = approval.lasts === "standing";
  return (
    <View style={styles.row} testID="ask-lasts">
      <Pill tone={standing ? "amber" : "neutral"}>
        {standing ? "Until you take it back" : "Just this once"}
      </Pill>
    </View>
  );
}

/** The preview's body by its format, the words alone: where it stands is `AskPreview`'s. */
function Drawn({
  body,
  format,
  compact,
}: {
  readonly body: string;
  readonly format: Approval["previewFormat"];
  readonly compact: boolean;
}) {
  const palette = usePalette();
  if (format === "markdown") {
    // On the card it is detail under the question: a size down and the second ink, as the
    // effect is. On its own screen it is the room's Markdown as a message draws it.
    return compact ? <Markdown text={body} ink={palette.ink2} small /> : <Markdown text={body} />;
  }
  if (format === "diff" || format === "json" || format === "table")
    return <CodeBlock text={body} />;
  return (
    <Text
      style={[styles.plain, { color: compact ? palette.ink2 : palette.ink }]}
      numberOfLines={compact ? 4 : undefined}
    >
      {body}
    </Text>
  );
}

/**
 * The preview, by its format: Markdown as the room draws a message, a diff, JSON or a table as a
 * block kept exactly as written, plain words as words. `titled` adds the preview's own heading,
 * which is shown only when the question has taken the card's headline from it.
 */
export function AskPreview({
  approval,
  compact = false,
  titled = false,
}: {
  readonly approval: Approval;
  readonly compact?: boolean;
  readonly titled?: boolean;
}) {
  const palette = usePalette();
  const body = approval.preview;
  if (body === undefined || body === "") return null;
  const drawn = <Drawn body={body} format={approval.previewFormat} compact={compact} />;
  const title = titled ? approval.previewTitle : undefined;
  return (
    <>
      {title === undefined ? null : (
        <Text style={[styles.title, { color: palette.ink3 }]}>{title}</Text>
      )}
      {compact ? (
        <View style={styles.held} testID="ask-preview">
          {drawn}
        </View>
      ) : (
        drawn
      )}
    </>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: "Menlo", borderRadius: RADIUS.xs },
  effect: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  plain: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
  title: { fontSize: TEXT.sm },
  held: { maxHeight: CARD_PREVIEW, overflow: "hidden" },
});
