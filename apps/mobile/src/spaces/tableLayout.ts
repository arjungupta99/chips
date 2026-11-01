/**
 * How a table's columns are laid out in a bubble on the phone (ADR 0184).
 *
 * React Native has no table, and cannot measure words before it draws them, so each column is
 * sized from its words, estimated at the size they are set in. A column has two widths: the most
 * it would take, every cell on one line (`most`), and the least it can take (`least`), which is
 * its longest word and never under a few words' width when it has more than that to say.
 *
 * A table whose columns all fit at their least **fits**: each column starts at its most and gives
 * width up toward its least in proportion to what it has to give, which is how a browser shares
 * out a table's width. That sharing is flexbox's (`flexBasis`, `flexShrink`), done against the
 * bubble's real width, so every row comes out with the same columns and nothing is measured.
 * Where the bubble is wider than the words, the last column takes what is left.
 *
 * A table that does not fit **scrolls** sideways inside its bubble, each column at its most but
 * no wider than `CAP` ems, so a long column wraps rather than running on for a screen.
 *
 * Whether it fits is decided against `room`, the most a bubble may be. That is the window's
 * estimate, so on an iPad, where the room is a pane, a table may be judged to fit a bubble it
 * does not; it then scrolls at its columns' least, rather than spilling out of the bubble.
 */

import type { Cell, Inline, Table } from "@chipschat/core";

/** An em of words at this weight, as a share of the size: SF Pro's average, a little over. */
const EM_SHARE = { regular: 0.53, bold: 0.58 } as const;

/** Space either side of a cell's words, and at the table's edges, the bubble's own (`BUBBLE.padX`). */
export const CELL_PAD = 10;
export const EDGE_PAD = 14;

/** Points over the estimate, so a word that came out a little wider than guessed still fits. */
const SLACK = 4;

/** A column with more to say than a word is never squeezed under this many ems. */
const FLOOR = 6.5;

/** A column of a table that scrolls is never wider than this many ems. */
const CAP = 14;

export interface Column {
  /** Every cell on one line, padding included. */
  readonly most: number;
  /** The narrowest it can be: its longest word, or `FLOOR` ems of a longer cell. */
  readonly least: number;
  /** Its width when the table scrolls. */
  readonly width: number;
}

export interface TableLayout {
  readonly scrolls: boolean;
  readonly columns: readonly Column[];
  /** Every column at its most: as wide as the table is with nothing wrapped. */
  readonly most: number;
  /** Every column at its least, the narrowest the table is drawn; its width, when it scrolls. */
  readonly width: number;
}

/** The table laid out in words set at `size`, for a bubble at most `room` wide. */
export function tableLayout(table: Table, size: number, room: number): TableLayout {
  const count = table.head.length;
  const columns = table.head.map((head, index) => {
    const pad =
      2 * CELL_PAD +
      (index === 0 ? EDGE_PAD - CELL_PAD : 0) +
      (index === count - 1 ? EDGE_PAD - CELL_PAD : 0);
    const cells = [
      measure(head, size, true),
      ...table.rows.map((row) => measure(row[index] ?? [], size, false)),
    ];
    const line = Math.max(...cells.map((cell) => cell.line));
    const word = Math.max(...cells.map((cell) => cell.word));
    const most = Math.ceil(line + pad + SLACK);
    const least = Math.ceil(Math.max(word, Math.min(line, FLOOR * size)) + pad + SLACK);
    const width = Math.max(least, Math.min(most, Math.ceil(CAP * size + pad)));
    return { most, least, width };
  });
  const least = sum(columns.map((column) => column.least));
  const scrolls = least > room;
  return {
    scrolls,
    columns,
    most: sum(columns.map((column) => column.most)),
    width: scrolls ? sum(columns.map((column) => column.width)) : least,
  };
}

/** How wide a cell's words are on one line, and its longest word, in points. */
export function measure(
  cell: Cell,
  size: number,
  bold: boolean,
): { readonly line: number; readonly word: number } {
  let line = 0;
  let word = 0;
  let current = 0;
  for (const { text, strong } of runsOf(cell, bold)) {
    const em = size * (strong ? EM_SHARE.bold : EM_SHARE.regular);
    for (const character of text) {
      line += em;
      current = /\s/.test(character) ? 0 : current + em;
      word = Math.max(word, current);
      // A line may break after a hyphen, a slash or a dash, as iOS breaks "door/conditions".
      if (/[-/\u2013\u2014]/.test(character)) current = 0;
    }
  }
  return { line, word };
}

/** A cell's words as plain runs, each knowing whether it is bold. */
function runsOf(runs: readonly Inline[], bold: boolean): { text: string; strong: boolean }[] {
  return runs.flatMap((run) => {
    switch (run.type) {
      case "strong":
        return runsOf(run.children, true);
      case "em":
        return runsOf(run.children, bold);
      case "mention":
        return [{ text: `@${run.handle}`, strong: true }];
      default:
        return [{ text: run.text, strong: bold }];
    }
  });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
