/**
 * What the context pages keep between them while the app runs (ADR 0135): the last copy read of
 * each owner's files, so a page opened again shows them at once and the editor opens on exactly
 * what the row showed; and the file just saved, so the page the editor goes back to flashes its
 * row. Neither is kept on disk: the copies are the harness's, and read again on every visit.
 */

const copies = new Map<string, unknown>();
let landing: { readonly key: string; readonly name: string } | undefined;

export function remember(key: string, copy: unknown): void {
  copies.set(key, copy);
}

export function recall<T>(key: string): T | undefined {
  return copies.get(key) as T | undefined;
}

/** A file was saved: the page of its owner flashes its row when it is shown next. */
export function land(key: string, name: string): void {
  landing = { key, name };
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
}
