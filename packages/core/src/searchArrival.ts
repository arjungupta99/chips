/**
 * How Search's results come and go (ADR 0189): what is found is never swapped in a frame. Arjun,
 * 17 October 2026: "the loaded results in the search appear abruptly … The whole experience
 * should look polished and delightful".
 *
 * - **A row that arrives** fades up and rises a few points into its place, a beat after the row
 *   above it arrived, so a batch of results comes down the page as one wave rather than all at
 *   once. Only the first few are a beat apart; the rest come with the last of them, so a long page
 *   is never waited for.
 * - **A row that stays** goes from where it was drawn to where it now stands when rows above it
 *   come or go: the Messages under three spaces close up as a letter typed leaves one.
 * - **What travels travels on UIKit's own spring** (the app's `IOS_SPRING`, ADR 0050): a rise and a
 *   move alike start gently and land softly. On a Bézier that started fast, a row going three
 *   hundred points was most of the way in two frames, and read as a jump (the simulator,
 *   17 October 2026). What fades fades on a curve: a fade has no weight to carry.
 * - **A row that goes** fades where it stands, quicker than one comes, while the rows round it
 *   close over it.
 * - **The ghost rows** standing for the messages on their way breathe, the second a beat after the
 *   first, until the messages come and take their place.
 *
 * What arrives is decided here, the same on the phone and the web, from the list before a change
 * and the list after it (`searchArrivals`). The pace is here too. How each client moves its rows
 * is its own: the phone's on the UI thread (`apps/mobile/src/search/ResultsMotion.tsx`), the web's
 * by the Web Animations API (`apps/web/src/app/searchMotion.ts`). With less motion asked for,
 * nothing travels: what comes and goes only fades.
 */

import type { SearchItem } from "./searchResults.js";

export const SEARCH_ARRIVAL = {
  /** How much later each arriving row starts than the one above it. */
  staggerMs: 32,
  /** Rows past this many arrive with the last of them. */
  staggered: 8,
  /** How far under its place an arriving row starts, and how long it takes to fade up. */
  rise: 12,
  fadeMs: 200,
  /** How long a row that goes takes to fade where it stood. */
  leaveMs: 140,
  /** What a fade is on, as a cubic Bézier: most of it at once, the rest softly. */
  fade: [0.2, 0.8, 0.2, 1],
  /** What a rise and a move are on: UIKit's spring, a damping ratio near 0.9 at a 0.35 s response. */
  spring: { stiffness: 320, damping: 32, mass: 1 },
  /** A ghost row's breath: once dim and back over this long, down to this strength, the second later. */
  breathMs: 1400,
  breathLow: 0.5,
  breathLagMs: 200,
} as const;

/**
 * The rows of `after` that `before` did not have, each with its place in the wave: 0 for the first
 * to arrive, counting down the list, the ones past `staggered` given the last place. A row is the
 * same row while its key is (`SearchItem.key`), so the spaces still found as a letter is typed stay
 * where they are, and only the ones it finds arrive.
 *
 * Nothing arrives on the first draw (`before` undefined): the page opened with its results there.
 */
export function searchArrivals(
  before: readonly SearchItem[] | undefined,
  after: readonly SearchItem[],
): ReadonlyMap<string, number> {
  const arrivals = new Map<string, number>();
  if (before === undefined) return arrivals;
  const had = new Set(before.map((item) => item.key));
  const last = SEARCH_ARRIVAL.staggered - 1;
  for (const item of after) {
    if (had.has(item.key)) continue;
    arrivals.set(item.key, Math.min(arrivals.size, last));
  }
  return arrivals;
}

/** How long after a change a row in place `order` of its wave starts to arrive. */
export function arrivalDelay(order: number): number {
  return order * SEARCH_ARRIVAL.staggerMs;
}
