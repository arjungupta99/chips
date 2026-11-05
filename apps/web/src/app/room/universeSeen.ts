/**
 * Where this computer last opened each space's Universe: the project's change it was opened at (ADR
 * 0227's addendum). Universe calls the reader for a newer change somebody else made, and stops once
 * it is opened here; core's `universeCalling` says which change, as it does on the phone.
 *
 * In `localStorage`, beside the recent searches, as a fact about this computer that the server
 * never hears: the phone keeps its own. Storage can be missing or refuse (a private window, a
 * blocked site), and then what was opened lasts as long as the page does.
 */

import { type RoomProject, universeCalling, universeSeenAt } from "@chipschat/core";
import { useCallback, useSyncExternalStore } from "react";

/** The key the record is kept under. */
export const SEEN_KEY = "chips.universe.seen";

const listeners = new Set<() => void>();
let seen: Readonly<Record<string, string>> | undefined;

/** What was kept last time. Nonsense, or no storage, is nothing seen. */
function stored(): Readonly<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(SEEN_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function read(): Readonly<Record<string, string>> {
  seen ??= stored();
  return seen;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The change a room's Universe calls about, and what opening it does: keep that change as seen. */
export function useUniverseCall(
  spaceId: string,
  project: RoomProject | undefined,
  selfId: string,
): { readonly calling: string | undefined; readonly opened: () => void } {
  const kept = useSyncExternalStore(subscribe, read, read);
  const calling = universeCalling(project, selfId, kept[spaceId]);
  const opened = useCallback(() => {
    const at = universeSeenAt(project);
    if (at === undefined || read()[spaceId] === at) return;
    seen = { ...read(), [spaceId]: at };
    for (const listener of listeners) listener();
    try {
      globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      // A window that keeps nothing still opens Universe; it only calls again next time.
    }
  }, [spaceId, project]);
  return { calling, opened };
}
