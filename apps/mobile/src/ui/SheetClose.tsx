/**
 * The way out of every sheet: an X at the top right, on the line the sheet's title stands on
 * (ADR 0169, Arjun's B, 15 October 2026: "All bottom sheets in Chips need to show a beautiful X
 * button on the top right"). `Sheet` draws it, so no sheet can be without one, and a sheet's head
 * leaves `CLOSE_ROOM` at its right for it. On the iPhone Duo it stands in the column beside the
 * sheet instead, where UIKit moves a sheet's own buttons (`closeInLane`).
 *
 * On iOS 26 and later it is a drop of the system's interactive glass, the material the room's
 * capsules and the composer's + are made of, which swells under a thumb as iOS's own glass
 * buttons do; the mark is ink. Anywhere else (Android, an older iOS, Reduce Transparency, the
 * web) it is a flat circle of the quiet surface with the mark in the second ink, the X the Mac
 * and web dialogs already wear (`.new-space-close`).
 *
 * It moves with the sheet, on values the sheet already has, so it starts no clock of its own:
 *
 * - **Arriving**, it grows in over the last half of the panel's rise, past its size and back, with
 *   the mark turning the last few degrees into place; leaving, the same backwards.
 * - **Pulled**, by the handle: a ring draws round it clockwise from the top in step with the
 *   finger, and closes at the line past which letting go puts the sheet away (`LETS_GO` of its
 *   height). There the ring gives way to the X filling with ink, with a tick a thumb can feel;
 *   back above the line, it empties again.
 *
 * Reduce Motion keeps the ring and the fill, which say where the finger is, and leaves out the
 * growing and the turn. Nothing here fades the glass: a material asked to animate its opacity is
 * drawn broken until it is whole again, so the glass only ever grows, and a closed X greys its mark.
 */

import { GlassView } from "expo-glass-effect";
import { useMemo } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { TOUCH_TARGET } from "./Button";
import type { Frame } from "./duo";
import { useLiquid } from "./Glass";
import { useGround } from "./ground";
import { Icon } from "./Icon";
import { usePalette, useScheme } from "./theme";
import { SPACE } from "./tokens";

/** The X's circle. */
export const CLOSE = 34;
/** What a sheet's first line leaves free at its right: the X, and the gap a row keeps. */
export const CLOSE_ROOM = CLOSE + SPACE.md;
/**
 * How far the X stands above where a sheet's title starts, which centres it on a title's line. A
 * first line that is a circle the X's size rises as far, and the two stand level.
 */
export const CLOSE_RISE = 6;
/** Where the X stands, moved from its place at the right of the title's line (`closeInLane`). */
export interface CloseAt {
  readonly right: number;
  readonly top: number;
}

/**
 * Where a phone's sheet puts its X on the iPhone Duo (ADR 0256, the mock's section 11): in the lane
 * down the column UIKit stands its own buttons in, as UIKit moves a sheet's own buttons there, and
 * never above the lane's top, where the status stands — the camera, the time and the battery. A
 * sheet that rises above it has its X at the lane's top; a lower one on its title's line, in the
 * lane. `lineRight` and `lineTop` are where the title's line ends and stands in the window, the
 * sheet at rest.
 */
export function closeInLane(lane: Frame, lineRight: number, lineTop: number): CloseAt {
  const middle = lane.x + lane.width / 2;
  const top = lineTop - CLOSE_RISE;
  return { right: lineRight - (middle + CLOSE / 2), top: -CLOSE_RISE + Math.max(0, lane.y - top) };
}

/** The mark inside it, and the ring around it. */
const MARK = 16;
const RING = CLOSE + 10;
const RING_LINE = 2;

export interface CloseMotion {
  /** The sheet's arrival: nought away, one in place. */
  readonly progress: Animated.Value;
  /** Where a finger has pulled the sheet to, in points below its place. */
  readonly drag: Animated.Value;
  /** One once a pull is past the line, nought short of it, sprung between. */
  readonly armed: Animated.Value;
  /** How far a pull goes before letting go closes the sheet, in points. */
  readonly line: number;
  /** Reduce Motion is on. */
  readonly still: boolean;
}

/**
 * The X on a line of no height where the sheet's title starts, under the handle, standing over what
 * the sheet holds.
 */
export function SheetClose({
  motion,
  disabled,
  onClose,
  onCloseButton,
  sheet,
  at,
}: {
  readonly motion: CloseMotion;
  /** The sheet may not be put away just now: a delete it asked for is under way. */
  readonly disabled: boolean;
  readonly onClose: () => void;
  /** What the X does instead, where that is not `onClose` (`Sheet`). */
  readonly onCloseButton: (() => void) | undefined;
  /** The sheet's own test id, which the X's is made from. */
  readonly sheet: string | undefined;
  /** Somewhere else than the right of the title's line: the Duo's column (`closeInLane`). */
  readonly at?: CloseAt | undefined;
}) {
  return (
    <View style={styles.line} pointerEvents="box-none">
      <Close
        motion={motion}
        disabled={disabled}
        onPress={onCloseButton ?? onClose}
        testID={`${sheet ?? "sheet"}-close`}
        at={at}
      />
    </View>
  );
}

function Close({
  motion,
  disabled,
  onPress,
  testID,
  at,
}: {
  readonly motion: CloseMotion;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly testID: string;
  readonly at: CloseAt | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  const scheme = useScheme();
  const liquid = useLiquid();
  const look = useLook(motion);
  const ink = disabled ? palette.ink4 : liquid ? palette.ink : palette.ink2;
  const press = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={(TOUCH_TARGET - CLOSE) / 2}
      testID={testID}
      style={({ pressed }) => [
        styles.round,
        liquid ? null : { backgroundColor: pressed ? on.pressed : on.fill },
      ]}
    >
      <Animated.View
        style={[styles.round, styles.fill, { backgroundColor: palette.ink, opacity: look.fill }]}
      />
      <Animated.View style={{ transform: [{ rotate: look.turn }] }}>
        <Icon name="x" size={MARK} color={ink} weight={2.4} />
        <Animated.View style={[styles.fill, styles.middle, { opacity: look.fill }]}>
          <Icon name="x" size={MARK} color={palette.bg} weight={2.4} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.at, at, { transform: [{ scale: look.grow }, { scale: look.pop }] }]}
    >
      <Ring first={look.first} second={look.second} shown={look.ring} color={palette.ink2} />
      {liquid ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          colorScheme={scheme}
          style={styles.round}
        >
          {press}
        </GlassView>
      ) : (
        press
      )}
    </Animated.View>
  );
}

/** What the X's parts are doing, worked out from the sheet's own values. */
function useLook({ progress, drag, armed, line, still }: CloseMotion) {
  return useMemo(() => {
    // A line not yet measured is a short one, so the ranges below still rise.
    const at = Math.max(line, 2);
    const half = (from: number, to: number) =>
      drag.interpolate({
        inputRange: [from, to],
        outputRange: ["-45deg", "135deg"],
        extrapolate: "clamp",
      });
    const fill = armed.interpolate({
      inputRange: [0, 0.35],
      outputRange: [0, 1],
      extrapolate: "clamp",
    });
    return {
      grow: still
        ? 1
        : progress.interpolate({
            inputRange: [0.5, 0.9, 1],
            outputRange: [0.01, 1.08, 1],
            extrapolate: "clamp",
          }),
      turn: still
        ? "0deg"
        : progress.interpolate({
            inputRange: [0.5, 1],
            outputRange: ["-24deg", "0deg"],
            extrapolate: "clamp",
          }),
      pop: still ? 1 : armed.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.18, 1] }),
      fill,
      first: half(0, at / 2),
      second: half(at / 2, at),
      // Seen from the first points of a pull, and gone once the X has filled.
      ring: Animated.multiply(
        drag.interpolate({ inputRange: [0, 6], outputRange: [0, 1], extrapolate: "clamp" }),
        Animated.subtract(1, fill),
      ),
    };
  }, [progress, drag, armed, line, still]);
}

/**
 * The ring drawn round the X as the sheet is pulled, out of two half rings and two windows, so that
 * it is turned and never redrawn: on the native driver a turn is free, and a stroke's dash is not.
 * The right window shows a left half ring turned into it clockwise from the top, the first half of
 * the way; the left window, a right half ring turned in from the bottom, the second.
 */
function Ring({
  first,
  second,
  shown,
  color,
}: {
  readonly first: Animated.AnimatedInterpolation<string>;
  readonly second: Animated.AnimatedInterpolation<string>;
  readonly shown: Animated.AnimatedNode;
  readonly color: string;
}) {
  return (
    <Animated.View pointerEvents="none" style={[styles.ring, { opacity: shown }]}>
      <View style={[styles.window, styles.rightWindow]}>
        <Animated.View
          style={[
            styles.arc,
            styles.leftArc,
            { borderLeftColor: color, borderTopColor: color, transform: [{ rotate: first }] },
          ]}
        />
      </View>
      <View style={[styles.window, styles.leftWindow]}>
        <Animated.View
          style={[
            styles.arc,
            { borderRightColor: color, borderBottomColor: color, transform: [{ rotate: second }] },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: { height: 0, zIndex: 1 },
  // Its middle on the title's line: a sheet's title starts just under the handle, where `line` is.
  at: { position: "absolute", top: -CLOSE_RISE, right: 0, width: CLOSE, height: CLOSE },
  round: {
    width: CLOSE,
    height: CLOSE,
    borderRadius: CLOSE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: { position: "absolute", top: 0, left: 0 },
  middle: { right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    top: (CLOSE - RING) / 2,
    left: (CLOSE - RING) / 2,
    width: RING,
    height: RING,
  },
  window: { position: "absolute", top: 0, width: RING / 2, height: RING, overflow: "hidden" },
  rightWindow: { left: RING / 2 },
  leftWindow: { left: 0 },
  arc: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: RING_LINE,
    borderColor: "transparent",
  },
  // Inside the right window the ring's middle is the window's left edge.
  leftArc: { left: -RING / 2 },
});
