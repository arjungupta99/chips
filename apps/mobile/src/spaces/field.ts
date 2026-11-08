/**
 * The room's field: what the list, its colour (`ScrollColours.tsx`), its motion (`RoomMotion.tsx`)
 * and a send's flight (`SendFlight.tsx`) share on the UI thread, made once per room
 * (`useColourField`). The type stands on its own here so each can import it without importing
 * the others.
 */

import type { FlatList } from "react-native";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import type { Row } from "./spaces";

export interface Field {
  /**
   * The list's offset, so a sample re-measures on every scroll frame. A sample does not read the
   * number; the room does, to know whether a send is made at its foot (`sendLanding.ts`).
   */
  readonly scroll: SharedValue<number>;
  /** Bumped on every layout of the viewport and every change of the list's content. */
  readonly layout: SharedValue<number>;
  /** Where the viewport is on the page, and how tall: measured once per change, for every sample. */
  readonly viewportTop: SharedValue<number>;
  readonly viewportHeight: SharedValue<number>;
  /**
   * How far down the viewport the room's first line stands: the bar and the pinned strip floating
   * over it, and the margin under them. Where a line read from its start is put (`RoomMotion.tsx`).
   */
  readonly top: SharedValue<number>;
  readonly still: boolean;
  /** The list itself, which the room scrolls to a line and to its foot. */
  readonly list: AnimatedRef<FlatList<Row>>;
  /**
   * Whether the room moves on its own transition (`RoomMotion.tsx`): not with Reduce Motion, and
   * not on the web, where the list keeps its place its own way.
   */
  readonly moves: boolean;
  /** One while the reader is up the history, where the list keeps their place and nothing moves. */
  readonly far: SharedValue<number>;
  /**
   * One while the room moves the list's offset itself rather than the reader (`Lift`, in
   * `RoomMotion.tsx`), and where it is taking it (`goal`): a send's words go for where their bubble
   * will stand once it is there (`SendFlight.tsx`).
   */
  readonly lifting: SharedValue<number>;
  readonly goal: SharedValue<number>;
  /**
   * Until when (`Date.now()`) the room is asked to take the list to its foot with the change that
   * draws a message of yours, sent from near the foot (`homeward`, in `RoomMotion.tsx`); nought when
   * nothing is asked.
   */
  readonly home: SharedValue<number>;
  /**
   * Until when (`Date.now()`) the room's moves are a change of its width, not of what it holds: the
   * one layout an iPad's room takes as its column moves (`useHeldWidth`, ADR 0279), whose rows and
   * bubbles glide on the panes' curve (`roomGlide`, in `RoomMotion.tsx`). Nought when none is coming.
   */
  readonly glide: SharedValue<number>;
  /**
   * How far that change of width moves the start of the lines' column on the glass, in which the
   * rows stand, at once (`useHeldWidth`): each row sets off from where it was drawn, not where it
   * stood in the column (`roomGlide`). Taken by the one layout it is told for, and nought after.
   */
  readonly shift: SharedValue<number>;
  /**
   * A change the reader is making in the room themselves — a line deleted, or brought back by
   * Undo — which moves on the room's spring even up the history (`RoomMotion.tsx`, `madeHere`).
   */
  readonly own: SharedValue<Own>;
}

/**
 * The reader's own change: asked for until `until` (`Date.now()`), and taken by the mount that
 * draws it at `at` (the frames' clock), nought until then.
 */
export interface Own {
  readonly until: number;
  readonly at: number;
}
