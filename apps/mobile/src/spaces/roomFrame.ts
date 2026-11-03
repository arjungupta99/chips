/**
 * The frame a move on the room's transition takes a view to (`RoomMotion.tsx`), kept apart from
 * the transition so that what it names can be proved under Node, where Reanimated is not loaded.
 */

import type { LayoutAnimationsValues } from "react-native-reanimated";

/** The four values of a view's frame a move takes it through. */
export type FrameValue = "originX" | "originY" | "width" | "height";

/**
 * A move names all four values of the frame, each to where it is laid out, whether it changed or
 * not; one that has not lands where it is drawn, at once. Reanimated merges a move into one still
 * on its way, value by value, so a value a move left out kept going to where the earlier move
 * sent it. A move of nothing — laid out where it is already drawn — left the earlier one going
 * whole.
 *
 * Which is how a bubble of yours was lost on the iPhone Duo. Sent to the background folded, Chips
 * is laid out again at the open Duo's width for the picture the app switcher keeps, and folded
 * again, with no frame drawn between: the first move set off for the wide place, the second found
 * the bubble drawn where it was going and moved nothing, and the bubble went to the wide place
 * when the frames came back — past the right of its row, out of sight, and there until the room
 * was opened again (the Duo simulator, iOS 27.2, 2 November 2026).
 */
export function wholeFrame<T>(
  values: LayoutAnimationsValues,
  to: (value: number, which: FrameValue) => T,
): Record<FrameValue, T> {
  "worklet";
  return {
    originX: to(values.targetOriginX, "originX"),
    originY: to(values.targetOriginY, "originY"),
    width: to(values.targetWidth, "width"),
    height: to(values.targetHeight, "height"),
  };
}
