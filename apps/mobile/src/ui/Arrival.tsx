/**
 * What a reader waited on, arriving where the waiting stood (Arjun, 24 October 2026: "the content
 * showing after loading is very abrupt, need a transition"). The waiting — Universe's planets, or a
 * page's words — steps back and fades, and what came fades in and rises into place a beat behind
 * it: the arrival on the Orbit mock he picked ("Orbit loading motion looks good").
 *
 * Until `ready`, what came is drawn but not seen. A web view's canvas is white from the moment it
 * is mounted, and showing it under the planets put a white sheet on the glass before a dark page
 * painted over it ("this index.html has a white background which makes transition more abrupt
 * with a flash"). With Reduce Motion on, the two dissolve, with no step back and no rise.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { useReduceMotion } from "./useReduceMotion";

const NATIVE = Platform.OS !== "web";
/** CSS's `ease`, as the mock drew it. */
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
/** The waiting going: it fades and steps back over this long. */
const GOES_MS = 320;
/** What came: it starts this far behind, and fades in and rises over `COMES_MS`. */
const COMES_AFTER_MS = 120;
const COMES_MS = 360;
const STEPS_BACK_TO = 0.92;
const RISES_FROM = 8;

export function Arrival({
  ready,
  waiting,
  children,
}: {
  /** What came is ready to be seen: a page has loaded, a read has answered. */
  readonly ready: boolean;
  /** What stands in its place until then. */
  readonly waiting: ReactNode;
  /** What came; nothing while there is nothing yet. */
  readonly children?: ReactNode;
}) {
  const still = useReduceMotion();
  const goes = useRef(new Animated.Value(0)).current;
  const comes = useRef(new Animated.Value(0)).current;
  // The waiting is drawn until it has gone, so it fades rather than vanishing in a frame.
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) {
      goes.setValue(0);
      comes.setValue(0);
      setGone(false);
      return;
    }
    const arriving = Animated.parallel([
      Animated.timing(goes, {
        toValue: 1,
        duration: GOES_MS,
        easing: EASE,
        useNativeDriver: NATIVE,
      }),
      Animated.timing(comes, {
        toValue: 1,
        duration: COMES_MS,
        delay: COMES_AFTER_MS,
        easing: EASE,
        useNativeDriver: NATIVE,
      }),
    ]);
    arriving.start(({ finished }) => {
      if (finished) setGone(true);
    });
    return () => arriving.stop();
  }, [ready, goes, comes]);
  const stepsBack = still ? 1 : STEPS_BACK_TO;
  const rises = still ? 0 : RISES_FROM;
  return (
    <View style={styles.fill}>
      <Animated.View
        style={[
          styles.fill,
          {
            opacity: comes,
            transform: [
              { translateY: comes.interpolate({ inputRange: [0, 1], outputRange: [rises, 0] }) },
            ],
          },
        ]}
        // Unseen, it is not there to touch or to read either.
        pointerEvents={ready ? "auto" : "none"}
        accessibilityElementsHidden={!ready}
        importantForAccessibility={ready ? "auto" : "no-hide-descendants"}
      >
        {children}
      </Animated.View>
      {gone ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: goes.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [
                { scale: goes.interpolate({ inputRange: [0, 1], outputRange: [1, stepsBack] }) },
              ],
            },
          ]}
        >
          {waiting}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
