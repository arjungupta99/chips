/**
 * The stage: the backdrop, the pager, and the picture a finger moves (the media viewer proposal,
 * §4.2 and diagram B).
 *
 * **The one file in the viewer that imports Reanimated and gesture handler.** Every value a
 * gesture moves is a shared value on the UI thread — the pager's offset, the picture's zoom and
 * pan, the drag to dismiss, the flight from the tile and back — and the arithmetic that decides
 * them is core's (`viewer.ts`), marked `"worklet"` so it runs there too. JavaScript hears from a
 * gesture only when something is decided: a page settled, the line crossed, a close, a tap.
 * Under Jest, Reanimated throws while it is being imported, so `jest.setup.js` mocks this file to a
 * view that draws the current item and hands a test `onNext`, `onPrevious` and `onDismiss`. What
 * that costs is the same as `Crossing`'s: no test here proves a swipe, a pinch or a flight. The
 * simulator, the emulator and `e2e/maestro/viewer.yaml` do.
 *
 * **The pager.** Every item stands at its own page, one stage's width and a 20-point gutter from
 * the next, and one offset carries them all; only the current item and its two neighbours are
 * mounted. A settled swipe leaves the offset where the spring put it, and the slots keep their
 * keys, so nothing is re-centred under the eye and no frame shows the wrong picture.
 *
 * **One pan, three meanings.** The pan reads the scale at its first movement and keeps its meaning
 * for the rest of the touch: zoomed, it moves the picture within `clampPan` and, let go, slides
 * into the bound as a scroll view does (`withGlide`); at the fitted size, the larger of its two
 * axes decides — across pages, down dismisses. A pinch zooms about the fingers and, let go under
 * three quarters, closes; a double tap goes to two and a half times at the point and back; a tap is
 * the viewer's to answer (the chrome, or a video's play); a long press opens the menu. A video is
 * not zoomable: a pinch and a double tap leave it be, and a drag to dismiss says it took hold, so
 * the viewer can pause it, and let go, if it springs home.
 *
 * **A pinch has the picture to itself, from its start to the last finger up.** iOS and Android both
 * keep a pinch going until every finger has lifted, and report the middle of the fingers still down,
 * so when the first finger lifts the middle leaps to the one left. Read as a move, that leap threw
 * the picture half the fingers' spread in one frame, and the release sprang it back: the bounce
 * Arjun saw at the end of a zoom (7 October 2026). The pinch takes a fresh grip (`pinchGrip`)
 * whenever a finger comes or goes, so the frame a finger lifts moves nothing and the finger left
 * carries the picture on, as Photos's does. A pan that had the picture stands down when a pinch
 * starts, and one that starts during it means nothing for the rest of its touch (`SPENT`): two
 * gestures writing the one pan from grips of their own could leap the same way. The pinch's grip is
 * its own, and the pan's is the pan's.
 *
 * **A video** stands in its clip as its poster, and the current one carries what the viewer gives
 * it to draw over the poster (`video`, from `VideoItem.tsx`) — the player, or the ring while it
 * comes — so it flies, pages and drags away with the picture. A neighbour is its poster and a play
 * mark.
 *
 * **The flight.** The current item's clip is drawn between two frames by one number: at 0 it is
 * the tile it came from, cropped as the tile crops it (`coverRect`), with the tile's corners (a
 * room tile's unless the tile said otherwise, ADR 0161); at 1 it
 * is fitted to the stage (`fitRect`). Opening springs it up on the app's one spring; closing springs
 * it back down to the tile of the item that is current then, while the drag, the zoom and the pan
 * spring home with it, so a picture let go 180 points down flies from where the finger left it.
 * Without a tile to go to it shrinks and fades where it is. Reduce Motion takes the travel out and
 * leaves a 160 ms crossfade, both ways. The stage says when the opening has landed (`onOpened`)
 * and when the current item's picture is drawn (`onDrawn`): the viewer waits on the first before
 * it swaps a view copy in under the picture, and on the second before it hides the tile — and
 * holds the flight itself (`held`) until the modal is up and that picture is drawn, so a staged
 * photo whose first decode takes a moment is not flown as an empty box.
 *
 * The clip is laid out once, fitted, and the flight draws it as the rect it is at by a transform
 * (`transformTo`): a scale across unlike the scale down while its shape goes from the tile's to the
 * picture's, which the picture inside it takes back out, so the picture is only ever drawn at its
 * own shape. And the flight keeps a clock of its own (`withSteadySpring`), which a frame moves by a
 * frame's worth at most: the first open after a cold start stalls the UI thread for some 50 ms
 * just after the flight is let go, and on the wall clock the first frame anyone saw was a third of
 * the way up (Arjun, 22 September 2026). A stall now holds the tile a moment, and never skips it.
 *
 * The flight is clipped to the room's own glass as it lands, and unclipped as it rises
 * (`clipRect`, and `within`): the room cuts a tile at the foot of its lines where the composer
 * begins, and a picture flying home to one the composer half covers was drawn over the composer
 * for the last of its flight, and then gone the moment the viewer left (Arjun, 20 September 2026).
 * The clip is an ancestor of the pager and of every transform a gesture makes, so it stands still
 * in the window while the picture moves inside it, and the stage within it keeps the window's own
 * coordinates.
 *
 * **What a style is allowed to read.** Two rules, and the second is the one that is easy to miss.
 * A style a gesture drives carries transforms and an opacity and never a layout property (ADR
 * 0061): `width` and `height` are applied by cloning the shadow tree and committing it, where a
 * transform is written straight to the view, so a style that so much as mentions a width — even to
 * hand back the number it handed back last frame — buys a commit for every frame of the zoom. And
 * a style is woken by every shared value its worklet can reach, not by the ones it happens to read:
 * Reanimated walks into a plain object looking for them (`extractInputs`), so one written as
 * `values.zoom.value` has subscribed itself to the pager, the drag and the flight besides. Written
 * that way, all eight of the styles below ran on every frame of every gesture and six of them
 * mentioned a box, so a pinch cost eight commits a frame — with the picture being re-rastered
 * beside them, which is what Arjun felt as the zoom jerking (22 September 2026). Each style now
 * takes the two or three values it reads out of the set by name, and since the same afternoon no
 * style here has a layout property at all: the flight had laid out the clip, the picture and the
 * glass afresh at each of its frames, four commits a frame just as the viewer's own first renders
 * were landing, and it draws them by transforms now like everything else.
 */

import {
  clampPan,
  clipRect,
  coverRect,
  DISMISS_DISTANCE,
  dismissDecision,
  dismissProgress,
  type Fingers,
  fitRect,
  type PinchGrip,
  type Point,
  pinchGrip,
  pinchTo,
  type Rect,
  rubberBand,
  type Size,
  snapPage,
  transformTo,
  zoomLimits,
} from "@chipschat/core";
import { Image } from "expo-image";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PixelRatio,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { isWorkletFunction, scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { tick } from "../ui/haptics";
import { IOS_SPRING } from "../ui/motion";
import { withGlide, withSteadySpring } from "../ui/steadySpring";
import { RADIUS } from "../ui/tokens";
import { PlayDisc } from "./PlayDisc";
import { type Corners, cornersOf } from "./tiles";

/** The stage between two pages: iOS Photos's. */
export const GUTTER = 20;
/** A neighbour video's play mark: the transport's middle disc (`Controls.tsx`). */
const PLAY_DISC = 72;
/** A double tap goes this far, at the point. */
const DOUBLE_TAP_SCALE = 2.5;
/** A pinch let go under this closes the viewer, as Photos does. */
const PINCH_CLOSES_UNDER = 0.75;
/** Reduce Motion's crossfade, as the sheet's (`STILL_MS`). */
const STILL_MS = 160;
/** With no tile to go back to, the picture shrinks to this and fades, in this long. */
const FALLBACK_SCALE = 0.6;
const FALLBACK_MS = 220;
/**
 * The view copy over the thumbnail, crossfaded. The thumbnail itself is never faded in: it is the
 * tile's own pixels, and the first frame of the flight is meant to be them. expo-image runs its
 * transition on any load that did not come from memory, and the first open in a process reads the
 * thumbnail from disk, so with the fade on it the tile was hidden while its picture was still a
 * quarter of the way through fading in over the stage (the simulator, 23 September 2026).
 */
const PICTURE_FADE_MS = 200;
/** Over this, a picture counts as zoomed. */
const ZOOMED = 1.01;
/**
 * A touch means nothing until it has moved this far, and a tap is no longer a tap past it. Android
 * reports a pan's first update as it activates, before the finger has gone anywhere, and a swipe
 * quick enough is still inside a tap's time (the emulator, 14 September 2026).
 */
const MOVED = 10;
/** Far enough past any edge that `clampPan` answers with the edge itself. */
const FAR = 1e9;

// Core's arithmetic is called from gesture callbacks on the UI thread, which only a worklet may
// be. The worklets Babel plugin marks it so when it transforms `packages/core`; if a change to the
// build ever stops it doing so, the first drag throws, and this says why first.
if (__DEV__ && !isWorkletFunction(dismissDecision)) {
  // biome-ignore lint/suspicious/noConsole: a development build's red box is the delivery mechanism here.
  console.error(
    "@chipschat/core's viewer arithmetic is not a worklet in this bundle: the media viewer's gestures will throw on the UI thread.",
  );
}

/** One item as the stage draws it. */
export interface StageItem {
  readonly id: string;
  readonly kind: "photo" | "video";
  /** The picture's own size, or nothing known (a zero size), which fills the stage. */
  readonly content: Size;
  /** The thumbnail, on the phone already: the first frame, and what stands in until the picture comes. */
  readonly thumb: string | undefined;
  /** The view copy, or the original once it was asked for. */
  readonly picture: string | undefined;
  /** Whether `picture` is the file as it was sent: decoded at the screen's size, not in full. */
  readonly original: boolean;
}

/** Where the closing flight goes: the tile, clipped to the glass, landing on the tile's corners. */
export interface Closing {
  readonly to: Rect | undefined;
  readonly within: Rect | undefined;
  /** Nothing is a room tile's. */
  readonly corners?: Corners | undefined;
}

export interface StageProps {
  readonly items: readonly StageItem[];
  readonly index: number;
  /** The tile's frame in the window when it was tapped; nothing opens with the crossfade. */
  readonly from: Rect | undefined;
  /** The tile's corners, when they are not a room tile's (ADR 0161). */
  readonly corners?: Corners | undefined;
  /**
   * Where the room's lines are in the window, so the flight is clipped as the room clips its own
   * tiles (`clipRect`). Nothing clips at all, which is what the flight did before 20 September 2026.
   */
  readonly within: Rect | undefined;
  /** Reduce Motion. */
  readonly still: boolean;
  /**
   * The opening waits: true until the modal is up over the room and the current item's picture is
   * drawn, so the first frame of the flight is the tile's own pixels and never an empty box, and
   * the flight is not spent while the modal is still being presented.
   */
  readonly held: boolean;
  /** Set once, to close: back to `to`, or shrinking and fading where it is, clipped to `within`. */
  readonly closing: Closing | undefined;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  /** A drag, a flick or a pinch decided to close. */
  readonly onDismiss: () => void;
  /** The closing flight has landed: unmount. */
  readonly onClosed: () => void;
  /** The opening has landed — the flight from the tile, or the crossfade — and the stage is at rest. */
  readonly onOpened: () => void;
  /** The current item's picture is on the stage: what stands where the tile is, drawn. */
  readonly onDrawn: () => void;
  /** The chrome goes at the first movement of a drag or a zoom, and comes back when it settles home. */
  readonly onChrome: (shown: boolean) => void;
  readonly onTap: () => void;
  readonly onMenu: () => void;
  /** What stands on the current item over its poster when it is a video: the player, or the ring. */
  readonly video?: ReactNode;
  /** A drag to dismiss took hold, or sprang home short of the line. */
  readonly onDragging?: ((dragging: boolean) => void) | undefined;
}

type Signal =
  | "next"
  | "previous"
  | "dismiss"
  | "closed"
  | "opened"
  | "tap"
  | "menu"
  | "chrome"
  | "bare"
  | "held"
  | "let";

const IDLE = 0;
const PAGING = 1;
const DISMISSING = 2;
const PANNING = 3;
/** A pinch has the picture: this touch's pan means nothing more until it ends. */
const SPENT = 4;

interface Values {
  readonly current: SharedValue<number>;
  readonly count: SharedValue<number>;
  readonly pager: SharedValue<number>;
  readonly stage: SharedValue<Size>;
  /** The current item's fitted frame, and how far it may zoom. */
  readonly fitted: SharedValue<Rect>;
  readonly maxZoom: SharedValue<number>;
  readonly zoomable: SharedValue<boolean>;
  /** 0 at the tile, 1 fitted. */
  readonly flight: SharedValue<number>;
  readonly origin: SharedValue<Rect>;
  /** The tile's corners, which the clip is rounded to at 0. */
  readonly corners: SharedValue<Corners>;
  /** The room's glass, which the flight is clipped to as it lands; a rect of no size does not clip. */
  readonly within: SharedValue<Rect>;
  readonly fade: SharedValue<number>;
  readonly shrink: SharedValue<number>;
  readonly zoom: SharedValue<number>;
  readonly panX: SharedValue<number>;
  readonly panY: SharedValue<number>;
  readonly dragX: SharedValue<number>;
  readonly dragY: SharedValue<number>;
  readonly mode: SharedValue<number>;
  readonly past: SharedValue<boolean>;
  readonly closing: SharedValue<boolean>;
  /** Where the pan's touch found what it moves: the pager's offset, or the picture's pan. */
  readonly grip: SharedValue<Point>;
  /** From a pinch's start to its last finger up. */
  readonly pinching: SharedValue<boolean>;
  readonly pinch: SharedValue<PinchGrip>;
}

const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
/** A room tile's corners, which a tile that says nothing has. */
const ROOM_CORNERS: Corners = cornersOf(RADIUS.md);

/**
 * The stage's shared values, as one object that keeps its identity for the life of the stage. It
 * must: the opening, the closing and the page are effects that depend on it, and a new object on
 * every render ran them again on every render — a video's clock redraws the viewer four times a
 * second, and each redraw started the closing spring again, so it never landed (the web target,
 * 14 September 2026).
 */
function useValues(props: StageProps, stage: Size): Values {
  const moving = props.from !== undefined && !props.still;
  const current = useSharedValue(props.index);
  const count = useSharedValue(props.items.length);
  const pager = useSharedValue(-props.index * (stage.width + GUTTER));
  const stageSize = useSharedValue(stage);
  const fitted = useSharedValue(NO_RECT);
  const maxZoom = useSharedValue(3);
  const zoomable = useSharedValue(true);
  const flight = useSharedValue(moving ? 0 : 1);
  const origin = useSharedValue(props.from ?? NO_RECT);
  const corners = useSharedValue(props.corners ?? ROOM_CORNERS);
  // Held from the first frame rather than written by an effect: the first frame is already at the tile.
  const within = useSharedValue(props.within ?? NO_RECT);
  const fade = useSharedValue(moving ? 1 : 0);
  const shrink = useSharedValue(1);
  const zoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const mode = useSharedValue(IDLE);
  const past = useSharedValue(false);
  const closing = useSharedValue(false);
  const grip = useSharedValue<Point>({ x: 0, y: 0 });
  const pinching = useSharedValue(false);
  const pinch = useSharedValue<PinchGrip>({
    at: { zoom: 1, x: 0, y: 0 },
    fingers: { scale: 1, focal: { x: 0, y: 0 }, count: 2 },
  });
  return useMemo(
    () => ({
      current,
      count,
      pager,
      stage: stageSize,
      fitted,
      maxZoom,
      zoomable,
      flight,
      origin,
      corners,
      within,
      fade,
      shrink,
      zoom,
      panX,
      panY,
      dragX,
      dragY,
      mode,
      past,
      closing,
      grip,
      pinching,
      pinch,
    }),
    [
      current,
      count,
      pager,
      stageSize,
      fitted,
      maxZoom,
      zoomable,
      flight,
      origin,
      corners,
      within,
      fade,
      shrink,
      zoom,
      panX,
      panY,
      dragX,
      dragY,
      mode,
      past,
      closing,
      grip,
      pinching,
      pinch,
    ],
  );
}

/** A picture's own size, or the stage's shape when it is not known. */
function contentOf(item: StageItem | undefined, stage: Size): Size {
  const known = item !== undefined && item.content.width > 0 && item.content.height > 0;
  return known ? item.content : stage;
}

export function Stage(props: StageProps) {
  const window = useWindowDimensions();
  const [stage, setStage] = useState<Size>({ width: window.width, height: window.height });
  const values = useValues(props, stage);
  const latest = useRef(props);
  latest.current = props;
  const emit = useCallback((signal: Signal) => {
    const now = latest.current;
    const answer: Record<Signal, () => void> = {
      next: now.onNext,
      previous: now.onPrevious,
      dismiss: now.onDismiss,
      closed: now.onClosed,
      opened: now.onOpened,
      tap: now.onTap,
      menu: now.onMenu,
      chrome: () => now.onChrome(true),
      bare: () => now.onChrome(false),
      held: () => now.onDragging?.(true),
      let: () => now.onDragging?.(false),
    };
    answer[signal]();
  }, []);

  useCurrent(props, stage, values);
  useOpening(props, values, emit);
  useClosing(props, values, emit);
  const gesture = useGesture(values, emit);

  // Each style below takes the few values it reads out of the set and never the set itself: see
  // *What a style is allowed to read* at the head of this file.
  const { flight, fade, dragY, zoom, pager: offset, within, stage: size } = values;
  const backdrop = useAnimatedStyle(() => ({
    opacity:
      flight.value *
      fade.value *
      dismissProgress(dragY.value).backdrop *
      // A pinch below fitted clears the stage as it goes, gone by half size.
      Math.min(1, Math.max(0, (zoom.value - 0.5) * 2)),
  }));
  const pager = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  // The clip is an ancestor of every transform a gesture makes, so it holds still in the window
  // while the picture is dragged, zoomed and flown inside it. It is laid out as the whole stage and
  // drawn as the glass, by a transform.
  const glass = useAnimatedStyle(() => {
    const whole = { x: 0, y: 0, width: size.value.width, height: size.value.height };
    const drawn = transformTo(whole, clipRect(within.value, size.value, flight.value));
    return {
      transform: [
        { translateX: drawn.x },
        { translateY: drawn.y },
        { scaleX: drawn.sx },
        { scaleY: drawn.sy },
      ],
    };
  });
  // And the stage inside it is drawn back at its own size by the inverse, so it keeps the window's
  // own coordinates whatever the clip is doing.
  const inside = useAnimatedStyle(() => {
    const whole = { x: 0, y: 0, width: size.value.width, height: size.value.height };
    const drawn = transformTo(whole, clipRect(within.value, size.value, flight.value));
    return {
      transform: [
        { translateX: -drawn.x / drawn.sx },
        { translateY: -drawn.y / drawn.sy },
        { scaleX: 1 / drawn.sx },
        { scaleY: 1 / drawn.sy },
      ],
    };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== stage.width || height !== stage.height) setStage({ width, height });
  };
  const first = Math.max(0, props.index - 1);
  const shown = props.items.slice(first, props.index + 2);
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <View style={StyleSheet.absoluteFill} onLayout={onLayout} testID="stage">
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
        <GestureDetector gesture={gesture}>
          <Animated.View style={StyleSheet.absoluteFill} collapsable={false}>
            <Animated.View style={[styles.glass, glass]}>
              <Animated.View style={[StyleSheet.absoluteFill, inside]}>
                <Animated.View style={[StyleSheet.absoluteFill, pager]}>
                  {shown.map((item, offset) => (
                    <Slot
                      key={item.id}
                      item={item}
                      at={first + offset}
                      stage={stage}
                      values={values}
                      current={first + offset === props.index}
                      video={first + offset === props.index ? props.video : undefined}
                      onDrawn={first + offset === props.index ? props.onDrawn : undefined}
                    />
                  ))}
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * The window turned, or a split moved: the picture re-fits to the new stage, and what was in the
 * middle of it stays there (§4.4). A tablet turned on a receipt read at two and a half times should
 * be the same part of the receipt, wider — not the whole of it again.
 *
 * The pan is a translate in the stage's own points and the fitted rect is centred in it, so the
 * point of the picture at the middle of the stage is `-pan` over the picture's drawn size — and it
 * stays that point when the pan is scaled by how much the fitted rect just did. The zoom is how
 * much bigger than fitted, so it carries over as it is, short of what the new stage allows: one
 * image pixel per device pixel is a different number in the other orientation. `clampPan` last,
 * because a picture that filled the stage across may not down.
 *
 * **A worklet, on the UI thread, and never read from JavaScript.** The zoom and the pan are moved
 * there by the gestures, and JavaScript's copy of a shared value is whatever JavaScript last wrote
 * — the `1` and `0`s of the last page, not the double tap since — and a stage written a moment ago
 * has not reached the UI thread's yet. Done from JavaScript, the Android tablet turned a picture at
 * two and a half times into one at fitted size, off to the side by exactly where `clampPan` puts
 * zoom 1 and pan 0 on the other orientation's stage (16 September 2026). So the new stage and both
 * rects are handed over, and the rest is read where it lives.
 */
function keepTheCentre(values: Values, was: Rect, now: Rect, stage: Size, maxZoom: number) {
  "worklet";
  if (was.width <= 0 || was.height <= 0) return;
  cancelAnimation(values.zoom);
  cancelAnimation(values.panX);
  cancelAnimation(values.panY);
  const zoom = Math.min(values.zoom.value, maxZoom);
  const bound = clampPan(zoom, now, stage, {
    x: (values.panX.value * now.width) / was.width,
    y: (values.panY.value * now.height) / was.height,
  });
  values.zoom.value = zoom;
  values.panX.value = bound.x;
  values.panY.value = bound.y;
}

/** Keep the UI thread's picture of the current item in step with the deck, the page and the stage. */
function useCurrent(props: StageProps, stage: Size, values: Values) {
  const { items, index, still } = props;
  const before = useRef({ items, stage, fitted: NO_RECT });
  useEffect(() => {
    const item = items[index];
    const content = contentOf(item, stage);
    const step = stage.width + GUTTER;
    const fitted = fitRect(content, stage);
    const limits = zoomLimits(content, stage, PixelRatio.get());
    values.count.value = items.length;
    values.stage.value = stage;
    values.fitted.value = fitted;
    values.maxZoom.value = limits.max;
    values.zoomable.value = item?.kind === "photo";
    const was = before.current;
    const turned = was.stage.width !== stage.width || was.stage.height !== stage.height;
    const reshuffled = was.items !== items;
    before.current = { items, stage, fitted };
    if (values.current.value === index && !turned) return;
    // Paged from outside the gesture — an arrow, the filmstrip, or the deck changing under the
    // viewer — or the window turned under it.
    const paged = values.current.value !== index;
    values.current.value = index;
    if (paged) {
      values.zoom.value = 1;
      values.panX.value = 0;
      values.panY.value = 0;
    } else {
      scheduleOnUI(keepTheCentre, values, was.fitted, fitted, stage, limits.max);
    }
    values.pager.value =
      still || turned || reshuffled ? -index * step : withSpring(-index * step, IOS_SPRING);
  }, [items, index, stage, still, values]);
}

/**
 * The first frame is the tile; spring from it, or crossfade in under Reduce Motion, once the
 * viewer says the way is clear (`held`). Either way, the viewer hears when it has landed.
 */
function useOpening(props: StageProps, values: Values, emit: (signal: Signal) => void) {
  const moving = props.from !== undefined && !props.still;
  const [opening] = useState(() => moving);
  const { held } = props;
  const started = useRef(false);
  useEffect(() => {
    if (held || started.current) return;
    started.current = true;
    const landed = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(emit, "opened");
    };
    if (opening) values.flight.value = withSteadySpring(1, landed);
    else values.fade.value = withTiming(1, { duration: STILL_MS }, landed);
  }, [held, opening, values, emit]);
}

function useClosing(props: StageProps, values: Values, emit: (signal: Signal) => void) {
  const { closing, still } = props;
  useEffect(() => {
    if (closing === undefined) return;
    values.closing.value = true;
    // Measured again at the close, because the room's foot moves: the keyboard went as the viewer
    // opened, and the room may have scrolled under the stage to reveal the item paged to.
    if (closing.within !== undefined) values.within.value = closing.within;
    const landed = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(emit, "closed");
    };
    if (still) values.fade.value = withTiming(0, { duration: STILL_MS }, landed);
    else if (closing.to === undefined) fadeWhereItIs(values, landed);
    else flyBack(values, closing.to, closing.corners ?? ROOM_CORNERS, landed);
  }, [closing, still, values, emit]);
}

/**
 * Back into the tile: the flight down, with the zoom, the pan and the drag going home beside it, on
 * the same steady clock, so a stalled frame holds all of them together.
 */
function flyBack(values: Values, to: Rect, corners: Corners, landed: (finished?: boolean) => void) {
  values.origin.value = to;
  values.corners.value = corners;
  values.zoom.value = withSteadySpring(1);
  for (const home of [values.panX, values.panY, values.dragX, values.dragY]) {
    home.value = withSteadySpring(0);
  }
  values.flight.value = withSteadySpring(0, landed);
}

/** No tile to go back to: smaller, and gone, where it stands. */
function fadeWhereItIs(values: Values, landed: (finished?: boolean) => void) {
  values.shrink.value = withTiming(FALLBACK_SCALE, { duration: FALLBACK_MS });
  values.fade.value = withTiming(0, { duration: FALLBACK_MS }, landed);
}

function useGesture(values: Values, emit: (signal: Signal) => void) {
  return useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(MOVED)
      .maxPointers(1)
      .onStart(() => {
        values.mode.value = IDLE;
      })
      .onUpdate((event) => panMoved(values, event.translationX, event.translationY, emit))
      .onEnd((event) =>
        panLetGo(values, event.translationY, event.velocityX, event.velocityY, emit),
      );
    const pinch = Gesture.Pinch()
      .onStart((event) => pinchHeld(values, fingersOf(event), emit))
      .onUpdate((event) => pinchMoved(values, fingersOf(event)))
      .onEnd(() => pinchLetGo(values, emit))
      .onFinalize(() => {
        values.pinching.value = false;
      });
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .maxDistance(MOVED)
      .onEnd((event, success) => {
        if (success) doubleTapped(values, { x: event.x, y: event.y }, emit);
      });
    const single = Gesture.Tap()
      .maxDistance(MOVED)
      .onEnd((_event, success) => {
        if (success && !values.closing.value) scheduleOnRN(emit, "tap");
      });
    const hold = Gesture.LongPress()
      .minDuration(450)
      .onStart(() => {
        if (!values.closing.value) scheduleOnRN(emit, "menu");
      });
    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(hold, double, single));
  }, [values, emit]);
}

// -- The gesture machine, on the UI thread. -----------------------------------------------------
// Each worklet is declared after the worklets it calls: core's `viewer.ts` says why.

/** What this touch means, read once at its first movement. */
function modeOf(values: Values, dx: number, dy: number, emit: (signal: Signal) => void): number {
  "worklet";
  if (values.pinching.value) return SPENT;
  if (values.zoom.value > ZOOMED) {
    cancelAnimation(values.panX);
    cancelAnimation(values.panY);
    values.grip.value = { x: values.panX.value, y: values.panY.value };
    return PANNING;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    cancelAnimation(values.pager);
    values.grip.value = { x: values.pager.value, y: 0 };
    return PAGING;
  }
  scheduleOnRN(emit, "bare");
  scheduleOnRN(emit, "held");
  return DISMISSING;
}

function pageMoved(values: Values, dx: number) {
  "worklet";
  const width = values.stage.value.width;
  const last = -(Math.max(1, values.count.value) - 1) * (width + GUTTER);
  const wanted = values.grip.value.x + dx;
  // Past either end of the deck the page follows the finger less and less, as a list does.
  if (wanted > 0) values.pager.value = rubberBand(wanted, width);
  else if (wanted < last) values.pager.value = last + rubberBand(wanted - last, width);
  else values.pager.value = wanted;
}

function dismissMoved(values: Values, dx: number, dy: number) {
  "worklet";
  values.dragX.value = dx;
  values.dragY.value = dy;
  const past = Math.abs(dy) >= DISMISS_DISTANCE;
  // Once per crossing: back under the line and out past it again is a second click.
  if (past && !values.past.value) scheduleOnRN(tick);
  values.past.value = past;
}

function pictureMoved(values: Values, dx: number, dy: number) {
  "worklet";
  const stage = values.stage.value;
  const wanted = { x: values.grip.value.x + dx, y: values.grip.value.y + dy };
  const bound = clampPan(values.zoom.value, values.fitted.value, stage, wanted);
  values.panX.value = bound.x + rubberBand(wanted.x - bound.x, stage.width);
  values.panY.value = bound.y + rubberBand(wanted.y - bound.y, stage.height);
}

function panMoved(values: Values, dx: number, dy: number, emit: (signal: Signal) => void) {
  "worklet";
  if (values.closing.value) return;
  if (values.mode.value === IDLE) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MOVED) return;
    values.mode.value = modeOf(values, dx, dy, emit);
  }
  if (values.mode.value === PAGING) pageMoved(values, dx);
  else if (values.mode.value === DISMISSING) dismissMoved(values, dx, dy);
  else if (values.mode.value === PANNING) pictureMoved(values, dx, dy);
}

function pageLetGo(values: Values, vx: number, emit: (signal: Signal) => void) {
  "worklet";
  const width = values.stage.value.width;
  const step = width + GUTTER;
  const from = values.current.value;
  // Toward the next item is positive: the finger moving left, the pager going negative.
  const carried = -(values.pager.value + from * step);
  const to = snapPage(carried, -vx, width, values.count.value, from);
  values.current.value = to;
  values.pager.value = withSpring(-to * step, { ...IOS_SPRING, velocity: vx });
  if (to !== from) scheduleOnRN(emit, to > from ? "next" : "previous");
}

function dismissLetGo(values: Values, dy: number, vy: number, emit: (signal: Signal) => void) {
  "worklet";
  values.past.value = false;
  if (dismissDecision(dy, vy) === "close") {
    scheduleOnRN(emit, "dismiss");
    return;
  }
  values.dragX.value = withSpring(0, IOS_SPRING);
  values.dragY.value = withSpring(0, IOS_SPRING);
  scheduleOnRN(emit, "chrome");
  scheduleOnRN(emit, "let");
}

/** A fling carried on and slowed into the bounds; where there is no room to move, straight home. */
function glideWithin(velocity: number, low: number, high: number) {
  "worklet";
  if (high - low < 1) return withSpring(low, IOS_SPRING);
  return withGlide(velocity, low, high);
}

function pictureLetGo(values: Values, vx: number, vy: number) {
  "worklet";
  const { fitted, stage, zoom } = values;
  const low = clampPan(zoom.value, fitted.value, stage.value, { x: -FAR, y: -FAR });
  const high = clampPan(zoom.value, fitted.value, stage.value, { x: FAR, y: FAR });
  values.panX.value = glideWithin(vx, low.x, high.x);
  values.panY.value = glideWithin(vy, low.y, high.y);
}

function panLetGo(
  values: Values,
  dy: number,
  vx: number,
  vy: number,
  emit: (signal: Signal) => void,
) {
  "worklet";
  const mode = values.mode.value;
  values.mode.value = IDLE;
  if (values.closing.value) return;
  if (mode === PAGING) pageLetGo(values, vx, emit);
  else if (mode === DISMISSING) dismissLetGo(values, dy, vy, emit);
  else if (mode === PANNING) pictureLetGo(values, vx, vy);
}

function fingersOf(event: {
  readonly scale: number;
  readonly focalX: number;
  readonly focalY: number;
  readonly numberOfPointers: number;
}): Fingers {
  "worklet";
  return {
    scale: event.scale,
    focal: { x: event.focalX, y: event.focalY },
    count: event.numberOfPointers,
  };
}

/** A grip on the picture where it stands now, the zoom and the pan as they are this frame. */
function gripHere(values: Values, fingers: Fingers): PinchGrip {
  "worklet";
  const here = { zoom: values.zoom.value, x: values.panX.value, y: values.panY.value };
  return pinchGrip(here, fingers, values.maxZoom.value);
}

function pinchHeld(values: Values, fingers: Fingers, emit: (signal: Signal) => void) {
  "worklet";
  if (values.closing.value || !values.zoomable.value) return;
  cancelAnimation(values.zoom);
  cancelAnimation(values.panX);
  cancelAnimation(values.panY);
  values.pinching.value = true;
  // A pan moving the picture lets it go; one paging or dragging to dismiss moves other things.
  if (values.mode.value === PANNING) values.mode.value = SPENT;
  values.pinch.value = gripHere(values, fingers);
  scheduleOnRN(emit, "bare");
}

function pinchMoved(values: Values, fingers: Fingers) {
  "worklet";
  if (values.closing.value || !values.zoomable.value) return;
  const grip = values.pinch.value;
  if (fingers.count !== grip.fingers.count) {
    values.pinch.value = gripHere(values, fingers);
    return;
  }
  const at = pinchTo(grip, fingers, values.fitted.value, values.maxZoom.value);
  values.zoom.value = at.zoom;
  values.panX.value = at.x;
  values.panY.value = at.y;
}

function settleFitted(values: Values, emit: (signal: Signal) => void) {
  "worklet";
  values.zoom.value = withSpring(1, IOS_SPRING);
  values.panX.value = withSpring(0, IOS_SPRING);
  values.panY.value = withSpring(0, IOS_SPRING);
  scheduleOnRN(emit, "chrome");
}

function pinchLetGo(values: Values, emit: (signal: Signal) => void) {
  "worklet";
  if (values.closing.value || !values.zoomable.value) return;
  const zoom = values.zoom.value;
  if (zoom < PINCH_CLOSES_UNDER) {
    scheduleOnRN(emit, "dismiss");
    return;
  }
  if (zoom <= ZOOMED) {
    settleFitted(values, emit);
    return;
  }
  // Back within the limit, about the middle of the stage, then within the bounds.
  const settled = Math.min(zoom, values.maxZoom.value);
  const stage = values.stage.value;
  const { x, y, width, height } = values.fitted.value;
  const middle = {
    x: stage.width / 2 - (x + width / 2),
    y: stage.height / 2 - (y + height / 2),
  };
  const kept = {
    x: middle.x - ((middle.x - values.panX.value) * settled) / zoom,
    y: middle.y - ((middle.y - values.panY.value) * settled) / zoom,
  };
  const bound = clampPan(settled, values.fitted.value, stage, kept);
  values.zoom.value = withSpring(settled, IOS_SPRING);
  values.panX.value = withSpring(bound.x, IOS_SPRING);
  values.panY.value = withSpring(bound.y, IOS_SPRING);
}

function doubleTapped(values: Values, at: Point, emit: (signal: Signal) => void) {
  "worklet";
  if (values.closing.value || !values.zoomable.value) return;
  if (values.zoom.value > ZOOMED) {
    settleFitted(values, emit);
    return;
  }
  const { x, y, width, height } = values.fitted.value;
  // The point tapped stays where it is while the picture grows about its middle.
  const wanted = {
    x: (at.x - (x + width / 2)) * (1 - DOUBLE_TAP_SCALE),
    y: (at.y - (y + height / 2)) * (1 - DOUBLE_TAP_SCALE),
  };
  const bound = clampPan(DOUBLE_TAP_SCALE, values.fitted.value, values.stage.value, wanted);
  values.zoom.value = withSpring(DOUBLE_TAP_SCALE, IOS_SPRING);
  values.panX.value = withSpring(bound.x, IOS_SPRING);
  values.panY.value = withSpring(bound.y, IOS_SPRING);
  scheduleOnRN(emit, "bare");
}

// -- A page. --------------------------------------------------------------------------------------

function mix(from: number, to: number, share: number): number {
  "worklet";
  return from + (to - from) * share;
}

function mixRect(from: Rect, to: Rect, share: number): Rect {
  "worklet";
  return {
    x: mix(from.x, to.x, share),
    y: mix(from.y, to.y, share),
    width: mix(from.width, to.width, share),
    height: mix(from.height, to.height, share),
  };
}

function Slot({
  item,
  at,
  stage,
  values,
  current,
  video,
  onDrawn,
}: {
  readonly item: StageItem;
  readonly at: number;
  readonly stage: Size;
  readonly values: Values;
  /** The item the viewer stands on, as React knows it; the UI thread's `current` leads it mid-swipe. */
  readonly current: boolean;
  readonly video: ReactNode;
  /** The current item's: its picture has been displayed, and so stands where the tile is. */
  readonly onDrawn: (() => void) | undefined;
}) {
  const content = contentOf(item, stage);
  const fitted = fitRect(content, stage);
  const {
    current: page,
    flight,
    origin,
    corners,
    fade,
    zoom,
    panX,
    panY,
    dragX,
    dragY,
    shrink,
  } = values;
  // Where the picture's frame is: the tile it came from, the stage's fitted rect, or the way
  // between the two. It is laid out once, fitted, and every frame of the flight draws it as the rect
  // it is at by a transform, so nothing the flight or a finger does is a layout (*What a style is
  // allowed to read*, at the head of this file). What the fingers do to it goes on top, about its
  // middle, as it did when the box was laid out. The tile's corners are the flight's to round off,
  // each its own, and a scale draws a corner at its own size, so each is asked for at the size that
  // comes out right.
  const clip = useAnimatedStyle(() => {
    const live = page.value === at;
    const share = live ? flight.value : 1;
    const drawn = transformTo(fitted, live ? mixRect(origin.value, fitted, share) : fitted);
    const scale = live ? zoom.value * dismissProgress(dragY.value).scale * shrink.value : 1;
    const round = (radius: number) =>
      mix(radius, 0, share) / Math.max(0.01, scale * Math.sqrt(drawn.sx * drawn.sy));
    const tile = corners.value;
    return {
      opacity: live ? fade.value : 1,
      borderTopLeftRadius: round(tile.topLeft),
      borderTopRightRadius: round(tile.topRight),
      borderBottomRightRadius: round(tile.bottomRight),
      borderBottomLeftRadius: round(tile.bottomLeft),
      transform: [
        { translateX: drawn.x + (live ? panX.value + dragX.value : 0) },
        { translateY: drawn.y + (live ? panY.value + dragY.value : 0) },
        { scale },
        { scaleX: drawn.sx },
        { scaleY: drawn.sy },
      ],
    };
  }, [at, fitted.x, fitted.y, fitted.width, fitted.height]);
  // The picture in it: cropped as the tile crops it, growing into the whole picture. The clip is
  // scaled by a different amount across than down while its shape goes from the tile's to the
  // picture's, and the picture takes that back out, so it is only ever drawn at its own shape.
  const picture = useAnimatedStyle(() => {
    const live = page.value === at;
    const share = live ? flight.value : 1;
    const from = live ? origin.value : fitted;
    const box = transformTo(fitted, mixRect(from, fitted, share));
    const own = transformTo(fitted, mixRect(coverRect(content, from), fitted, share));
    return {
      transform: [
        { translateX: (own.x - box.x) / box.sx },
        { translateY: (own.y - box.y) / box.sy },
        { scaleX: own.sx / box.sx },
        { scaleY: own.sy / box.sy },
      ],
    };
  }, [at, content.width, content.height, fitted.x, fitted.y, fitted.width, fitted.height]);
  const shown = item.picture ?? item.thumb;
  return (
    <View
      style={[styles.page, { left: at * (stage.width + GUTTER), width: stage.width }]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.clip,
          { left: fitted.x, top: fitted.y, width: fitted.width, height: fitted.height },
          clip,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, picture]}>
          {shown === undefined ? null : (
            <Image
              source={{ uri: shown }}
              {...(item.thumb === undefined ? {} : { placeholder: { uri: item.thumb } })}
              contentFit="fill"
              placeholderContentFit="fill"
              transition={item.picture === undefined ? 0 : PICTURE_FADE_MS}
              recyclingKey={item.id}
              // A view copy stays sharp at three times; an original is decoded at the screen's size.
              allowDownscaling={item.original}
              {...(onDrawn === undefined ? {} : { onDisplay: onDrawn })}
              accessibilityIgnoresInvertColors
              style={StyleSheet.absoluteFill}
              testID={`stage-picture-${item.id}`}
            />
          )}
          {/* In the picture's own drawing, so a player is never drawn at the clip's shape. */}
          {current ? video : null}
        </Animated.View>
        {item.kind === "video" && !current ? (
          <View style={styles.mark}>
            <PlayDisc size={PLAY_DISC} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Black whatever the theme: a photo is looked at against nothing.
  backdrop: { backgroundColor: "#000" },
  glass: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  page: { position: "absolute", top: 0, bottom: 0 },
  clip: { position: "absolute", overflow: "hidden" },
  mark: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
