/**
 * The web's media viewer: what a room mounts to have one, and what a tile calls to open it
 * (the media viewer proposal, §4.3).
 *
 * A room wraps its messages in a `ViewerHost`. A photo's tile registers its element, so the
 * lightbox knows the frame to grow out of and the one to shrink back into; a click calls `open`,
 * and the host builds the deck from core — the media of the twenty messages around the tapped one
 * (`deckOf`, rule 2) — and fixes it there. The window is read once, at opening, so nothing moves
 * under a finger while the viewer is up.
 *
 * A room and a thread are each a space, so each mounts its own host and pages through its own
 * lines. Outside a host, opening does nothing: the context's default is a viewer that is not
 * there, which is what the kitchen sink and a unit test that renders a bubble alone get.
 */

import {
  DECK_WINDOW,
  type DeckItem,
  type Directory,
  deckOf,
  deckOfOne,
  indexOfItem,
  type Lane,
  type Space,
} from "@chipschat/core";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/** Where a viewer was opened from: the attachment, and the line it hangs under. */
export interface OpenAt {
  readonly attachmentId: string;
  readonly lineId: string;
}

export interface Viewer {
  /** Open on this attachment, in the deck of the messages around its line. */
  readonly open: (at: OpenAt) => void;
  /**
   * A video the server never measured: it has no poster, so it is in no room's deck and has no
   * tile to fly back to. Its row opens it alone (core's `deckOfOne`, the phone's Phase 2).
   */
  readonly openOne: (at: OpenAt) => void;
  /**
   * A deck handed over whole, opened on one of its items: a room's file's versions, from Files
   * (ADR 0100), whose lines may be older than any the room holds. No tile to fly from or back to.
   */
  readonly openDeck: (deck: readonly DeckItem[], attachmentId: string) => void;
  /**
   * A tile says where it is — called as a ref, with the element or `null` as it goes. The
   * lightbox grows out of the tile it was opened from and shrinks back into the tile of whatever
   * is current when it closes, which may be another message's.
   */
  readonly registerTile: (attachmentId: string, element: HTMLElement | null) => void;
  /** Whether a viewer is mounted above this at all. */
  readonly present: boolean;
}

/** The deck a viewer opened with, and where it stands in it. */
export interface Opened {
  readonly deck: readonly DeckItem[];
  readonly index: number;
}

const ABSENT: Viewer = {
  open: () => {},
  openOne: () => {},
  openDeck: () => {},
  registerTile: () => {},
  present: false,
};

export const ViewerContext = createContext<Viewer>(ABSENT);

/** The viewer above this row, or one that is not there. */
export function useViewer(): Viewer {
  return useContext(ViewerContext);
}

/**
 * The host's own state, kept apart from the component so `ViewerHost` reads as what it draws.
 * The tile registry is a ref: a tile coming and going must not redraw the room.
 */
export function useViewerState(
  space: Space,
  lanes: readonly Lane[],
  directory: Directory,
): {
  readonly viewer: Viewer;
  readonly opened: Opened | undefined;
  readonly tileOf: (attachmentId: string) => HTMLElement | undefined;
  readonly goTo: (index: number) => void;
  readonly close: () => void;
} {
  const [opened, setOpened] = useState<Opened | undefined>(undefined);
  const tiles = useRef(new Map<string, HTMLElement>());
  // The room as it stands, for an `open` that may fire long after this render.
  const room = useRef({ space, lanes, directory });
  room.current = { space, lanes, directory };

  const registerTile = useCallback((attachmentId: string, element: HTMLElement | null) => {
    if (element === null) tiles.current.delete(attachmentId);
    else tiles.current.set(attachmentId, element);
  }, []);

  const open = useCallback((at: OpenAt) => {
    const { space: now, lanes: theirs, directory: who } = room.current;
    const deck = deckOf(now, theirs, { around: at.lineId, messages: DECK_WINDOW }, who);
    const index = indexOfItem(deck, at.attachmentId);
    if (index < 0) return;
    setOpened({ deck, index });
  }, []);

  const openOne = useCallback((at: OpenAt) => {
    const { space: now, lanes: theirs, directory: who } = room.current;
    const deck = deckOfOne(now, theirs, at, who);
    if (deck.length === 0) return;
    setOpened({ deck, index: 0 });
  }, []);

  const openDeck = useCallback((deck: readonly DeckItem[], attachmentId: string) => {
    const index = indexOfItem(deck, attachmentId);
    if (index >= 0) setOpened({ deck, index });
  }, []);

  const viewer = useMemo<Viewer>(
    () => ({ open, openOne, openDeck, registerTile, present: true }),
    [open, openOne, openDeck, registerTile],
  );

  const goTo = useCallback((index: number) => {
    setOpened((was) =>
      was === undefined
        ? was
        : { deck: was.deck, index: Math.min(was.deck.length - 1, Math.max(0, index)) },
    );
  }, []);
  const close = useCallback(() => setOpened(undefined), []);
  const tileOf = useCallback((attachmentId: string) => tiles.current.get(attachmentId), []);

  return { viewer, opened, tileOf, goTo, close };
}
