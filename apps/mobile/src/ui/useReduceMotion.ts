/**
 * Whether the person has asked the system for less motion — Reduce Motion on iOS, the animator
 * scale on Android, `prefers-reduced-motion` in a browser. The platform's accessibility service
 * answers, once and then whenever the setting changes, so a sheet that slides for everyone else
 * fades for them: the same information, without the travel.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceMotion(): boolean {
  const [less, setLess] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (on) => {
        if (live) setLess(on);
      },
      // A platform without the setting has not asked for less motion.
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setLess);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return less;
}
