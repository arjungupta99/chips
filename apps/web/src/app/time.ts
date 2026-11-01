/** Small time helpers the shell shares: a clock time, and a coarse "when" for the sidebar. */

export function clockTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** `11:52 PM` today, `2 October` before: when a room's file was posted (ADR 0100). */
export function clockOrDay(ts: string, now: number = Date.now()): string {
  const at = new Date(ts);
  if (at.toDateString() === new Date(now).toDateString()) return clockTime(ts);
  return at.toLocaleDateString([], { day: "numeric", month: "long" });
}

/** `now`, `2m`, `1h`, `3d`, then a date — the sidebar's relative stamp. */
export function relativeTime(ts: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** `14 October`: a day, as a person's page and a link's line say it. */
export function dayWords(ts: string): string {
  return new Date(ts).toLocaleDateString([], { month: "long", day: "numeric" });
}

/** `14 Oct`, for a line with more to say beside it. */
export function shortDayWords(ts: string): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * When something that lasts ends: `until 3:42 PM` when that's today, which with 30-minute links
 * is nearly every invite (ADR 0232), `until October 21` for another day, and `expired …` once it
 * has. Not `relativeTime`, which says how long ago and makes every time to come "now" (JR-2).
 */
export function untilWords(expiresAt: string, now: number = Date.now()): string {
  const at = new Date(expiresAt);
  const today = at.toDateString() === new Date(now).toDateString();
  const when = today
    ? at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : at.toLocaleDateString([], { month: "long", day: "numeric" });
  if (at.getTime() > now) return `until ${when}`;
  return today ? `expired at ${when}` : `expired ${when}`;
}

/** Milliseconds left until an ISO expiry, for a countdown; undefined when there is none. */
export function remainingMs(
  expiresAt: string | undefined,
  now: number = Date.now(),
): number | undefined {
  if (expiresAt === undefined) return undefined;
  return new Date(expiresAt).getTime() - now;
}
