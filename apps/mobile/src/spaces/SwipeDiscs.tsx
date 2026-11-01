/**
 * What a swiped row slides off (ADR 0178; Arjun, 16 October 2026: "make these Swipe row to delete
 * / archive / lock more cooler and polished", and from the mock, "B with graphite"): a quiet tray,
 * and on it a flat round button for each act, its word under it.
 *
 * Everything here moves with the row, read off the swipeable's own offset on the UI thread:
 *
 * - The row's trailing corners round as it slides (`useRowEdge`), so it reads as a card pulled
 *   aside rather than a strip cut short.
 * - Each disc comes out from under the row's edge as its place is uncovered, the rightmost first,
 *   and pops to its size on a spring once half of it is clear. Its word follows a beat later.
 * - Once a disc is wholly clear its mark makes one move: the bin's lid hops, the box's lid lands,
 *   the lid of the box a room comes back out of lifts, the padlock's shackle clicks shut, the pin's
 *   head pushes in, and on Unpin pulls out a little.
 * - The row crossing the line where letting go opens it is felt as a selection click, as a decision
 *   card's swipe is (`needs/Crossing.tsx`).
 * - A row whose room goes carries on off the edge it was pushed towards, gathering speed, and its
 *   tray fades a beat behind it (`Going`; ADR 0205's addendum).
 *
 * Reduce Motion lets every spring and beat here jump to its end, which Reanimated does by itself:
 * the discs fade in as the row uncovers them, without the pop, and the marks stand still.
 *
 * It is a file of its own because it imports Reanimated, which throws under Jest while it is still
 * being imported; `jest.setup.js` mocks it away, as it mocks the swipeable, and the acts are
 * reached in tests through the rows' accessibility actions. That it moves is the simulator's to
 * show.
 */

import { type ReactNode, useEffect, useState } from "react";
import {
  Dimensions,
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Path, Svg } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { tick } from "../ui/haptics";
import { ICON_BOX, ICONS, type IconName } from "../ui/icons";
import { TEXT } from "../ui/tokens";

/** One button on the tray, as `SwipeRow` resolves it: its word, its mark and its colours. */
export interface Disc {
  readonly key: string;
  readonly word: string;
  readonly mark: IconName;
  readonly tone: string;
  readonly ink: string;
}

/** The room either side of the discs, inside the width the row opens to. */
const INSET = 6;
/** How far the tray reaches in under the row, so a row pulled past open never shows its edge. */
const REACH = 160;
/** How round the row's trailing corners are once it has slid a few points. */
const CORNER = 18;
/** A row this tall or taller wears the full disc; a sheet's shorter rows wear the small one. */
const TALL = 72;
/** A disc's size before it pops: small enough to tuck under the row's edge. */
const TUCKED = 0.3;
/** The pop: quick, and a little past its size before it settles. */
const POP = { stiffness: 640, damping: 21, mass: 1 } as const;

/** The width the row opens to for so many acts, each `width` wide. */
function trayWidth(count: number, width: number): number {
  return count * width + 2 * INSET;
}

/**
 * The row's corners on the side it slides away from, rounding as it slides: its trailing ones as
 * it goes left, its leading ones as it goes right (ADR 0205). `travel` is where the row is, the
 * swipeable's offset mirrored here by `Discs`, which only the render callback is handed.
 */
export function useRowEdge(): {
  readonly travel: SharedValue<number>;
  readonly style: StyleProp<ViewStyle>;
} {
  const travel = useSharedValue(0);
  const corners = useAnimatedStyle(() => {
    const right = Math.min(CORNER, Math.max(0, -travel.value) * 0.35);
    const left = Math.min(CORNER, Math.max(0, travel.value) * 0.35);
    return {
      borderTopRightRadius: right,
      borderBottomRightRadius: right,
      borderTopLeftRadius: left,
      borderBottomLeftRadius: left,
    };
  });
  // The swipeable puts this on its own `Animated.View`, which takes an animated style; its prop is
  // typed as a plain one.
  return { travel, style: [styles.edge, corners] as unknown as StyleProp<ViewStyle> };
}

export function Discs({
  discs,
  side = "right",
  width,
  opensAt,
  translation,
  travel,
  tray,
  words,
  onPress,
  testID,
  fade,
}: {
  readonly discs: readonly Disc[];
  /**
   * Which of the row's ends they come out from under: its trailing end, as the row goes left, or
   * its leading end as it goes right, where Hide is (ADR 0205).
   */
  readonly side?: "right" | "left";
  /** How wide each disc's place is. */
  readonly width: number;
  /** The distance past which letting go opens the row. */
  readonly opensAt: number;
  /** The swipeable's offset: negative as the row goes left, positive as it goes right. */
  readonly translation: SharedValue<number>;
  /** Where the row's edge reads how far it has gone (`useRowEdge`). */
  readonly travel: SharedValue<number>;
  readonly tray: string;
  /** The colour of the words under the discs. */
  readonly words: string;
  readonly onPress: (key: string) => void;
  readonly testID: string;
  /** How far the tray has faded as its row goes off the edge (`Going`): 0 there, 1 gone. */
  readonly fade?: SharedValue<number> | undefined;
}) {
  const [small, setSmall] = useState(false);
  const fading = useAnimatedStyle(() => (fade === undefined ? {} : { opacity: 1 - fade.value }));
  // How far the row has gone this side's way: positive as it uncovers these discs.
  const away = side === "right" ? -1 : 1;
  useAnimatedReaction(
    () => translation.value,
    (now, before) => {
      travel.value = now;
      // Outward only, and once per crossing; `before` is null on the first run, which crossed
      // nothing.
      if (before !== null && before * away < opensAt && now * away >= opensAt) scheduleOnRN(tick);
    },
  );
  const onLayout = (event: LayoutChangeEvent) => {
    setSmall(event.nativeEvent.layout.height < TALL);
  };
  return (
    <Animated.View
      style={[styles.discs, { width: trayWidth(discs.length, width) }, fading]}
      onLayout={onLayout}
    >
      <View
        style={[side === "right" ? styles.trayRight : styles.trayLeft, { backgroundColor: tray }]}
      />
      {discs.map((disc, index) => (
        <Slot
          key={disc.key}
          disc={disc}
          // How far the row must go before this disc's place starts to show: the outermost first,
          // the rightmost of a trailing tray and the leftmost of a leading one.
          from={(side === "right" ? discs.length - 1 - index : index) * width + INSET}
          away={away}
          width={width}
          small={small}
          translation={translation}
          words={words}
          onPress={() => onPress(disc.key)}
          testID={`${testID}-${disc.key}`}
        />
      ))}
    </Animated.View>
  );
}

function Slot({
  disc,
  from,
  away,
  width,
  small,
  translation,
  words,
  onPress,
  testID,
}: {
  readonly disc: Disc;
  readonly from: number;
  /** -1 for a trailing tray, which the row uncovers going left; 1 for a leading one. */
  readonly away: -1 | 1;
  readonly width: number;
  readonly small: boolean;
  readonly translation: SharedValue<number>;
  readonly words: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const kind = MOVES[disc.mark]?.kind;
  const thumps = kind === "click";
  const look = small ? SMALL : FULL;
  // How much of this disc's place the row has uncovered, from none to all of it.
  const shown = useDerivedValue(() =>
    interpolate(
      translation.value * away,
      [from + 4, from + width - 12],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  );
  const press = useSharedValue(1);
  const { grow, beat } = usePop(shown, kind);
  const holds = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 2.6),
    transform: [
      // From the screen's edge, inward: the way the row's edge uncovers it.
      { translateX: (1 - shown.value) * 18 * -away },
      { scale: grow.value * press.value * (thumps ? thump(beat.value) : 1) },
    ],
  }));
  // The word follows its disc: it waits for the place to be mostly clear and for the pop to be
  // most of the way out, so a quick thumb never shows a word over a disc still tucked away.
  const says = useAnimatedStyle(() => ({
    opacity: Math.min(
      interpolate(shown.value, [0.45, 0.9], [0, 1], Extrapolation.CLAMP),
      interpolate(grow.value, [0.6, 0.95], [0, 1], Extrapolation.CLAMP),
    ),
    transform: [{ translateY: (1 - shown.value) * 5 }],
  }));
  const size = look.disc;
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPressIn={() => {
        press.value = withTiming(0.86, { duration: 80 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, POP);
      }}
      onPress={onPress}
      testID={testID}
      style={[styles.slot, { width, gap: look.gap }]}
    >
      <Animated.View
        style={[
          styles.disc,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: disc.tone },
          holds,
        ]}
      >
        <Mark name={disc.mark} size={look.mark} color={disc.ink} beat={beat} />
      </Animated.View>
      <Animated.Text
        style={[styles.word, { color: words, fontSize: look.word }, says]}
        numberOfLines={1}
      >
        {disc.word}
      </Animated.Text>
    </Pressable>
  );
}

/** A disc, its mark, the gap under it and its word, on a list's row and on a sheet's shorter one. */
const FULL = { disc: 46, mark: 24, gap: 5, word: TEXT.xs } as const;
const SMALL = { disc: 36, mark: 20, gap: 3, word: TEXT.xs - 1 } as const;

/** 1 as a value rises through `at`, -1 as it falls back under it, 0 otherwise. */
function crossing(now: number, before: number, at: number): -1 | 0 | 1 {
  "worklet";
  if (now >= at && before < at) return 1;
  if (now < at && before >= at) return -1;
  return 0;
}

/**
 * A disc's size and its mark's beat, as the row uncovers it: it pops to its size once half of it
 * is clear and tucks back under the line, and its mark makes its move once all of it is clear,
 * ready to make it again once the row has gone most of the way home.
 */
function usePop(shown: SharedValue<number>, kind: Move | undefined) {
  const grow = useSharedValue(TUCKED);
  // The mark's one move, from 0 to 1. A padlock rests open at 0, so it is open while hidden and
  // shuts as it comes out; the other marks rest the same at either end.
  const beat = useSharedValue(0);
  const duration = kind === undefined ? 0 : BEAT_MS[kind];
  useAnimatedReaction(
    () => shown.value,
    (now, before) => {
      if (before === null) return;
      const half = crossing(now, before, 0.4);
      if (half !== 0) grow.value = withSpring(half > 0 ? 1 : TUCKED, POP);
      if (crossing(now, before, 0.97) > 0) {
        beat.value = 0;
        beat.value = withTiming(1, { duration });
      }
      if (crossing(now, before, 0.25) < 0) beat.value = 0;
    },
  );
  return { grow, beat };
}

type Move = "hop" | "land" | "lift" | "click";

/**
 * Which of a mark's paths moves, about which point of the 24 box, and how. The paths are the
 * marks' own (`ui/icons.ts`), each lid, the shackle and Read's tick a path of its own; the tick
 * drops into its bubble as the shackle drops shut.
 */
const MOVES: Partial<
  Record<
    IconName,
    { readonly part: number; readonly hinge: readonly [number, number]; readonly kind: Move }
  >
> = {
  trash: { part: 0, hinge: [4, 7], kind: "hop" },
  archive: { part: 0, hinge: [3, 6], kind: "land" },
  unarchive: { part: 0, hinge: [3, 6], kind: "lift" },
  lock: { part: 1, hinge: [12, 11], kind: "click" },
  read: { part: 1, hinge: [12, 10], kind: "click" },
  pin: { part: 0, hinge: [12, 9], kind: "click" },
  unpin: { part: 0, hinge: [12, 9], kind: "lift" },
};

const BEAT_MS: Readonly<Record<Move, number>> = { hop: 520, land: 500, lift: 480, click: 380 };

/** How long a mark's one move takes, for a beat run from elsewhere: none, for a mark that has none. */
export function moveMs(name: IconName): number {
  const move = MOVES[name];
  return move === undefined ? 0 : BEAT_MS[move.kind];
}

/** The moving part's turn in degrees and its rise in box units, a beat of the way through. */
function pose(kind: Move, at: number): readonly [number, number] {
  "worklet";
  const curve = (input: number[], output: number[]) =>
    interpolate(at, input, output, Extrapolation.CLAMP);
  switch (kind) {
    case "hop":
      return [
        curve([0, 0.32, 0.64, 0.84, 1], [0, -17, 4, -1.5, 0]),
        curve([0, 0.32, 0.64, 1], [0, -2.6, 0, 0]),
      ];
    case "land":
      return [
        curve([0, 0.25, 0.6, 1], [0, -9, 0, 0]),
        curve([0, 0.25, 0.6, 0.8, 1], [0, -4.5, 0.9, -0.4, 0]),
      ];
    case "lift":
      return [curve([0, 0.35, 1], [0, -6, 0]), curve([0, 0.35, 1], [0, -2, 0])];
    case "click":
      return [0, curve([0, 0.55, 0.8, 1], [-3.4, 0.9, -0.2, 0])];
  }
}

/** The padlock's disc swelling a little as the shackle lands. */
export function thump(at: number): number {
  "worklet";
  return interpolate(at, [0, 0.45, 0.65, 1], [1, 1, 1.16, 1], Extrapolation.CLAMP);
}

/** Box units of room around each part, so a lid lifted clear of the box is not cut off. */
const MARGIN = 4;

/**
 * A mark drawn a path at a time, so one of them can move. The same paths, stroke and box as `Icon`.
 * The bar a picked list acts from wears it too (`SelectMotion.tsx`, ADR 0181).
 */
export function Mark({
  name,
  size,
  color,
  beat,
}: {
  readonly name: IconName;
  readonly size: number;
  readonly color: string;
  readonly beat: SharedValue<number>;
}) {
  const move = MOVES[name];
  const unit = size / ICON_BOX;
  const moving = useAnimatedStyle(() => {
    if (move === undefined) return {};
    const [turn, rise] = pose(move.kind, beat.value);
    // About the hinge rather than the middle: over to it, turn, and back.
    const x = (move.hinge[0] - ICON_BOX / 2) * unit;
    const y = (move.hinge[1] - ICON_BOX / 2) * unit;
    return {
      transform: [
        { translateY: rise * unit },
        { translateX: x },
        { translateY: y },
        { rotate: `${turn}deg` },
        { translateX: -x },
        { translateY: -y },
      ],
    };
  });
  const pad = MARGIN * unit;
  const box = { left: -pad, top: -pad, width: size + 2 * pad, height: size + 2 * pad };
  return (
    <View style={{ width: size, height: size }}>
      {ICONS[name].map((d, index) => (
        <Animated.View key={d} style={[styles.part, box, index === move?.part ? moving : null]}>
          <Svg
            width={box.width}
            height={box.height}
            viewBox={`${-MARGIN} ${-MARGIN} ${ICON_BOX + 2 * MARGIN} ${ICON_BOX + 2 * MARGIN}`}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d={d} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

/** How long a row takes to carry on off its edge, gathering speed as it goes. */
const GO_MS = 280;
/** How far past the edge it goes, so its rounded corner is out of sight too. */
const GO_PAST = 24;

/**
 * How far a row's tray has faded as the row goes (`Going`), for its `Discs` to read: one per row,
 * since the tray is drawn by the swipeable's callback and the row's content is not.
 */
export function useTrayFade(): SharedValue<number> {
  return useSharedValue(0);
}

/**
 * A row's content carrying on off the edge it was pushed towards (ADR 0205's addendum: Arjun's B,
 * "Slide away"), from wherever a swipe left it, gathering speed as it goes; `onGone` once it is
 * off. Its tray fades a beat behind it, so what is left to fold shut is an empty place. Still
 * while `going` is not set, so it wraps every row without moving it.
 */
export function Going({
  going,
  fade,
  onGone,
  children,
}: {
  readonly going: "left" | "right" | undefined;
  readonly fade?: SharedValue<number> | undefined;
  readonly onGone: () => void;
  readonly children: ReactNode;
}) {
  const shift = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable, and onGone is the row's to change
  useEffect(() => {
    if (going === undefined) {
      // Called off, as a move put back by a refusal is: it comes back to where it rests.
      if (shift.value === 0) return;
      shift.value = withTiming(0, { duration: GO_MS, easing: Easing.bezier(0.22, 1, 0.36, 1) });
      if (fade !== undefined) fade.value = withTiming(0, { duration: 180 });
      return;
    }
    const past = Dimensions.get("window").width + GO_PAST;
    shift.value = withTiming(
      (going === "right" ? 1 : -1) * past,
      { duration: GO_MS, easing: Easing.bezier(0.5, 0, 0.75, 0) },
      (finished) => {
        if (finished === true) scheduleOnRN(onGone);
      },
    );
    if (fade !== undefined) fade.value = withDelay(120, withTiming(1, { duration: 180 }));
  }, [going]);
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));
  return <Animated.View style={moved}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  edge: { overflow: "hidden" },
  discs: { flexDirection: "row", paddingHorizontal: INSET },
  trayRight: { position: "absolute", top: 0, bottom: 0, right: 0, left: -REACH },
  trayLeft: { position: "absolute", top: 0, bottom: 0, left: 0, right: -REACH },
  slot: { alignItems: "center", justifyContent: "center" },
  disc: { alignItems: "center", justifyContent: "center" },
  word: { fontWeight: "600" },
  part: { position: "absolute" },
});
