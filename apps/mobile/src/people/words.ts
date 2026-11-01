/**
 * The few words People, a person's page and Invite someone say that core leaves to the screen:
 * dates, as this phone says them.
 */

/** "Joined 12 October · invited by you", or without who when nobody is known to have. */
export function joinedWords(joinedAt: string, invitedBy: string | undefined): string {
  const joined = `Joined ${dayWords(joinedAt)}`;
  return invitedBy === undefined ? joined : `${joined} · invited by ${invitedBy}`;
}

/**
 * "until 3:42 PM" for a link that ends today, which with 30-minute links is nearly every one (ADR
 * 0232), "until 21 October" for one that ends another day, and "expired …" once it has gone by.
 */
export function untilWords(expiresAt: string, now: number = Date.now()): string {
  const at = new Date(expiresAt);
  const today = at.toDateString() === new Date(now).toDateString();
  const when = today
    ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : dayWords(expiresAt);
  if (at.getTime() > now) return `until ${when}`;
  return today ? `expired at ${when}` : `expired ${when}`;
}

/** "12 October", as this phone says a day. */
export function dayWords(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/** "12 Oct", for a line with more to say beside it. */
export function shortDayWords(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
