/**
 * Words with the part a search found marked (ADR 0132, ADR 0133): gold behind deep gold, the
 * colours a room flashes a line in when a result opens it, so the row and the landing read as one
 * thing. A result row draws its line marked (`Marked`), and the bubble a result opens marks the
 * same words inside its own runs for a moment (`MarkedParts`, in `spaces/Markdown.tsx`).
 *
 * The pieces come from core (`markedParts` for a name or a bubble's words, `snippetParts` for what
 * the server found), so every client marks the same letters. A mark is a `Text` inside the line's
 * `Text`, which is what lets it wrap with the words around it; inside a line a background has no
 * corners, so the mark is square where the mock drew it rounded.
 */

import type { SearchPart } from "@chipschat/core";
import type { ReactNode } from "react";
import { type StyleProp, Text, type TextStyle } from "react-native";
import { usePalette } from "./theme";

export function Marked({
  parts,
  style,
  lines,
  children,
}: {
  readonly parts: readonly SearchPart[];
  readonly style?: StyleProp<TextStyle>;
  readonly lines?: number | undefined;
  /** Drawn before the parts, inside the same line: a voice note's microphone, a step's prompt. */
  readonly children?: ReactNode;
}) {
  return (
    <Text style={style} numberOfLines={lines}>
      {children}
      <MarkedParts parts={parts} />
    </Text>
  );
}

/** The pieces alone, for a `Text` that is already there: each marked one its own nested `Text`. */
export function MarkedParts({ parts }: { readonly parts: readonly SearchPart[] }) {
  const palette = usePalette();
  return parts.map((part, at) =>
    part.marked ? (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: a text's parts are only ever in order.
        key={at}
        testID="mark"
        style={{ backgroundColor: palette.goldSoft, color: palette.goldDeep }}
      >
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  );
}
