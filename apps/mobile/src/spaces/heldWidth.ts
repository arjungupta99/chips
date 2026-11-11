/**
 * How a room's lines take a change of the room's width on an iPad (ADR 0279): once, with their
 * words out of sight, rather than at every width the room's column passes through on its way.
 *
 * The split moves the room's column on the panes' curve (`PaneMotion.tsx`). Laid out at each width
 * on the way, every row the list had drawn wrapped its words again on every frame, about nine
 * screens of them, and the columns stalled with it (Arjun, 5 November 2026: "major frame drops from
 * all the message bubble resizing"). So the lines stand in a box of their own width while the column
 * moves: the width they have while their words go, then the new one, in one render, from which each
 * row and bubble glides to its new frame on the UI thread (`roomGlide`, in `RoomMotion.tsx`), and
 * none once they have landed, when the room's own width is theirs again.
 *
 * Where the box stands in the room is what keeps every line going one way (Arjun's iPad, 6 November
 * 2026: "weird abrupt bouncing of content underneath whenever left or right columns are
 * collapsed"). Their column stands in the middle of the box, and nothing moves it but a layout:
 *
 * - A column as wide at the new width as at the old, as on a 13-inch on its side with the list or
 *   without it, stands in the middle of the room the whole way, and goes with the room's middle
 *   frame by frame. None of its rows changes, so none of them glides, and the box's own change of
 *   width moves nothing. Kept to the room's start, the lines rode its edge out with the list while
 *   their words went, and jumped back to the middle as they took the new width.
 * - A column that narrows or widens keeps to the room's edge that stays put, its start when the
 *   column beside it comes or goes and its end when the list does, so the lines stand still on the
 *   glass while their words go, and each row glides once, from where it was drawn to where it
 *   lands, setting off from where the box's change of width put the column's start rather than
 *   with it (`Field.shift`). Kept to the room's middle, a column narrowing beside the details went
 *   the way the room's middle did, and came back as it narrowed.
 *
 * The words go, the room's width changes, and they come back, one after another (Arjun's iPad, 6
 * November 2026: "get rid of the blur. when we tap: hide text (not bubbles), resize, show text").
 * Each bubble's words fade out while the bubbles stay (`Ink`, in `RoomWords.tsx`); the panes beside
 * the room wait until they have gone before they move (`useWordsLead`, given them as `PaneLead`);
 * the bubbles glide to their new frames with nothing in them to wrap again; and the words fade
 * back once the panes and the lines have landed. A frost over the whole room did this before, up
 * over a fifth of a second and cleared after; it read as a blur laid over the room.
 *
 * The words say when they have gone and when they are back, and nothing here guesses either: their
 * fades are on the steady clock, which a stall holds back, so on the wall's clock the lines would
 * set off before the words had gone, and be let go with the words still coming back. The panes go
 * by the lines in turn: they set off once the lines are drawn at the new width (`Told.waiting`).
 *
 * Kept apart from the words' motion, which is Reanimated, so that when each part happens can be
 * proved under Jest.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useReduceMotion } from "../ui/useReduceMotion";

/**
 * How long the words wait before they go: the change that sets them going mounts the details'
 * pane too, which reached the screen three frames after a fade let go with it (the simulator, 5
 * November 2026). Nothing moves until they have gone, so a wait costs nothing seen.
 */
export const WORDS_WAIT = 50;
/** How long the words take to go, before anything moves: long enough to be seen going. */
export const WORDS_OUT = 150;
/**
 * How long the panes beside the room wait before they move (`PaneLead`, in `PaneMotion.tsx`): until
 * the words have gone. Both wait on the steady clock, so a stall holds them back alike.
 */
export const WORDS_LEAD = WORDS_WAIT + WORDS_OUT;
/**
 * How long the rows and bubbles take to glide to their new frames. They set off once the words
 * have gone, as the panes do, and land just before the panes' 0.52 s (`PadBarMotion.tsx`).
 */
export const GLIDE = 480;
/**
 * How long after the lines take the new width their words start to come back: the panes' 0.52 s,
 * once they and the lines have landed. And how long the words take to come back.
 */
export const WORDS_BACK = 520;
export const WORDS_IN = 200;
/**
 * When the lines let go of their width, once they have taken it: past the glide and past the panes,
 * which set off a frame after them (`panesWait`) and which a stall holds back on the steady clock.
 */
export const LET_GO = GLIDE + 120;

/** The lines' words: going or gone, coming back, or simply there. */
export type Words = "going" | "coming" | undefined;

/**
 * Where a room stands beside the list, where the split says it: how wide, and how far short of the
 * detail's right it ends, which is the column of its details or Universe beside it, or nought.
 */
export interface RoomSpan {
  readonly width: number;
  readonly end: number;
}

/**
 * Where in the room the lines' box stands while it holds a width: in the middle, or at the edge that
 * stays put.
 */
export type Edge = "start" | "middle" | "end";

/** What the room's moves are told of the lines' change of width (`Field.glide`, `Field.shift`). */
export interface Told {
  /**
   * The lines take the new width next, which moves their column's start `shift` points on the
   * glass: tell the moves, and then `take` it.
   */
  readonly glide: (shift: number, take: () => void) => void;
  /** They have landed. */
  readonly landed: () => void;
  /** Whether the panes beside the room are to wait for them: until they have taken the new width. */
  readonly waiting: (waiting: boolean) => void;
}

/** The width the lines' box holds, and the room's edge it keeps to. */
interface Held {
  readonly width: number;
  readonly edge: Edge;
}

/** The lines' width and the edge they keep to, their words, and what the words tell them. */
export interface HeldWidth {
  readonly width: number | undefined;
  readonly edge: Edge | undefined;
  readonly words: Words;
  /**
   * Whether the lines are gliding to the new width: from the render that draws them at it until
   * they let go of it. Their list draws past its own frame only then (`DrawsPast`, in
   * `ScrollColours.tsx`).
   */
  readonly gliding: boolean;
  /** Each change of width the words are going for, counted: they say they have gone for each. */
  readonly change: number;
  /** The words have gone: the lines take the new width. */
  readonly gone: () => void;
  /** The words are back. */
  readonly back: () => void;
}

/**
 * The width a room's lines stand at, given where the room stands (`span`, said by the split;
 * nothing where it says none): nothing at rest, where they take the room's own; and while the
 * room's column moves, the width they had until their words have gone, then the new one until they have
 * glided there, in the middle of the room or at its edge that stays put. A turned window, a room
 * with no motion (`moves`), and the first width take it at once. The room's moves are `told` how
 * far the start of the lines' column moves on the glass as they take the new width, the column
 * being `column` wide in lines of a width and standing in their middle, and when they have landed.
 */
export function useHeldWidth(
  span: RoomSpan | undefined,
  moves: boolean,
  column: (width: number) => number,
  told: Told,
): HeldWidth {
  const { width: window } = useWindowDimensions();
  const width = span?.width;
  const end = span?.end ?? 0;
  const [held, setHeld] = useState<Held | undefined>(undefined);
  const [words, setWords] = useState<Words>(undefined);
  // Each change of width the lines take with their words gone, counted, and whether they glide yet.
  const [change, setChange] = useState({ count: 0, gliding: false });
  const [last, setLast] = useState({ width, end, window });
  if (last.width !== width || last.window !== window) {
    setLast({ width, end, window });
    // They hold where they are laid out: the room's width at rest, or a glide's on its way.
    const was = held?.width ?? last.width;
    const glides = moves && last.window === window && was !== undefined && width !== undefined;
    setHeld(
      glides ? { width: was, edge: edgeOf(was, width, last.end === end, column) } : undefined,
    );
    if (glides) {
      setWords("going");
      setChange((now) => ({ count: now.count + 1, gliding: false }));
    }
  }
  const to = useRef(width);
  to.current = width;
  const tell = useRef(told);
  tell.current = told;
  const across = useRef(column);
  across.current = column;
  const drawn = useRef(held);
  drawn.current = held;
  const now = useRef(change);
  now.current = change;
  const { gliding } = change;
  // The panes wait from the commit that holds the lines to the one that draws them at the new width.
  const waiting = held !== undefined && !gliding;
  useLayoutEffect(() => {
    tell.current.waiting(waiting);
  }, [waiting]);
  useEffect(() => () => tell.current.waiting(false), []);
  // Gone, said once for the change the words went for: the lines take the newest width, once the
  // moves have been told; and the newest then, should it have changed again meanwhile.
  const gone = useCallback(() => {
    const { count, gliding } = now.current;
    if (count === 0 || gliding) return;
    now.current = { count, gliding: true };
    const from = drawn.current;
    const next = to.current;
    const shift =
      from === undefined || next === undefined ? 0 : shiftOf(from, next, across.current);
    tell.current.glide(shift, () => {
      setHeld((held) =>
        held === undefined || to.current === undefined
          ? undefined
          : { width: to.current, edge: held.edge },
      );
      setChange((change) => ({ count: change.count, gliding: true }));
    });
  }, []);
  // Back, unless they have been sent going again since.
  const back = useCallback(() => setWords((words) => (words === "coming" ? undefined : words)), []);
  useEffect(() => {
    if (!gliding) return;
    // Drawn at the new width: the glide is under way.
    const coming = setTimeout(() => setWords("coming"), WORDS_BACK);
    const rest = setTimeout(() => {
      tell.current.landed();
      setHeld(undefined);
    }, LET_GO);
    return () => {
      clearTimeout(coming);
      clearTimeout(rest);
    };
  }, [gliding]);
  return {
    width: held?.width,
    edge: held?.edge,
    words,
    gliding: held !== undefined && gliding,
    change: change.count,
    gone,
    back,
  };
}

/**
 * How long the panes beside a room wait before they move (`PaneLead`): until the words of the
 * room's lines have gone, where they go — beside a `room` that is in sight, and moves (not with
 * Reduce Motion, and not on the web, as `Field.moves`); nought where nothing does.
 */
export function useWordsLead(room: boolean): number {
  const less = useReduceMotion();
  return room && !less && Platform.OS !== "web" ? WORDS_LEAD : 0;
}

/**
 * Where the lines' box stands as it goes from `from` to `to`: in the middle where their column is
 * as wide at both, a point apart at most, so that none of its rows changes; otherwise at the edge
 * that stays put, the room's start unless it is its end that `stays`.
 */
function edgeOf(from: number, to: number, stays: boolean, column: (width: number) => number): Edge {
  if (Math.abs(column(to) - column(from)) < 1) return "middle";
  return stays ? "end" : "start";
}

/**
 * How far the start of the lines' column moves on the glass as their box takes the width `to`: the
 * column stands in the middle of the box, and the box where it stands in the room.
 */
function shiftOf(from: Held, to: number, column: (width: number) => number): number {
  const was = column(from.width);
  const is = column(to);
  if (from.edge === "middle") return (was - is) / 2;
  return from.edge === "start"
    ? (to - is - (from.width - was)) / 2
    : (from.width + was - (to + is)) / 2;
}
