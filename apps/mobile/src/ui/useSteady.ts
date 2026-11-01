/**
 * One object whose calls go to whatever `now` held at the last draw: what a list hands its rows,
 * so a row is not drawn again because the list was.
 *
 * A list made its rows' handlers afresh at every draw, so every row was drawn again with it: on
 * Spaces at every Select, every pick and every word the store heard, some 500 animated views and
 * 10 MB for one pick on 24 rows; behind a room, the Agents tab's 33 rows twice for each message
 * sent there (the simulator, 19 October 2026). With steady handlers a row's props are what it
 * shows, and `memo` holds it.
 */

import { useLayoutEffect, useMemo, useRef } from "react";

export function useSteady<T extends { [Name in keyof T]: (...args: never[]) => unknown }>(
  now: T,
): T {
  const latest = useRef(now);
  useLayoutEffect(() => {
    latest.current = now;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the same calls for the list's life
  return useMemo(
    () =>
      Object.fromEntries(
        Object.keys(now).map((name) => [
          name,
          (...args: never[]) =>
            (latest.current[name as keyof T] as (...each: never[]) => unknown)(...args),
        ]),
      ) as T,
    [],
  );
}
