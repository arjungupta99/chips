/**
 * The tab bar this app draws on an iPhone (ADR 0233), as numbers: where it stands, and what each
 * part of it does as it shrinks. The bar itself is `PhoneBar.tsx`; this is apart from it so that
 * the lists, which keep room for it, and the tests can read it without Reanimated or the glass.
 *
 * At rest it stands where UIKit's own bar stood on iOS 26, measured on an iPhone 17 Pro under iOS
 * 26.5 (24 September 2026): a capsule 62 points tall, its middle 18 points above the foot of the
 * safe area, 21 in from the leading edge, and the + the same 21 in from the trailing edge with 10
 * between them. While a list is read it is 48 tall and 4 points lower, every tab where it was, the
 * names gone and the marks in the middle; the + shrinks to the same height. Pulled back, it all
 * comes back, the names last. With the phone on its side it is the size it is upright, a little
 * higher, and always shrunk, the bar at the leading side and the + at the trailing.
 */

/** The bar at rest, and shrunk. */
export const BAR_HEIGHT = 62;
export const BAR_SHRUNK = 48;
/** How far lower the shrunk bar's middle stands, toward the edge of the phone. */
export const BAR_SINK = 4;
/** Where the bar's middle stands above the foot of the safe area. */
export const SLOT_LIFT = 18;
/** How far in from each side the bar and the + stand. */
export const SLOT_INSET = 21;
/** Between the bar's end and the +. */
export const BAR_GAP = 10;
/** Round the tabs inside the bar, and round the chosen tab's pill. */
export const BAR_PAD = 4;
/** How much wider than its tab the chosen tab's pill is, as UIKit drew it. */
export const PILL_SPILL = 2;
/** The middle of a mark, and of a name, down from the top of the bar at rest. */
export const MARK_Y = 24;
export const NAME_Y = 45;
/** The mark's size shrunk, against its size at rest. */
export const MARK_SHRUNK = 0.9;
/** How far into the shrink the names are gone, so they go first and come back last. */
export const NAMES_GONE = 0.45;

/**
 * What a tab's list keeps clear below its last row for the bar, past the safe area it already
 * keeps: the bar's top half and its lift. UIKit's bar was in the safe area; this one is drawn over
 * the list, so the list is told.
 */
export const BAR_ROOM = SLOT_LIFT + BAR_HEIGHT / 2;

/**
 * Where the bar stands across a window `width` by `height` whose safe area keeps `sides` clear, with
 * the + beside it or not, holding `tabs`, and how far in from the trailing edge the + stands
 * (`right`).
 *
 * The bar stands in from the leading side and the + in from the trailing side, each 21 points in
 * from the safe area's edge, as upright, where the safe area runs to the window's edges. On its
 * side the bar is as wide as it is upright, rather than running across to the + (Arjun, 25 October
 * 2026: "in phone landscape the bar should not take up the whole width", then "the + goes on right
 * and tab bar goes on left").
 */
export function barFrame(
  width: number,
  height: number,
  plus: boolean,
  tabs: number,
  sides: { readonly left: number; readonly right: number },
) {
  const end = plus ? BAR_HEIGHT + BAR_GAP : 0;
  const across = Math.max(0, Math.min(width, height) - SLOT_INSET * 2 - end);
  const tab = tabs > 0 ? (across - BAR_PAD * 2) / tabs : 0;
  return { left: sides.left + SLOT_INSET, width: across, tab, right: sides.right + SLOT_INSET };
}

/**
 * Where the bar's middle stands above the foot of the safe area, at rest. On its side, higher: the
 * shrunk bar's foot is on the safe area's, where UIKit stands its own bar on its side (the Files
 * app on an iPhone 17 Pro under iOS 26.5, 25 October 2026: 44 points tall, its foot 21 points up,
 * on the safe area's).
 */
export function barLift(landscape: boolean): number {
  return landscape ? BAR_SHRUNK / 2 + BAR_SINK : SLOT_LIFT;
}

/** How far the bar's foot stands above the foot of the window, at rest. */
export function barFoot(safeBottom: number, landscape: boolean): number {
  return safeBottom + barLift(landscape) - BAR_HEIGHT / 2;
}

/** The middle of tab `index`, across from the bar's leading edge. */
export function tabMiddle(index: number, tab: number): number {
  "worklet";
  return BAR_PAD + tab * (index + 0.5);
}

/**
 * Every part of the bar at a point of its shrink: `s` is 0 at rest and 1 shrunk, and runs a little
 * past either end on the spring.
 *
 * The bar moves as one piece by `lift`, so that its top comes down with the glass's top, and the
 * glass is `glass` tall from there. Marks keep their place in it (their middle at rest is the
 * shrunk bar's middle) and get a little smaller. The names fade and drop as they go. The pill moves
 * up into the shrunk bar's middle and shrinks to its inside. The + shrinks about its middle and
 * comes down with the bar.
 */
export function barPose(s: number) {
  "worklet";
  const fall = BAR_HEIGHT - BAR_SHRUNK;
  const t = Math.min(1, Math.max(0, s / NAMES_GONE));
  const gone = t * t * (3 - 2 * t);
  return {
    lift: (fall / 2 + BAR_SINK) * s,
    glass: BAR_HEIGHT - fall * s,
    markY: (BAR_SHRUNK / 2 - MARK_Y) * s,
    mark: 1 - (1 - MARK_SHRUNK) * s,
    names: 1 - gone,
    nameY: 3 * gone,
    name: 1 - 0.15 * gone,
    pillY: -(fall / 2) * s,
    pill: 1 - (1 - (BAR_SHRUNK - BAR_PAD * 2) / (BAR_HEIGHT - BAR_PAD * 2)) * s,
    plus: 1 - (1 - BAR_SHRUNK / BAR_HEIGHT) * s,
    plusY: BAR_SINK * s,
  };
}
