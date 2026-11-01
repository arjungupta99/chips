/**
 * Picking rows of a list to archive or delete them together, whatever the rows are: the Spaces
 * list's rooms (ADR 0181) and the Agents tab's agents (ADR 0182). What the list's own acts take,
 * and what its sheets say, are the list's; what is the same for any of them is here.
 *
 * - Select starts it and Done ends it. While it lasts the tab bar and the gold + step aside for
 *   the bar of acts, and the list makes room under its last row for that bar (`PickRoom`).
 * - A press picks a row, or, for one that can't be picked, shakes it and raises a note that says
 *   why (`whyNot`). The line under the list's name says what can't be picked, with Select all.
 * - A row on its way out — archived, or deleted — is held where it stood until it has gone
 *   (`hold`, `move`, `letGo`; `keepLeaving` draws it), folding away, or going to dust first. What
 *   goes waits for the sheet that asked to be gone, so it is seen going (`afterSheet`): folded
 *   behind the sinking sheet, a row was gone before the list showed again (the simulator, 16
 *   October 2026).
 * - The rows move as the list starts and stops picking by its `motion`, which the list hands them
 *   in a `PickMotion`; they are drawn again for it only once they have come to rest
 *   (`ROWS_REDRAWN_MS`), and `live` says, in the meantime, what a press on one does.
 */

import { useCallback, useEffect, useState } from "react";
import * as feel from "../ui/haptics";
import { SHEET_OUT_MS } from "../ui/Sheet";
import { useStepTabBarAside } from "../ui/tabBarAside";
import { useReduceMotion } from "../ui/useReduceMotion";
import { type Asker, useDust } from "./Dust";
import type { Held } from "./picking";
import { HINT_HEIGHT, type Note, PickHint } from "./Selecting";
import { ROWS_REDRAWN_MS, usePickMotion } from "./SelectMotion";

/** A row on its way out of the list, drawn where it stood until it has gone. */
export interface Leaving<T> extends Held<T> {
  /** Which run of rows it stood in. */
  readonly run: string;
  /** Archived, it folds away; deleted, it goes to dust first. */
  readonly kind: "archive" | "delete";
  /** Held while the server is asked; going, to dust; folding shut. */
  readonly phase: "held" | "going" | "folding";
}

/** What each row is told while the list picks. */
export interface Picking<T> {
  /** The list is picking. */
  readonly active: boolean;
  readonly picked: ReadonlySet<string>;
  readonly may: (item: T) => boolean;
  readonly onPick: (item: T) => void;
  /** How many times each row that can't be picked has been pressed, which shakes it. */
  readonly shakes: ReadonlyMap<string, number>;
}

/** The rows on their way out, and the dust the deleted ones go to. */
export interface Going<T> {
  readonly leaving: ReadonlyMap<string, Leaving<T>>;
  readonly dust: Asker;
  readonly onDusted: (id: string) => void;
  readonly onFolded: (id: string) => void;
}

const NONE_PICKED: ReadonlySet<string> = new Set();

export function usePick<T extends { readonly id: string }>({
  items,
  visible,
  may,
  whyNot,
  hint,
  runOf,
  closeRow,
}: {
  /** Every row the list has, shown or folded away. */
  readonly items: readonly T[];
  /** The rows shown now, which Select all picks. */
  readonly visible: readonly T[];
  readonly may: (item: T) => boolean;
  /** Why a row can't be picked, said over the bar when it is pressed. */
  readonly whyNot: (item: T) => Omit<Note, "key">;
  /**
   * What the line under the name says about the rows that can't be picked, if any can't, and
   * whether it is about locked ones.
   */
  readonly hint: { readonly words: string | undefined; readonly locked: boolean };
  /** Which run of rows a row stands in, for where it is held as it goes. */
  readonly runOf: (item: T) => string;
  /** Closes a row a swipe has left open, as picking starts. */
  readonly closeRow: () => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string> | undefined>(undefined);
  const [note, setNote] = useState<Note | undefined>(undefined);
  const [shakes, setShakes] = useState<ReadonlyMap<string, number>>(new Map());
  const [leaving, setLeaving] = useState<ReadonlyMap<string, Leaving<T>>>(new Map());
  const dust = useDust(useReduceMotion());
  const picking = picked !== undefined;
  useStepTabBarAside(picking);
  const motion = usePickMotion(picking);
  const rowsPicking = useCaughtUp(picking, ROWS_REDRAWN_MS);
  const chosen =
    picked === undefined ? [] : items.filter((item) => picked.has(item.id) && may(item));
  const stop = useCallback(() => {
    setPicked(undefined);
    setNote(undefined);
  }, []);
  const clearNote = useCallback(() => setNote(undefined), []);
  const none = useCallback(() => setPicked(undefined), []);
  const onPick = (item: T) => {
    if (!may(item)) {
      setShakes((all) => new Map(all).set(item.id, (all.get(item.id) ?? 0) + 1));
      setNote({ key: Date.now(), ...whyNot(item) });
      return;
    }
    const on = picked?.has(item.id) !== true;
    if (on) feel.tick();
    setPicked((now) => {
      const next = new Set(now);
      if (on) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  };
  const pickable = visible.filter(may);
  const all = pickable.length > 0 && pickable.every((item) => picked?.has(item.id) === true);
  const onAll = () => setPicked(all ? new Set() : new Set(pickable.map((item) => item.id)));
  // Held where they stood, in whichever run of rows they stood in, until they have gone.
  const hold = (going: readonly T[], kind: Leaving<T>["kind"], phase: Leaving<T>["phase"]) =>
    setLeaving((now) => {
      const next = new Map(now);
      for (const item of going) {
        const run = runOf(item);
        const index = Math.max(
          0,
          items.filter((each) => runOf(each) === run).findIndex((each) => each.id === item.id),
        );
        next.set(item.id, { item, index, run, kind, phase });
      }
      return next;
    });
  const move = (ids: readonly string[], phase: Leaving<T>["phase"]) =>
    setLeaving((now) => {
      const next = new Map(now);
      for (const id of ids) {
        const was = next.get(id);
        if (was !== undefined) next.set(id, { ...was, phase });
      }
      return next;
    });
  const afterSheet = (ids: readonly string[], phase: Leaving<T>["phase"]) =>
    setTimeout(() => move(ids, phase), SHEET_OUT_MS);
  const letGo = (ids: readonly string[]) =>
    setLeaving((now) => {
      const next = new Map(now);
      for (const id of ids) next.delete(id);
      return next;
    });
  const row: Picking<T> = {
    active: rowsPicking,
    picked: picked ?? NONE_PICKED,
    may,
    onPick,
    shakes,
  };
  const going: Going<T> = {
    leaving,
    dust: dust.asker,
    onDusted: (id) => move([id], "folding"),
    onFolded: (id) => letGo([id]),
  };
  return {
    picking,
    /** What the rows move by as picking starts and stops, for the list's `PickMotion`. */
    motion,
    chosen,
    row,
    going,
    // The line under the name while picking.
    under: picking
      ? {
          node: <PickHint words={hint.words} locked={hint.locked} all={all} onAll={onAll} />,
          height: HINT_HEIGHT,
        }
      : undefined,
    dust,
    note,
    clearNote,
    // Select stands only where there is something it could pick.
    any: items.some(may),
    start: () => {
      closeRow();
      setPicked(new Set());
    },
    stop,
    hold,
    move,
    afterSheet,
    letGo,
    /** Nothing left to pick from: picking stops. */
    none,
  };
}

export type Picks<T extends { readonly id: string }> = ReturnType<typeof usePick<T>>;

/**
 * `value`, `after` it last changed: what the rows are drawn with while they move by the list's
 * `PickMotion`. At once where nothing moves (`after` of nought, as under Jest).
 */
function useCaughtUp(value: boolean, after: number): boolean {
  const [caught, setCaught] = useState(value);
  useEffect(() => {
    if (after <= 0 || caught === value) return;
    const timer = setTimeout(() => setCaught(value), after);
    return () => clearTimeout(timer);
  }, [value, after, caught]);
  return after <= 0 ? value : caught;
}
