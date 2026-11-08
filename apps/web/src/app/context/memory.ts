/**
 * What the context pages keep between them while the app runs (ADR 0135): the last copy read of
 * each owner's files, so a page opened again shows them at once and the editor opens on exactly
 * what the row showed; and the file just saved, so the page the editor goes back to flashes its
 * row. Neither is kept on disk: the copies are the harness's, and read again on every visit.
 *
 * Beside the columns the page a deeper one came from stays drawn (ADR 0284), so it is told when
 * either changes (`watch`) rather than finding out when it is drawn again.
 */

const copies = new Map<string, unknown>();
let landing: { readonly key: string; readonly name: string } | undefined;

/** What changed for a key: its copy, or a file of its was saved. */
export type Told = "copy" | "landed";
const watchers = new Map<string, Set<(told: Told) => void>>();

function tell(key: string, told: Told): void {
  for (const watcher of [...(watchers.get(key) ?? [])]) watcher(told);
}

/** Be told when this key's copy changes or a file of its lands; what stops it. */
export function watch(key: string, watcher: (told: Told) => void): () => void {
  const set = watchers.get(key) ?? new Set();
  set.add(watcher);
  watchers.set(key, set);
  return () => {
    set.delete(watcher);
    if (set.size === 0) watchers.delete(key);
  };
}

export function remember(key: string, copy: unknown): void {
  if (copies.get(key) === copy && copies.has(key)) return;
  copies.set(key, copy);
  tell(key, "copy");
}

export function recall<T>(key: string): T | undefined {
  return copies.get(key) as T | undefined;
}

/** A file was saved: the page of its owner flashes its row when it is shown next. */
export function land(key: string, name: string): void {
  landing = { key, name };
  tell(key, "landed");
}

/** The file to flash on this owner's page, once. */
export function takeLanding(key: string): string | undefined {
  if (landing?.key !== key) return undefined;
  const { name } = landing;
  landing = undefined;
  return name;
}

/** For the tests: nothing remembered. */
export function forget(): void {
  copies.clear();
  landing = undefined;
  watchers.clear();
}
