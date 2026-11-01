/**
 * Undo, for a message just deleted for oneself (ADR 0167): a capsule over the room's foot, just
 * above the field, saying what happened, with a ring counting the seconds left and Undo beside it
 * — the phone's (`apps/mobile/src/spaces/UndoPill.tsx`), in the desktop's glass.
 *
 * A second deletion while it is up starts it again for that one; the first is deleted already, and
 * its own Undo is over. It goes when the count runs out, on Undo, or on Escape.
 */

import { DELETED_FOR_YOU, UNDO_MS } from "@chipschat/core";
import { useEffect, useState } from "react";

/** The deletion Undo is for, and when it was made, so a second one starts the count again. */
export interface Undoing {
  readonly lineId: string;
  readonly at: number;
}

/** How long it takes to go, after which it is gone from the page. */
const LEAVE_MS = 180;

export function UndoPill({
  undoing,
  onUndo,
  onGone,
  words = DELETED_FOR_YOU,
  title = "Puts the message back on your screens",
  page = false,
}: {
  readonly undoing: Undoing | undefined;
  readonly onUndo: (lineId: string) => void;
  /** The count has run out: it is over. */
  readonly onGone: () => void;
  /** What happened: a message deleted for you, unless said otherwise (a rule removed, ADR 0195). */
  readonly words?: string;
  /** What Undo does, on hover and to a screen reader. */
  readonly title?: string;
  /** Over the foot of the window, not a room's field: for a page that scrolls. */
  readonly page?: boolean;
}) {
  // What it says stays while it leaves, after the deletion it was for is over.
  const [shown, setShown] = useState<Undoing | undefined>(undoing);
  const [seconds, setSeconds] = useState(UNDO_MS / 1000);
  useEffect(() => {
    if (undoing === undefined) {
      const gone = setTimeout(() => setShown(undefined), LEAVE_MS);
      return () => clearTimeout(gone);
    }
    setShown(undoing);
    setSeconds(UNDO_MS / 1000);
    const ticks = Array.from({ length: UNDO_MS / 1000 - 1 }, (_, at) =>
      setTimeout(() => setSeconds(UNDO_MS / 1000 - at - 1), (at + 1) * 1000),
    );
    const over = setTimeout(onGone, UNDO_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onGone();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      for (const tick of ticks) clearTimeout(tick);
      clearTimeout(over);
      window.removeEventListener("keydown", onKey);
    };
  }, [undoing, onGone]);
  if (shown === undefined) return null;
  return (
    <div className={page ? "undo-dock undo-dock-page" : "undo-dock"}>
      <output
        key={shown.at}
        className="undo-pill"
        data-leaving={undoing === undefined ? "true" : undefined}
        data-testid="undo-pill"
        aria-live="polite"
      >
        <span className="undo-ring" aria-hidden="true">
          <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
            <circle className="undo-ring-track" cx="11" cy="11" r="9.9" />
            <circle
              className="undo-ring-left"
              cx="11"
              cy="11"
              r="9.9"
              style={{ animationDuration: `${UNDO_MS}ms` }}
            />
          </svg>
          <span className="undo-count">{seconds}</span>
        </span>
        <span className="undo-words">{words}</span>
        <button
          type="button"
          className="undo-button"
          data-testid="undo-pill-undo"
          title={title}
          onClick={() => onUndo(shown.lineId)}
        >
          Undo
        </button>
      </output>
    </div>
  );
}
