/**
 * Picking rows to archive or delete them together on the desktop: the rail's rooms (ADR 0181) and
 * the Agents page's agents (ADR 0182), as the phone's lists pick theirs (`usePick` there). Who may
 * be picked, and what the asking says, are core's; what is the same for any list is here.
 *
 * - Select starts it, and Done or Escape ends it. A click picks a row, and a shift-click picks
 *   every row that may be picked from the last one clicked to it, as a desktop list does.
 * - A row that can't be picked shakes, and a note over the bar says why (`whyNot`).
 * - A row on its way out — archived, unarchived or deleted — is held where it stood until it has
 *   folded away (`hold`, `go`, `letGo`; core's `keepLeaving` draws it), since the store drops it at
 *   once; where it lands, in another run, it unfolds (`land`).
 */

import type { HeldRow } from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** A row on its way out of the list, drawn where it stood until it has gone. */
export interface Leaving<T> extends HeldRow<T> {
  /** Which run of rows it stood in. */
  readonly run: string;
  /** Archived or unarchived, it folds away; deleted, it crumbles first. */
  readonly kind: "archive" | "delete";
  /** Held while the server is asked, or going. */
  readonly phase: "held" | "going";
}

/** A note over the bar about a row that can't be picked: why not. */
export interface Note {
  /** New for each click, so the same row clicked twice says it again. */
  readonly key: number;
  readonly words: string;
}

/** What a row is told while the list picks, and as it goes. */
export interface RowPick {
  readonly active: boolean;
  /** The circle at its leading edge: ticked, empty, or none, for a row that can't be picked. */
  readonly mark: "on" | "off" | "none";
  /** How many times it has been clicked while it can't be picked, which shakes it. */
  readonly shake: number;
  readonly onPick: (range: boolean) => void;
  /** It is on its way out, and how. */
  readonly leaving?: Leaving<unknown> | undefined;
  /** It has just come into this run from another, and unfolds. */
  readonly landing: boolean;
  /** Its fold is done. */
  readonly onGone: () => void;
}

/** How long a row going may take before it is let go anyway: its fold ends well before. */
const GONE_BY_MS = 1200;
/**
 * How long a row on its way to another run may take to get there and still unfold as it does: an
 * agent gets there once the server has said, a room at once.
 */
const LANDS_BY_MS = 1500;

export function usePick<T extends { readonly id: string }>({
  items,
  visible,
  may,
  whyNot,
  runOf,
}: {
  /** Every row the list has, shown or folded away. */
  readonly items: readonly T[];
  /** The rows shown now, in their order, which Select all and a shift-click pick from. */
  readonly visible: readonly T[];
  readonly may: (item: T) => boolean;
  /** Why a row can't be picked, said over the bar when it is clicked. */
  readonly whyNot: (item: T) => string;
  /** Which run of rows a row stands in, for where it is held as it goes. */
  readonly runOf: (item: T) => string;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string> | undefined>(undefined);
  const [note, setNote] = useState<Note | undefined>(undefined);
  const [shakes, setShakes] = useState<ReadonlyMap<string, number>>(new Map());
  const [leaving, setLeaving] = useState<ReadonlyMap<string, Leaving<T>>>(new Map());
  // Rows on their way to another run, by the run they left: one that stays where it was, as one
  // the server refused does, does not unfold.
  const [landing, setLanding] = useState<ReadonlyMap<string, string>>(new Map());
  // The row a shift-click picks from: the last one clicked.
  const anchor = useRef<string | undefined>(undefined);
  const picking = picked !== undefined;
  const chosen =
    picked === undefined ? [] : items.filter((item) => picked.has(item.id) && may(item));
  const stop = useCallback(() => {
    setPicked(undefined);
    setNote(undefined);
    anchor.current = undefined;
  }, []);
  const clearNote = useCallback(() => setNote(undefined), []);
  // Escape ends it, unless a dialog is up, whose Cancel Escape is.
  useEffect(() => {
    if (!picking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]") !== null) return;
      stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, stop]);
  const pickable = visible.filter(may);
  const all = pickable.length > 0 && pickable.every((item) => picked?.has(item.id) === true);
  const onPick = (item: T, range: boolean) => {
    if (!may(item)) {
      setShakes((now) => new Map(now).set(item.id, (now.get(item.id) ?? 0) + 1));
      setNote({ key: Date.now(), words: whyNot(item) });
      return;
    }
    const from = visible.findIndex((each) => each.id === anchor.current);
    const to = visible.findIndex((each) => each.id === item.id);
    anchor.current = item.id;
    if (range && from >= 0 && to >= 0) {
      const run = visible.slice(Math.min(from, to), Math.max(from, to) + 1).filter(may);
      setPicked((now) => new Set([...(now ?? []), ...run.map((each) => each.id)]));
      return;
    }
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };
  const letGo = useCallback(
    (ids: readonly string[]) =>
      setLeaving((now) => {
        if (!ids.some((id) => now.has(id))) return now;
        const next = new Map(now);
        for (const id of ids) next.delete(id);
        return next;
      }),
    [],
  );
  // Held where they stood, in whichever run of rows they stood in, until they have gone.
  const hold = (going: readonly T[], kind: Leaving<T>["kind"], phase: Leaving<T>["phase"]) => {
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
    if (phase === "going") goneBy(going.map((item) => item.id));
  };
  // A fold that never ends, as a row in a run folded shut can't, still lets its row go.
  const goneBy = (ids: readonly string[]) => setTimeout(() => letGo(ids), GONE_BY_MS);
  const go = (ids: readonly string[]) => {
    setLeaving((now) => {
      const next = new Map(now);
      for (const id of ids) {
        const was = next.get(id);
        if (was !== undefined) next.set(id, { ...was, phase: "going" });
      }
      return next;
    });
    goneBy(ids);
  };
  const land = (going: readonly T[]) => {
    setLanding((now) => {
      const next = new Map(now);
      for (const item of going) next.set(item.id, runOf(item));
      return next;
    });
    setTimeout(
      () =>
        setLanding((now) => {
          const next = new Map(now);
          for (const item of going) next.delete(item.id);
          return next;
        }),
      LANDS_BY_MS,
    );
  };
  /**
   * What a row is told, drawn in `run`: the list says which, since a row held as it goes is no
   * longer in the list its run would be worked out from. Going from the run it stood in; where it
   * has landed, in another, it unfolds.
   */
  const rowOf = (item: T, run: string): RowPick => {
    const away = leaving.get(item.id);
    const from = landing.get(item.id);
    return {
      active: picking,
      mark: !may(item) ? "none" : picked?.has(item.id) === true ? "on" : "off",
      shake: shakes.get(item.id) ?? 0,
      onPick: (range) => onPick(item, range),
      leaving: away?.run === run ? away : undefined,
      landing: from !== undefined && from !== run,
      onGone: () => letGo([item.id]),
    };
  };
  return {
    picking,
    chosen,
    may,
    rowOf,
    leaving,
    all,
    /** Select all, or with every row shown picked, none. */
    onAll: () => setPicked(all ? new Set() : new Set(pickable.map((item) => item.id))),
    note,
    clearNote,
    // Select stands only where there is something it could pick.
    any: items.some(may),
    start: () => {
      anchor.current = undefined;
      setPicked(new Set());
    },
    stop,
    hold,
    go,
    land,
    letGo,
  };
}

export type Picks<T extends { readonly id: string }> = ReturnType<typeof usePick<T>>;
