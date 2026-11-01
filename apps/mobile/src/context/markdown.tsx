/**
 * A context file's Markdown as it is typed (ADR 0135): the text exactly as it is, every character
 * kept, with its marks dimmed and what they mark brought up to ink. Only colour changes, never a
 * weight or a size, so each glyph keeps its width and a caret in a `TextInput` that holds these
 * spans stays where it was typed (checked on the iOS simulator, 7 October 2026).
 *
 * A very long file is drawn plain: re-marking every keystroke of 64 KB costs more than the marks
 * are worth. Where the marks are is core's (`markdownInks`), so the web dims the same ones.
 */

import { markdownInks } from "@chipschat/core";
import type { ReactNode } from "react";
import { Text } from "react-native";

export interface MarkInks {
  /** A mark: `#`, `**`, `_`, a backtick, a list's dash. */
  readonly mark: string;
  /** What a heading, a bold or an emphasis says. */
  readonly strong: string;
  /** Code. */
  readonly code: string;
}

/** The text as spans, its line breaks kept as they are: where each mark is is core's. */
export function markdownSpans(text: string, inks: MarkInks): ReactNode[] {
  return markdownInks(text).map((piece) =>
    piece.ink === "plain" ? (
      piece.text
    ) : (
      <Text key={piece.key} style={{ color: inks[piece.ink] }}>
        {piece.text}
      </Text>
    ),
  );
}
