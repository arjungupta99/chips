/**
 * The rail's rooms on their way from one run to another, or off it (ADR 0205's addendum: Arjun's
 * B, "Slide away"): hidden or unhidden, a row slides off the rail's right edge; archived,
 * unarchived or deleted, its left; and the gap closes. Where it lands, under a heading that is
 * open, its new row opens and slides in from the other edge. Core says what moved and what each
 * row does (`roomMoves.ts` there); this is when, and how a row tells it that it has.
 *
 * What moved is worked out as the rail is drawn, so a room that has moved is never drawn gone for a
 * frame first. A move waits, its row where it stood, while a dialog is up over the rail (the room's
 * sheet, or the one that asked about an Archive or a Delete), so it is seen going once that has
 * gone. A row whose animation never ends, as one in a window out of sight may not, is let go after
 * `GONE_BY_MS`. With Reduce Motion, or with no way to ask the screen about it, rows move as they
 * always did: at once.
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
  standing,
} from "@chipschat/core";
import type { AnimationEvent } from "react";
import { useEffect, useMemo, useState } from "react";

/** How often a waiting move looks again for the dialog over the rail to have gone. */
const LOOK_MS = 80;
/** The longest a row may take to go or land before it is let go anyway. */
const GONE_BY_MS = 1600;

/** The rail's rooms in their runs, as the store has them now. */
export interface Runs {
  readonly open: readonly Space[];
  readonly hidden: readonly Space[];
  readonly closed: readonly Space[];
}

/** The rooms on their way, and what each row says as it goes. */
export interface RailMoves {
  readonly moves: Moves<Space>;
  /** The rows drawn in `run`, given those the rail would draw there. */
  readonly drawn: (run: ListRun, rows: readonly Space[]) => Space[];
  /** What a row's animations say, as they end: off its edge, folded shut, landed. */
  readonly onAnimationEnd: (id: string, event: AnimationEvent<HTMLElement>) => void;
}

const NONE: Moves<Space> = NO_MOVES;

function shownRuns(hidden: boolean, closed: boolean): ReadonlySet<ListRun> {
  const runs = new Set<ListRun>(["open"]);
  if (hidden) runs.add("hidden");
  if (closed) runs.add("closed");
  return runs;
}

/** Whether rows move here at all: not with Reduce Motion, nor with no screen to ask (a test's). */
export function moving(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Whether a dialog stands over the rail. */
function dialogUp(): boolean {
  return typeof document !== "undefined" && document.querySelector("dialog[open]") !== null;
}

export function useRailMoves({
  workspace,
  live,
  showHidden,
  showClosed,
  skip,
}: {
  /** Which workspace's rooms these are: another, and nothing has moved, everything is new. */
  readonly workspace: unknown;
  readonly live: Runs;
  readonly showHidden: boolean;
  readonly showClosed: boolean;
  /** Rooms that are another's to move: Select's, as they fold or blur away (ADR 0181). */
  readonly skip: (id: string) => boolean;
}): RailMoves {
  const now = useMemo<Look<Space>>(
    () => ({ at: standing(live), shown: shownRuns(showHidden, showClosed) }),
    [live, showHidden, showClosed],
  );
  const [seen, setSeen] = useState({ look: now, workspace });
  const [moves, setMoves] = useState<Moves<Space>>(NONE);
  if (seen.look !== now || seen.workspace !== workspace) {
    setSeen({ look: now, workspace });
    if (seen.workspace !== workspace || !moving()) setMoves(NONE);
    else {
      const before = seen.look;
      setMoves((was) => movesBetween(before, now, was, skip));
    }
  }
  // Waiting moves go once no dialog stands over the rail.
  useEffect(() => {
    if (!movesWaiting(moves)) return;
    if (!dialogUp()) {
      setMoves(releaseMoves);
      return;
    }
    const timer = setInterval(() => {
      if (!dialogUp()) setMoves(releaseMoves);
    }, LOOK_MS);
    return () => clearInterval(timer);
  }, [moves]);
  // And those under way end, whatever their animations say.
  useEffect(() => {
    if (moves.size === 0 || movesWaiting(moves)) return;
    const timer = setTimeout(() => setMoves(NONE), GONE_BY_MS);
    return () => clearTimeout(timer);
  }, [moves]);
  return {
    moves,
    drawn: (run, rows) => drawnRun(run, rows, moves),
    onAnimationEnd: (id, event) => {
      const name = event.animationName;
      if (name.startsWith("move-off")) setMoves((was) => moveSlid(was, id));
      else if (name === "move-fold") setMoves((was) => moveFolded(was, id));
      else if (name.startsWith("move-in")) setMoves((was) => moveLanded(was, id));
    },
  };
}
