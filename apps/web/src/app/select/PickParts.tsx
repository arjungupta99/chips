/**
 * The parts a list wears while it picks (ADR 0181, ADR 0182), on the rail and on the Agents page:
 * Select, the line that says what can't be picked beside Select all, the circle at each row's
 * leading edge, the bar of acts, and the note over it. Flat, as every control here is; what is
 * worth looking at is how they come and go (`styles.css`, "picking").
 */

import { Icon } from "@chipschat/ui";
import { type AnimationEvent, useEffect, useState } from "react";
import type { Note, RowPick } from "./usePick.ts";

/**
 * Select, or Done while the list picks. Both words stand in the one place, and the one not said is
 * hidden, so the button keeps its width as it changes.
 */
export function SelectButton({
  picking,
  onClick,
  testId,
}: {
  readonly picking: boolean;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      className="pick-select"
      data-picking={picking ? "true" : undefined}
      aria-pressed={picking}
      onClick={onClick}
      data-testid={testId}
    >
      <span aria-hidden={picking}>Select</span>
      <span aria-hidden={!picking}>Done</span>
    </button>
  );
}

/**
 * The line under the heading while the list picks: Select all, or Deselect all once every row shown
 * is picked, and what can't be picked, if anything can't. Its height glides open and shut, so the
 * rows under it glide down and up with it.
 */
export function PickHint({
  shown,
  words,
  all,
  onAll,
  testId,
}: {
  readonly shown: boolean;
  readonly words: string | undefined;
  readonly all: boolean;
  readonly onAll: () => void;
  readonly testId: string;
}) {
  return (
    <div className="pick-hint" data-shown={shown ? "true" : undefined} inert={!shown}>
      <div className="pick-hint-in" data-testid={testId}>
        <button type="button" className="pick-all" onClick={onAll} data-testid={`${testId}-all`}>
          {all ? "Deselect all" : "Select all"}
        </button>
        {words !== undefined && <span className="pick-hint-words">{words}</span>}
      </div>
    </div>
  );
}

/**
 * The circle at a row's leading edge while the list picks: ticked, empty, or none at all. Its room
 * opens as the list starts picking, moving the row's face and words over, and shuts as it stops.
 */
export function PickMark({ pick }: { readonly pick: RowPick | undefined }) {
  if (pick === undefined) return null;
  return (
    <span className="pick-mark" aria-hidden="true">
      <span className="pick-dot">
        <Icon name="check" size={12} />
      </span>
    </span>
  );
}

/**
 * What a row's own element carries for picking: whether the list picks, its shake, how it goes and
 * whether it has landed, and the role of a checkbox while the list picks.
 */
export function pickProps(pick: RowPick | undefined) {
  if (pick === undefined) return {};
  return {
    "data-picking": pick.active ? "true" : undefined,
    "data-mark": pick.active ? pick.mark : undefined,
    // Two names for the one shake, taken in turn, so the same row clicked twice shakes again.
    "data-shake": pick.shake > 0 ? String(pick.shake % 2) : undefined,
    ...(pick.active && pick.mark !== "none"
      ? { role: "checkbox", "aria-checked": pick.mark === "on" }
      : {}),
    ...(pick.active && pick.mark === "none" ? { "aria-disabled": true } : {}),
  } as const;
}

/** What a row's list item carries as it goes, or lands: the fold, and when it is done. */
export function leavingProps(pick: RowPick | undefined) {
  if (pick === undefined) return {};
  const away = pick.leaving;
  return {
    "data-leaving": away === undefined ? undefined : away.kind,
    "data-phase": away === undefined ? undefined : away.phase,
    "data-landing": pick.landing && away === undefined ? "true" : undefined,
    onAnimationEnd: (event: AnimationEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (away?.phase === "going") pick.onGone();
    },
  };
}

/** One of the bar's acts: what it does, on how many. */
export interface Act {
  readonly act: "read" | "archive" | "unarchive" | "delete";
  readonly count: number;
  /** Read with nothing picked: it reads every room, and says so rather than how many. */
  readonly all?: boolean;
  readonly onClick: () => void;
}

const ACT_WORD: Readonly<Record<Act["act"], string>> = {
  read: "Read",
  archive: "Archive",
  unarchive: "Unarchive",
  delete: "Delete",
};

/**
 * The bar of acts while the list picks, risen over the foot of the list on frosted glass: Read, on
 * the rail (ADR 0181 addendum, 18 October 2026); Archive, or Unarchive where every room picked is
 * archived; and Delete, each saying how many it takes. It stays in the page, shut, so it can sink
 * as well as rise.
 */
export function PickBar({
  shown,
  read,
  left,
  erase,
  note,
  onNoteGone,
  place,
}: {
  readonly shown: boolean;
  /** Read, at the bar's start: the rail's, which the Agents page has no use for. */
  readonly read?: Act | undefined;
  readonly left: Act;
  readonly erase: Act;
  readonly note: Note | undefined;
  readonly onNoteGone: () => void;
  /** Where it stands: across the rail's foot, or in the middle of a page's. */
  readonly place: "rail" | "page";
}) {
  return (
    <div
      className="pick-bar"
      data-place={place}
      data-shown={shown ? "true" : undefined}
      inert={!shown}
      data-testid="pick-bar"
    >
      <PickNote note={shown ? note : undefined} onGone={onNoteGone} />
      <div className="pick-bar-acts" data-acts={read === undefined ? 2 : 3}>
        {read !== undefined && <ActButton {...read} />}
        <ActButton {...left} />
        <ActButton {...erase} />
      </div>
    </div>
  );
}

function ActButton({ act, count, all = false, onClick }: Act) {
  const live = count > 0;
  const word = all ? `${ACT_WORD[act]} all` : live ? `${ACT_WORD[act]} ${count}` : ACT_WORD[act];
  return (
    <button
      type="button"
      className="pick-act"
      data-act={act}
      disabled={!live}
      onClick={onClick}
      data-testid={`pick-${act}`}
    >
      {word}
    </button>
  );
}

/** How long a note stays over the bar before it goes by itself. */
const NOTE_MS = 2800;

/** The note over the bar about a row that can't be picked: why not, for a few seconds. */
function PickNote({
  note,
  onGone,
}: {
  readonly note: Note | undefined;
  readonly onGone: () => void;
}) {
  // The words stay while it fades.
  const [said, setSaid] = useState(note);
  useEffect(() => {
    if (note === undefined) return;
    setSaid(note);
    const timer = setTimeout(onGone, NOTE_MS);
    return () => clearTimeout(timer);
  }, [note, onGone]);
  return (
    <p
      key={said?.key}
      className="pick-note"
      data-shown={note === undefined ? undefined : "true"}
      role="status"
      data-testid="pick-note"
    >
      {said?.words}
    </p>
  );
}
