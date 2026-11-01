/**
 * Whether this person asked for less motion (ADR 0213, point 3): the caption's words come at
 * once, and the stage, the bar and the preview change without springs. Kept in step with the
 * setting while the page is open. Not still in a test without a window that can say.
 */

import { useSyncExternalStore } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | undefined {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? undefined
    : window.matchMedia(REDUCE);
}

function subscribe(changed: () => void): () => void {
  const list = query();
  list?.addEventListener("change", changed);
  return () => list?.removeEventListener("change", changed);
}

export function useStill(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches === true,
    () => false,
  );
}
