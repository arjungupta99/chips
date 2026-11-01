/**
 * What was searched for on this computer, newest first (ADR 0132's addendum): the words of a
 * search whose Enter was pressed, or one of whose results was opened. Core says what the list is
 * (`rememberSearch`, `forgetSearch`: the same words once, at most eight); this keeps it.
 *
 * In `localStorage`, beside the appearance, as a fact about this computer that the server never
 * hears: the phone keeps its own. Storage can be missing or refuse (a private window, a blocked
 * site), and then the list lasts as long as the page does.
 */

import { forgetSearch, rememberSearch } from "@chipschat/core";
import { useSyncExternalStore } from "react";

/** The key the list is kept under. */
export const RECENT_KEY = "chips.search.recent";

const listeners = new Set<() => void>();
let recent: readonly string[] | undefined;

/** What was kept last time. Nonsense, or no storage, is no searches. */
function stored(): readonly string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((each) => typeof each === "string") : [];
  } catch {
    return [];
  }
}

function read(): readonly string[] {
  recent ??= stored();
  return recent;
}

function set(next: readonly string[]): void {
  recent = next;
  for (const listener of listeners) listener();
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A window that keeps nothing still searches; it only forgets.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface RecentSearches {
  readonly list: readonly string[];
  readonly remember: (text: string) => void;
  readonly forget: (text: string) => void;
  readonly clear: () => void;
}

const ACTIONS = {
  remember: (text: string) => set(rememberSearch(read(), text)),
  forget: (text: string) => set(forgetSearch(read(), text)),
  clear: () => set([]),
};

export function useRecentSearches(): RecentSearches {
  const list = useSyncExternalStore(subscribe, read, read);
  return { list, ...ACTIONS };
}

/** For a test: nothing held, and the storage read again on the next use. */
export function resetRecentSearches(): void {
  recent = undefined;
}
