/**
 * What a server holds with the changes asked here and not yet answered drawn over it: the store's
 * for a room's face and the rooms hidden or pinned, and the reader's for the owner's update
 * switches (`computerSays.ts`). In a file of its own so both can use it.
 */

/**
 * Something of the person's own that is not on the log (a room's face, the rooms hidden, the rooms
 * pinned, somebody's face): what the server holds, so far as the store knows, and the changes to
 * it asked here and not yet answered, drawn over it for `show`. A change shows at once; taken, it
 * joins what the server holds; refused, it is dropped. Nothing is put back from what showed when
 * a change was asked, which could be an earlier change, refused in turn: two quick picks the
 * server both turned away left the first one showing (3 November 2026).
 */
export interface OnTheirWay<T, C> {
  /** What the server holds: what it or the cache last said, and the changes it took since. */
  readonly held: () => T;
  /** What the server or the cache says it holds now; what shows is drawn again. */
  readonly heard: (now: T) => void;
  /**
   * A change asked for, by key, shown at once. Its answer, taken or refused, says whether what
   * shows moved: a later change for the same key, still on its way, settles what shows instead.
   */
  readonly ask: (
    key: string,
    change: C,
  ) => { readonly taken: () => boolean; readonly refused: () => boolean };
}

export function onTheirWay<T, C>(
  draw: (held: T, changes: ReadonlyMap<string, C>) => T,
  start: T,
  show: (now: T) => void,
): OnTheirWay<T, C> {
  let held = start;
  const changes = new Map<string, C>();
  const drawn = () => show(draw(held, changes));
  return {
    held: () => held,
    heard: (now) => {
      held = now;
      drawn();
    },
    ask: (key, change) => {
      changes.set(key, change);
      drawn();
      const mine = () => changes.get(key) === change;
      return {
        taken: () => {
          held = draw(held, new Map([[key, change]]));
          if (mine()) {
            changes.delete(key);
            return false;
          }
          drawn();
          return true;
        },
        refused: () => {
          if (!mine()) return false;
          changes.delete(key);
          drawn();
          return true;
        },
      };
    },
  };
}
