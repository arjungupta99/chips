/**
 * The clock, as a value a component can render from: a countdown on a card needs to move
 * without any event arriving. Ticks at the interval given, and no faster than a second.
 */

import { useEffect, useState } from "react";

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), Math.max(1000, intervalMs));
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
