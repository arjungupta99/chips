/**
 * Something arriving where it stands, on a spring: flat controls move instead of shining (Arjun:
 * "the cool goes into motion"). Keyed by the caller, so each new thing arrives afresh.
 */

import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Platform } from "react-native";

const NATIVE = Platform.OS !== "web";

/**
 * What arrives comes in on a spring, from a little smaller and from nothing: in the context
 * editor's bar and capsule, Save turning gold, the pins taking its place, the tick, each line of
 * the status (ADR 0135); on the model sheet's Save, the same (ADR 0141).
 */
export function Arrive({
  children,
  from = 0.7,
  rise = 0,
  bounce = 8,
}: {
  readonly children: ReactNode;
  readonly from?: number;
  /** How far below its place it comes up from. */
  readonly rise?: number;
  readonly bounce?: number;
}) {
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(shown, {
      toValue: 1,
      useNativeDriver: NATIVE,
      friction: bounce,
      tension: 140,
    }).start();
  }, [shown, bounce]);
  return (
    <Animated.View
      style={{
        opacity: shown.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
        transform: [
          { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) },
          { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
