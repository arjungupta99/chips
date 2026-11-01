/**
 * The lines the room holds back now (ADR 0147, point 12; core's `saidMidRun`): a harness's line
 * said in a run still at work, for up to `CLOSE_WAIT_MS` from when this room first saw it.
 * Jacobian posts its reply and closes its run 30 ms to 1.1 s later, and the close makes the line
 * the answer, brings its receipt and takes the thinking bubble away: drawn as it came, the reply
 * went in over the bubble and the room moved again a moment later. Held, the reply lands in the
 * render the bubble goes (`useThinking` drops a stopped harness in that same render), and the room
 * moves once. A line still waiting when the time is up was a word said mid-run, and is drawn as it
 * is, the bubble working on under it. The lines there when the room opened are drawn: they have
 * stood longer than any wait. The Mac and the web hold the same lines (`Doing.tsx`).
 */

import type { Space } from "@chipschat/core";
import { CLOSE_WAIT_MS, saidMidRun } from "@chipschat/core";
import { useEffect, useMemo, useRef, useState } from "react";

/** Nothing held, as one set for the life of the app, so a room with nothing waiting draws nothing anew. */
const NONE: ReadonlySet<string> = new Set();

export function useHeldReplies(space: Space | undefined): ReadonlySet<string> {
  const seen = useRef<{ readonly space: string; readonly at: Map<string, number> } | undefined>(
    undefined,
  );
  const id = space?.id ?? "";
  if (seen.current?.space !== id) {
    seen.current = {
      space: id,
      at: new Map((space?.lines ?? []).map((line) => [line.id, Number.NEGATIVE_INFINITY])),
    };
  }
  const at = seen.current.at;
  const now = Date.now();
  for (const line of space?.lines ?? []) if (!at.has(line.id)) at.set(line.id, now);
  const waiting =
    space === undefined
      ? []
      : saidMidRun(space).filter((line) => now - (at.get(line) ?? now) < CLOSE_WAIT_MS);
  const key = waiting.join(" ");
  const [, ask] = useState(0);
  useEffect(() => {
    if (key === "") return;
    const due = Math.min(...key.split(" ").map((line) => (at.get(line) ?? 0) + CLOSE_WAIT_MS));
    const timer = setTimeout(() => ask((n) => n + 1), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [key, at]);
  return useMemo(() => (key === "" ? NONE : new Set(key.split(" "))), [key]);
}
