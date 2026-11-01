/**
 * How a queued turn's message changes its words (`TaskBubble.tsx`). The room's thinking bubble
 * rolled by it too until 10 October 2026, and holds still now (ADR 0147: the words wait their
 * turn and crossfade where they stand, and nothing crosses the bubble).
 *
 * Two pieces that go together. The words roll: what stands lifts and fades, and the next rises
 * into its place. And a light crosses on the beat the words change, which is the room saying
 * there is news rather than decoration on a timer. The bubble opens to the height the new words
 * need on the room's own transition (`RoomMotion.tsx`), so a step arriving reads as the bubble
 * opening rather than as the room kicking under it; until 25 September 2026 that was a height
 * sprung from JavaScript, a layout on every frame of it.
 *
 * With Reduce Motion on the words change at once and no light crosses at all.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, Platform, StyleSheet } from "react-native";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";

/** A line leaving, and the next one arriving: a swap, and the leaving half is the quicker. */
const OUT_MS = 140;
const IN_MS = 260;
/** How far a line travels as it goes, and as it comes. */
const TRAVEL = 7;
/** How long the light takes to cross the bubble, on the beat the words change. */
const SHEEN_MS = 780;
/** How far past each edge the band starts and ends, so it enters and leaves off-stage. */
const SHEEN_OVER = 0.7;
/** Taller than any bubble it crosses; the bubble's own corner clips it to shape. */
const SHEEN_TALL = 140;
const NATIVE = Platform.OS !== "web";

/**
 * The words, and how they change: the line lifts and fades over `OUT_MS`, the new one is put in
 * its place below and rises over `IN_MS`. One text node rather than two crossfading, because the
 * box has to measure what is coming to know how tall to be, and measuring two lines at once to
 * draw one is a cost for a frame nobody sees.
 *
 * A change that lands inside a swap takes the swap over: what was going goes now, and the line
 * it was going to be replaced by is never drawn at all. A harness passes through two words in a
 * breath, and by the time the first had arrived it would already be wrong.
 */
export function useRolling<T>(next: T, key: string, less: boolean) {
  const [shown, setShown] = useState(next);
  const said = useRef(key);
  // Read in the completion below, which runs a beat after the render that set it.
  const wanted = useRef(next);
  wanted.current = next;
  const progress = useRef(new Animated.Value(0)).current;
  const swap = useRef<Animated.CompositeAnimation | undefined>(undefined);
  useEffect(() => {
    if (said.current === key) return;
    said.current = key;
    if (less) {
      setShown(wanted.current);
      return;
    }
    const out = Animated.timing(progress, {
      toValue: 1,
      duration: OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: NATIVE,
    });
    swap.current = out;
    out.start(({ finished }) => {
      // Stopped by a change that overtook it, or by leaving the room; either way not ours.
      if (!finished) return;
      setShown(wanted.current);
      progress.setValue(-1);
      const arrive = Animated.timing(progress, {
        toValue: 0,
        duration: IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE,
      });
      swap.current = arrive;
      arrive.start();
    });
    // Runs before the next swap begins as well as on the way out, which is what overtakes it.
    return () => swap.current?.stop();
  }, [key, less, progress]);
  return {
    key,
    shown,
    words: {
      opacity: progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [TRAVEL, 0, -TRAVEL],
          }),
        },
      ],
    },
  };
}

/**
 * The light that crosses the bubble on the beat the words change. Fired rather than looped: a
 * sheen on a timer is decoration that keeps asking to be looked at, and one that goes off when
 * the thought changes is the room saying there is news. Still when there is none.
 *
 * A band of gold at a sixth of its strength, travelling on the native driver. The gradient is
 * `react-native-svg`'s, which the room already draws its scroll colours with; the band is taller
 * than the bubble can be and the bubble's own corner clips it.
 */
export function Sheen({
  at,
  width,
  gold,
}: {
  readonly at: Animated.Value;
  readonly width: number;
  readonly gold: string;
}) {
  const id = useId();
  if (width === 0) return null;
  const band = Math.round(width * SHEEN_OVER);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sheen,
        {
          width: band,
          transform: [
            {
              translateX: at.interpolate({
                inputRange: [0, 1],
                outputRange: [-band, width + band],
              }),
            },
          ],
        },
      ]}
    >
      <Svg width={band} height={SHEEN_TALL}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={gold} stopOpacity={0} />
            <Stop offset="0.5" stopColor={gold} stopOpacity={0.16} />
            <Stop offset="1" stopColor={gold} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={band} height={SHEEN_TALL} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * When the light crosses, and how wide it has to go. The width is the bubble's own, taken as it
 * lays out; the height is not, because the bubble's height springs and watching it would be a
 * render a frame for the whole of every change.
 */
export function useSheen(key: string, less: boolean) {
  const at = useRef(new Animated.Value(1)).current;
  const [width, setWidth] = useState(0);
  // The words the bubble came in with are not news, so the first key lights nothing.
  const lit = useRef(key);
  useEffect(() => {
    if (lit.current === key) return;
    lit.current = key;
    if (less) return;
    at.setValue(0);
    const sweep = Animated.timing(at, {
      toValue: 1,
      duration: SHEEN_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: NATIVE,
    });
    sweep.start();
    return () => sweep.stop();
  }, [key, less, at]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const wide = Math.round(event.nativeEvent.layout.width);
    setWidth((was) => (was === wide ? was : wide));
  }, []);
  return { at, width, onLayout };
}

const styles = StyleSheet.create({
  sheen: { position: "absolute", top: 0, left: 0, bottom: 0 },
});
