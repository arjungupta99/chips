/**
 * A handler with one identity for as long as the component lives, that always calls the newest
 * one it was given. The rows of a long list are memoised on their props, and a callback made
 * fresh on every render of the screen — `onOpenSpace={(id) => router.push(...)}` — would undo
 * that on every event the store delivers: the row's props would differ, and the row would draw
 * again with nothing to draw differently. Through this, the row holds one function, and what
 * that function does is whatever the screen most recently said.
 *
 * An absent handler stays absent. Whether a row offers something — a tap across a lane, a note
 * on a message — is decided by whether it was given a handler at all, and a stand-in for an
 * absent one would make every row offer everything.
 *
 * The newest handler is taken in a layout effect, before anything a person can touch has been
 * drawn, rather than in the render, which under concurrent rendering may never commit.
 */

import { useCallback, useLayoutEffect, useRef } from "react";

export function useHandler<A extends unknown[], R>(
  handler: ((...args: A) => R) | undefined,
): ((...args: A) => R | undefined) | undefined {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  const stable = useCallback((...args: A) => latest.current?.(...args), []);
  return handler === undefined ? undefined : stable;
}
