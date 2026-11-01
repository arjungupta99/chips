/**
 * Where a lifted message and its menu stand (ADR 0200), worked out once, as numbers: the copy of
 * the bubble, the capsule of quick actions over it and the card of the rest under it.
 *
 * The copy stays at the bubble's own place unless the capsule or the card would leave the glass;
 * then all three move up or down together, as little as keeps them on it. A bubble taller than the
 * room the capsule and the card leave shows as much of itself as fits, from the part that was seen
 * — under the bar and its band, above the composer — and is cut square where it is cut. The capsule
 * and the card stand on the bubble's side, its leading edge for theirs and its trailing edge for
 * yours, and never past the glass's own margin.
 *
 * The copy also starts and ends as what the room showed of the bubble (`shownOf`): a reply that ran
 * under the bar was drawn whole over it, the bar gone at once and back at once as the copy went,
 * and the reply's foot, cut from the copy, gone at once from the room (Arjun, 18 October 2026: "the
 * nav and bottom abruptly disappear and appear").
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A stretch of the screen, from its top edge down to its bottom edge. */
export interface Span {
  readonly top: number;
  readonly bottom: number;
}

/**
 * What the room shows of a bubble: the part of it in `seen`, where the room's lines are seen whole.
 * A bubble with none of itself there is shown as a line at its edge, which is where its copy grows
 * from.
 */
export function shownOf(bubble: Box, seen: Span): Span {
  const top = Math.min(Math.max(bubble.y, seen.top), bubble.y + bubble.height);
  const bottom = Math.max(Math.min(bubble.y + bubble.height, seen.bottom), top);
  return { top, bottom };
}

export interface LiftPlace {
  /** How far into the bubble the copy starts: the part above what was seen is left out. */
  readonly skip: number;
  /** How tall the copy is drawn: the bubble's height, or what the room left for it. */
  readonly height: number;
  /** How far the copy, the capsule and the card move from the bubble's place, up being less than nought. */
  readonly dy: number;
  /** Where the capsule and the card stand once moved, on the screen; the capsule when there is one. */
  readonly capsule: { readonly x: number; readonly y: number } | undefined;
  readonly card: { readonly x: number; readonly y: number };
}

/** Between the capsule, the copy and the card. */
export const LIFT_GAP = 10;
/** The glass's margin at its sides, which nothing passes. */
export const LIFT_SIDE = 12;
/** Never less of a long bubble than this, whatever the menu takes. */
export const LIFT_LEAST = 96;

export function placeLift({
  bubble,
  screen,
  top,
  bottom,
  capsule,
  card,
  side,
  seen,
}: {
  /** The bubble on the screen, as the UI thread measured it. */
  readonly bubble: Box;
  readonly screen: Size;
  /** The insets the menu keeps clear of: the status bar's and the home indicator's, and a little. */
  readonly top: number;
  readonly bottom: number;
  readonly capsule: Size | undefined;
  readonly card: Size;
  /** Which side the bubble stands on: yours on the right. */
  readonly side: "left" | "right";
  /** Where the room's lines are seen whole; the glass between the insets when not said. */
  readonly seen?: Span | undefined;
}): LiftPlace {
  const above = capsule === undefined ? 0 : capsule.height + LIFT_GAP;
  const below = card.height + LIFT_GAP;
  const room = screen.height - top - bottom - above - below;
  // The part of the bubble that was seen, from its top: a bubble that ran up under the bar lifts
  // from where the reader could see it.
  const from = seen?.top ?? top;
  const skip = Math.min(Math.max(0, from - bubble.y), Math.max(0, bubble.height - LIFT_LEAST));
  const height = Math.max(
    Math.min(bubble.height - skip, room),
    Math.min(LIFT_LEAST, bubble.height),
  );
  const at = bubble.y + skip;
  const least = top + above;
  const most = screen.height - bottom - below - height;
  const y = most < least ? least : Math.min(Math.max(at, least), most);
  const dy = y - at;
  const along = (width: number) => {
    const x = side === "right" ? bubble.x + bubble.width - width : bubble.x;
    return Math.min(Math.max(x, LIFT_SIDE), screen.width - LIFT_SIDE - width);
  };
  return {
    skip,
    height,
    dy,
    capsule:
      capsule === undefined
        ? undefined
        : { x: along(capsule.width), y: y - LIFT_GAP - capsule.height },
    card: { x: along(card.width), y: y + height + LIFT_GAP },
  };
}
