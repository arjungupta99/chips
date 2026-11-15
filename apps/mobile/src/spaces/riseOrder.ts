/**
 * The order a workspace's rows keep while they rise (`RiseIn`, ADR 0197's addendum): the order they
 * were first drawn in, until the last of them has risen.
 *
 * A row's rise is an entering animation, and a view moved while one runs is put back as the
 * animation stood — at its first frame, nothing and 18 points down — and left there: Fabric moves a
 * view by taking it out and putting it back, and Reanimated puts back what the animation had drawn
 * so far. A re-paired iPhone (12 November 2026) drew its two spaces from the cache the old pairing
 * left, in the order they had then, and the server's catching up swapped them a beat later, while
 * they rose: the space that moved to the top stood there as a blank gap, Spaces showed one room,
 * and it came back only when a message redrew it. The simulator does the same when the swap lands
 * inside the rise. So nothing moves until the rows are still, and then the list takes its order.
 *
 * Pure, so the rule is checked without Reanimated, which Jest cannot load.
 */

import { arrivalDelay, SEARCH_ARRIVAL } from "@chipschat/core";

/**
 * How long a workspace's rise is under way, from its rows being drawn: the wave's last row starts
 * `arrivalDelay(staggered - 1)` in, and its spring (320 / 32) settles about half a second after;
 * 800 ms leaves room for a phone that is busy folding what the server sends as the rows rise.
 */
export const RISEN_MS = arrivalDelay(SEARCH_ARRIVAL.staggered - 1) + 800;

/**
 * `live`, with the rows of the first draw (`first`, by id) put back in the order they rose in, and
 * any that came after it, which land rather than rise (`Land`) and may move, after them in the
 * order the list has them. A row of the first draw that has gone is simply not there.
 */
export function heldOrder<T extends { readonly id: string }>(
  live: readonly T[],
  first: readonly string[],
): T[] {
  const byId = new Map(live.map((row) => [row.id, row]));
  const rose = new Set(first);
  const risen = first.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  return [...risen, ...live.filter((row) => !rose.has(row.id))];
}
