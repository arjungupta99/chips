/**
 * A room going from one of a list's runs to another, or off the list (ADR 0205's addendum; Arjun,
 * 20 October 2026, of the mock: "Do B, and give Archive and Unarchive from a swipe the same
 * motion", then "give delete the motion as well"). Hidden, unhidden, archived, unarchived or
 * deleted, its row carries on off the edge the act was pushed towards (right for Hide and Unhide,
 * which a row offers pushed right; left for the rest), and the gap it leaves closes. Where it
 * lands, in a run in sight, its new row opens and slides in from the other edge.
 *
 * A list works out what moved by setting where each room stands now beside where it stood at its
 * last look (`movesBetween`), so a room moves the same whatever moved it: a swipe, a room's sheet,
 * Select's Unarchive, another of the person's devices, or somebody else. A list out of sight, or
 * under a sheet that is going, keeps each move waiting with its row where it stood until it is
 * seen again (`releaseMoves`), so a room is always seen going. What Select holds as it folds rows
 * away or turns them to dust is its own (ADR 0181), and is left to it.
 *
 * A move goes through its phases a step at a time, each step the row's to say: its old row waits,
 * slides off (`moveSlid`), then folds shut (`moveFolded`) while its new row lands (`moveLanded`).
 * A room that moves again before it has landed, as one put back by a refusal does, simply stands
 * where it now is.
 */

import { type HeldRow, keepLeaving } from "./picking.js";

/** The runs of a Spaces list: its open rooms, the ones the reader hid, and the archived ones. */
export type ListRun = "open" | "hidden" | "closed";

/** What took a room from one run to another, or off the list. */
export type MoveKind = "hide" | "unhide" | "archive" | "unarchive" | "delete";

/** The edge a row goes off, and the one it comes in from the other side of. */
export type MoveSide = "left" | "right";

/** Where a room stands: its run, its place in it, and the room as it was then. */
export interface Stood<T> extends HeldRow<T> {
  readonly run: ListRun;
}

/** Where every room on a list stands, by id. */
export type Standing<T> = ReadonlyMap<string, Stood<T>>;

/** A room on its way, in the phases its two rows go through. */
export interface Moving<T> {
  /** The room as it was last seen, which its old row is drawn from. */
  readonly item: T;
  readonly kind: MoveKind;
  readonly side: MoveSide;
  /** Where it goes: a run, or nowhere for a room deleted. */
  readonly to: ListRun | undefined;
  /**
   * Its old row, drawn where it stood: waiting to be seen, sliding off, then folding shut. None
   * when the run it left was out of sight.
   */
  readonly leaving:
    | {
        readonly run: ListRun;
        readonly index: number;
        readonly phase: "waiting" | "sliding" | "folding";
      }
    | undefined;
  /**
   * Its new row, in the run it goes to: waiting while the old one goes, then landing. None when
   * that run is out of sight, or it went nowhere.
   */
  readonly landing: { readonly phase: "waiting" | "landing" } | undefined;
}

/** The rooms on their way, by id. */
export type Moves<T> = ReadonlyMap<string, Moving<T>>;

export const NO_MOVES: Moves<never> = new Map();

/** What took a room from `from` to `to`, if anything did. */
export function moveKind(from: ListRun, to: ListRun | undefined): MoveKind | undefined {
  if (to === from) return undefined;
  if (to === undefined) return "delete";
  if (to === "closed") return "archive";
  if (from === "closed") return "unarchive";
  return to === "hidden" ? "hide" : "unhide";
}

/** The edge a row goes off for `kind`: the way its act is pushed on a phone's row. */
export function moveSide(kind: MoveKind): MoveSide {
  return kind === "hide" || kind === "unhide" ? "right" : "left";
}

/** Where each room stands in `runs`. */
export function standing<T extends { readonly id: string }>(
  runs: Readonly<Record<ListRun, readonly T[]>>,
): Standing<T> {
  const out = new Map<string, Stood<T>>();
  for (const run of ["open", "hidden", "closed"] as const) {
    runs[run].forEach((item, index) => {
      out.set(item.id, { item, index, run });
    });
  }
  return out;
}

/** Two looks at a list: where its rooms stood and which runs were in sight. */
export interface Look<T> {
  readonly at: Standing<T>;
  readonly shown: ReadonlySet<ListRun>;
}

/**
 * The moves after a list's look at `now`, its last look having been `before`: those already on
 * their way, less any whose room has moved again, and one for each room that has changed run or
 * gone since, where either end of it is in sight. `skip` says which rooms are another's to move
 * (Select's).
 */
export function movesBetween<T extends { readonly id: string }>(
  before: Look<T>,
  now: Look<T>,
  moves: Moves<T>,
  skip: (id: string) => boolean = () => false,
): Moves<T> {
  const out = new Map<string, Moving<T>>();
  for (const [id, move] of moves) {
    if (now.at.get(id)?.run === move.to) out.set(id, move);
  }
  for (const [id, was] of before.at) {
    if (moves.has(id) || skip(id)) continue;
    const started = startedMove(was, now.at.get(id), before.shown, now.shown);
    if (started !== undefined) out.set(id, started);
  }
  return sameMoves(moves, out) ? moves : out;
}

/** The move of a room that stood at `was` and stands at `is`, if it moved where it can be seen. */
function startedMove<T>(
  was: Stood<T>,
  is: Stood<T> | undefined,
  shownBefore: ReadonlySet<ListRun>,
  shownNow: ReadonlySet<ListRun>,
): Moving<T> | undefined {
  const kind = moveKind(was.run, is?.run);
  if (kind === undefined) return undefined;
  const seenGoing = shownBefore.has(was.run);
  const seenLanding = is !== undefined && shownNow.has(is.run);
  if (!seenGoing && !seenLanding) return undefined;
  return {
    item: is?.item ?? was.item,
    kind,
    side: moveSide(kind),
    to: is?.run,
    leaving: seenGoing ? { run: was.run, index: was.index, phase: "waiting" } : undefined,
    landing: seenLanding ? { phase: "waiting" } : undefined,
  };
}

function sameMoves<T>(a: Moves<T>, b: Moves<T>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, move] of b) if (a.get(id) !== move) return false;
  return true;
}

/** Whether any move waits to be seen. */
export function movesWaiting<T>(moves: Moves<T>): boolean {
  for (const move of moves.values()) {
    if (move.leaving?.phase === "waiting") return true;
    if (move.leaving === undefined && move.landing?.phase === "waiting") return true;
  }
  return false;
}

/** The list is seen: every waiting row starts to slide off, or, with none to go, to land. */
export function releaseMoves<T>(moves: Moves<T>): Moves<T> {
  if (!movesWaiting(moves)) return moves;
  const out = new Map<string, Moving<T>>();
  for (const [id, move] of moves) {
    if (move.leaving?.phase === "waiting") {
      out.set(id, { ...move, leaving: { ...move.leaving, phase: "sliding" } });
    } else if (move.leaving === undefined && move.landing?.phase === "waiting") {
      out.set(id, { ...move, landing: { phase: "landing" } });
    } else {
      out.set(id, move);
    }
  }
  return out;
}

function changed<T>(
  moves: Moves<T>,
  id: string,
  step: (move: Moving<T>) => Moving<T> | undefined,
): Moves<T> {
  const move = moves.get(id);
  if (move === undefined) return moves;
  const next = new Map(moves);
  const after = step(move);
  if (after === undefined) next.delete(id);
  else next.set(id, after);
  return next;
}

/** Its old row is off the edge: it folds shut, and its new row lands. */
export function moveSlid<T>(moves: Moves<T>, id: string): Moves<T> {
  return changed(moves, id, (move) =>
    move.leaving?.phase !== "sliding"
      ? move
      : {
          ...move,
          leaving: { ...move.leaving, phase: "folding" },
          landing: move.landing === undefined ? undefined : { phase: "landing" },
        },
  );
}

/** Its old row has folded shut. */
export function moveFolded<T>(moves: Moves<T>, id: string): Moves<T> {
  return changed(moves, id, (move) =>
    move.landing === undefined ? undefined : { ...move, leaving: undefined },
  );
}

/** Its new row has landed. */
export function moveLanded<T>(moves: Moves<T>, id: string): Moves<T> {
  return changed(moves, id, (move) =>
    move.leaving === undefined ? undefined : { ...move, landing: undefined },
  );
}

/**
 * Whether a room on its way counts as in the run it goes to: once its old row has started to fold
 * (or it had none), so a heading's count changes as the gap closes, not before.
 */
function arrived<T>(move: Moving<T>): boolean {
  if (move.landing !== undefined) return move.landing.phase === "landing";
  return move.leaving === undefined || move.leaving.phase === "folding";
}

/**
 * The rows a list draws in `run`: the rooms in it, less those on their way in that have not
 * arrived, and with those on their way out put back where they stood.
 */
export function drawnRun<T extends { readonly id: string }>(
  run: ListRun,
  live: readonly T[],
  moves: Moves<T>,
): T[] {
  if (moves.size === 0) return [...live];
  const coming = new Set<string>();
  const held: HeldRow<T>[] = [];
  for (const [id, move] of moves) {
    if (move.to === run && !arrived(move)) coming.add(id);
    if (move.leaving?.run === run) held.push({ item: move.item, index: move.leaving.index });
  }
  return keepLeaving(
    live.filter((item) => !coming.has(item.id)),
    held,
  );
}

/** How a row drawn in `run` moves, if it does: going off an edge, or landing from one. */
export type RowMove =
  | { readonly going: MoveSide; readonly folding: boolean }
  | { readonly landing: MoveSide };

/** What `id`'s row in `run` is doing, if anything. */
export function rowMove<T>(moves: Moves<T>, id: string, run: ListRun): RowMove | undefined {
  const move = moves.get(id);
  if (move === undefined) return undefined;
  if (move.leaving?.run === run) {
    return move.leaving.phase === "waiting"
      ? undefined
      : { going: move.side, folding: move.leaving.phase === "folding" };
  }
  if (move.to === run && move.landing?.phase === "landing") {
    return { landing: move.side === "right" ? "left" : "right" };
  }
  return undefined;
}

/**
 * Whether the heading over `run` is folding away with its last row: every row it heads is on its
 * way out and folding.
 */
export function runFolding<T extends { readonly id: string }>(
  run: ListRun,
  drawn: readonly T[],
  moves: Moves<T>,
): boolean {
  return (
    drawn.length > 0 &&
    drawn.every((item) => {
      const move = moves.get(item.id);
      return move?.leaving?.run === run && move.leaving.phase === "folding";
    })
  );
}
