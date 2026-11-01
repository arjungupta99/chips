/**
 * A message swiped to the right to reply to it (ADR 0219). The bubble and its face follow the
 * finger, and an arrow grows in a disc behind them, from four tenths of its size to all of it by
 * 58 points, where it turns gold with a tick under the finger: let go past there and the message is
 * replied to. Either way the row springs home on the room's spring.
 *
 * The swipe starts only on what the message draws: its bubble, and the photos, voice notes and
 * files under it, each a `ReplyGrip`. The rest of the row is the room's, and a drag across it is the
 * screen's swipe back, which iOS 26 takes from anywhere in the content (Arjun, 25 October 2026:
 * "swipe to go back should work from any empty area"). The row was one grip until then, so the
 * room's empty side of every message replied to it.
 *
 * Only a move to the right past 10 points starts it, and 12 points up or down fails it first, so
 * the room's scroll wins a diagonal. A touch that lands within 24 points of the screen's left edge
 * never starts it, bubble or not: that is the swipe back too. It all runs on the UI thread; only the
 * tick and the reply cross over.
 *
 * `SwipeRow.tsx` swipes rows in lists and sheets open onto buttons. This is a gesture that lets go
 * of what it did, and is its own.
 */

import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { alpha } from "../ui/Glass";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { IOS_SPRING } from "../ui/motion";
import { usePalette } from "../ui/theme";

/** How far right a finger moves before the row follows it, and how far up or down ends that. */
const START = 10;
const FAIL = 12;
/** Where a touch must land clear of the screen's left edge, which is the swipe back. */
const EDGE = 24;
/** How far the row has come when letting go replies, and the arrow is all there. */
const REPLY_AT = 58;
/** Past that the row comes a third as far as the finger, so it is felt to have arrived. */
const PAST = 0.35;
const DISC = 30;

/** What a row's grips move as a finger takes one of them: the row, and the arrow behind it. */
interface Swiping {
  readonly enabled: boolean;
  readonly x: SharedValue<number>;
  readonly hit: SharedValue<boolean>;
  readonly gold: SharedValue<number>;
  /** The latest `onReply`, read when a swipe lets go past the point. */
  readonly reply: RefObject<() => void>;
}

const SwipingRow = createContext<Swiping | undefined>(undefined);

export function ReplySwipe({
  enabled,
  onReply,
  children,
}: {
  /** Whether this line can be replied to (core's `mayReply`) and the room takes replies. */
  readonly enabled: boolean;
  readonly onReply: () => void;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const x = useSharedValue(0);
  const hit = useSharedValue(false);
  const gold = useSharedValue(0);
  const reply = useRef(onReply);
  reply.current = onReply;
  // The grips' gestures are made again only when whether the line can be replied to changes.
  const swiping = useMemo(() => ({ enabled, x, hit, gold, reply }), [enabled, x, hit, gold]);
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const grown = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [START, REPLY_AT * 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(x.value, [0, REPLY_AT], [0.4, 1], Extrapolation.CLAMP) }],
  }));
  const lit = useAnimatedStyle(() => ({ opacity: gold.value }));
  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.disc, grown]} testID="reply-swipe-arrow">
        <View style={[styles.ground, { backgroundColor: alpha(palette.ink, 0.09) }]}>
          <Icon name="reply" size={16} color={palette.ink2} weight={2.1} />
        </View>
        <Animated.View style={[styles.ground, { backgroundColor: palette.gold }, lit]}>
          <Icon name="reply" size={16} color="#1A1400" weight={2.1} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={moved}>
        <SwipingRow.Provider value={swiping}>{children}</SwipingRow.Provider>
      </Animated.View>
    </View>
  );
}

/**
 * A piece of a message a finger can take to reply to it, with a gesture of its own that moves the
 * whole row. Its child is one view, which the gesture is put on. Outside a room's row (a page, the
 * lifted copy) it is only that view. It is there whether or not the line can be replied to yet, so a
 * send landing does not draw its bubble afresh.
 */
export function ReplyGrip({ children }: { readonly children: ReactElement }) {
  const swiping = useContext(SwipingRow);
  const pan = useMemo(() => (swiping === undefined ? undefined : panOf(swiping)), [swiping]);
  return pan === undefined ? children : <GestureDetector gesture={pan}>{children}</GestureDetector>;
}

function panOf({ enabled, x, hit, gold, reply }: Swiping) {
  const replied = () => reply.current();
  const ticked = () => feel.tick();
  return Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(START)
    .failOffsetY([-FAIL, FAIL])
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      if (touch !== undefined && touch.absoluteX < EDGE) manager.fail();
    })
    .onUpdate((event) => {
      const moved = Math.max(0, event.translationX);
      x.value = moved <= REPLY_AT ? moved : REPLY_AT + (moved - REPLY_AT) * PAST;
      const past = moved >= REPLY_AT;
      if (past === hit.value) return;
      hit.value = past;
      gold.value = withTiming(past ? 1 : 0, { duration: 120 });
      if (past) scheduleOnRN(ticked);
    })
    .onEnd(() => {
      if (hit.value) scheduleOnRN(replied);
    })
    .onFinalize(() => {
      hit.value = false;
      gold.value = withTiming(0, { duration: 160 });
      x.value = withSpring(0, IOS_SPRING);
    });
}

const styles = StyleSheet.create({
  disc: {
    position: "absolute",
    left: 2,
    top: "50%",
    width: DISC,
    height: DISC,
    marginTop: -DISC / 2,
  },
  ground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: DISC / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
