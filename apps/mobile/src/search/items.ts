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
  return spaceHref(hit.spaceId, hitAt(hit), hitWords(hit, searched));
}

/** Where in its room a hit lands: its line, or its run's closing line; nowhere for neither. */
export function hitAt(hit: SearchHit): string | undefined {
  if (hit.kind === "receipt") return hit.runId === undefined ? undefined : `run:${hit.runId}`;
  return hit.lineId === undefined ? undefined : `line:${hit.lineId}`;
}

/** A room's route, at a line and with what was searched for, as far as they are said. */
export function spaceHref(
  spaceId: string,
  at: string | undefined,
  words: string | undefined,
): string {
  if (at === undefined) return `/spaces/${spaceId}`;
  const query = `at=${encodeURIComponent(at)}`;
  return words === undefined
    ? `/spaces/${spaceId}?${query}`
    : `/spaces/${spaceId}?${query}&words=${encodeURIComponent(words)}`;
}
