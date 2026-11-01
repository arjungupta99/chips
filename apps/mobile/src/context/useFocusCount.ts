/**
 * How many times the screen has come to the front: a page that shows a harness's copy reads it
 * again each time (ADR 0135), since Chips hears nothing when a harness sends a new one.
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

export function useFocusCount(): number {
  const [count, setCount] = useState(0);
  useFocusEffect(useCallback(() => setCount((was) => was + 1), []));
  return count;
}
