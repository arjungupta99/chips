/**
 * What was searched for on this phone, newest first (ADR 0132): the words of a search whose
 * Search key was pressed, or one of whose results was opened. Core says what the list is
 * (`rememberSearch`, `forgetSearch`: the same words once, at most eight); this keeps it.
 *
 * Kept in `prefs` beside the appearance, as a fact about this phone that the server never hears:
 * another device keeps its own. Held here for the tab to read at once, and read from the phone's
 * storage the first time the tab asks.
 */

import { forgetSearch, rememberSearch } from "@chipschat/core";
import { useSyncExternalStore } from "react";
import { readSetting, SETTINGS, writeSetting } from "../prefs";

let recent: readonly string[] = [];
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: readonly string[], write = true): void {
  recent = next;
  for (const listener of listeners) listener();
  if (write) {
    void writeSetting(SETTINGS.recentSearches, JSON.stringify(next)).catch(() => undefined);
  }
}

/** What was kept last time. Nonsense, or nothing, is no searches. */
function load(): Promise<void> {
  loading ??= readSetting(SETTINGS.recentSearches)
    .then((stored) => {
      const value: unknown = stored === undefined ? [] : JSON.parse(stored);
      // A search made before the storage answered is newer than anything it holds.
      if (Array.isArray(value) && recent.length === 0) {
        set(
          value.filter((each): each is string => typeof each === "string"),
          false,
        );
      }
    })
    .catch(() => undefined);
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void load();
  return () => listeners.delete(listener);
}

const read = () => recent;

export interface RecentSearches {
  readonly list: readonly string[];
  readonly remember: (text: string) => void;
  readonly forget: (text: string) => void;
  readonly clear: () => void;
}

const ACTIONS = {
  remember: (text: string) => set(rememberSearch(recent, text)),
  forget: (text: string) => set(forgetSearch(recent, text)),
  clear: () => set([]),
};

export function useRecentSearches(): RecentSearches {
  const list = useSyncExternalStore(subscribe, read, read);
  return { list, ...ACTIONS };
}

/** For a test: nothing remembered, and the storage read again on the next use. */
export function resetRecentSearches(): void {
  recent = [];
  loading = undefined;
}
