/**
 * What moves as a line comes and goes under a screen's name (`Screen`'s `under`): the Spaces
 * list's "Select all" while it picks (ADR 0181), the Agents tab's (ADR 0182), Search's chips.
 *
 * Until 16 October 2026 the line was there or not, and the list made room for it in the same
 * frame: the rows below jumped thirty points down as Select was pressed, and back up on Done
 * (Arjun: "when the "select all" banner appears the rows below shift abruptly"). Now the room
 * opens on a spring and the line fades and drops into it, and on the way out the line goes first
 * and the room closes after it. The rows' circles slide in on the same spring (`SelectMotion`'s
 * `SHIFT`), so the list moves over and down as one.
 *
 * The room is laid out once, and the list moved by a transform, as the rows' own words are (ADR
 * 0181's addendum): as the line comes, a view at the head of the list takes its height at once
 * (`UnderRoom`) and everything below it is held up by that much (`UnderBody`), then let down on
 * the spring; as it goes, the list is drawn up on the spring and the room let go at the end, in
 * the same frame as the hold. The first build opened the room by its height on every frame, which
 * laid out where every row stood on every frame: on the simulator that was a dropped frame or two
 * more on each press of Select or Done. The band of glass behind the name is drawn at its full
 * height from the first frame and moved by a transform, as a blur must be (`UnderBand`), and the
 * line itself by a transform and its opacity (`UnderLine`).
 *
 * It imports Reanimated, which throws under Jest while it is still being imported; `jest.setup.js`
 * stands plain views in for it, the room open at once while there is a line.
 */

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

/** The rows' own spring as they move over for their circles (`SelectMotion`'s `SHIFT`). */
const OPEN = { stiffness: 380, damping: 30, mass: 1 } as const;
/** How far above its place the line starts, under the name, as it drops into its room. */
const DROP = 10;

/**
 * How open the room for the line is as it is seen, 0 to 1 (`at`), how it is laid out, shut or open
 * (`laid`), and whether the line is there at all, going included.
 */
export interface Glide {
  readonly at: SharedValue<number>;
  readonly laid: SharedValue<number>;
  readonly there: boolean;
}

/**
 * The room's spring, open while `open`, and there until it has shut. Laid open in the frame its
 * spring starts, and shut in the frame it ends: both on the UI thread, so a frame never shows the
 * one without the other.
 */
export function useGlide(open: boolean): Glide {
  const at = useSharedValue(open ? 1 : 0);
  const laid = useSharedValue(open ? 1 : 0);
  const [there, setThere] = useState(open);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (open) setThere(true);
    scheduleOnUI(() => {
      "worklet";
      if (open) {
        laid.value = 1;
        at.value = withSpring(1, OPEN);
        return;
      }
      at.value = withSpring(0, OPEN, (finished) => {
        if (finished !== true) return;
        laid.value = 0;
        scheduleOnRN(setThere, false);
      });
    });
  }, [open]);
  const kept = there || open;
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  return useMemo(() => ({ at, laid, there: kept }), [kept]);
}

/** The room at the head of a list for the line under the name: as tall as the line, laid open. */
export function UnderRoom({ glide, height }: { readonly glide: Glide; readonly height: number }) {
  const { laid } = glide;
  const open = useAnimatedStyle(() => ({ height: height * laid.value }));
  return <Animated.View pointerEvents="none" style={open} />;
}

/**
 * Everything in the list below the room, held where the room's spring has it rather than where it
 * is laid out: up by the line's height as the room is laid open, let down as it opens, and drawn
 * up as it shuts. It carries the list's own style, so its rows stand in it as they stood in the
 * list. At rest, and on a screen with no line, it is where it is laid out.
 */
export function UnderBody({
  glide,
  height,
  style,
  children,
}: {
  readonly glide: Glide;
  /** The line's height, or nothing while there is no line. */
  readonly height: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const { at, laid } = glide;
  const held = useAnimatedStyle(() => ({
    transform: [{ translateY: (at.value - laid.value) * height }],
  }));
  return <Animated.View style={[style, held]}>{children}</Animated.View>;
}

/**
 * The line itself, faded in as its room opens, after the rows have started down, and dropped from
 * under the name; on the way out, gone before its room has shut.
 */
export function UnderLine({
  glide,
  style,
  children,
}: {
  readonly glide: Glide;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const { at } = glide;
  const lit = useAnimatedStyle(() => {
    const open = Math.min(1, Math.max(0, at.value));
    return {
      opacity: Math.min(1, Math.max(0, open * 1.4 - 0.4)),
      transform: [{ translateY: (open - 1) * DROP }],
    };
  });
  return <Animated.View style={[style, lit]}>{children}</Animated.View>;
}

/**
 * The band behind the name, drawn at its height with the line and moved up by the line's height
 * while the room is shut: shut, it is the band with no line, and open, the band with one. A blur
 * is moved, never faded or stretched, and a band drawn again at a new size on every frame would
 * be a band drawn on every frame (`EdgeBand`).
 */
export function UnderBand({
  glide,
  height,
  children,
}: {
  readonly glide: Glide;
  /** The line's height, which the band is drawn taller by. */
  readonly height: number;
  readonly children: ReactNode;
}) {
  const { at } = glide;
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateY: -height * (1 - Math.min(1, Math.max(0, at.value))) }],
  }));
  return <Animated.View style={[StyleSheet.absoluteFill, moved]}>{children}</Animated.View>;
}

/**
 * Where the name is a shelf rather than glass (Android, the web, Reduce Transparency): the line
 * stands in a room of its own under the name, opened and shut on the same spring, and the list
 * below it is moved down by it.
 */
export function UnderShelf({
  glide,
  height,
  children,
}: {
  readonly glide: Glide;
  readonly height: number;
  readonly children: ReactNode;
}) {
  const { at } = glide;
  const open = useAnimatedStyle(() => ({ height: Math.max(0, height * at.value) }));
  return (
    <Animated.View style={[styles.shelf, open]}>
      <UnderLine glide={glide} style={{ height }}>
        {children}
      </UnderLine>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shelf: { overflow: "hidden" },
});
