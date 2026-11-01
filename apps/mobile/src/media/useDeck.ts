/**
 * The deck a viewer pages through, held still while it is up (the media viewer proposal, rule 2).
 *
 * `deckOf` cuts the twenty messages around the tapped line. The window is fixed when the viewer
 * opens: a line that lands afterwards is seen at the next opening, and a message taken back leaves
 * the deck, so nothing moves under a finger except what was withdrawn. Core's recipe for that
 * needs no new name — ask for every line (`messages` of at least the room's length) and keep the
 * items whose lines the deck opened with (Phase 0's test *holds still while it is up*).
 *
 * Memoised on the space, its lanes and the directory, which is the room's snapshot: a room that
 * redraws for a reason of its own hands back the same deck.
 *
 * A video the server never measured is in no deck; opened from its row, the viewer's deck is that
 * one video (core's `deckOfOne`), and the message it came in taken back closes it. Files hands a
 * deck over whole, a file's versions (ADR 0100), which is the deck as it was given.
 */

import {
  DECK_WINDOW,
  type DeckItem,
  type Directory,
  deckOf,
  deckOfOne,
  type Lane,
  type Space,
} from "@chipschat/core";
import { useMemo, useState } from "react";

export function useDeck(
  space: Space | undefined,
  lanes: readonly Lane[],
  directory: Directory,
  around: string,
  alone?: string | undefined,
  given?: readonly DeckItem[] | undefined,
): readonly DeckItem[] {
  // The lines the deck opened with, cut once, on the first render. A deck of one holds its line.
  const [held] = useState(
    () =>
      new Set(
        (space === undefined
          ? []
          : deckOf(space, lanes, { around, messages: DECK_WINDOW }, directory)
        ).map((item) => item.lineId),
      ),
  );
  return useMemo(() => {
    // A deck handed over whole (ADR 0100) is the deck, and holds still as it is.
    if (given !== undefined || space === undefined) return given ?? [];
    return alone === undefined
      ? deckOf(
          space,
          lanes,
          { around, messages: Math.max(DECK_WINDOW, space.lines.length) },
          directory,
        ).filter((item) => held.has(item.lineId))
      : deckOfOne(space, lanes, { lineId: around, attachmentId: alone }, directory);
  }, [space, lanes, directory, around, alone, held, given]);
}

/**
 * Where the viewer stands in the deck: on the item it was on, or — when that item has left, a
 * message taken back — on the one that took its place, or the last; nothing when the deck is
 * empty, which closes the viewer.
 */
export function standing(
  deck: readonly DeckItem[],
  attachmentId: string,
  before: number,
): number | undefined {
  if (deck.length === 0) return undefined;
  const at = deck.findIndex((item) => item.attachment.id === attachmentId);
  return at >= 0 ? at : Math.min(Math.max(0, before), deck.length - 1);
}
