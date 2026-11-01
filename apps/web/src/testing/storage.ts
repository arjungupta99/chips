/**
 * A page's storage, in memory: what `localStorage` holds in a browser.
 *
 * Every web test starts with an empty one (`setup.ts`), so what one test keeps is never there for
 * the next, and the storage paths run the same on every Node. jsdom's own storage outlives a test,
 * and on Node 25 and later `localStorage` is Node's, which is undefined without
 * `--localstorage-file`: the same suite passed on 26 by skipping storage and failed on 22 by
 * keeping a pick from one test to the next.
 */
export function pageStorage(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    key: (index) => [...held.keys()][index] ?? null,
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, String(value)),
    removeItem: (key) => void held.delete(key),
    clear: () => held.clear(),
  };
}
