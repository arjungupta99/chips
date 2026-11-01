/**
 * The space a link brought this person into (ADR 0168), to be opened once it is here.
 *
 * Joining by a space's link changes the phone's workspace, which rebuilds every screen, and the
 * room is not on the phone until the server has sent it. So the join leaves the room here, and
 * Spaces, drawn again in the workspace joined, opens it when its list has it. On a wide screen,
 * where a room opens beside the list, a space of the workspace the phone is in lands the same way;
 * on a phone the join route goes to the room itself, so it is never on the stack twice.
 */

import { useEffect, useSyncExternalStore } from "react";

let waiting: string | undefined;
const listeners = new Set<() => void>();

/** Open this space as soon as Spaces has it. */
export function landIn(spaceId: string): void {
  waiting = spaceId;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: nothing waiting. */
export function forgetLanding(): void {
  waiting = undefined;
}

/**
 * On Spaces: the room waiting to be opened, opened once the list has it, and then forgotten. A
 * room that never comes leaves Spaces as it is.
 */
export function useLanding(has: (spaceId: string) => boolean, open: (spaceId: string) => void) {
  const pending = useSyncExternalStore(subscribe, () => waiting);
  const here = pending !== undefined && has(pending);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the room is here, and once only
  useEffect(() => {
    if (pending === undefined || !here) return;
    waiting = undefined;
    open(pending);
  }, [pending, here]);
}
