/**
 * A list taken down to a place on its own, slowly enough to be followed (Arjun, 30 October 2026, of
 * the link a space's Invite page makes: its QR code "simply hides below the screen, will confuse
 * people"). iOS's own animated scroll is over in about a quarter of a second, which reads as a
 * jump; this one takes `GLIDE_MS` on an ease in and out, so what came in is seen to be below what
 * was there.
 *
 * It goes only down, and only as far as the list goes: a place already at the top, or above it,
 * leaves the list where it is. A finger on the list stops it where it is, and Reduce Motion takes
 * the travel out: the list is put there at once.
 *
 * Each frame is a `scrollTo` from JavaScript, on React Native's own `Animated`, as the sheet's own
 * motion is: Reanimated, which would run it on the UI thread, cannot be loaded under Jest here. It
 * starts a frame after it is asked, once the list has heard how tall it has become, so it knows
 * how far it can go.
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from "react-native";
import { useReduceMotion } from "./useReduceMotion";

/** How long the glide takes: slow enough to follow, as a hand would scroll it. */
export const GLIDE_MS = 700;

export interface ScrollGlide {
  /** Spread on the list: where it stands, how tall it is and its content, and a finger's drag. */
  readonly list: {
    readonly ref: RefObject<ScrollView | null>;
    readonly onLayout: (event: LayoutChangeEvent) => void;
    readonly onContentSizeChange: (width: number, height: number) => void;
    readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    readonly onScrollBeginDrag: () => void;
  };
  /** Down until `y`, a place in the list's content, stands at its top, or as far as it goes. */
  readonly down: (y: number) => void;
}

export function useScrollGlide(): ScrollGlide {
  const still = useReduceMotion();
  const ref = useRef<ScrollView>(null);
  const seen = useRef({ offset: 0, height: 0, content: 0 });
  const frame = useRef<number | undefined>(undefined);
  const going = useRef<(() => void) | undefined>(undefined);

  const stop = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    going.current?.();
    going.current = undefined;
  }, []);

  const go = useCallback(
    (y: number) => {
      const { offset: from, height, content } = seen.current;
      const to = Math.min(y, Math.max(0, content - height));
      if (to <= from + 1) return;
      if (still) {
        ref.current?.scrollTo({ y: to, animated: false });
        return;
      }
      const at = new Animated.Value(from);
      at.addListener(({ value }) => ref.current?.scrollTo({ y: value, animated: false }));
      const motion = Animated.timing(at, {
        toValue: to,
        duration: GLIDE_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      });
      going.current = () => {
        motion.stop();
        at.removeAllListeners();
      };
      motion.start(() => at.removeAllListeners());
    },
    [still],
  );

  const down = useCallback(
    (y: number) => {
      stop();
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        go(y);
      });
    },
    [stop, go],
  );

  useEffect(() => stop, [stop]);

  const list = useMemo(
    () => ({
      ref,
      onLayout: (event: LayoutChangeEvent) => {
        seen.current.height = event.nativeEvent.layout.height;
      },
      onContentSizeChange: (_width: number, height: number) => {
        seen.current.content = height;
      },
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        seen.current.offset = event.nativeEvent.contentOffset.y;
      },
      onScrollBeginDrag: stop,
    }),
    [stop],
  );

  return { list, down };
}
