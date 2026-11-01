/**
 * A bubble of yours, watched while the words of a send fly to it from the room's field
 * (`SendFlight.tsx`): where it is on the screen, taken on the UI thread every frame, and whether it
 * has stood still there (`watch`, in `newSpace/geometry.ts`). It sits inside the bubble, the
 * bubble's own size, for as long as the bubble is held out of sight. The words go for it from its
 * first frame (`eager`) and follow it as the room scrolls up to show it.
 *
 * It began as the watch on a room's first bubble while the + window's words flew to it, until the
 * + stopped sending words (ADR 0149). It is taken on the UI thread, and not asked for from
 * JavaScript, for two things seen on the simulator then (24 September 2026). `measureInWindow` put
 * the bubble ten points below where the screen drew it, so the words landed ten points short and
 * the bubble came up above them as they dissolved into it; Reanimated's `measure` is where it is
 * drawn. And asking twenty times a second from JavaScript was a render for every answer while the
 * words were in the air.
 *
 * It is measured from the frame it is in the tree (`ui/measured.ts`), not from its `onLayout`: the
 * words wait for the room to say where the bubble is before they set off, and the room starts
 * rising in the frame the bubble is drawn, so a round trip through JavaScript was the words
 * standing still while the room went up without them.
 */

import { useMemo } from "react";
import { StyleSheet, type View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { type Rect, same, UNWATCHED, type Watch, watch } from "../newSpace/geometry";
import { measured } from "../ui/measured";

/** What is seen of a bubble of yours, on the UI thread and every frame. */
export interface Told {
  /**
   * Where the bubble is, once the words are to go for it: once it has settled, or from its first
   * frame when `eager`, and from then on wherever it goes.
   */
  readonly aim: SharedValue<Rect | undefined>;
  /** One while the bubble is standing still: the words land only if it is. */
  readonly settled: SharedValue<number>;
}

/** What is seen of a bubble, kept for a flight. */
export function useTold(): Told {
  const aim = useSharedValue<Rect | undefined>(undefined);
  const settled = useSharedValue(0);
  return useMemo(() => ({ aim, settled }), [aim, settled]);
}

/** The watch, while the bubble is held; nothing once it is not, or for a bubble never held. */
export function BubbleWatch({
  told,
  eager = false,
}: {
  readonly told: Told | undefined;
  /** Aimed at from the first frame it is measured, rather than once it has settled. */
  readonly eager?: boolean;
}) {
  return told === undefined ? null : <Watching told={told} eager={eager} />;
}

function Watching({ told, eager }: { readonly told: Told; readonly eager: boolean }) {
  const ref = useAnimatedRef<View>();
  const seen = useSharedValue<Watch>(UNWATCHED);
  useFrameCallback((frame) => {
    const box = measured(ref);
    if (box === null || box.width <= 0 || box.height <= 0) return;
    const now = { x: box.pageX, y: box.pageY, width: box.width, height: box.height };
    const next = watch(seen.value, now, frame.timestamp);
    seen.value = next;
    told.settled.value = next.settled ? 1 : 0;
    const aim = told.aim.value;
    if ((eager || next.aiming) && (aim === undefined || !same(aim, now))) told.aim.value = now;
  });
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
