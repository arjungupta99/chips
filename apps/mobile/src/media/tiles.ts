/**
 * The tiles the viewer opens from and goes back to (the media viewer proposal, rule 3).
 *
 * A photo's tile in the room joins this registry while it is mounted, under the line it hangs
 * under and its attachment, with two things it can do: say where it is in the window at this
 * moment, and hide while its picture is up on the stage. The viewer asks at the moment it needs
 * to — when a drag lets go, not when the viewer opened — because the room may have scrolled under
 * the stage since, and a tile the list has windowed away is simply not here, which is what the
 * shrink-and-fade is for.
 *
 * Keyed by the line and the attachment, not the attachment alone: the same file carried twice is
 * two tiles, and the deck's item is the first of them (`deckOf`).
 */

import type { Rect } from "@chipschat/core";

/**
 * How round a tile's corners are, in points: what the flight rounds the picture to at the tile's
 * end, so it lands as the tile it turns into (ADR 0161). A room's tiles are round at every corner
 * alike; Media on this phone's are square but for a section's outer four.
 */
export interface Corners {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomRight: number;
  readonly bottomLeft: number;
}

/** Every corner as round as the next. */
export function cornersOf(radius: number): Corners {
  return { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };
}

/** Which tile: the line it hangs under, and its attachment. */
export interface TileKey {
  readonly lineId: string;
  readonly attachmentId: string;
}

export interface Tile {
  /** Where the tile is in the window now, or nothing when it cannot say. */
  readonly measure: () => Promise<Rect | undefined>;
  /** Hide the tile while its picture stands on the stage, and show it again. */
  readonly hide: (hidden: boolean) => void;
  /** Its corners now, when they are not a room tile's: a list's reflow can move a tile to a corner. */
  readonly corners?: (() => Corners | undefined) | undefined;
}

export interface Tiles {
  /** Join on mount; the function returned leaves, on unmount. */
  readonly register: (lineId: string, attachmentId: string, tile: Tile) => () => void;
  /** Where the tile is now: nothing when it is not mounted, cannot measure, or is off the glass. */
  readonly measure: (
    lineId: string,
    attachmentId: string,
    window: { readonly width: number; readonly height: number },
  ) => Promise<Rect | undefined>;
  /** Its corners, when it says them: nothing is a room tile's. */
  readonly corners: (lineId: string, attachmentId: string) => Corners | undefined;
  /** The one tile hidden under the stage, or none. */
  readonly hide: (
    key: { readonly lineId: string; readonly attachmentId: string } | undefined,
  ) => void;
}

/** How long a measure may take before the tile is taken to be gone: a view the list has let go of never answers. */
const MEASURE_WAIT_MS = 150;

const keyOf = (lineId: string, attachmentId: string) => `${lineId}/${attachmentId}`;

export function createTiles(): Tiles {
  const joined = new Map<string, Tile>();
  let hidden: string | undefined;
  return {
    register(lineId, attachmentId, tile) {
      const key = keyOf(lineId, attachmentId);
      joined.set(key, tile);
      if (hidden === key) tile.hide(true);
      return () => {
        if (joined.get(key) === tile) joined.delete(key);
      };
    },
    async measure(lineId, attachmentId, window) {
      const tile = joined.get(keyOf(lineId, attachmentId));
      if (tile === undefined) return undefined;
      const rect = await tile.measure();
      return rect !== undefined && onGlass(rect, window) ? rect : undefined;
    },
    corners(lineId, attachmentId) {
      return joined.get(keyOf(lineId, attachmentId))?.corners?.();
    },
    hide(key) {
      const next = key === undefined ? undefined : keyOf(key.lineId, key.attachmentId);
      if (next === hidden) return;
      if (hidden !== undefined) joined.get(hidden)?.hide(false);
      hidden = next;
      if (next !== undefined) joined.get(next)?.hide(true);
    },
  };
}

/**
 * What a room's floating chrome covers of its glass, in points: the bar and the pinned strip at
 * its head, the composer at its foot.
 */
export interface Covered {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The glass less what the chrome covers: where a tile is actually seen, and so where a flight is
 * clipped. The room's lines run the full height of the glass and pass under the bar and the
 * composer (ADR 0063), so the glass itself is no longer where a tile shows — clipped to it, a
 * picture flying home to a tile the composer half covers was drawn over the composer for the last
 * of its flight, and then swapped for the tile under the composer's glass the instant the viewer
 * left (Arjun, 23 September 2026). Nothing, when nothing of the glass is left.
 */
export function uncovered(glass: Rect, covered: Covered): Rect | undefined {
  const top = covered.top > 0 ? covered.top : 0;
  const bottom = covered.bottom > 0 ? covered.bottom : 0;
  const height = glass.height - top - bottom;
  if (!(height > 0) || !(glass.width > 0)) return undefined;
  return { x: glass.x, y: glass.y + top, width: glass.width, height };
}

/** Something that can say where it is in the window: a mounted view. */
interface Measurable {
  readonly measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

/**
 * Where a view is in the window, or nothing when it has no size or does not answer in time. A
 * view the list has already let go of, and a view under a test renderer, never call back.
 */
export function measureView(view: Measurable | null | undefined): Promise<Rect | undefined> {
  if (view === null || view === undefined) return Promise.resolve(undefined);
  return Promise.race([
    new Promise<Rect | undefined>((resolve) =>
      view.measureInWindow((x, y, width, height) =>
        resolve(width > 0 && height > 0 ? { x, y, width, height } : undefined),
      ),
    ),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), MEASURE_WAIT_MS)),
  ]);
}

/** Whether a rect has a size and some of it is on the glass: a tile scrolled off is no place to fly to. */
export function onGlass(
  rect: Rect,
  window: { readonly width: number; readonly height: number },
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0 &&
    rect.x < window.width &&
    rect.y < window.height
  );
}
