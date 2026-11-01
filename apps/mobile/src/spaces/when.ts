/**
 * The clock on a line, and the coarser stamp a list of spaces wears.
 *
 * A line in a room is read against the lines around it, so it wants the hour. A row in a list is
 * read against today, so it wants the distance: `2m`, `3h`, `4d`. The desktop sidebar says the
 * same two things with the same two words (`apps/web/src/app/time.ts`), which is why `4d` here
 * is `4d` there.
 */

/** `10:45`, in the phone's own locale and zone — the only sensible one on a carried device. */
export function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * `6:12 PM` today, the date before: when something began, said once in a line ("Offline · since
 * 6:12 PM", ADR 0083).
 */
export function clockOrDay(iso: string, now: number): string {
  const day = dayLabel(iso, now);
  return day === "Today" ? clockTime(iso) : day;
}

/** `Today`, `Yesterday`, or the date — the separator between one day's lines and the next. */
export function dayLabel(iso: string, now: number): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - startOfDay(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return at.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

/** `Today 11:26 AM`, `Yesterday 9:02 PM`, `4 September 3:10 PM`: the separator over a line after a silence. */
export function separatorLabel(iso: string, now: number): string {
  const day = dayLabel(iso, now);
  return day === "" ? "" : `${day} ${clockTime(iso)}`;
}

function startOfDay(at: Date): number {
  const copy = new Date(at);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** `now`, `2m`, `1h`, `3d`, then a date — how long ago a space last had anything in it. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const seconds = Math.max(0, Math.round((now - at.getTime()) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
