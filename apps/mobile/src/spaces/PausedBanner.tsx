/**
 * The room's banner while Chips holds its agents' messages to each other (ADR 0097): who paused
 * them — Chips, at the referee's ceiling or at the room's spend ceiling with what the job spent
 * (ADR 0118), or a person — and *Let them carry on*, which is a person acting, so the count starts
 * again, what was held is handed over and a new job begins. It stays until a person acts. The
 * words are core's (`pauseWords`), so the desktop says the same.
 *
 * Held at the spend ceiling, it offers the way on at the ceiling there is, *Carry on at $3.00*,
 * and, for whoever may set the ceiling, *Raise the limit* first: the room's Spend per job, whose
 * Save lets them carry on too (ADR 0282, Arjun's C of the mock "Spend in Chips explain").
 *
 * It comes and goes with the room's word, and never in a jump (Arjun's iPhone, 11 November 2026:
 * coming back to a room, "a rectangular red message at the bottom … appeared like for a second
 * and disappeared. Looked abrupt and unexpected"). Two things made that:
 *
 * - **What it draws from.** Back from the background, the room still holds what it knew when the
 *   app went, and the catch-up is a moment behind. So while the room is out of touch
 *   (`useInTouch`) the banner keeps what it was drawing, and only once the room has caught up does
 *   it follow the room again: a pause the catch-up both brings and ends is never drawn.
 * - **How it goes.** It fades in as it rises into its place, and out where it stands, then gives
 *   its place up, and the room settles on its own spring as for any change at its foot (ADR
 *   0075). Opacity and a lift, on the native driver, as the connection mark does
 *   (`ui/Connection.tsx`): a height that animated would move the foot every frame, and a layout
 *   transition's leaving copy is drawn where the foot's top used to be, which falls by its height
 *   the moment it goes. A room opened paused has it there from the first frame.
 */

import {
  carryOnWords,
  maySetSpend,
  pauseWords,
  RAISE_LIMIT,
  type Snapshot,
  type Space,
  type Store,
} from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

/** How long the banner takes to come in, and to go. Away quickly, in gently. */
export const ARRIVE_MS = 240;
export const LEAVE_MS = 180;
/** How far under its place it starts, and sinks back to as it goes. */
const LIFT = 8;
const NATIVE = Platform.OS !== "web";

export function PausedBanner({
  store,
  space,
  snapshot,
  selfId,
  onRaise,
  inTouch = true,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  /** Raise the limit: the room's Spend per job, opened to carry on with what is saved. */
  readonly onRaise?: (() => void) | undefined;
  /** Whether the room has caught up with its server (`useInTouch`). */
  readonly inTouch?: boolean;
}) {
  const palette = usePalette();
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const room = useHeldUntilInTouch(space, inTouch);
  const words = room.state === "open" ? pauseWords(room, snapshot.directory) : undefined;
  const here = words !== undefined;
  // What it last said, kept for the length of its exit: it fades out saying it.
  const last = useRef<{ readonly room: Space; readonly words: string } | undefined>(undefined);
  if (words !== undefined) last.current = { room, words };
  const { enter, away } = useComesAndGoes(here);
  const shown = last.current;
  if (away || shown === undefined) return null;
  const carryOn = () => {
    setFailed(undefined);
    store.setExchange(shown.room.id, "going").catch((error: unknown) => {
      setFailed(error instanceof Error ? error.message : "The server would not let them go on.");
    });
  };
  // Held at the ceiling, and not paused by a person since.
  const atCeiling = shown.room.pausedSpend !== undefined && shown.room.pausedBy === undefined;
  const raises =
    atCeiling && onRaise !== undefined && maySetSpend(shown.room, snapshot.model, selfId);
  return (
    <Animated.View
      // On its way out it is only a picture: nothing under the thumb, nothing to read out.
      pointerEvents={here ? "auto" : "none"}
      accessibilityElementsHidden={!here}
      importantForAccessibility={here ? "auto" : "no-hide-descendants"}
      style={[
        styles.banner,
        {
          backgroundColor: palette.redSoft,
          borderColor: palette.red,
          opacity: enter,
          transform: [{ translateY: enter.interpolate(SINKS) }],
        },
      ]}
      accessibilityRole="summary"
      testID="paused-banner"
    >
      <Text style={[styles.words, { color: palette.redInk }]}>{shown.words}</Text>
      <View style={styles.acts}>
        {raises ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRaise}
            style={[styles.act, { borderColor: palette.redInk, backgroundColor: palette.redInk }]}
            testID="raise-limit"
          >
            <Text style={[styles.actWords, { color: palette.redSoft }]}>{RAISE_LIMIT}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={carryOn}
          style={[styles.act, { borderColor: palette.redInk }]}
          testID="carry-on"
        >
          <Text style={[styles.actWords, { color: palette.redInk }]}>
            {atCeiling ? carryOnWords(shown.room) : "Let them carry on"}
          </Text>
        </Pressable>
      </View>
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.redInk }]}>{failed}</Text>
      )}
    </Animated.View>
  );
}

/**
 * The room as the banner draws it: as it stands while the room is in touch, and while it is not,
 * as it stood when it last was. A room opened out of touch draws what it holds. One banner is one
 * room's (the foot keys it by the room), so what it holds is never another room's.
 */
function useHeldUntilInTouch(space: Space, inTouch: boolean): Space {
  const held = useRef(space);
  if (inTouch) held.current = space;
  return held.current;
}

/**
 * The banner's arrival and its exit, and whether there is anything to draw at all. `away` is the
 * end of the exit — nothing drawn, and its place given back to the room — so the exit runs first
 * and the place goes at the end of it. Whatever it is when the room opens, it is at once.
 */
function useComesAndGoes(here: boolean): {
  readonly enter: Animated.Value;
  readonly away: boolean;
} {
  const still = useReduceMotion();
  const enter = useRef(new Animated.Value(here ? 1 : 0)).current;
  const [away, setAway] = useState(!here);
  const first = useRef(true);
  // Its place is taken back before the arrival.
  useEffect(() => {
    if (here) setAway(false);
  }, [here]);
  useEffect(() => {
    const ended = () => setAway(!here);
    if (first.current || still) {
      first.current = false;
      enter.setValue(here ? 1 : 0);
      ended();
      return;
    }
    const motion = Animated.timing(enter, {
      toValue: here ? 1 : 0,
      duration: here ? ARRIVE_MS : LEAVE_MS,
      easing: here ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: NATIVE,
    });
    motion.start(({ finished }) => {
      if (finished) ended();
    });
    return () => motion.stop();
  }, [enter, here, still]);
  return { enter, away };
}

/** Under its place by `LIFT` while it is away, in its place once it is here. */
const SINKS = { inputRange: [0, 1], outputRange: [LIFT, 0] };

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.sm,
  },
  words: { fontSize: TEXT.md, lineHeight: 20 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  act: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  actWords: { fontSize: TEXT.md, fontWeight: "600" },
  failed: { fontSize: TEXT.sm },
});
