/**
 * The +'s size, and the room a tab's list keeps for it and for the bar, apart from the + itself
 * (`Plus.tsx`): the lists take this, and the + brings Reanimated and the glass with it, which a list
 * has no need of and its tests cannot load.
 */

import { Platform, View } from "react-native";
import { BAR_HEIGHT, BAR_ROOM } from "../ui/barShape";
import { ReadingWatch } from "../ui/phoneBarNative";

/** Across, in points: as tall as the bar at rest on an iPhone. */
export const PLUS_SIZE = BAR_HEIGHT;
/**
 * On Android the + floats above the bar's trailing end, as Android's floating action button does
 * (`app/(tabs)/_layout.tsx`), this far in from the edge and above the bar: Material's margin.
 */
export const PLUS_GAP = 16;

/** Whether the bar is the one this app draws, over the list: on an iPhone (ADR 0233). */
const DRAWN_BAR = Platform.OS === "ios" && !Platform.isPad;

/**
 * What a tab's list keeps clear below its last row. On Android, the + floating over it: it covered
 * the last row of every tab, Archived on Spaces (the emulator, 16 October 2026). On an iPhone, the
 * bar drawn over it, which the window's inset knows nothing of (ADR 0233). On an iPad the bar is
 * the system's, at the top, and nothing is kept.
 */
export const PLUS_ROOM =
  Platform.OS === "android" ? PLUS_SIZE + PLUS_GAP : DRAWN_BAR ? BAR_ROOM : 0;

/**
 * That room, as the last thing in a tab's list. On an iPhone it also holds what tells the bar
 * whether the list is being read (`ReadingWatch`), which finds the list by standing in it.
 */
export function PlusRoom() {
  if (PLUS_ROOM === 0) return null;
  return <View style={{ height: PLUS_ROOM }}>{DRAWN_BAR ? <ReadingWatch /> : null}</View>;
}
