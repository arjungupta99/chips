/**
 * Whether the app is in front: a backgrounded app draws nothing, so nothing that only moves to be
 * seen need move. Search's backdrop and its hint stop on it (ADRs 0136 and 0137).
 */

import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  return active;
}
