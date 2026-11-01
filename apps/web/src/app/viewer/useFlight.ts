/**
 * The viewer's open and its return (the media viewer proposal, rule 3 and §4.3).
 *
 * It grows out of the tile it was tapped from, and shrinks back into the tile of whatever is
 * current when it closes — which may be another message's, after a swipe. The flight itself is
 * `open.ts`'s FLIP; what is here is when to fly, where from and where to, and the two things that
 * have to happen in the right order around it: the platform's `showModal`, and the focus.
 */

import type { DeckItem } from "@chipschat/core";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type Frame, fly, frameOf, reduceMotion, STILL_MS } from "./open.ts";

/** The radius a tile is drawn with, so a rounded tile does not square off as it leaves. */
const TILE_RADIUS = "10px";

export interface Flight {
  /** `opening` until the picture has landed, then `open`; `closing` once it is on its way back. */
  readonly phase: "opening" | "open" | "closing";
  /** Close it, with the return to the tile. */
  readonly shut: () => void;
  /** The stage says where the current picture stands, which is what the flight flies to and from. */
  readonly onFitted: (frame: Frame | undefined) => void;
}

export function useFlight(what: {
  readonly deck: readonly DeckItem[];
  readonly index: number;
  readonly tileOf: (attachmentId: string) => HTMLElement | undefined;
  /** The tile the viewer was opened from, read at the first render. */
  readonly openedFrom: RefObject<HTMLElement | undefined>;
  readonly picture: RefObject<HTMLImageElement | null>;
  readonly dialog: RefObject<HTMLDialogElement | null>;
  readonly closeButton: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
}): Flight {
  const { deck, index, tileOf, openedFrom, picture, dialog, closeButton, onClose } = what;
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  const fitted = useRef<Frame | undefined>(undefined);
  const flown = useRef(false);
  /** Cancels the opening flight, for a viewer closed before it has landed. */
  const opening = useRef<(() => void) | undefined>(undefined);

  /**
   * The tile the focus goes back to, set as the viewer closes and used by the cleanup below.
   *
   * It cannot be focused before the dialog has gone: while a modal dialog is up the rest of the
   * document is inert, and `focus()` on an inert element does nothing. Nor can it wait on a timer
   * — React commits the unmount on its own schedule, and a `setTimeout(0)` ran first, leaving the
   * focus on a Close button that was about to be removed and the page on `<body>` (16 September
   * 2026). So the tile is remembered here and focused in the same breath as `close()`.
   */
  const wanted = useRef<HTMLElement | undefined>(undefined);

  // The platform's modal: the top layer, the focus trap, and the room inert behind it.
  //
  // Nothing here listens for the dialog's own `close` event, and the cleanup's `close()` is not a
  // way out of the viewer. Under StrictMode React mounts an effect, tears it down and mounts it
  // again, so a `close` event taken as *the person closed it* shut the lightbox in the same frame
  // it opened (16 September 2026). The ways out are all the lightbox's: the Close button, a tap on
  // the backdrop, a drag, and Escape through `cancel`, which is turned into the return.
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (!element.open) element.showModal();
    closeButton.current?.focus();
    return () => {
      if (element.open) element.close();
      // Now the document is live again, the tile can take the focus. Nothing is wanted on
      // StrictMode's first teardown, which happens before the viewer has been closed by anybody.
      wanted.current?.focus();
    };
  }, [dialog, closeButton]);

  const shut = useCallback(() => {
    if (phase === "closing") return;
    setPhase("closing");
    const id = deck[index]?.attachment.id;
    const tile = id === undefined ? undefined : tileOf(id);
    // The room scrolls under the opaque stage to have the tile on screen, as rule 3 asks.
    tile?.scrollIntoView({ block: "nearest", behavior: "auto" });
    wanted.current = tile ?? openedFrom.current;
    // An opening still in the air is taken down: a picture must not be left flying over the room.
    opening.current?.();
    const from = fitted.current;
    const thumb = picture.current?.currentSrc;
    if (thumb === undefined || from === undefined) {
      // Nothing to fly — the picture had not arrived, or the tile has gone from the room — so it
      // shrinks and fades where it is, which is rule 3's other half.
      window.setTimeout(onClose, reduceMotion() ? 0 : STILL_MS);
      return;
    }
    fly({ src: thumb, from, to: frameOf(tile), onDone: onClose, radius: TILE_RADIUS });
  }, [phase, deck, index, tileOf, openedFrom, picture, onClose]);

  // The opening flight: once the stage has said where the picture stands, the tile's thumbnail
  // flies there. It runs once; a page after that is the pager's, not a flight.
  const onFitted = useCallback(
    (frame: Frame | undefined) => {
      fitted.current = frame;
      if (flown.current || frame === undefined || phase !== "opening") return;
      flown.current = true;
      const tile = openedFrom.current;
      const thumb = tile?.querySelector("img")?.currentSrc;
      if (thumb === undefined) {
        setPhase("open");
        return;
      }
      opening.current = fly({
        src: thumb,
        from: frameOf(tile),
        to: frame,
        radius: TILE_RADIUS,
        onDone: () => setPhase("open"),
      });
    },
    [phase, openedFrom],
  );

  return { phase, shut, onFitted };
}
