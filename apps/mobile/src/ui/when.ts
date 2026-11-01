/**
 * How long is left, in words.
 *
 * `packages/ui` has a richer version of this, and the phone may not import it — the app is
 * React Native and that package is the web's components (the dependency-cruiser rule says so).
 * An ask's card needs one sentence about an expiry, so that one sentence is here, pure,
 * and tested under Vitest.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `in 4 min`, `in 3 h`, `expired`. Nothing at all when there is no deadline. */
export function timeLeft(expiresAt: string | undefined, now: number): string | undefined {
  if (expiresAt === undefined) return undefined;
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return undefined;
  const left = at - now;
  if (left <= 0) return "expired";
  if (left < MINUTE) return "in under a minute";
  if (left < HOUR) return `in ${Math.round(left / MINUTE)} min`;
  if (left < DAY) return `in ${Math.round(left / HOUR)} h`;
  return `in ${Math.round(left / DAY)} d`;
}
