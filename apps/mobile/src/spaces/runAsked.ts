/**
 * The act a person asked of a thinking bubble's run (ADR 0293), until it lands: a Pause lands when
 * the run says it is paused, a Resume when it no longer does, and a Stop takes the bubble away.
 * `late` once the beat has gone by with no answer, when the bubble says "Pausing" or "Stopping".
 * One the server turned away is let go once the store's mark on the run has gone and nothing
 * changed. The web's bubble keeps the same hook (`apps/web/src/app/RunMenu.tsx`).
 */

import { type Doing, RUN_ASKED_BEAT_MS, type RunAct } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";

/** After the store's mark goes, how long an answer may still take to land before it is let go. */
const REFUSED_MS = 600;

export function useRunAsked(doing: Doing, busy: boolean) {
  const [act, setAct] = useState<RunAct | undefined>(undefined);
  const [late, setLate] = useState(false);
  const sawBusy = useRef(false);
  const paused = doing.paused === true;
  useEffect(() => {
    setLate(false);
    if (act === undefined) return;
    const beat = setTimeout(() => setLate(true), RUN_ASKED_BEAT_MS);
    return () => clearTimeout(beat);
  }, [act]);
  useEffect(() => {
    if ((act === "pause" && paused) || (act === "resume" && !paused)) setAct(undefined);
  }, [act, paused]);
  useEffect(() => {
    if (act === undefined) {
      sawBusy.current = false;
      return;
    }
    if (busy) {
      sawBusy.current = true;
      return;
    }
    if (!sawBusy.current) return;
    sawBusy.current = false;
    const refused = setTimeout(() => setAct(undefined), REFUSED_MS);
    return () => clearTimeout(refused);
  }, [busy, act]);
  return { act, late: late && act !== undefined, ask: setAct };
}
