/**
 * Where a view is on the screen, asked on the UI thread, from the frame it is in the tree.
 *
 * Its ref reaches the UI thread as React commits it, and its layout is known by then; its
 * `onLayout` reaches JavaScript a round trip later, and on a send JavaScript is busy drawing the
 * room. A flight that waited on `onLayout` to know where a bubble was, or how big its own words
 * were, held the words still in the field for a fifth of a second while the room rose without
 * them (the simulator, 4 October 2026). Before the view is in the tree there is nothing to ask,
 * and Reanimated's `measure` would warn of it: this answers nothing instead.
 *
 * Nor once it has left the tree. A watch asks every frame, and goes on asking until JavaScript has
 * run its cleanup, a few frames after the commit that took its view away: the bubble a send flies
 * to, let go as the words land or drawn afresh while they are in the air. Reanimated's `measure`
 * answers nothing then too, with a warning in development for each frame: seven on the emulator
 * per send, fifty-two on a busy one, and the toast they raised took the taps meant for the
 * composer (AN-30, 17 October 2026). So the view is asked through what `measure` asks, the
 * runtime's own `_measure`, which answers the same without the warning
 * (`measured.vitest.ts` reads Reanimated's source to keep it so).
 */

import type { View } from "react-native";
import { type AnimatedRef, type MeasuredDimensions, measure } from "react-native-reanimated";

/** What Reanimated puts on the UI runtime: the view's place, or nothing once it has no layout. */
type Ask = (node: unknown) => MeasuredDimensions | null;

export function measured(ref: AnimatedRef<View>): MeasuredDimensions | null {
  "worklet";
  // On the UI thread the ref is a function answering the view's shadow node, or nothing yet.
  const node = (ref as unknown as () => unknown)();
  if (node === null) return null;
  const ask = (globalThis as { _measure?: Ask })._measure;
  if (ask === undefined) return measure(ref);
  const box = ask(node);
  // A view flattened away measures as NaN, and `measure` says why: that one is worth a warning.
  if (box !== null && Number.isNaN(box.x)) return measure(ref);
  return box;
}
