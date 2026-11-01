/**
 * How a message lifted out of the room moves (ADR 0200): where the bubble is, the room going soft
 * behind it, the copy of the bubble rising, and the capsule and the card coming out of it.
 *
 * Where the bubble is, is asked on the UI thread. The room's list is inverted, and
 * `measureInWindow` places a bubble in it ten points below where the screen draws it
 * (`BubbleWatch.tsx`): the copy would have stood ten points off the bubble it covers, and the lift
 * would have started with a jump. Where the room shows its lines whole is asked with it
 * (`RoomSeen`), and the copy starts and ends as exactly that much of the bubble, so it covers the
 * bubble and nothing else at rest. The bubble itself stays where it is, going soft with the room:
 * a copy drawn whole over the bar, and a bubble put out of sight with its foot showing nowhere,
 * took the bar and the reply's foot away at once and gave them back at once (Arjun, 18 October
 * 2026).
 *
 * The blur comes up by its intensity, which is what `expo-blur` animates, rather than by its
 * opacity: a material asked to fade is drawn broken until it is whole again (`SheetClose.tsx`).
 * For the same reason the capsule and the card, which are the system's glass, grow out of the
 * bubble's corner and shrink back into it; they never fade. Every frame is a transform, an opacity,
 * the rounding of a cut corner, or the blur's one number (ADR 0061).
 *
 * Under Jest each of these is a plain view (`jest.setup.js`), and the bubble is wherever the test
 * says: what the menu offers and does is tested there, and how it moves is the phone's.
 */

import { BlurView } from "expo-blur";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  type View,
  type ViewStyle,
} from "react-native";
import Animated, {
  type AnimatedRef,
  Easing,
  LayoutAnimationConfig,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { measured } from "../ui/measured";
import { useReduceMotion } from "../ui/useReduceMotion";
import type { Box, Span } from "./lift";

/** How much bigger the copy stands while it is up: enough to read as picked up, not as zoomed. */
export const LIFT = 1.035;
/** Up, a little past its place and back, as a thing picked up does. */
const UP = { stiffness: 340, damping: 26, mass: 1 } as const;
/**
 * Down, onto the bubble's own pixels, with nothing past them: an overshoot there is a wobble. It is
 * down, and what follows it may begin, within a quarter of a point of a hundred-point move, at about
 * 390 ms. Reanimated's own end, at a hundredth of a point, came at 560 ms: a quarter of a second of nothing
 * after the copy was still, before Reply's field or a page could come (the simulator, 23 October
 * 2026).
 */
const DOWN = { stiffness: 420, damping: 40, mass: 1, energyThreshold: 1e-5 } as const;
/** The blur at its fullest, of `expo-blur`'s hundred. */
const BLUR = 55;
const BLUR_IN_MS = 260;
const BLUR_OUT_MS = 220;
/** The capsule and the card go back into the bubble this quickly: they are out of the way first. */
const POP_OUT_MS = 140;
/**
 * How small they start and end: a speck, as the sheet's X starts (`SheetClose.tsx`). Nought is a
 * transform with no inverse, and they are never hidden by their opacity instead: glass that comes
 * into being under an opacity of nought was drawn without its material, its shadow alone over the
 * room (the simulator, 18 October 2026).
 */
const SMALL = 0.01;
/** With Reduce Motion, how long the backdrop takes to come and go. */
const STILL_MS = 160;

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

/** A bubble's place on the screen, asked for on the UI thread. */
export interface LiftBoxRef {
  readonly ref: AnimatedRef<View>;
  /**
   * Asks where the bubble is and where its room shows lines whole, and answers on JavaScript: no
   * box when the bubble is not on the screen, no span outside a room.
   */
  readonly ask: (then: (box: Box | null, seen: Span | null) => void) => void;
}

const Seen = createContext<AnimatedRef<View> | undefined>(undefined);

/**
 * Where the room shows its lines whole: under the bar and the band of blur below it, where a line
 * is drawn softened, and above the composer, wherever the keys have put it. A view of that size
 * stands unseen in the room, after what it is given, and is measured with a held bubble.
 */
export function RoomSeen({
  top,
  bottom,
  children,
}: {
  /** Points from the room's top: the bar, the pinned strip and the band's ramp. */
  readonly top: number;
  /** Points from the room's foot: the composer and what is under it. */
  readonly bottom: number;
  readonly children: ReactNode;
}) {
  const ref = useAnimatedRef<View>();
  return (
    <Seen.Provider value={ref}>
      {children}
      <Animated.View
        ref={ref}
        collapsable={false}
        pointerEvents="none"
        style={[styles.seen, { top, bottom }]}
      />
    </Seen.Provider>
  );
}

export function useLiftBox(): LiftBoxRef {
  const ref = useAnimatedRef<View>();
  const seen = useContext(Seen);
  const ask = useCallback(
    (told: (box: Box | null, seen: Span | null) => void) => {
      const then = WEB
        ? (box: Box | null, span: Span | null) => told(...asSeen(ref, seen, box, span))
        : told;
      scheduleOnUI(() => {
        "worklet";
        const at = measured(ref);
        const box =
          at === null || at.width <= 0
            ? null
            : { x: at.pageX, y: at.pageY, width: at.width, height: at.height };
        const room = seen === undefined ? null : measured(seen);
        const span =
          room === null || !(room.height > 0)
            ? null
            : { top: room.pageY, bottom: room.pageY + room.height };
        scheduleOnRN(then, box, span);
      });
    },
    [ref, seen],
  );
  return useMemo(() => ({ ref, ask }), [ref, ask]);
}

const WEB = Platform.OS === "web";

/**
 * On the web, Reanimated measures a view's place as it is seen and its size as it is laid out,
 * before any transform over it; a phone measures both as seen. The same as a phone's, both, read
 * from the page: under a transform that draws the room smaller than it is laid out, a copy of the
 * bubble as wide as its layout would stand out past it.
 */
function asSeen(
  ref: AnimatedRef<View>,
  seen: AnimatedRef<View> | undefined,
  box: Box | null,
  span: Span | null,
): [Box | null, Span | null] {
  const rect = (of: AnimatedRef<View> | undefined) =>
    (
      of as unknown as (() => { getBoundingClientRect?: () => DOMRect } | null) | undefined
    )?.()?.getBoundingClientRect?.();
  const bubble = rect(ref);
  const room = rect(seen);
  return [
    box === null || bubble === undefined
      ? box
      : { ...box, width: bubble.width, height: bubble.height },
    span === null || room === undefined ? span : { top: span.top, bottom: span.top + room.height },
  ];
}

/** The view inside the bubble, its own size, that `useLiftBox` measures. */
export function LiftBox({ box }: { readonly box: LiftBoxRef }) {
  return (
    <Animated.View
      ref={box.ref}
      collapsable={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
}

/**
 * What is held up over the room, kept still in itself: nothing in it comes or goes on Reanimated's
 * layout animations. The copy is drawn by the line's own parts, and the time in it fades as it goes
 * (`Leaving`, the room's way of giving up a line's time); as the menu went, that fade, kept alive
 * where the copy had been, put the room's own bubble out of sight for some eight frames, its words
 * and its colour gone and back (Arjun, 19 October 2026, "the actual message bubble blinks";
 * filmed on the simulator, and gone with this). The menu goes as one, at once, once the copy is
 * back on the bubble.
 */
export function LiftStill({ children }: { readonly children: ReactNode }) {
  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      {children}
    </LayoutAnimationConfig>
  );
}

/**
 * The room behind, gone soft: blurred where there is glass, and a little dimmer over it; only
 * dimmer where there is none. A press on it puts the message down.
 */
export function LiftBackdrop({
  open,
  blur,
  tint,
  dim,
  onPress,
}: {
  readonly open: boolean;
  readonly blur: boolean;
  readonly tint: "systemUltraThinMaterialLight" | "systemUltraThinMaterialDark";
  /** The colour over the room, at its fullest. */
  readonly dim: string;
  readonly onPress: () => void;
}) {
  const still = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    const duration = still ? STILL_MS : open ? BLUR_IN_MS : BLUR_OUT_MS;
    shown.value = withTiming(open ? 1 : 0, { duration, easing: Easing.out(Easing.cubic) });
  }, [open, still, shown]);
  const soft = useAnimatedProps(() => ({ intensity: shown.value * BLUR }));
  const over = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={StyleSheet.absoluteFill}
      onPress={onPress}
      testID="lift-backdrop"
    >
      {blur ? (
        <AnimatedBlur animatedProps={soft} tint={tint} style={StyleSheet.absoluteFill} />
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dim }, over]} />
    </Pressable>
  );
}

/**
 * The copy of the bubble, over it: up, by `dy` and a little bigger, once it is `open` and `ready`
 * (the menu placed); back onto the bubble when it is no longer open, and then `onGone`. It grows
 * from its own side, so a bubble against the glass's edge stays against it. The bubble may have
 * moved while it was up, as the room does when the keys it was held over go down, so it goes down
 * `land` points from where it rose, onto where the bubble is now.
 *
 * At rest it shows what the room showed of the bubble (`rest`, and `back` going down), and up what
 * the menu leaves room for (`lifted`), and the cut moves between the two as it rises and goes down.
 * A cut is two views that clip, each the screen's height and moved, never sized: one held with its
 * top edge at the cut's top, one inside it with its bottom edge at the cut's foot, and the bubble
 * inside both, moved back to where it is drawn. Every frame is still a transform, and the corners'
 * rounding where it is cut.
 */
export function LiftCopy({
  open,
  ready,
  x,
  width,
  from,
  dy,
  land = 0,
  rest,
  back,
  lifted,
  round,
  side,
  onGone,
  children,
}: {
  readonly open: boolean;
  readonly ready: boolean;
  /** The bubble's leading edge and width, on the screen. */
  readonly x: number;
  readonly width: number;
  /** Where the bubble's top edge was when it was held. */
  readonly from: number;
  readonly dy: number;
  readonly land?: number | undefined;
  /** What of the bubble the room showed as it was held. */
  readonly rest: Span;
  /** And what it shows where the copy goes down to, once that is known. */
  readonly back?: Span | undefined;
  /** What of it shows while it is up. */
  readonly lifted: Span;
  /**
   * The corners up, where it is cut: a bubble's, so a reply too tall to show whole still reads as a
   * bubble held up. At rest the cut is square, as the bar's band and the composer cut it in the room.
   */
  readonly round: { readonly top: number; readonly foot: number };
  readonly side: "left" | "right";
  readonly onGone: () => void;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const tall = useWindowDimensions().height;
  const up = useSharedValue(0);
  const rose = useRef(false);
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => {
    if (open) {
      if (!ready) return;
      rose.current = true;
      up.value = still ? 1 : withSpring(1, UP);
      return;
    }
    // Put down before it was ever up: there is nothing to settle.
    if (!rose.current) {
      gone.current();
      return;
    }
    const done = () => gone.current();
    up.value = still
      ? withTiming(0, { duration: STILL_MS }, (finished) => {
          if (finished === true) scheduleOnRN(done);
        })
      : withSpring(0, DOWN, (finished) => {
          if (finished === true) scheduleOnRN(done);
        });
  }, [open, ready, still, up]);
  // Going down it goes to where the bubble is now, which is known once it is already up.
  const down = back ?? rest;
  const rising = useAnimatedStyle(() => ({
    shadowOpacity: up.value * 0.18,
    transform: [{ scale: 1 + up.value * (LIFT - 1) }],
  }));
  const topCut = useAnimatedStyle(() => ({
    borderTopLeftRadius: up.value * round.top,
    borderTopRightRadius: up.value * round.top,
    transform: [{ translateY: up.value * lifted.top + (1 - up.value) * down.top }],
  }));
  const footCut = useAnimatedStyle(() => {
    const top = up.value * lifted.top + (1 - up.value) * down.top;
    const foot = up.value * lifted.bottom + (1 - up.value) * down.bottom;
    return {
      borderBottomLeftRadius: up.value * round.foot,
      borderBottomRightRadius: up.value * round.foot,
      transform: [{ translateY: foot - tall - top }],
    };
  });
  const drawn = useAnimatedStyle(() => {
    const foot = up.value * lifted.bottom + (1 - up.value) * down.bottom;
    const at = from + up.value * dy + (1 - up.value) * land;
    return { transform: [{ translateY: at - (foot - tall) }] };
  });
  const frame = { left: x, width, height: tall };
  const middle = (lifted.top + lifted.bottom) / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.copy,
        frame,
        styles.shadow,
        { transformOrigin: [side === "right" ? width : 0, middle, 0] },
        rising,
      ]}
    >
      <Animated.View style={[styles.cut, { width, height: tall }, topCut]}>
        <Animated.View style={[styles.cut, { width, height: tall }, footCut]}>
          <Animated.View style={[styles.drawn, { width }, drawn]}>{children}</Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The capsule or the card: out of the bubble's corner on a spring while `open`, back into it
 * quickly when not. `origin` is the corner it grows from.
 */
export function LiftPop({
  open,
  origin,
  delay = 0,
  style,
  onLayout,
  children,
}: {
  readonly open: boolean;
  readonly origin: string;
  readonly delay?: number;
  readonly style: StyleProp<ViewStyle>;
  readonly onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    if (still) shown.value = open ? 1 : 0;
    else if (open) shown.value = withDelay(delay, withSpring(1, UP));
    else shown.value = withTiming(0, { duration: POP_OUT_MS, easing: Easing.in(Easing.quad) });
  }, [open, still, delay, shown]);
  const popped = useAnimatedStyle(() => ({
    // Never faded, not even at once: a material asked to fade is drawn broken.
    transform: [{ scale: SMALL + (1 - SMALL) * shown.value }],
  }));
  return (
    <Animated.View onLayout={onLayout} style={[style, { transformOrigin: origin }, popped]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { shadowColor: "#000000", shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  seen: { position: "absolute", left: 0, right: 0 },
  copy: { position: "absolute", top: 0 },
  cut: { position: "absolute", top: 0, left: 0, overflow: "hidden" },
  drawn: { position: "absolute", top: 0, left: 0 },
});
