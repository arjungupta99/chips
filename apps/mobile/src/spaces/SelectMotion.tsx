/**
 * What moves while spaces are picked on the Spaces list (ADR 0181; Arjun, 16 October 2026: "I
 * want a batch select option", and from the mock, "Go with your recommendations"):
 *
 * - Each row's words move over for a circle that slides in at its leading edge, the rows a beat
 *   apart from the top, and its chevron fades (`PickRow`, `Fade`). A picked circle pops blue with
 *   its tick; a locked room wears Locked's graphite disc instead, which shakes its shackle when the
 *   row is pressed; a room nothing can be done to wears nothing.
 * - The bar of acts rises where the tab bar stood (`Rise`), and each act's disc lights and makes
 *   its mark's one move as it comes to have something to act on (`ActDisc`), as the swipe's do.
 * - A row archived or deleted folds away (`Fold`), a deleted one after going to dust first, on the
 *   dust Delete for me uses (`ListDust`, `Dust.tsx`).
 * - Read takes the rows' counts away, down the screen a beat a row (`Counted`, `readWave`).
 * - A room moved to another run lands there: its place opens and it slides in from an edge
 *   (`Land`), and Hidden's shut eye blinks as a room comes under it (`Blink`; ADR 0205's addendum).
 * - A room pinned or unpinned stays in its run and changes places in it: its row lifts and glides
 *   there, and the rows it passes glide out of its way (`Glide`; ADR 0240).
 *
 * What is pinned to the row's end — the time, the unread count, the chevron — stays where it is
 * while the face, the name and the last line move over. They move by a transform alone
 * (`Shifted`, `ShiftedText`), and the row is laid out again only when they are still: at the start
 * as the list starts picking, the transform holding them where they were, and at the end as it
 * stops. The first build moved them by the row's padding, a layout on every frame, and every row's
 * one-line name and last line were truncated and drawn again each frame: the simulator's frames
 * took 50 to 80 ms for half a second (Arjun, 16 October 2026: "I am noticing frame drops in the
 * animation when I tap the select button"). The text is never wider than its room: narrowed before
 * the words move over, widened after they have moved back.
 *
 * Reduce Motion lets every spring and timing here jump to its end, which Reanimated does by itself.
 *
 * It is a file of its own because it imports Reanimated, which throws under Jest while it is still
 * being imported; `jest.setup.js` stands plain views in for it, and the tests reach the rows, the
 * bar and the sheets through what they hold. That it moves is the simulator's to show.
 */

import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  type StyleProp,
  StyleSheet,
  type Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  LinearTransition,
  type MeasuredDimensions,
  makeMutable,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { measured } from "../ui/measured";
import { usePalette } from "../ui/theme";
import { SPACE } from "../ui/tokens";
import { type Dust, DustLayer } from "./Dust";
import { Mark, moveMs, thump } from "./SwipeDiscs";
import { actTone } from "./SwipeRow";

/** What a row wears at its leading edge while the list picks. */
export type PickMark = "off" | "on" | "locked" | "none";

/** How far a row's words move over for its circle: the circle, and the gap after it. */
export const LEAD = 38;
const CIRCLE = 24;
/**
 * The rows come over a beat apart, from the top of the screen down: a beat for each row's height,
 * near enough (`List.tsx` draws them 80 points tall). A row is laid out again on its own beat, so
 * no frame lays out more than a row or two: all 29 of his open rooms in one frame took 85 ms on the
 * simulator, a row 3 ms.
 */
const STAGGER_MS = 14;
const ROW_PITCH = 80;
/**
 * The rows off the screen, which nobody sees move, are laid out over or back once those on it have
 * come to rest, nearest first, a row a frame or so. Each is a commit that lays the list out again,
 * and taken on their beats as the rows on the screen moved, nearly every frame of the motion had
 * one (the simulator, 31 October 2026).
 */
const UNSEEN_AFTER_MS = 650;
const UNSEEN_MS = 10;
/** Where the first row stands under the screen's name, near enough, which comes over at once. */
const LIST_TOP = 100;
/** The words moving over: a little past and back, as a list's edit mode does. */
const SHIFT = { stiffness: 380, damping: 30, mass: 1 } as const;
/** A circle picked, and a disc lit: quick, and a little past its size. */
const POP = { stiffness: 640, damping: 21, mass: 1 } as const;
/** The bar rising, and a note over it. */
const RISE = { stiffness: 420, damping: 32, mass: 1 } as const;
/** How far below its place the bar starts, out of sight under the foot of the screen. */
const DROP = 120;
const FOLD_MS = 300;
/** How far a row that can't be picked fades while the list picks. */
const UNPICKABLE = 0.55;

/**
 * How far a row's words stand from where the row lays them out, while they move over or back:
 * what `Shifted` and `ShiftedText` move by. Nothing outside a `PickRow`.
 */
const Shift = createContext<SharedValue<number> | undefined>(undefined);

/**
 * Whether the list is picking, for what moves in its rows as it starts and stops (`usePickMotion`):
 * set as the list draws Select's change, and followed on the UI thread, so no row is drawn again
 * for its words to move over or its chevron to fade. Each row drawn again for it was most of the
 * JavaScript of a tap on Select, 90 of its 120 ms, and its mount fell in the motion's first frames
 * (the simulator, 31 October 2026). A row without one follows its own `picking`.
 */
export const PickMotion = createContext<SharedValue<boolean> | undefined>(undefined);

/** What a list's `PickMotion` holds: whether it is picking, from the draw that says so. */
export function usePickMotion(picking: boolean): SharedValue<boolean> {
  const motion = useSharedValue(picking);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useLayoutEffect(() => {
    motion.value = picking;
  }, [picking]);
  return motion;
}

/**
 * How long after the list starts or stops picking its rows are drawn again for it: what a press on
 * one does, what a screen reader calls it, whether it can be pushed aside. By then the rows have
 * come to rest, and the mount of fifty of them falls in no frame that moves. A press in the
 * meantime asks the list, not the row (`List.tsx`).
 */
export const ROWS_REDRAWN_MS = 700;

/** Whether the list is picking, as its `PickMotion` says, or as `picking` says without one. */
function usePicking(picking: boolean): SharedValue<boolean> {
  const motion = useContext(PickMotion);
  const own = useSharedValue(picking);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    own.value = picking;
  }, [picking]);
  return motion ?? own;
}

/**
 * A row of the list, its words moved over by `LEAD` while the list picks, with what it wears at
 * its leading edge. `edge` is the row's own leading padding, which the circle stands in. What
 * moves over is what the row wraps in `Shifted` or `ShiftedText`; the rest stays.
 */
export function PickRow({
  picking,
  mark,
  dim,
  shake,
  edge,
  line,
  style,
  children,
}: {
  readonly picking: boolean;
  /** Kept as the list stops picking, so the circle slides out rather than vanishing. */
  readonly mark: PickMark;
  /** It can't be picked, and steps back while the list picks. */
  readonly dim: boolean;
  /** Goes up by one each time a row that cannot be picked is pressed. */
  readonly shake: number;
  readonly edge: number;
  /** The hairline over the row, from where the words start, which moves over with them. */
  readonly line?: { readonly color: string; readonly inset: number } | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  // Where the words are seen, from 0 (home) to 1 (over), and where the row lays them out, which
  // is one or the other: laid over before they move over, and home once they are back.
  const shown = useSharedValue(picking ? 1 : 0);
  const laid = useSharedValue(picking ? 1 : 0);
  const wobble = useSharedValue(0);
  const row = useAnimatedRef<View>();
  const source = usePicking(picking);
  const screen = Dimensions.get("window").height;
  // On the UI thread, where the row is asked where it stands, and where the frame that lays it out
  // over is the frame that holds its words where they were.
  useAnimatedReaction(
    () => source.value,
    (now, was) => {
      if (was !== null) {
        if (now !== was) moveRow(now, measured(row), screen, shown, laid);
        return;
      }
      // First asked as it is drawn: as the list is, at once.
      const to = now ? 1 : 0;
      if (shown.value !== to) {
        shown.value = to;
        laid.value = to;
      }
    },
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (shake === 0) return;
    wobble.value = withSequence(
      withTiming(-7, { duration: 70 }),
      withTiming(6, { duration: 80 }),
      withTiming(-3, { duration: 80 }),
      withTiming(1.5, { duration: 80 }),
      withTiming(0, { duration: 90 }),
    );
  }, [shake]);
  const shift = useDerivedValue(() => (shown.value - laid.value) * LEAD);
  // A layout, but only as the words come to rest at one end or the other.
  const moved = useAnimatedStyle(() => ({ paddingLeft: edge + laid.value * LEAD }));
  const lead = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, shown.value * 1.6)),
    transform: [{ translateX: (shown.value - 1) * LEAD }],
  }));
  // Laid out from where the name starts at home and carried over; the row clips what passes its
  // end.
  const hairline = useAnimatedStyle(() => ({
    transform: [{ translateX: shown.value * LEAD }],
  }));
  const shaken = useAnimatedStyle(() => ({ transform: [{ translateX: wobble.value }] }));
  // A row that can't be picked steps back while the list picks: what can be picked is what reads.
  // Apart from the shake's transform, which is a new array each frame: a row that can be picked
  // answers the same opacity every frame, which Reanimated then leaves alone.
  const stepped = useAnimatedStyle(() => ({ opacity: dim ? 1 - shown.value * UNPICKABLE : 1 }));
  return (
    <Animated.View ref={row} style={[style, moved]}>
      {line === undefined ? null : (
        <Animated.View
          style={[styles.line, { backgroundColor: line.color, left: edge + line.inset }, hairline]}
        />
      )}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.lead, { left: edge }, lead]}
      >
        <Circle mark={mark} shake={shake} />
      </Animated.View>
      <Shift.Provider value={shift}>
        <Animated.View style={[styles.words, shaken, stepped]}>{children}</Animated.View>
      </Shift.Provider>
    </Animated.View>
  );
}

/**
 * How long a row waits to come over, or go back: from the top of the screen down, a beat a row,
 * and those off the screen once the rest have come to rest, by how far off they are, above it as
 * far as below it.
 */
function beatFor(y: number, height: number, screen: number, unseen: boolean): number {
  "worklet";
  if (!unseen) return (Math.max(0, y - LIST_TOP) / ROW_PITCH) * STAGGER_MS;
  const away = y > screen ? y - screen : -(y + height);
  return UNSEEN_AFTER_MS + (away / ROW_PITCH) * UNSEEN_MS;
}

/**
 * A row's words moving over as the list starts picking, or back as it stops, from where the row
 * stands (`at`): laid out over before they move over, and home once they are back. Below
 * `beatFor`: a worklet keeps the worklets it calls as the module has them where it is defined.
 */
function moveRow(
  now: boolean,
  at: MeasuredDimensions | null,
  screen: number,
  shown: SharedValue<number>,
  laid: SharedValue<number>,
) {
  "worklet";
  // A row off the screen is not seen to move: on its beat it is laid out and shown over or back at
  // once, rather than be one more spring that every frame commits. Every row on a spring,
  // Reanimated's commit on each frame was most of the main thread's work while the list moved (the
  // simulator, 16 October 2026).
  const unseen = at !== null && (at.pageY > screen || at.pageY + at.height < 0);
  const wait = at === null ? 0 : beatFor(at.pageY, at.height, screen, unseen);
  const jump = { duration: 0 };
  if (now) {
    laid.value = withDelay(wait, withTiming(1, jump));
    shown.value = withDelay(wait, unseen ? withTiming(1, jump) : withSpring(1, SHIFT));
    return;
  }
  if (unseen) {
    shown.value = withDelay(wait, withTiming(0, jump));
    laid.value = withDelay(wait, withTiming(0, jump));
    return;
  }
  shown.value = withDelay(
    wait,
    withSpring(0, SHIFT, (finished) => {
      if (finished === true) laid.value = 0;
    }),
  );
}

/** What moves over with a picking row's words: its face, and its last line. */
export function Shifted({
  style,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const shifted = useShifted();
  return <Animated.View style={[style, shifted]}>{children}</Animated.View>;
}

/** A picking row's words that move over with it: its name. */
export function ShiftedText({ style, ...props }: ComponentProps<typeof Text>) {
  const shifted = useShifted();
  return <Animated.Text {...props} style={[style, shifted]} />;
}

function useShifted() {
  const shift = useContext(Shift);
  return useAnimatedStyle(() => ({
    transform: [{ translateX: shift === undefined ? 0 : shift.value }],
  }));
}

/** The circle, picked or not, or Locked's disc. */
function Circle({ mark, shake }: { readonly mark: PickMark; readonly shake: number }) {
  const palette = usePalette();
  const on = useSharedValue(mark === "on" ? 1 : 0);
  const pop = useSharedValue(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    on.value = withTiming(mark === "on" ? 1 : 0, { duration: mark === "on" ? 90 : 160 });
    if (mark !== "on") return;
    pop.value = 0.7;
    pop.value = withSpring(1, POP);
  }, [mark]);
  const filled = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: pop.value }],
  }));
  if (mark === "none") return null;
  if (mark === "locked") return <Padlock shake={shake} />;
  return (
    <View style={[styles.circle, { borderColor: palette.ink4 }]}>
      <Animated.View style={[styles.fill, { backgroundColor: palette.blue }, filled]}>
        <Icon name="check" size={15} color="#ffffff" weight={2.6} />
      </Animated.View>
    </View>
  );
}

/** Locked's graphite disc (ADR 0178): its shackle lifts and clicks shut when the row is pressed. */
function Padlock({ shake }: { readonly shake: number }) {
  const palette = usePalette();
  // A padlock rests shut at the end of its beat, and opens at its start (`SwipeDiscs.tsx`).
  const beat = useSharedValue(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (shake === 0) return;
    beat.value = 0;
    beat.value = withTiming(1, { duration: moveMs("lock") });
  }, [shake]);
  const thumped = useAnimatedStyle(() => ({ transform: [{ scale: thump(beat.value) }] }));
  return (
    <Animated.View
      style={[
        styles.circle,
        styles.padlock,
        { backgroundColor: actTone("locked", palette) },
        thumped,
      ]}
    >
      <Mark name="lock" size={14} color="#ffffff" beat={beat} />
    </Animated.View>
  );
}

/** What fades as the list starts picking, and back as it stops: a row's chevron. */
export function Fade({
  shown,
  children,
}: {
  /** Shown while the list does not pick, without a `PickMotion` to follow. */
  readonly shown: boolean;
  readonly children: ReactNode;
}) {
  const at = useSharedValue(shown ? 1 : 0);
  const picking = usePicking(!shown);
  useAnimatedReaction(
    () => picking.value,
    (now, was) => {
      if (was === null) at.value = now ? 0 : 1;
      else if (now !== was) at.value = withTiming(now ? 0 : 1, { duration: 180 });
    },
  );
  const faded = useAnimatedStyle(() => ({ opacity: at.value }));
  return <Animated.View style={faded}>{children}</Animated.View>;
}

/**
 * What steps back while the list picks, as a row that can't be picked does, and takes no presses
 * till it stops: on the Agents tab, the harnesses and the rows that open other pages (ADR 0182).
 */
export function StepBack({
  back,
  children,
}: {
  readonly back: boolean;
  readonly children: ReactNode;
}) {
  const at = useSharedValue(back ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    at.value = withTiming(back ? 1 : 0, { duration: 180 });
  }, [back]);
  const faded = useAnimatedStyle(() => ({ opacity: 1 - at.value * UNPICKABLE }));
  return (
    <Animated.View pointerEvents={back ? "none" : "auto"} style={faded}>
      {children}
    </Animated.View>
  );
}

/**
 * What rises from under the foot of the screen while `shown`, and sinks back: the bar of acts, and
 * a note over it. There from the render that shows it, so it rises from the start of its spring;
 * gone once it has sunk.
 */
export function Rise({
  shown,
  style,
  children,
}: {
  readonly shown: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const { at, there } = useRisen(shown);
  const risen = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, at.value * 2)),
    transform: [{ translateY: (1 - at.value) * DROP }],
  }));
  if (!there) return null;
  return (
    <Animated.View pointerEvents={shown ? "box-none" : "none"} style={[style, risen]}>
      {children}
    </Animated.View>
  );
}

/**
 * The band of blur behind the bar, risen with it from under the foot of the screen by its own
 * height, and sunk back: moved, never faded, as a blur must be (`Glass.tsx`). It stands where the
 * tab bar's own edge of blur stood (Arjun, 16 October 2026: "a blur bar needs to show below the
 * archive and delete buttons at the bottom (similar to nav)").
 */
export function RiseBehind({
  shown,
  height,
  children,
}: {
  readonly shown: boolean;
  readonly height: number;
  readonly children: ReactNode;
}) {
  const { at, there } = useRisen(shown);
  // Never past its place: a spring a little over would lift it off the foot of the screen.
  const risen = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, 1 - at.value) * height }],
  }));
  if (!there) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.behind, { height }, risen]}>
      {children}
    </Animated.View>
  );
}

/**
 * Room under a list's last row for the bar, opened as it rises and shut as it sinks, so a list
 * scrolled to its end is not pulled down in a frame as the bar goes. `gap` is the list's own gap
 * between its children, which this takes back.
 *
 * Its height is a layout, which on every frame of the bar's spring laid out the whole list again
 * and walked every view of it (the simulator, 31 October 2026). So it opens and shuts on the spring
 * only where it is seen, at the list's end; below the foot of the screen, as it is in any list
 * longer than the screen, it opens or shuts at once.
 */
export function RiseRoom({
  shown,
  height,
  gap,
}: {
  readonly shown: boolean;
  readonly height: number;
  readonly gap: number;
}) {
  const at = useSharedValue(shown ? 1 : 0);
  const [there, setThere] = useState(shown);
  const room = useAnimatedRef<View>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (shown) setThere(true);
    const screen = Dimensions.get("window").height;
    const done = (finished?: boolean) => {
      "worklet";
      if (finished === true && !shown) scheduleOnRN(setThere, false);
    };
    scheduleOnUI(() => {
      "worklet";
      const placed = measured(room);
      const to = shown ? 1 : 0;
      at.value =
        placed !== null && placed.pageY > screen
          ? withTiming(to, { duration: 0 }, done)
          : withSpring(to, RISE, done);
    });
  }, [shown]);
  const open = useAnimatedStyle(() => ({ height: Math.max(0, height * at.value) }));
  if (!(there || shown)) return null;
  return <Animated.View ref={room} pointerEvents="none" style={[{ marginTop: -gap }, open]} />;
}

/** The bar's spring, up while `shown`, and whether it is there at all, sinking included. */
function useRisen(shown: boolean) {
  const at = useSharedValue(shown ? 1 : 0);
  const [there, setThere] = useState(shown);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (shown) setThere(true);
    at.value = withSpring(shown ? 1 : 0, RISE, (finished) => {
      if (finished === true && !shown) scheduleOnRN(setThere, false);
    });
  }, [shown]);
  return { at, there: there || shown };
}

/**
 * An act's disc on the bar: grey while the act has nothing to act on, its colour once it has, and
 * then a pop and its mark's one move, as the swipe's discs make theirs.
 */
export function ActDisc({
  name,
  tone,
  ink = "#ffffff",
  live,
  size,
}: {
  readonly name: IconName;
  readonly tone: string;
  /** The mark's colour on the lit disc: white, but for Read's gold, which wears the count's ink. */
  readonly ink?: string | undefined;
  readonly live: boolean;
  readonly size: number;
}) {
  const palette = usePalette();
  const beat = useSharedValue(1);
  const grow = useSharedValue(1);
  const was = useRef(live);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (live && !was.current) {
      grow.value = 0.8;
      grow.value = withSpring(1, POP);
      beat.value = 0;
      beat.value = withTiming(1, { duration: moveMs(name) });
    }
    was.current = live;
  }, [live]);
  const grown = useAnimatedStyle(() => ({ transform: [{ scale: grow.value }] }));
  return (
    <Animated.View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: live ? tone : palette.surface3,
        },
        grown,
      ]}
    >
      <Mark
        name={name}
        size={Math.round(size * 0.55)}
        color={live ? ink : palette.ink4}
        beat={beat}
      />
    </Animated.View>
  );
}

/**
 * The rows' counts being read away, by Read all or Read on picked rows (ADR 0181 addendum, 18
 * October 2026): each count swells a little and shrinks to nothing, down the screen a beat a row,
 * as the rows come back from picking, and only then does its row close up over the room it held.
 * A count that goes any other way — its room opened beside the list, on an iPad — goes at once,
 * with no wait for where it stands.
 *
 * The count keeps its room while it goes. Left to Reanimated's exit, a count was taken out of the
 * row at once and drawn over it as it went: the time moved under it, and the last line widened
 * only after it had gone (the simulator, 18 October 2026). Where it stands, for its beat, is asked
 * on the UI thread as it starts to go, while it is still there.
 */
const waving = makeMutable(false);
let waveEnds: ReturnType<typeof setTimeout> | undefined;

/** How long after the row above a row's count goes, in a wave, and how many rows' worth at most. */
const WAVE_MS = 40;
const WAVE_ROWS = 12;
/** How long the counts that go are taken to be the wave's: past the render that takes them. */
const WAVE_HOLD_MS = 800;

/** The counts that go next go as a wave: call it just before reading the rooms. */
export function readWave() {
  waving.value = true;
  clearTimeout(waveEnds);
  waveEnds = setTimeout(() => {
    waving.value = false;
  }, WAVE_HOLD_MS);
}

/**
 * A row's unread count, drawn by `children`, which swells and goes when it falls to none
 * (`readWave`), keeping its room in the row until it has.
 */
export function Counted({
  count,
  children,
}: {
  readonly count: number;
  readonly children: (count: number) => ReactNode;
}) {
  // What is drawn: the count, or the last one there was while it goes; none once it has gone.
  const [shown, setShown] = useState(count);
  if (count > 0 && count !== shown) setShown(count);
  const now = useRef(count);
  now.current = count;
  const ref = useAnimatedRef<View>();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const going = count === 0 && shown > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (!going) {
      // Back before it had gone: as it was.
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    const gone = () => {
      if (now.current === 0) setShown(0);
    };
    scheduleOnUI(() => {
      "worklet";
      // Where it stands says how far down the wave it goes: the top of the screen first.
      const y = measured(ref)?.pageY;
      const rows = y === undefined ? 0 : (y - LIST_TOP) / ROW_PITCH;
      const delay = waving.value ? Math.min(WAVE_ROWS, Math.max(0, rows)) * WAVE_MS : 0;
      opacity.value = withDelay(delay + 120, withTiming(0, { duration: 200 }));
      scale.value = withDelay(
        delay,
        withSequence(
          withTiming(1.14, { duration: 100, easing: Easing.out(Easing.quad) }),
          withTiming(0.2, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
            if (finished === true) scheduleOnRN(gone);
          }),
        ),
      );
    });
  }, [going]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  if (shown === 0) return null;
  return (
    <Animated.View ref={ref} style={style}>
      {children(shown)}
    </Animated.View>
  );
}

/**
 * A row on its way out of the list, folding shut once `folding` is set: archived, or gone to dust
 * after a delete, or moved to another run (ADR 0205's addendum); and a heading with its last row.
 * `onFolded` when it has; the list lets go of it then.
 */
export function Fold({
  folding,
  onFolded,
  children,
}: {
  readonly folding: boolean;
  readonly onFolded: () => void;
  readonly children: ReactNode;
}) {
  const tall = useSharedValue(0);
  const open = useSharedValue(1);
  const shut = useSharedValue(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (!folding) {
      // Called off part way, as a move put back by a refusal is (ADR 0205's addendum): it opens
      // again, and lets go of its height once it has.
      if (!shut.value) return;
      open.value = withTiming(1, { duration: FOLD_MS }, (finished) => {
        if (finished === true) shut.value = false;
      });
      return;
    }
    shut.value = true;
    open.value = withTiming(
      0,
      { duration: FOLD_MS, easing: Easing.bezier(0.3, 0, 0.2, 1) },
      (finished) => {
        if (finished === true) scheduleOnRN(onFolded);
      },
    );
  }, [folding]);
  const folded = useAnimatedStyle(() =>
    shut.value ? { height: tall.value * open.value, opacity: Math.min(1, open.value * 1.5) } : {},
  );
  return (
    <Animated.View
      style={[styles.fold, folded]}
      onLayout={(event) => {
        if (!shut.value) tall.value = event.nativeEvent.layout.height;
      }}
    >
      {children}
    </Animated.View>
  );
}

/** How long a heading's chevron takes to turn. */
const TURN_MS = 240;

/**
 * A heading's chevron, turned down while what it heads is shown and back while it is not: Hidden
 * and Archived at the foot of the Spaces list (ADR 0205), which said Show and Hide before Hidden
 * came and made "Hide" an order. Reduce Motion lets it jump, as Reanimated does by itself.
 */
export function Turned({
  down,
  children,
}: {
  readonly down: boolean;
  readonly children: ReactNode;
}) {
  const turn = useSharedValue(down ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    turn.value = withTiming(down ? 1 : 0, {
      duration: TURN_MS,
      easing: Easing.bezier(0.3, 0, 0.2, 1),
    });
  }, [down]);
  const turned = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  return <Animated.View style={turned}>{children}</Animated.View>;
}

/** How long a landing row takes to slide in from its edge, and how long after its place starts to open. */
const LAND_MS = 440;
const LAND_AFTER_MS = 140;

/**
 * A row landing in a run (ADR 0205's addendum: Arjun's B, "Slide away"): its place opens from
 * nothing as the row it left folds shut, and it slides in from `from`'s edge a beat after, on the
 * curve a pushed screen settles on; `onLanded` once it has. "open" only opens its place, for a
 * heading coming with its first row. What it is told at its first draw is what it does, so a row
 * is never landed twice, and one told nothing is drawn as it is.
 */
export function Land({
  from: told,
  onLanded,
  children,
}: {
  readonly from: "left" | "right" | "open" | undefined;
  readonly onLanded?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const [from] = useState(told);
  // Landed, its place lets go of the motion's styles. What Reanimated last set stays on the view
  // all the same (a style taken away leaves its last values behind), so the motion has to end on
  // the row's own height: measured lifted out of the run while it lands, where the place opening
  // round it, nothing tall at first, can't squeeze it to nothing too.
  const [landed, setLanded] = useState(from === undefined);
  const tall = useSharedValue(0);
  const open = useSharedValue(0);
  const shift = useSharedValue(from === "left" ? -1 : from === "right" ? 1 : 0);
  const width = useMemo(() => Dimensions.get("window").width, []);
  const started = useRef(false);
  const finish = () => {
    setLanded(true);
    onLanded?.();
  };
  const begin = (height: number) => {
    tall.value = height;
    if (started.current || landed) return;
    started.current = true;
    open.value = withTiming(
      1,
      { duration: FOLD_MS, easing: Easing.bezier(0.3, 0, 0.2, 1) },
      (finished) => {
        if (finished === true && from === "open") scheduleOnRN(finish);
      },
    );
    if (from === "open") return;
    shift.value = withDelay(
      LAND_AFTER_MS,
      withTiming(0, { duration: LAND_MS, easing: Easing.bezier(0.22, 1, 0.36, 1) }, (finished) => {
        if (finished === true) scheduleOnRN(finish);
      }),
    );
  };
  const place = useAnimatedStyle(() => ({
    height: tall.value * open.value,
    opacity: Math.min(1, open.value * 1.5),
  }));
  const slid = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value * width }] }));
  // The same two views either way, so what it holds is never drawn afresh as it lands.
  return (
    <Animated.View style={landed ? undefined : [styles.fold, place]}>
      <Animated.View
        style={landed ? undefined : [styles.lifted, slid]}
        onLayout={landed ? undefined : (event) => begin(event.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** How long Hidden's shut eye takes to blink as a room comes under it. */
const BLINK_MS = 420;

/**
 * How a pinned row and the rows it passes glide to their places (ADR 0240): a spring a little
 * softer than a swiped row's, so a row going the length of the list is seen going.
 */
const GLIDE = LinearTransition.springify().mass(1).stiffness(260).damping(26);

/** The lift a row glides on: quick up, and settling as it lands. */
const LIFT = { stiffness: 420, damping: 30, mass: 1 } as const;

/**
 * A row of the open run, which glides when a pin moves it (ADR 0240; Arjun, 27 October 2026, of
 * the mock: "Go with A"). Armed, a change of its place is a layout transition rather than a jump;
 * the list arms the run only while a pin moves it, so nothing else it does glides, and a row
 * folding or landing keeps its own motion. The row the pin is for lifts as it goes: a little
 * larger, on a shadow, over the rows it passes. The lift is a style that stays on, at rest when it
 * is down, since a Reanimated style taken away leaves its last values behind.
 */
export function Glide({
  armed,
  lifted,
  ground,
  children,
}: {
  readonly armed: boolean;
  readonly lifted: boolean;
  /** The page's colour, which the lifted row's shadow is cast from. */
  readonly ground: string;
  readonly children: ReactNode;
}) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withSpring(lifted ? 1 : 0, LIFT);
  }, [lifted, lift]);
  const raised = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.02 * lift.value }],
    shadowOpacity: 0.2 * lift.value,
    elevation: 8 * lift.value,
  }));
  return (
    <Animated.View
      {...(armed ? { layout: GLIDE } : {})}
      style={[styles.glide, lifted ? { zIndex: 1, backgroundColor: ground } : null, raised]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A heading's mark blinking as a room comes under it: larger for a moment, and back (ADR 0205's
 * addendum). Only when `count` grows past what it was, never as the list is first drawn.
 */
export function Blink({
  count,
  children,
}: {
  readonly count: number;
  readonly children: ReactNode;
}) {
  const was = useRef(count);
  const size = useSharedValue(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (count > was.current) {
      size.value = withSequence(
        withTiming(1.45, { duration: BLINK_MS * 0.35, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: BLINK_MS * 0.65, easing: Easing.bezier(0.3, 0, 0.2, 1) }),
      );
    }
    was.current = count;
  }, [count]);
  const sized = useAnimatedStyle(() => ({ transform: [{ scale: size.value }] }));
  return <Animated.View style={sized}>{children}</Animated.View>;
}

/**
 * How many specks the rows deleted together share: one row breaks as a bubble does, and several
 * share this many, so no frame moves many more views than one bubble's dust and a half.
 */
const LIST_SPECKS = 330;

/**
 * The list's layer for dust (`Dust.tsx`), over the rows: they have no colour field under them, so
 * the specks wear each row's own colours and the glass it gives is nowhere.
 */
export function ListDust({ dust }: { readonly dust: Dust }) {
  const viewportTop = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  const field = useMemo(() => ({ viewportTop, viewportHeight }), []);
  return <DustLayer dust={dust} field={field} budget={LIST_SPECKS} />;
}

const styles = StyleSheet.create({
  glide: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowRadius: 18 },
  line: { position: "absolute", top: 0, right: 0, height: StyleSheet.hairlineWidth },
  lead: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  // The row's own run: face, words, count, chevron, a gap apart as they were before (`List.tsx`).
  words: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.md },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 1.75,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    top: -1.75,
    left: -1.75,
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  padlock: { borderWidth: 0 },
  disc: { alignItems: "center", justifyContent: "center" },
  fold: { overflow: "hidden" },
  behind: { position: "absolute", left: 0, right: 0, bottom: 0 },
  // A landing row, out of the run while its place opens round it (`Land`).
  lifted: { position: "absolute", top: 0, left: 0, right: 0 },
});
