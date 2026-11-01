/**
 * Where the outgoing colour field stands inside a bubble, as arithmetic alone — shared by the
 * UI worklet that places it (`ScrollColours.tsx`) and the test that checks the sums.
 *
 * The field is one tall picture of the gradient, `FIELD_HEIGHT` points drawn once per bubble and
 * never re-laid out. What moves it is a transform, and only a transform: a translation and a
 * scale that put the picture's gradient band over the glass exactly, so a bubble anywhere on the
 * glass shows the slice at its own place. A transform is applied on the UI thread without
 * touching layout; the first version of this animated the field's `height` instead, which on the
 * new architecture commits a shadow tree on every scroll frame — the frame drops, and the
 * flicker when that commit raced a render (17 September 2026).
 *
 * The scale is about the field's own middle, which is the one origin a view scales about, so the
 * translation carries half the change in height as well.
 *
 * Only the middle of the picture is the gradient. `FIELD_MARGIN` of it at each end is the end
 * colour flat, and that run is what hangs past the glass, because the placement is always a
 * little behind the scroll: `measure` reads a shadow tree the scroll view updates by its own
 * state commits, so during a drag — and in the frame it stops in, which no later event corrects
 * — the field is placed for where the bubble was, not where it is. With the picture ending at
 * the glass's edge that showed as a band of the bubble's flat teal along the top of the
 * part-scrolled bubble, the one place an edge of the field can be seen (Arjun, 20 September
 * 2026). A picture that runs past the glass has no edge to show; a placement a frame behind
 * moves the colours by that frame's scroll, which is a few points of a gradient the height of
 * the screen, and cannot be seen at all.
 */

/** How tall the picture is drawn, gradient band and flat ends together. */
export const FIELD_HEIGHT = 1000;

/**
 * How wide the picture is drawn: one point. Its colours change only down it, so a picture one
 * point wide stretched across a bubble is the same picture as one drawn the bubble's width — and
 * it is the drawn size that the phone keeps in memory, as a bitmap at the screen's scale. Drawn as
 * wide as each bubble, the field held about 10 MB a sent bubble: a room of twelve had 133 MB of
 * CoreAnimation memory, 9 MB without the field. One point wide it has 12 MB (18 October 2026,
 * `footprint` on the simulator). What the stretch loses is CoreGraphics's dither along a row, a
 * level in 255 either way: each row is now one colour, and the rows still differ by the dither.
 */
export const FIELD_WIDTH = 1;

/**
 * How far the one-point picture is stretched, about its own middle: 2048 points either side,
 * further than the widest bubble on the widest iPad reaches (78% of 1376 points, in landscape).
 * The bubble clips it. A stretch this far is a constant, so the picture needs no measuring of its
 * bubble's width and cannot come up short of it when the phone turns on its side.
 */
export const FIELD_STRETCH = 4096;

/** The share of the picture at each end that is flat colour, hanging past the glass. */
export const FIELD_MARGIN = 0.2;

/** The band of the picture that is the gradient, and that is scaled to the glass's height. */
export const FIELD_BAND = FIELD_HEIGHT * (1 - 2 * FIELD_MARGIN);

export interface FieldPlacement {
  readonly translateY: number;
  readonly scaleY: number;
}

/**
 * The transform for a field inside a bubble whose top is `bubbleTop` on the page, given the
 * viewport's top and height on the same page: the gradient band's top lands on the viewport's
 * top and its foot on the viewport's foot. A viewport not yet measured is one point tall,
 * never nought: a scale of nought is a field that cannot be seen at all.
 */
export function placeField(
  viewportTop: number,
  viewportHeight: number,
  bubbleTop: number,
): FieldPlacement {
  "worklet";
  const scaleY = Math.max(viewportHeight, 1) / FIELD_BAND;
  const top = viewportTop - bubbleTop;
  return { translateY: top + (scaleY * FIELD_BAND - FIELD_HEIGHT) / 2, scaleY };
}

/**
 * How far past the glass a bubble still has its field placed: half a glass at each end. A bubble
 * further off than that keeps the placement it last had, because nothing can see its colours —
 * and every placement written is a view Reanimated commits into the shadow tree on that frame.
 * Placing every bubble the list keeps mounted, four screens either way, was a commit of the whole
 * room on every scroll frame and the largest cost on the main thread while it scrolled (24
 * September 2026, sampled on the simulator).
 *
 * Half a glass is far more than a frame of the fastest fling moves a bubble, so a bubble coming
 * on is placed before it shows, and a frame behind as every placement is (see above).
 */
export const NEAR_GLASS = 0.5;

/** Whether a bubble `height` tall with its top at `bubbleTop` is on the glass or near enough to it. */
export function nearGlass(
  viewportTop: number,
  viewportHeight: number,
  bubbleTop: number,
  height: number,
): boolean {
  "worklet";
  const reach = viewportHeight * NEAR_GLASS;
  return (
    bubbleTop + height >= viewportTop - reach && bubbleTop <= viewportTop + viewportHeight + reach
  );
}

/**
 * The colour stops of the picture, top to bottom: the violet the room begins with, the blue of
 * its middle, and the teal every outgoing bubble wears when the field is not drawn
 * (`OUTGOING.ground`'s family) — `--mine-top`, `--mine-middle` and `--mine-foot` on the desktop,
 * which draws the same field. White ink clears 4.5:1 on every point between them. The first
 * and last are given twice, so the margins that hang past the glass are that colour flat.
 */
export const FIELD_STOPS = [
  [0, "#6651a8"],
  [FIELD_MARGIN, "#6651a8"],
  [0.5, "#34669e"],
  [1 - FIELD_MARGIN, "#0b737d"],
  [1, "#0b737d"],
] as const;
