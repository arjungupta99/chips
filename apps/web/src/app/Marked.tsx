/**
 * Words with the part a search found marked (ADR 0132, ADR 0133): gold behind deep gold, the
 * brand's own, so a result row and the line it opens read as one thing. A result row draws its
 * name, its line and its snippet marked, and the bubble a result opens marks the same words inside
 * its own runs for a moment (`Markdown`'s `marks`).
 *
 * The pieces come from core (`markedParts` for a name or a bubble's words, `snippetParts` for what
 * the server found), so the desktop and the phone mark the same letters.
 */

import type { SearchPart } from "@chipschat/core";

export function Marked({ parts }: { readonly parts: readonly SearchPart[] }) {
  return parts.map((part, at) =>
    part.marked ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: a text's parts are only ever in order.
      <mark key={at} className="search-mark">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}
