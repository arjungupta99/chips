/**
 * The key a harness names a space by, as it is stored (ADR 0024, ADR 0033). A harness's own key
 * is prefixed with its id, so no adapter can name another's space; a shared key — a worktree —
 * is stored under a namespace of its own instead, so a second harness in the same worktree finds
 * the same space. Both directions live here, so the door that writes a key and the list that
 * reads it back cannot come to disagree about the spelling.
 */

const SHARED = "shared:";

export function scopedKey(harnessId: string, key: string, shared: boolean): string {
  return shared ? `${SHARED}${key}` : `${harnessId}:${key}`;
}

/** The key as the harness gave it, and whether it named a shared place. */
export function unscopedKey(harnessId: string, stored: string): { key: string; shared: boolean } {
  if (stored.startsWith(SHARED)) return { key: stored.slice(SHARED.length), shared: true };
  const own = `${harnessId}:`;
  return { key: stored.startsWith(own) ? stored.slice(own.length) : stored, shared: false };
}
