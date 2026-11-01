/**
 * A context file's Markdown as an editor draws it (ADR 0135): every character as it is, its marks
 * dimmed and what they mark brought up to ink. Where the marks are is core's (`markdownInks`), the
 * same as the phone's; only colour changes, so each glyph keeps its width and the words drawn under
 * the field line up with the caret in it.
 */

import { markdownInks } from "@chipschat/core";
import type { ReactNode } from "react";

export function markdownSpans(text: string): ReactNode[] {
  return markdownInks(text).map((piece) =>
    piece.ink === "plain" ? (
      piece.text
    ) : (
      <span key={piece.key} className={`ctx-ink-${piece.ink}`}>
        {piece.text}
      </span>
    ),
  );
}
