/**
 * The "Create new space" window, grown out of the + (`NewSpace.tsx` holds what it is for).
 *
 * One glass view over everything, poured out of the + on two springs, across and up, a little out
 * of step, with the keyboard rising under it and the list behind dimmed. Neither spring carries
 * past the card: the window's overshoot stretched it a line taller and back again as it came to
 * rest, which read as the card breathing in and out (24 September 2026). It pours as the keyboard
 * starts to rise, not as the + is tapped: the phone takes a tenth of a second or so to bring a
 * keyboard up, the screen draws nothing while it does, and a pour begun at the tap lost its first
 * frames to that and came out of the + in two jumps (24 September 2026). It is laid out once, the
 * size of the screen, and what is seen of it is cut by clips that only move (`geometry.ts`), so
 * no frame of it is a layout (ADR 0061). Its words are laid out once at their full size and fade
 * in, so nothing in it reflows as it grows. The gold of the + fades out of it as it grows and back
 * into it as it folds away.
 *
 * A send makes the room by its name (ADR 0148, ADR 0149): the words are its name, and nothing is
 * said in it until the person says it there, so they have no bubble to fly to. The window fills
 * the screen, the room is made and opened under it once it has all but covered it, and the window
 * dissolves into the room once it has and the room has drawn itself, with the name already in the
 * room's capsule. With Reduce Motion on it only fades, in and out. The words flew to the room's
 * first bubble while the + sent them as the first message, until 10 October 2026.
 *
 * The springs and the delays are the approved mock's (`docs/proposals/new-space-mocks.html`,
 * FIG 1), transcribed from its stiffness and damping.
 *
 * On an iPad (ADR 0177) a send fills the half beside the list, where the room opens, with square
 * corners, rather than the whole screen (`fillRect`). The card is a card's width rather than across
 * the screen, and hangs under the gold + at the top of the window that it pours out of, which keeps
 * a ring while it is up; it stands on the keys only if they would come over it (ADR 0256,
 * `cardUnder`). It stood in the middle at the foot, and poured down across the whole window to get
 * there. A turned iPad moves the +, and the window follows it (`useFollowed`).
 */

import type { Participant } from "@chipschat/core";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  type DerivedValue,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Path, Svg } from "react-native-svg";
import { type Seen, type SheetFrom, watch } from "../ui/beside";
import { useChrome } from "../ui/chrome";
import { type Duo, pageOffFold, useDuo } from "../ui/duo";
import { useGlassy, useLiquid } from "../ui/Glass";
import { alpha } from "../ui/glassDial";
import { useLayout } from "../ui/layout";
import { useEscape } from "../ui/menuBar";
import { pagesOf } from "../ui/Split";
import { RAIL_WIDTH } from "../ui/TabBar";
import { usePalette, useScheme } from "../ui/theme";
import { useReduceMotion } from "../ui/useReduceMotion";
import {
  cardAcross,
  cardTop,
  cardUnder,
  clamp01,
  clipsFor,
  fillRect,
  type Rect,
  windowRect,
} from "./geometry";
import { PLUS_TINT, usePlusGlass } from "./Plus";
import { CARD_INSET, Field, Head, INK } from "./Words";

export type Stage =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly from: Rect }
  | { readonly kind: "closing"; readonly from: Rect }
  | { readonly kind: "sending"; readonly from: Rect }
  | { readonly kind: "lifting"; readonly from: Rect };

export interface WindowProps {
  readonly stage: Exclude<Stage, { readonly kind: "closed" }>;
  /** The + it was opened from, followed when the window turns; its place at the press is `from`. */
  readonly plus?: SheetFrom | undefined;
  readonly harnesses: readonly Participant[];
  /** Who will be in the room: the first is asked for it, and the rest are added beside it. */
  readonly picked: readonly Participant[];
  /** Empty is picked: nobody is asked, and the words name the room (ADR 0148). */
  readonly empty: boolean;
  readonly onChoose: (harnessId: string) => void;
  /** The lead's name tapped, with several picked: the next one picked leads. */
  readonly onLead: () => void;
  readonly draft: string;
  readonly onDraft: (text: string) => void;
  readonly onClose: () => void;
  readonly onSend: (text: string) => void;
  /** The window has filled the screen on a send: the room can come in under it now, unseen. */
  readonly onCovered: () => void;
  /**
   * The room under the window has drawn itself, or has been waited for long enough
   * (`NewSpace.tsx`): the window dissolves into it only then.
   */
  readonly drawn: boolean;
  /** The window has dissolved into the room. */
  readonly onRevealed: () => void;
  /** Gone: folded into the +, or lifted off the room. */
  readonly onDone: () => void;
}

/** Between the card and the screen's sides, and the keyboard under it. */
const GAP = 10;
/** The least a card hung under an iPad's + stands off the window's edges: the mock's. */
const EDGE = 16;
/** The ring the + keeps while its window is up on an iPad, and the page's colour between them. */
const RING = 2;
const RING_GAP = 3;
/** The card's corner, and the whole screen's at the end of a send: a phone's own. */
const CORNER = 30;
const SCREEN_CORNER = 56;
/** The corner at the end of a send on an iPad: none, since what it fills is the half beside the list. */
const PANE_CORNER = 0;

/**
 * How long the pour waits for a keyboard before it goes without one: none is coming when a
 * hardware keyboard is attached. A keyboard that is coming has started to rise well within it.
 */
const KEYBOARD_WAIT_MS = 300;
/**
 * The mock's springs: stiffness and damping, over a mass of one. The two that open it are damped
 * all the way, so they come to the card and stop there, and stiffer than the mock's so they get
 * there as soon: they were the mock's 250/24 and 185/20, which carried two per cent past it.
 */
const OPEN_ACROSS = { stiffness: 420, damping: 41, mass: 1 } as const;
const OPEN_DOWN = { stiffness: 320, damping: 36, mass: 1 } as const;
const CLOSE_ACROSS = { stiffness: 300, damping: 28, mass: 1 } as const;
const CLOSE_DOWN = { stiffness: 260, damping: 25, mass: 1 } as const;
const SEND_ACROSS = { stiffness: 210, damping: 24, mass: 1 } as const;
const SEND_DOWN = { stiffness: 165, damping: 21, mass: 1 } as const;
/**
 * How far into the fill the room is made and opened under the window: where the page it becomes
 * is solid. The phone takes a third of a second or so to build it, and the window has all but
 * stopped by the time it drops the frames that takes.
 */
const COVERED = 0.65;
/** How far into the fill the room is dissolved into: the screen all but covered. */
const FILLED = 0.97;
/**
 * How near the + the folding window is, as a share of the way from it, when it dissolves into the
 * + rather than being taken away on top of it; and how long it takes, coming the rest of the way
 * as it does. The window and the + are both glass tinted gold and not the same glass — the one cut
 * out of a pane the size of the screen, the other drawing its own rim, and the + seen through the
 * window — and the one taken away to leave the other, once the window's spring had come to rest,
 * was seen as the window stopping short of a circle and then snapping to one (Arjun, 25 September
 * 2026).
 */
const HOME = 0.05;
const MELT_MS = 150;
/** The window dissolving into the room. */
const REVEAL_MS = 220;
const FADE_MS = 200;
const EASE = Easing.bezier(0.3, 0.8, 0.3, 1);

interface Values {
  readonly across: SharedValue<number>;
  readonly down: SharedValue<number>;
  /** Whether the window is folding back into the +, which brings the gold back. */
  readonly folding: SharedValue<number>;
  readonly spin: SharedValue<number>;
  readonly scrim: SharedValue<number>;
  readonly shown: SharedValue<number>;
  readonly rise: SharedValue<number>;
  /** Reduce Motion's fade, in and out; one otherwise. */
  readonly seen: SharedValue<number>;
  /** The window dissolving into the room under it on a send, or into the + as it folds. */
  readonly away: SharedValue<number>;
  readonly keyboard: SharedValue<number>;
  readonly cardHeight: SharedValue<number>;
  /** One from a send until the window has gone. */
  readonly sent: SharedValue<number>;
  /** One from the tap until the pour begins, with the keyboard or without it. */
  readonly waiting: SharedValue<number>;
  /** The window has covered the screen on a send, and said so once. */
  readonly covered: SharedValue<number>;
  /** One once the room under it has drawn itself (`WindowProps.drawn`). */
  readonly drawn: SharedValue<number>;
}

function useValues(): Values {
  const across = useSharedValue(0);
  const down = useSharedValue(0);
  const folding = useSharedValue(0);
  const spin = useSharedValue(0);
  const scrim = useSharedValue(0);
  const shown = useSharedValue(0);
  const rise = useSharedValue(8);
  const seen = useSharedValue(1);
  const away = useSharedValue(0);
  const keyboard = useSharedValue(0);
  const cardHeight = useSharedValue(0);
  const sent = useSharedValue(0);
  const waiting = useSharedValue(0);
  const covered = useSharedValue(0);
  const drawn = useSharedValue(0);
  // One object for the life of the window: the stages' effects start springs when it changes.
  return useMemo(
    () => ({
      across,
      down,
      folding,
      spin,
      scrim,
      shown,
      rise,
      seen,
      away,
      keyboard,
      cardHeight,
      sent,
      waiting,
      covered,
      drawn,
    }),
    [
      across,
      down,
      folding,
      spin,
      scrim,
      shown,
      rise,
      seen,
      away,
      keyboard,
      cardHeight,
      sent,
      waiting,
      covered,
      drawn,
    ],
  );
}

export function Window(props: WindowProps) {
  const { stage } = props;
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const still = useReduceMotion();
  const values = useValues();
  const input = useRef<TextInput>(null);
  useKeyboard(values);
  useMotion(props, values, input, still);
  useBack(stage.kind === "open", props.onClose);
  useEscape(stage.kind === "open", props.onClose);

  const { across, down, keyboard, cardHeight } = values;
  const from = useFollowed(props.plus, stage.from);
  const foot = insets.bottom;
  const { wide, place, hang, fill } = usePlace(from, screen);
  const rect = useDerivedValue(() => {
    const lift = Math.max(keyboard.value, foot);
    const card = {
      x: place.x,
      y: cardTop(screen.height, lift, GAP, cardHeight.value, hang),
      width: place.width,
      height: cardHeight.value,
    };
    return windowRect(from, card, fill, across.value, down.value);
  });

  const { seen, away, scrim: dim } = values;
  const root = useAnimatedStyle(() => ({ opacity: seen.value * (1 - away.value) }));
  const scrim = useAnimatedStyle(() => ({ opacity: dim.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, root]}
      pointerEvents={stage.kind === "open" ? "box-none" : "none"}
      accessibilityViewIsModal
      onAccessibilityEscape={props.onClose}
      testID="new-space-window"
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={props.onClose}
        accessibilityLabel="Close"
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="new-space-outside"
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]} />
      </Pressable>
      {hang === undefined ? null : <Ringed at={from} values={values} />}
      <Clips
        rect={rect}
        values={values}
        screen={screen}
        filled={wide ? PANE_CORNER : SCREEN_CORNER}
      >
        <Layers rect={rect} values={values} />
        <Card
          {...props}
          values={values}
          input={input}
          x={place.x}
          width={place.width}
          hang={hang}
        />
      </Clips>
    </Animated.View>
  );
}

/**
 * Where the card stands and what a send fills. A send fills the room's side beside the list, unless
 * the list is put away, where the room it makes opens (`geometry.ts`, ADR 0256). A + at the top of
 * the window has the card hang under it at a card's width; one at the foot, as an iPad's capsule
 * has it since ADR 0276 and Android's and the web's, has the card in the middle on the keys. The
 * sidebar floats over the list and takes nothing from the room.
 */
function usePlace(from: Rect, screen: Size) {
  const { wide, roomy } = useLayout();
  const { listHidden } = useChrome();
  const duo = useDuo();
  const pages = pagesOf(duo.fold, screen.width);
  const page = besideColumn(duo, screen);
  const hung =
    roomy && from.y < screen.height / 2 ? cardUnder(screen.width, EDGE, from) : undefined;
  const fill = fillRect(
    page,
    wide
      ? (listHidden ? 0 : pages.across + pages.gap) + (Platform.OS === "web" ? RAIL_WIDTH : 0)
      : undefined,
  );
  // Half open, the card stands on the page beside the column, off the fold (`pageOffFold`).
  const held = pageOffFold(duo, screen.width) ?? page;
  const across = cardAcross(held.width, GAP, roomy);
  return {
    wide,
    place: hung ?? { x: held.x + across.x, width: across.width },
    hang: hung?.top,
    fill,
  };
}

/**
 * On the iPhone Duo the card and the room it fills stand on the page beside the column, as the
 * room's composer does; folded, the card ran on under the column (the simulator, 2 November 2026).
 * Open, the list runs to the fold (`pagesOf`).
 */
function besideColumn({ side, column }: Duo, screen: Size) {
  return {
    x: side === "left" ? column : 0,
    width: screen.width - (side === undefined ? 0 : column),
    height: screen.height,
  };
}

/**
 * Where the + is while the window is up: where it was pressed, and once the window turns, where it
 * stands then, looked at each frame for a moment as a popover's button is (`watch`, ADR 0256). The
 * card hangs from it on an iPad, its ring is drawn on it, and the window folds back into it.
 */
function useFollowed(plus: SheetFrom | undefined, from: Rect): Rect {
  const { width, height } = useWindowDimensions();
  const [seen, setSeen] = useState<Seen>();
  const size = useRef({ width, height });
  useEffect(() => {
    const was = size.current;
    if (was.width === width && was.height === height) return;
    size.current = { width, height };
    const view = plus?.current;
    if (view === null || view === undefined) return;
    return watch(view, { at: from, seen: false }, height, setSeen);
  }, [plus, from, width, height]);
  return seen?.seen === true ? seen.at : from;
}

/**
 * The gold + in a ring while its window is up on an iPad (the mock's section 8): over the dimmed
 * screen and under the window pouring out of it, so the button it hangs from is still seen. Drawn
 * here, since the + itself is under the dim; it comes and goes with the dim.
 */
function Ringed({ at, values }: { readonly at: Rect; readonly values: Values }) {
  const palette = usePalette();
  const { scrim } = values;
  const shown = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const out = RING + RING_GAP;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: at.x - out,
          top: at.y - out,
          width: at.width + 2 * out,
          height: at.height + 2 * out,
          borderRadius: at.height / 2 + out,
          borderColor: palette.gold,
          backgroundColor: palette.bg,
        },
        shown,
      ]}
      testID="new-space-ring"
    >
      <View style={[styles.ringed, { borderRadius: at.height / 2, backgroundColor: palette.gold }]}>
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M12 4.5v15M4.5 12h15" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
      </View>
    </Animated.View>
  );
}

/**
 * The window's springs, one set for each stage. Each stage starts its own from wherever the last
 * left off, so a fold begun while the window is still pouring out folds from where it got to.
 *
 * On a send the window fills the screen, the room is made and opened under it once it has all
 * but covered it, and the window dissolves into the room once the screen is covered and the room
 * has drawn itself.
 */
function useMotion(
  props: WindowProps,
  values: Values,
  input: React.RefObject<TextInput | null>,
  still: boolean,
) {
  const { stage, onRevealed, onDone, onCovered, drawn: roomDrawn } = props;
  const kind = stage.kind;
  useEffect(() => {
    values.drawn.value = roomDrawn ? 1 : 0;
  }, [roomDrawn, values]);
  useEffect(() => {
    if (kind === "open" && !still) {
      opening(values, still, input);
      // No keyboard has started to rise by now, so none is coming: pour without it.
      const alone = setTimeout(() => {
        if (values.waiting.value === 0) return;
        values.waiting.value = 0;
        pour(values);
      }, KEYBOARD_WAIT_MS);
      return () => clearTimeout(alone);
    }
    if (kind !== "sending") return move(kind, values, still, input, onDone);
    sending(values, still, input);
    // Nothing fills under Reduce Motion: the room is made and opened under the window at once,
    // and the window fades off it once it has drawn (below).
    if (still) onCovered();
  }, [kind, values, still, input, onDone, onCovered]);
  useEffect(() => {
    if (still && kind === "sending" && roomDrawn) onRevealed();
  }, [still, kind, roomDrawn, onRevealed]);

  // The room is made and comes in under the window once the page it becomes is solid.
  const { across, down, covered, sent, away, folding } = values;
  useAnimatedReaction(
    () => Math.min(across.value - 1, down.value - 1),
    (filled) => {
      if (filled < COVERED || covered.value === 1) return;
      covered.value = 1;
      runOnJS(onCovered)();
    },
  );
  // And the window dissolves into it once the screen is all but covered and the room has drawn
  // itself. A room just opened can take most of a second to; dissolved into before then, the
  // window left a blank page that the room then appeared on all at once (the simulator, 11
  // October 2026), so the window, which is a page too, is the one held.
  const { drawn } = values;
  useAnimatedReaction(
    () =>
      sent.value === 1 && drawn.value === 1 && Math.min(across.value - 1, down.value - 1) >= FILLED,
    (ready, was) => {
      if (!ready || was === true) return;
      const timing = { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) };
      away.value = withTiming(1, timing, (finished) => {
        if (finished) runOnJS(onRevealed)();
      });
    },
  );
  // Folding, it dissolves into the + once it is all but back on it, and is gone when it has.
  useAnimatedReaction(
    () => folding.value === 1 && Math.max(across.value, down.value) < HOME,
    (home, was) => {
      if (!home || was === true) return;
      away.value = withTiming(1, { duration: MELT_MS }, (finished) => {
        if (finished) runOnJS(onDone)();
      });
    },
  );
}

/** Every stage but a send, which has more to it (`sending`). */
function move(
  kind: "open" | "closing" | "lifting",
  values: Values,
  still: boolean,
  input: React.RefObject<TextInput | null>,
  onDone: () => void,
) {
  if (kind === "open") opening(values, still, input);
  else if (kind === "closing") closing(values, still, input, onDone);
  else lifting(values, still, onDone);
}

function opening(values: Values, still: boolean, input: React.RefObject<TextInput | null>) {
  values.folding.value = 0;
  // Moving, it waits to pour until the keyboard starts to rise (`pour`); still, it fades in whole.
  values.waiting.value = still ? 0 : 1;
  input.current?.focus();
  if (!still) return;
  values.across.value = 1;
  values.down.value = 1;
  values.spin.value = 1;
  values.shown.value = 1;
  values.rise.value = 0;
  values.scrim.value = 1;
  values.seen.value = 0;
  values.seen.value = withTiming(1, { duration: FADE_MS });
}

/**
 * The pour itself, out of the + and up to the card: begun on the UI thread as the keyboard starts
 * to rise (`useKeyboard`), or from here when no keyboard is coming.
 */
function pour(values: Values) {
  "worklet";
  values.across.value = withSpring(1, OPEN_ACROSS);
  values.down.value = withDelay(25, withSpring(1, OPEN_DOWN));
  values.spin.value = withTiming(1, { duration: 280, easing: EASE });
  values.scrim.value = withTiming(1, { duration: 320 });
  values.shown.value = withDelay(150, withTiming(1, { duration: 220 }));
  values.rise.value = withDelay(150, withTiming(0, { duration: 340, easing: EASE }));
}

function closing(
  values: Values,
  still: boolean,
  input: React.RefObject<TextInput | null>,
  onDone: () => void,
) {
  // Folded before it had begun to pour, it never will.
  values.waiting.value = 0;
  input.current?.blur();
  if (still) {
    values.seen.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    return;
  }
  values.folding.value = 1;
  values.shown.value = withTiming(0, { duration: 100 });
  values.spin.value = withTiming(0, { duration: 280, easing: EASE });
  values.scrim.value = withTiming(0, { duration: 320 });
  // Done once it has dissolved into the + (`useMotion`), not once these come to rest.
  values.down.value = withSpring(0, CLOSE_DOWN);
  values.across.value = withDelay(20, withSpring(0, CLOSE_ACROSS));
}

function sending(values: Values, still: boolean, input: React.RefObject<TextInput | null>) {
  input.current?.blur();
  values.covered.value = 0;
  if (still) return;
  values.sent.value = 1;
  values.shown.value = withTiming(0, { duration: 100 });
  values.across.value = withSpring(2, SEND_ACROSS);
  values.down.value = withDelay(20, withSpring(2, SEND_DOWN));
}

/** The window has gone into the room, or fades off it under Reduce Motion, and then it is gone. */
function lifting(values: Values, still: boolean, onDone: () => void) {
  const duration = still ? FADE_MS : REVEAL_MS;
  values.away.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
    if (finished) runOnJS(onDone)();
  });
}

/**
 * The keyboard's height as it moves, on the UI thread: the card rides it. And the moment it starts
 * to rise, which is when a window waiting to pour pours.
 */
function useKeyboard(values: Values) {
  useKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        if (event.progress !== 1 || values.waiting.value === 0) return;
        values.waiting.value = 0;
        pour(values);
      },
      onMove: (event) => {
        "worklet";
        values.keyboard.value = event.height;
      },
      onEnd: (event) => {
        "worklet";
        values.keyboard.value = event.height;
      },
    },
    [values],
  );
}

/** Android's back folds the window away, as a tap outside it does. */
function useBack(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);
}

/**
 * The four clips, nested, and what they hold put back where it was laid out (`clipsFor`). Each
 * is the screen's size and never changes it; only their moves and their corner are animated.
 */
function Clips({
  rect,
  values,
  screen,
  filled: fillCorner,
  children,
}: {
  readonly rect: DerivedValue<Rect>;
  readonly values: Values;
  readonly screen: Size;
  /** The corner once a send has filled what it fills. */
  readonly filled: number;
  readonly children: React.ReactNode;
}) {
  const { across, down } = values;
  const corner = useDerivedValue(() => {
    const filled = clamp01(Math.min(across.value - 1, down.value - 1));
    const wanted = CORNER + (fillCorner - CORNER) * filled;
    return Math.min(wanted, rect.value.width / 2, rect.value.height / 2);
  });
  const inside = useAnimatedStyle(() => {
    const back = clipsFor(rect.value, screen).inside;
    return { transform: [{ translateX: back.x }, { translateY: back.y }] };
  });
  const size = { width: screen.width, height: screen.height };
  return (
    <Clip index={0} rect={rect} corner={corner} screen={screen}>
      <Clip index={1} rect={rect} corner={corner} screen={screen}>
        <Clip index={2} rect={rect} corner={corner} screen={screen}>
          <Clip index={3} rect={rect} corner={corner} screen={screen}>
            <Animated.View style={[styles.inside, size, inside]} pointerEvents="box-none">
              {children}
            </Animated.View>
          </Clip>
        </Clip>
      </Clip>
    </Clip>
  );
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** One of the four: the screen's size, rounded, moved so one of its corners is the window's. */
function Clip({
  index,
  rect,
  corner,
  screen,
  children,
}: {
  readonly index: 0 | 1 | 2 | 3;
  readonly rect: DerivedValue<Rect>;
  readonly corner: DerivedValue<number>;
  readonly screen: Size;
  readonly children: React.ReactNode;
}) {
  const moved = useAnimatedStyle(() => {
    const move = clipsFor(rect.value, screen).corners[index];
    return {
      borderRadius: corner.value,
      transform: [{ translateX: move.x }, { translateY: move.y }],
    };
  });
  return (
    <Animated.View
      style={[styles.clip, { width: screen.width, height: screen.height }, moved]}
      pointerEvents="box-none"
    >
      {children}
    </Animated.View>
  );
}

/**
 * What the window is made of, under its words: the glass, the gold of the + fading out of it as
 * it grows, the page it becomes on a send, and the + itself turning away at the middle of it.
 */
function Layers({ rect, values }: { readonly rect: DerivedValue<Rect>; readonly values: Values }) {
  const palette = usePalette();
  const { across, down, folding, spin } = values;
  const gold = useAnimatedStyle(() => {
    const grown = clamp01(Math.min(across.value, down.value));
    const shown = folding.value === 1 ? clamp01((0.65 - grown) / 0.5) : 1 - clamp01(grown * 1.7);
    return { opacity: across.value > 1 || down.value > 1 ? 0 : shown };
  });
  const page = useAnimatedStyle(() => {
    const filled = Math.min(across.value - 1, down.value - 1);
    return { opacity: clamp01((filled - 0.1) / 0.55) };
  });
  const glyph = useAnimatedStyle(() => {
    const at = rect.value;
    return {
      opacity: 1 - spin.value,
      transform: [
        { translateX: at.x + at.width / 2 - 14 },
        { translateY: at.y + at.height / 2 - 14 },
        { rotate: `${90 * spin.value}deg` },
        { scale: 1 - 0.6 * spin.value },
      ],
    };
  });
  // The + is glass tinted gold where it wears the glass (`Plus.tsx`), so the window starts as
  // that: its own glass with the same share of gold over it, rather than a solid gold that jumps
  // out of the + for the frames before it moves.
  const glass = usePlusGlass();
  return (
    <>
      <Material />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: glass ? alpha(palette.gold, PLUS_TINT) : palette.gold },
          gold,
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }, page]}
        pointerEvents="none"
      />
      <Animated.View style={[styles.glyph, glyph]} pointerEvents="none">
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M12 4.5v15M4.5 12h15" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </>
  );
}

/** The system's glass where the phone has it, the bars' chrome where it does not, paint without. */
function Material() {
  const palette = usePalette();
  const scheme = useScheme();
  const glassy = useGlassy();
  const liquid = useLiquid();
  if (liquid) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={scheme}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    );
  }
  if (!glassy) {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.surface }]}
        pointerEvents="none"
      />
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BlurView
        intensity={80}
        tint={scheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(palette.surface, 0.5) }]} />
    </View>
  );
}

/**
 * The window's words: its name, who is asked, and the field. Laid out once at the card's full
 * size above the keyboard, and faded in, so nothing in it moves as the window grows round it.
 */
function Card(
  props: WindowProps & {
    readonly values: Values;
    readonly input: React.RefObject<TextInput | null>;
    /** Where the card stands across the screen, and how wide (`cardAcross`, `cardUnder`). */
    readonly x: number;
    readonly width: number;
    /** Where its top hangs on an iPad, under the + (`cardUnder`); on a phone it stands on the keys. */
    readonly hang: number | undefined;
  },
) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const { keyboard, cardHeight, shown, rise } = props.values;
  const { hang } = props;
  const foot = insets.bottom;
  // Standing on the keys, its foot is laid out at the screen's and lifted; hung, its top is laid
  // out at the screen's and put down, so what it holds grows away from the +.
  const card = useAnimatedStyle(() => {
    const lift = Math.max(keyboard.value, foot);
    if (hang === undefined) return { transform: [{ translateY: -lift }] };
    return {
      transform: [{ translateY: cardTop(screen.height, lift, GAP, cardHeight.value, hang) }],
    };
  });
  const head = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: rise.value }],
  }));
  const field = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: rise.value }],
  }));
  const rim = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View
      style={[
        styles.card,
        hang === undefined ? styles.onKeys : styles.hung,
        { left: props.x, width: props.width },
        card,
      ]}
      onLayout={(event) => {
        cardHeight.value = event.nativeEvent.layout.height;
      }}
      testID="new-space-card"
    >
      <Animated.View
        style={[styles.rim, { borderColor: alpha(palette.line2, 0.55) }, rim]}
        pointerEvents="none"
      />
      <Animated.View style={head}>
        <Head
          harnesses={props.harnesses}
          picked={props.picked}
          empty={props.empty}
          onChoose={props.onChoose}
          onLead={props.onLead}
          onClose={props.onClose}
        />
      </Animated.View>
      <Animated.View style={field}>
        <Field
          draft={props.draft}
          onDraft={props.onDraft}
          asked={props.picked[0]}
          empty={props.empty}
          onSend={props.onSend}
          input={props.input}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Seven tenths: at three the list read on behind the window and the glass card, which shows
  // what is behind it, sank into it (Arjun, 26 September 2026: make the background darker so
  // the window stands out). Darker behind, the card is the lightest thing on the screen.
  scrim: { backgroundColor: "rgba(0,0,0,0.7)" },
  clip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  inside: { position: "absolute", left: 0, top: 0 },
  glyph: { position: "absolute", left: 0, top: 0, width: 28, height: 28 },
  card: {
    position: "absolute",
    paddingTop: 16,
    paddingHorizontal: CARD_INSET,
    paddingBottom: 14,
  },
  onKeys: { bottom: GAP },
  hung: { top: 0 },
  ring: { position: "absolute", borderWidth: RING, padding: RING_GAP },
  ringed: { flex: 1, alignItems: "center", justifyContent: "center" },
  rim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: CORNER,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
