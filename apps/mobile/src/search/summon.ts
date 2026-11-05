/**
 * Search Everything (⇧⌘F, `ui/menuBar.ts`): the Search tab's field takes the keys when the tab
 * comes up, whatever it holds, or at once if the tab is in front already. The tab listens while it
 * is mounted; one not drawn yet takes the keys when it first is, as it always does.
 */

const listeners = new Set<() => void>();

export function summonSearch(): void {
  for (const listener of listeners) listener();
}

export function onSummon(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
