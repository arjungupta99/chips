/**
 * The Spaces list's rooms on their way from one run to another, or off the list (ADR 0205's
 * addendum: Arjun's B, "Slide away", for Hide and Unhide, Archive and Unarchive, and Delete).
 * Core says what moved and what each row does (`roomMoves.ts` there); this is when.
 *
 * What moved is worked out as the list is drawn, by setting where each room stands beside where it
 * stood at the last draw, so a room that has moved is never drawn gone for a frame and then put
 * back: a row a swipe left open stays the row it was, and carries on off the edge from there.
 *
 * A move waits, its row where it stood, while the list can't be seen: while a room is open over
 * it, until the room has slid back off (`BACK_MS`), and while the sheet that asked about an
 * Archive or a Delete is up, until it has sunk (`SHEET_OUT_MS`). A room hidden from its own sheet
 * is seen going as the list comes back.
 */

import {
  drawnRun,
  type ListRun,
  type Look,
  type Moves,
  moveFolded,
  moveLanded,
  moveSlid,
  movesBetween,
  movesWaiting,
  NO_MOVES,
  releaseMoves,
  type Space,
  type Store,
  standing,
} from "@chipschat/core";
import { useFocusEffect } from "expo-router";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHEET_OUT_MS } from "../ui/Sheet";

/** How long a room's screen takes to slide back off the list, near enough. */
const BACK_MS = 420;

/** The list's rooms in their runs, as the store has them now. */
export interface Runs {
  readonly open: readonly Space[];
  readonly hidden: readonly Space[];
  readonly closed: readonly Space[];
}

/** The rooms on their way, and what each row says as it goes. */
export interface RoomMoves {
  readonly moves: Moves<Space>;
  /** The rows drawn in `run`, given those the list would draw there. */
  readonly drawn: (run: ListRun, rows: readonly Space[]) => Space[];
  readonly slid: (id: string) => void;
  readonly folded: (id: string) => void;
  readonly landed: (id: string) => void;
}

const NONE: Moves<Space> = NO_MOVES;

function shownRuns(hidden: boolean, closed: boolean): ReadonlySet<ListRun> {
  const runs = new Set<ListRun>(["open"]);
  if (hidden) runs.add("hidden");
  if (closed) runs.add("closed");
  return runs;
}

export function useRoomMoves({
  store,
  live,
  showHidden,
  showClosed,
  skip,
  quiet,
}: {
  /** The workspace's store: another, and nothing has moved, everything is new. */
  readonly store: Store;
  readonly live: Runs;
  readonly showHidden: boolean;
  readonly showClosed: boolean;
  /** Rooms that are another's to move: Select's, as they fold or go to dust (ADR 0181). */
  readonly skip: (id: string) => boolean;
  /** A sheet that asked about an act is up: moves wait until it has sunk. */
  readonly quiet: boolean;
}): RoomMoves {
  const now = useMemo<Look<Space>>(
    () => ({ at: standing(live), shown: shownRuns(showHidden, showClosed) }),
    [live, showHidden, showClosed],
  );
  const [seen, setSeen] = useState({ look: now, store });
  const [moves, setMoves] = useState<Moves<Space>>(NONE);
  if (seen.look !== now || seen.store !== store) {
    setSeen({ look: now, store });
    if (seen.store !== store) setMoves(NONE);
    else {
      const before = seen.look;
      setMoves((was) => movesBetween(before, now, was, skip));
    }
  }
  const sight = useSight();
  const quietUntil = useQuietUntil(quiet);
  useEffect(() => {
    if (!movesWaiting(moves) || !sight.seen || quiet) return;
    const wait = Math.max(0, quietUntil.current - Date.now(), sight.since + BACK_MS - Date.now());
    if (wait === 0) {
      setMoves(releaseMoves);
      return;
    }
    const timer = setTimeout(() => setMoves(releaseMoves), wait);
    return () => clearTimeout(timer);
  }, [moves, sight, quiet, quietUntil]);
  return {
    moves,
    drawn: (run, rows) => drawnRun(run, rows, moves),
    slid: (id) => setMoves((was) => moveSlid(was, id)),
    folded: (id) => setMoves((was) => moveFolded(was, id)),
    landed: (id) => setMoves((was) => moveLanded(was, id)),
  };
}

/** Whether the list is in sight, and since when, if it came back into it. */
function useSight(): { readonly seen: boolean; readonly since: number } {
  const [sight, setSight] = useState({ seen: true, since: 0 });
  useFocusEffect(
    useCallback(() => {
      setSight((was) => (was.seen ? was : { seen: true, since: Date.now() }));
      return () => setSight({ seen: false, since: 0 });
    }, []),
  );
  return sight;
}

/**
 * When the last sheet to go will have sunk: set as it starts to go, before the moves it held are
 * looked at, which is why it is an effect declared before theirs.
 */
function useQuietUntil(quiet: boolean): RefObject<number> {
  const until = useRef(0);
  const was = useRef(quiet);
  useEffect(() => {
    if (was.current && !quiet) until.current = Date.now() + SHEET_OUT_MS;
    was.current = quiet;
  }, [quiet]);
  return until;
}
