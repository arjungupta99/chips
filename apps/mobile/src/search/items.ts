/**
 * Where a Search tab result opens (ADR 0132): what it lists, and the words in its rows, are
 * core's (`searchItems`, `searchResults.ts`), shared with the desktop's page; the routes are the
 * phone's.
 */

import { hitWords, type SearchHit } from "@chipschat/core";

/**
 * Where a hit opens: its room, at its line, or at the run a step belongs to, which the room lands
 * on by its closing line (`parseTarget`).
 *
 * A message takes what was searched for with it (`words`), which its room marks in the bubble for
 * a moment (ADR 0133); a voice note and a step take none (core's `hitWords`).
 */
export function hitHref(hit: SearchHit, searched = ""): string {
  const at =
    hit.kind === "receipt"
      ? hit.runId === undefined
        ? undefined
        : `run:${hit.runId}`
      : hit.lineId === undefined
        ? undefined
        : `line:${hit.lineId}`;
  if (at === undefined) return `/spaces/${hit.spaceId}`;
  const words = hitWords(hit, searched);
  const query = `at=${encodeURIComponent(at)}`;
  return words === undefined
    ? `/spaces/${hit.spaceId}?${query}`
    : `/spaces/${hit.spaceId}?${query}&words=${encodeURIComponent(words)}`;
}
