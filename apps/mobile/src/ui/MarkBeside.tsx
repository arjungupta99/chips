/**
 * The connection's mark beside another in a bar's one capsule: Universe's, in a room with a
 * project (ADR 0227), or Select's word on the Spaces and Agents lists (`BEFORE_A_WORD`, ADR 0131).
 * The mark's room opens as it arrives and closes once it has faded, so the glass widens and
 * narrows, and what stands beside it gives way and takes its space back, over a beat rather than
 * in one frame ("when the chips loading logo disappears I need a smooth transition to the universe
 * logo, right now it abruptly shrinks", Arjun, 24 October 2026). With a little more glass on the
 * mark's side while it is here: its chip is a solid square, which reads as pressed to the rim
 * where the rings, with air round them, don't. With nothing beside it, the mark is the capsule's
 * alone.
 *
 * - **When the screen is drawing on time.** The room's commonest moment is a launch, and there the
 *   UI thread itself stalls while the screen is built: on Arjun's iPhone, two and a half seconds in,
 *   frames came 70 to 200 ms apart where they come every 8.3, and the room opened in three to five
 *   of them ("the bubble expansion still has frame drops during cold start", 31 October 2026). No
 *   motion drawn a frame at a time can be smooth through that, on any thread. So the room waits
 *   until the frames have come on time for `CALM_MS`, watched on the UI thread, and then moves; it
 *   waits `CALM_WAIT_MS` at the most. Measured on the same phone, the room then opened over 23 to
 *   30 frames, all but one on time, where it had opened over three to five. Waiting for
 *   JavaScript to be idle as well said nothing: it was idle through the stalls.
 * - **On the UI thread.** Each frame of the room is set by Reanimated, with nothing asked of
 *   JavaScript, which a launch keeps busy too.
 * - **The mark is shown by its room.** It is put in its room as soon as there is something to say,
 *   and drawn as the room opens: it comes up over the room's last part, so it grows into space that
 *   is there rather than over what stands beside it, and nothing is mounted while the room moves.
 *   The room is drawn whether or not the mark is in it yet.
 * - **With Reduce Motion** the room is set, not animated, as the mark's fade is.
 *
 * Its own file because it is this app's Reanimated, which cannot be loaded under Jest
 * (`jest.setup.js` stands a plain row in for it).
 */

import { type ReactNode, useEffect, useRef } from "react";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { BESIDE_A_MARK, MARK_WIDTH, type MarkFit, ROOM_MS } from "./Connection";
import { useReduceMotion } from "./useReduceMotion";

const ROOM_TIMING = { duration: ROOM_MS, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
/** A frame on time, give or take one: longer is the UI thread busy with something else. */
const CALM_FRAME_MS = 20;
/**
 * How long the frames must have come on time, every one, before the room moves. On his iPhone the
 * launch's stalls came 100 to 250 ms apart for most of a second; after 300 ms clear, none came
 * for most of another.
 */
const CALM_MS = 300;
/** The longest the room waits for them. */
const CALM_WAIT_MS = 1500;
/** How far open the room is when the mark starts to show in it, and how small it starts. */
const SHOWS_FROM = 0.55;
const GROWS_FROM = 0.7;

export function MarkBeside({
  mark,
  open,
  fit = BESIDE_A_MARK,
  style,
  children,
}: {
  /** The bar's `ConnectionMark` while `useMarking` says there is a slot, else null. */
  readonly mark: ReactNode;
  /** Whether the mark's room is open: `useMarking`'s `room`, asked for with `beside`. */
  readonly open: boolean;
  /** Where the room sits in the capsule: beside another mark in a bar, unless said. */
  readonly fit?: MarkFit;
  readonly style?: StyleProp<ViewStyle>;
  /** What stands beside it, or null. */
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const room = useSharedValue(open ? 1 : 0);
  // Where the room is going, and whether it is still waiting for the screen to draw on time.
  const goal = useSharedValue(open ? 1 : 0);
  const waiting = useSharedValue(false);
  const calm = useSharedValue(0);
  const waited = useSharedValue(0);
  const calming = useFrameCallback((frame) => {
    if (!waiting.value) return;
    const gap = frame.timeSincePreviousFrame ?? 0;
    waited.value += gap;
    calm.value = gap > 0 && gap <= CALM_FRAME_MS ? calm.value + gap : 0;
    if (calm.value < CALM_MS && waited.value < CALM_WAIT_MS) return;
    waiting.value = false;
    // Closing, the mark has faded out by now: the wait is longer than its fade.
    room.value = withTiming(goal.value, ROOM_TIMING);
  }, false);
  const first = useRef(true);
  useEffect(() => {
    const to = open ? 1 : 0;
    if (first.current) {
      first.current = false;
      return;
    }
    if (still) {
      room.value = to;
      return;
    }
    goal.value = to;
    calm.value = 0;
    waited.value = 0;
    waiting.value = true;
    // The watch runs only while there may be something to wait for.
    calming.setActive(true);
    const done = setTimeout(() => calming.setActive(false), CALM_WAIT_MS + ROOM_MS);
    return () => clearTimeout(done);
  }, [open, still, room, goal, calm, waited, waiting, calming]);
  const [before, beforeMarked] = fit.lead;
  const { trail, gap } = fit;
  const row = useAnimatedStyle(() => ({
    paddingLeft: before + (beforeMarked - before) * room.value,
    paddingRight: trail * room.value,
  }));
  const slot = useAnimatedStyle(() => ({
    width: MARK_WIDTH * room.value,
    marginRight: gap * room.value,
  }));
  const shown = useAnimatedStyle(() => {
    const t = interpolate(room.value, [SHOWS_FROM, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ scale: GROWS_FROM + (1 - GROWS_FROM) * t }] };
  });
  if (children === null) return <>{mark}</>;
  return (
    <Animated.View style={[styles.beside, style, row]}>
      <Animated.View style={[styles.room, slot]}>
        <Animated.View style={shown}>{mark}</Animated.View>
      </Animated.View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  beside: { flexDirection: "row", alignItems: "center" },
  // Its room clips nothing: the mark grows into it as it shows, and is gone before it closes.
  room: { alignItems: "center" },
});
