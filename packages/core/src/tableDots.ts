/**
 * Where a wide table stands as it scrolls, for the marks that say there is more of it (ADR 0186).
 * Its sides fade where it has more beyond them (`edgeStrength`), and a dot per column above it
 * lights the columns in view as one capsule (`columnsInView`, `capsule`). The phone and the web
 * draw them by these numbers, so the two cannot disagree.
 *
 * The arithmetic is marked `"worklet"`: the phone runs it on the UI thread as the table scrolls,
 * where a function is callable only when it is a worklet itself. Anywhere else the directive is an
 * unknown one, which JavaScript ignores. A worklet is declared after everything it calls (see
 * `viewer.ts`).
 */

/** How far a fade runs in from its edge, and how far the table moves before an edge is all fade. */
export const TABLE_FADE = { length: 36, run: 28 } as const;

/** A dot per column: its size, and the gap after it. */
export const TABLE_DOT = { size: 6, gap: 6 } as const;

/** How strongly an edge fades with `beyond` more of the table past it: none at its end. */
export function edgeStrength(beyond: number): number {
  "worklet";
  return Math.min(1, Math.max(0, beyond / TABLE_FADE.run));
}

/** Where `at` falls among columns `widths` wide, in columns: 1.5 is halfway through the second. */
function columnAt(widths: readonly number[], at: number): number {
  "worklet";
  let start = 0;
  for (let index = 0; index < widths.length; index++) {
    const width = widths[index] ?? 0;
    if (at <= start + width) return width > 0 ? index + (at - start) / width : index;
    start += width;
  }
  return widths.length;
}

/**
 * The columns in view of a table whose columns are `widths` wide, scrolled `x` along in a box
 * `room` wide: where the view starts and ends, in columns. A bounce past either end is the end.
 */
export function columnsInView(
  widths: readonly number[],
  x: number,
  room: number,
): { readonly from: number; readonly to: number } {
  "worklet";
  let total = 0;
  for (let index = 0; index < widths.length; index++) total += widths[index] ?? 0;
  const start = Math.min(Math.max(0, x), Math.max(0, total - room));
  return { from: columnAt(widths, start), to: columnAt(widths, Math.min(total, start + room)) };
}

/**
 * The lit capsule over the dots for the columns `from` to `to`: column k is the dot at k steps
 * along and the gap after it, so the capsule's ends glide from dot to dot as the table moves, and
 * it is never less than one dot.
 */
export function capsule(
  from: number,
  to: number,
): { readonly left: number; readonly width: number } {
  "worklet";
  const step = TABLE_DOT.size + TABLE_DOT.gap;
  const left = from * step;
  return { left, width: Math.max(TABLE_DOT.size, to * step - TABLE_DOT.gap - left) };
}

/**
 * How much dot `index` shows beside the capsule at `left`, `width`, from all of it to none: a dot
 * fades as the capsule's end comes over it and has gone a third of the way across, so no sliver of
 * it shows past the end.
 */
export function dotShown(index: number, left: number, width: number): number {
  "worklet";
  const start = index * (TABLE_DOT.size + TABLE_DOT.gap);
  const under = Math.min(start + TABLE_DOT.size, left + width) - Math.max(start, left);
  return Math.min(1, Math.max(0, 1 - (3 * under) / TABLE_DOT.size));
}

/** How wide the row of dots is for `count` columns. */
export function dotsWidth(count: number): number {
  return count * (TABLE_DOT.size + TABLE_DOT.gap) - TABLE_DOT.gap;
}
