/**
 * Whether trouble on a first load has lasted `PATIENCE_MS` (14 October 2026): the Agents page
 * before its first list, and the space pane and the rail with no room to show. Core's
 * `patientLook` and `patientEmpty` say what to show with it, as the phone's do.
 *
 * Timed from the first trouble, so a socket going out and back with every try does not start the
 * wait again, and reset only once the list is `over` it: rooms or agents on screen, or the
 * server's word that there are none.
 */

import { PATIENCE_MS } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";

export function usePatience(over: boolean, trouble: boolean): boolean {
  const since = useRef<number | undefined>(undefined);
  const [told, setTold] = useState(false);
  useEffect(() => {
    if (over) {
      since.current = undefined;
      setTold(false);
      return;
    }
    if (!trouble) return;
    since.current ??= Date.now();
    const wait = since.current + PATIENCE_MS - Date.now();
    if (wait <= 0) {
      setTold(true);
      return;
    }
    const timer = setTimeout(() => setTold(true), wait);
    return () => clearTimeout(timer);
  }, [over, trouble]);
  return told;
}
