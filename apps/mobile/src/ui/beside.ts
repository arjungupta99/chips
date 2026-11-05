/**
 * Where a popover stands (ADR 0256, the mock's section 7): on an iPad a sheet opened from a button
 * opens beside it, its arrow on the button, as iPadOS opens a choice. It stands on whichever side
 * of the button has the more room, above a button low on the window and below one high on it, and
 * across from the button's middle as far as the window's edges allow; the arrow stays on the
 * button wherever the panel had to stop.
 *
 * The side it stands is its edge: below a button its top is fixed, above one its foot is, so what
 * it holds grows away from the button, a page at a time, without being measured first.
 */

import type { RefObject } from "react";
import type { View } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";
import { SHEET, SPACE } from "./tokens";

/** A box in the window: the button a popover stands beside. */
export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a sheet was opened from: the button, or the row, measured as the sheet opens. */
export type SheetFrom = RefObject<View | null>;

/** As wide as a popover gets: a phone's sheet is what each holds, and a phone is about this wide. */
export const POPOVER_WIDTH = 380;
/** How far the arrow stands out of the panel. */
export const ARROW = 9;
/** Between the button and the arrow's tip. */
const GAP = 4;
/** The least a popover stands off the window's edges. */
const EDGE = SPACE.md;

export interface Placed {
  /** Above the button, its arrow at its foot; else below it, its arrow at its top. */
  readonly above: boolean;
  /** Its edge nearest the button: its top's distance down the window, or its foot's up it. */
  readonly edge: number;
  readonly left: number;
  readonly width: number;
  /** As tall as it may be on that side. */
  readonly room: number;
  /** Where the arrow's middle is, from the panel's left. */
  readonly arrow: number;
}

export function placeBeside(
  spot: Spot,
  window: { readonly width: number; readonly height: number },
  insets: EdgeInsets,
  most: number = POPOVER_WIDTH,
): Placed {
  const off = GAP + ARROW;
  const under = window.height - insets.bottom - EDGE - (spot.y + spot.height + off);
  const over = spot.y - off - insets.top - EDGE;
  const above = over > under;
  const width = Math.min(most, window.width - insets.left - insets.right - EDGE * 2);
  const middle = spot.x + spot.width / 2;
  const left = clamp(
    middle - width / 2,
    insets.left + EDGE,
    window.width - insets.right - EDGE - width,
  );
  return {
    above,
    edge: above ? window.height - spot.y + off : spot.y + spot.height + off,
    left,
    width,
    room: Math.max(0, above ? over : under),
    // Clear of the panel's rounded corners.
    arrow: clamp(middle - left, SHEET.radius + ARROW, width - SHEET.radius - ARROW),
  };
}

function clamp(value: number, least: number, most: number): number {
  return Math.max(least, Math.min(most, value));
}

/** Where a popover's button is, and whether it is in sight to point at. */
export interface Seen {
  readonly at: Spot;
  readonly seen: boolean;
}

/** How many frames a button is looked at for, after the sheet opens or the window turns. */
const LOOKS = 30;

/**
 * A button looked at each frame for half a second: a turned iPad lays its window out twice, the
 * second time a few frames on (ADR 0256), and a button measured once stood where it had been.
 * Fabric answers at once. A view that does not (one under a test renderer) leaves the popover in
 * the middle, and one that answers later moves it to the button when it does. The New space
 * window follows its + the same way (`newSpace/Window.tsx`).
 */
export function watch(
  view: View,
  middle: Seen,
  height: number,
  onSpot: (next: (was: Seen | undefined) => Seen) => void,
): () => void {
  let answered = false;
  let frame = 0;
  let next = 0;
  const look = () =>
    view.measureInWindow((x, y, across, down) => {
      answered = true;
      const at = { x, y, width: across, height: down };
      const seen = at.y + at.height > 0 && at.y < height ? { at, seen: true } : middle;
      onSpot((was) => (was !== undefined && sameSpot(was.at, seen.at) ? was : seen));
      if (++frame < LOOKS) next = requestAnimationFrame(look);
    });
  look();
  if (!answered) onSpot(() => middle);
  return () => cancelAnimationFrame(next);
}

function sameSpot(one: Spot, other: Spot): boolean {
  return (
    one.x === other.x &&
    one.y === other.y &&
    one.width === other.width &&
    one.height === other.height
  );
}
