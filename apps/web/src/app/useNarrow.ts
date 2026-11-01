/**
 * Whether the window is a phone's width (JR-15): the stylesheet's own breakpoint, for the few
 * words that must be shorter there, which CSS cannot shorten. Not a phone in a test without a
 * window that can say.
 */

import { useSyncExternalStore } from "react";

const NARROW = "(max-width: 640px)";

function query(): MediaQueryList | undefined {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? undefined
    : window.matchMedia(NARROW);
}

function subscribe(changed: () => void): () => void {
  const list = query();
  list?.addEventListener("change", changed);
  return () => list?.removeEventListener("change", changed);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches === true,
    () => false,
  );
}
