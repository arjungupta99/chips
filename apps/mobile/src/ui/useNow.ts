/**
 * The clock, for the countdowns. Re-read every fifteen seconds so a card that lapses says so
 * without anybody tapping it, and only while there is something with a deadline on screen —
 * a timer running behind an empty queue is a wakeup a phone pays for and nobody reads.
 */

import { useEffect, useState } from "react";

export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
