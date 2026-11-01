/**
 * The Search tab's Cancel (ADR 0132), beside its field (`Search`), coming in as a phone's own does
 * (Arjun: "the cancel button appears abruptly … The screen should look polished", 7 October 2026):
 * the box narrows and Cancel rides in from the right edge beside it, fading up, in one movement,
 * and goes back the same way.
 *
 * - **On the UI thread.** Its room grows from nothing by Reanimated, so the box gives way a frame
 *   at a time with nothing asked of JavaScript.
 * - **Slid, not squeezed.** Cancel stands at the box's edge in a stand wider than it will ever be,
 *   and its room clips it, so it is drawn whole, sliding in. Fitted to the room instead, it was cut
 *   short ("C…") and laid out afresh every frame, which stalled the box half way.
 * - **With Reduce Motion** the box gives way at once and Cancel only fades.
 *
 * Its own file because it is this app's Reanimated, which cannot be loaded under Jest
 * (`jest.setup.js` stands a plain Cancel in for it, as it does for `needs/Crossing`).
 */

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

/** How long Cancel takes to come in or go, and the curve: quick away, settling at the end. */
const CANCEL_MS = 320;
const CANCEL_EASE = Easing.bezier(0.25, 0.8, 0.25, 1);
/** The gap between the box and Cancel. */
const CANCEL_GAP = SPACE.md;
/**
 * The width Cancel stands in, wider than the word will ever be: its room clips it, and the word
 * is laid out once in this, not fitted to the room a frame at a time, which cut it short (“C…”)
 * and cost a text layout every frame.
 */
const CANCEL_STAND = 160;

/**
 * Cancel and the room it takes beside the box: none while the box is not in use, its own width and
 * the gap while it is, grown or given back over `CANCEL_MS`. Hidden, it can't be pressed and
 * VoiceOver passes it by.
 */
export function SearchCancel({
  shown,
  onPress,
  testID,
}: {
  readonly shown: boolean;
  readonly onPress: () => void;
  readonly testID: string | undefined;
}) {
  const palette = usePalette();
  const less = useReduceMotion();
  // Its own width, measured from the button, which hugs the word in its wide stand.
  const [width, setWidth] = useState(0);
  const room = useSharedValue(shown ? 1 : 0);
  const seen = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    const to = shown ? 1 : 0;
    const timing = { duration: CANCEL_MS, easing: CANCEL_EASE };
    // With less motion asked for, the box gives way at once and Cancel only fades.
    room.value = less ? to : withTiming(to, timing);
    seen.value = withTiming(to, less ? { duration: CANCEL_MS / 2 } : timing);
  }, [shown, less, room, seen]);
  const roomStyle = useAnimatedStyle(() => ({ width: room.value * (width + CANCEL_GAP) }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: seen.value }));
  return (
    <Animated.View
      style={[styles.room, roomStyle]}
      pointerEvents={shown ? "auto" : "none"}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
    >
      <Animated.View style={[styles.word, wordStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={SPACE.sm}
          onPress={onPress}
          disabled={!shown}
          onLayout={(event) => setWidth(Math.ceil(event.nativeEvent.layout.width))}
          testID={testID}
        >
          <Text style={[styles.cancel, { color: palette.accent }]} numberOfLines={1}>
            Cancel
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cancel: { fontSize: TEXT.body },
  // Its room clips it: Cancel stands at the box's edge, a gap in, and is drawn as far as the room
  // reaches, so it rides in from the right edge as the room grows.
  room: { alignSelf: "stretch", overflow: "hidden" },
  word: {
    position: "absolute",
    left: CANCEL_GAP,
    top: 0,
    bottom: 0,
    width: CANCEL_STAND,
    justifyContent: "center",
    alignItems: "flex-start",
  },
});
