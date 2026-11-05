/**
 * The arrow keys in a grid of buttons (ADR 0272): the colours and the marks are each one stop for
 * Tab, and inside one the arrows move the keyboard from button to button, as they would across a
 * grid of anything on a Mac. Moving does not choose: a face saves on every pick and every save of
 * a person's or an agent's face is a line in the log, so a pick is Enter or Space on the button,
 * or a click, never an arrow passing over it.
 *
 * Up and down go to the button nearest across in the row above or below, measured where the page
 * is laid out, so a family of marks that ends short of a row hands over to the next family's
 * nearest mark rather than to whatever sits a row's count further on. Where nothing is laid out
 * (a test's DOM) a row is `across` buttons.
 */

import type { KeyboardEvent } from "react";

/** The buttons in a grid, in order. */
function buttonsIn(grid: HTMLElement): HTMLButtonElement[] {
  return [...grid.querySelectorAll<HTMLButtonElement>("button[data-roving]")];
}

/** Where a key along the row goes, from a button at `at` of `count`. */
const ALONG: Readonly<Record<string, (at: number, count: number) => number>> = {
  ArrowLeft: (at) => at - 1,
  ArrowRight: (at) => at + 1,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/** The button the arrow lands on, or nothing past an edge. */
function target(
  buttons: readonly HTMLButtonElement[],
  at: number,
  key: string,
  across: number,
): number | undefined {
  const along = ALONG[key];
  if (along !== undefined) return within(along(at, buttons.length), buttons.length);
  const down = key === "ArrowDown";
  if (!down && key !== "ArrowUp") return undefined;
  const from = buttons[at]?.getBoundingClientRect();
  if (from === undefined || from.width === 0)
    return within(down ? at + across : at - across, buttons.length);
  return nearestAcross(buttons, from, down);
}

/** A place in the grid, or nothing past its edges. */
function within(at: number, count: number): number | undefined {
  return at >= 0 && at < count ? at : undefined;
}

/**
 * The button in the nearest row above or below, closest across to where the keyboard is. Rows are
 * told apart by the buttons' middles, which a swatch growing under the pointer does not move.
 */
function nearestAcross(
  buttons: readonly HTMLButtonElement[],
  from: DOMRect,
  down: boolean,
): number | undefined {
  const middle = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  // Less than half a button apart up or down is the same row.
  const half = from.height / 2;
  let best: { at: number; rows: number; across: number } | undefined;
  buttons.forEach((button, at) => {
    const box = button.getBoundingClientRect();
    const rows = (box.top + box.height / 2 - middle.y) * (down ? 1 : -1);
    if (rows < half) return;
    const across = Math.abs(box.left + box.width / 2 - middle.x);
    const nearer = best === undefined || rows < best.rows - half;
    if (nearer || (Math.abs(rows - (best?.rows ?? rows)) < half && across < (best?.across ?? 0)))
      best = { at, rows, across };
  });
  return best?.at;
}

/** A grid's arrow keys: the keyboard moves, and the button it lands on is the grid's Tab stop. */
export function onRovingKey(event: KeyboardEvent<HTMLElement>, across: number): void {
  const grid = event.currentTarget;
  const buttons = buttonsIn(grid);
  const at = buttons.indexOf(event.target as HTMLButtonElement);
  if (at < 0) return;
  const next = target(buttons, at, event.key, across);
  if (next === undefined) return;
  event.preventDefault();
  const button = buttons[next];
  if (button === undefined) return;
  for (const each of buttons) each.tabIndex = each === button ? 0 : -1;
  button.focus();
  button.scrollIntoView?.({ block: "nearest" });
}
