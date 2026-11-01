/**
 * A list on a sheet, which shares a finger with the sheet as iOS's own sheets' lists do (ADR 0175):
 * the sheet is pulled down from anywhere on it, and a list scrolls until it stands at its top,
 * after which a pull down on it takes the sheet. A list scrolled off its top scrolls back first.
 *
 * What makes that so is one rule between two gestures, which the list changes as it crosses its
 * top: at its top, the list's scrolling waits for the sheet's pull to let the finger go, which it
 * does at once on a move up or across (`Sheet`'s `useDrag`); off its top, the pull waits for the
 * list, which takes any move up or down. The system's recognisers keep the rule, so a list starts
 * scrolling the moment the pull lets go.
 *
 * It scrolls only when there is more of it than the sheet shows. iOS lets a list down the screen
 * bounce whatever its length, so a short one on a tall sheet could be pushed up over nothing and
 * sprang back (Arjun, 31 October 2026, on the connection's sheet: "only have it scroll if content
 * is going below the screen limits"). A list that runs past the sheet still bounces at its ends.
 *
 * Drawn outside a sheet it is a plain scroll view. A list across, such as the icon sheet's
 * grounds, stays a plain one: the sheet's pull lets go of a move across before a list would
 * notice it.
 */

import { createContext, type Ref, useContext, useMemo, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewProps,
} from "react-native";
import { Gesture, GestureDetector, type PanGesture } from "react-native-gesture-handler";

/** A sheet's pull, as a list on the sheet sees it. */
export interface Grip {
  readonly pan: PanGesture;
}

export const SheetGrip = createContext<Grip | undefined>(undefined);

/** Scrolled less than this and a list or a page is at its top: a bounce settles on fractions. */
export const SCROLL_TOP = 1;

export function SheetScroll({
  ref,
  onScroll,
  scrollEventThrottle = 16,
  alwaysBounceVertical = false,
  ...props
}: ScrollViewProps & { readonly ref?: Ref<ScrollView> }) {
  const grip = useContext(SheetGrip);
  const [top, setTop] = useState(true);
  const native = useMemo(
    () => (grip === undefined ? undefined : shared(grip.pan, top)),
    [grip, top],
  );
  const list = (
    <ScrollView
      ref={ref}
      scrollEventThrottle={scrollEventThrottle}
      alwaysBounceVertical={alwaysBounceVertical}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const now = event.nativeEvent.contentOffset.y < SCROLL_TOP;
        if (now !== top) setTop(now);
        onScroll?.(event);
      }}
      {...props}
    />
  );
  return native === undefined ? list : <GestureDetector gesture={native}>{list}</GestureDetector>;
}

/** The list's own scrolling, and which of it and the sheet's pull waits for the other. */
function shared(pan: PanGesture, top: boolean) {
  const native = Gesture.Native();
  return top ? native.requireExternalGestureToFail(pan) : native.blocksExternalGesture(pan);
}
