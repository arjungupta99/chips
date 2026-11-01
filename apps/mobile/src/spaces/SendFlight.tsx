/**
 * A message's words, from the field to their bubble (`docs/proposals/send-animation-mocks.html`,
 * A — Arjun's pick, 24 September 2026: "go with A"); and its photos, from the staged strip to
 * their tiles (`docs/proposals/send-curve-mocks.html`, 25 September 2026: "image sends happen
 * without proper transitions").
 *
 * On a send the words leave the field from exactly where they were typed: a copy of the bubble
 * they are about to be — its padding, its corner, its time under the words, as wide as it may be
 * in the room, so they break where it breaks them — drawn over the room and over the composer. Its
 * words are drawn as the bubble draws them, by `Markdown`. Drawn as plain text, as the field shows
 * them, a blank line between two paragraphs flew a whole line tall and closed to the bubble's gap
 * between paragraphs in the frame they landed (Arjun's phone, 17 October 2026); bold, links and
 * lists would have changed there too. They change in the frame they leave the field instead, the
 * frame they are wrapped again to the bubble's width. The bubble's colour comes up under them where
 * they sat, the ink turning white on it, and they go for the bubble on two springs, up a little
 * quicker than across, so the path curves. They go when the room draws their line and starts
 * rising to show it, in that frame and on the room's spring, so that the room and the words set off
 * together (`target`); the room says where the bubble is from the frame it is drawn
 * (`BubbleWatch.tsx`). The bubble is kept out of sight while they are in the air
 * (`sendLanding.ts`). When they are on it, it is drawn where they are and they go, in that order:
 * the same pixels, so nothing is seen to change.
 *
 * A photo leaves its chip the same way: a copy of the picture, the chip's forty points and corner,
 * goes for the tile the room draws it in, growing to the tile's size and corner as it goes, on the
 * same two springs. It waits a frame for the room to say where the tile is, since the field cannot
 * reckon a tile's place as it can a bubble's; the tile is held out of sight until the picture is on
 * it. Words and photos sent together fly together, the words above and the pictures under, as the
 * line draws them. The copy is laid out at the tile's size and scaled down to the chip's, and the
 * picture inside is scaled back up by as much and a little more, so it covers the smaller box as
 * the chip's own thumbnail did and the crop opens out to the tile's rather than stretching.
 *
 * The room rises with them, on the same spring as their height, as Messages' does: the transcript
 * and the new bubble move as one body, so the gap between the words and the bubble above them
 * only ever closes, from the field's distance down to a bubble's. Left to scroll up on its own —
 * the list's ease to its foot, a third of a second slow at both ends — the room set off later and
 * slower than the words, and they passed through the bubble above on their way (Arjun's phone,
 * 25 September 2026). So the rows above rise on the words' own spring (`ROOM_SPRING`, the room's
 * transition in `RoomMotion.tsx`), from the frame the line is drawn, and the bubble the words go
 * for is where it will stand: the room's measure is of the layout, which the transition does not
 * move. The room's foot — a thinking bubble under the line — stays where it is, and the words go
 * above it.
 *
 * It is the new space's flight (`newSpace/Window.tsx`) done again for a room already built: the
 * same watch on the bubble, the same colour field taken where the words are, the same landing.
 * What differs is how it keeps time, and that the room is not waited on for long.
 *
 * The copy is on the glass in the frame the field empties, where the words were. The layer it is
 * drawn in is the room's for as long as the room is open, and knows where it is on the screen
 * before anything is sent; drawn into a layer made for it, the copy waited a round trip through
 * JavaScript to be told where it was, and the field stood empty for three frames first (the
 * simulator, 24 September 2026). And the springs are stepped a frame at a time on a clock of their
 * own, moved by the frames' own times and by at most `STEADY_MS` in one (as the viewer's flight
 * is, `media/Stage.tsx`): the phone is busy in the moment after a send, and on the wall clock the
 * first frame anyone saw of the copy was a quarter of the way to the bubble already. A stall now
 * costs a pause, never a jump; and since they are stepped, the springs chase a bubble that moves at
 * the speed they are going rather than starting again.
 *
 * A room that never says where the bubble is, or will not keep it still, is not waited on: the
 * words land where they have got to and the bubble shows wherever it is.
 *
 * Where the capsule over the field changed where messages here go, its arrow and faces fly up with
 * the words and become the route over the bubble (ADR 0081): a copy of the route's arrow and faces,
 * laid out at the route's size, leaves from where the capsule drew them at the capsule's size and
 * grows to the route's on the room's spring as it goes, and the route is held out of sight until it
 * is on it, as the bubble is (`useRouteLanding`). The sender's own face in the route comes after.
 *
 * Every frame of it is a transform, an opacity or a colour (ADR 0061): each copy is laid out once,
 * when it is made — a picture's once more, when the room says how big its tile is — and moved.
 */

import { type Directory, holdsTable, ROOM_SPRING as UP } from "@chipschat/core";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PixelRatio, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  type AnimatedRef,
  type FrameInfo,
  measure,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { Rect } from "../newSpace/geometry";
import { avatarSide } from "../ui/Avatar";
import { measured } from "../ui/measured";
import { usePalette } from "../ui/theme";
import { BUBBLE, OUTGOING, RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { Told } from "./BubbleWatch";
import { Arrow, Faces, stepOf } from "./LaneChain";
import { STAMP_INK } from "./Line";
import { Markdown } from "./Markdown";
import { type Field, FieldPicture } from "./ScrollColours";
import { FIELD_HEIGHT, FIELD_STRETCH, FIELD_WIDTH, placeField } from "./scrollField";
import type { Flying, Picture, RouteLaunch } from "./sendLanding";

/**
 * The mock's second spring, across, as stiffness and damping over a mass of one: 0.66 s at a
 * damping ratio of 0.94, slower and flatter than the one up (`UP`, the room's own), so the words
 * reach the bubble's height a little before its side.
 */
const ACROSS = { stiffness: 91, damping: 18 } as const;
/** The most a frame moves the flight's clock on, in milliseconds. */
const STEADY_MS = 20;
/**
 * Within this many points of the mark, and all but still, a spring has arrived, and is put on it:
 * half of one of the screen's own pixels, so the copy is on the bubble's pixels already and the
 * putting is not seen. At a point and a half it was a tick at the end. At half a point, which is
 * a pixel and a half on a phone, the words crept the last of the way a quarter of a pixel a frame
 * and then stepped two (the simulator, 17 October 2026). The spring takes about a tenth of a
 * second more to come this close, in which the words move a pixel or so.
 */
const ARRIVED = 0.5 / PixelRatio.get();
/** Points a second: slower than this, it has stopped. */
const RESTING = 20;
/** The bubble's colour coming up under the words where they sat, and the ink turning white on it. */
const GROUND_MS = 110;
/** How long the words wait where they were typed for the room to draw their line (`target`). */
const GRACE_MS = 250;
/**
 * How long the words wait to hear where their bubble is before they give up and let it show
 * wherever it is — a row the list has not drawn, a line that never came.
 */
const AIM_MS = 700;
/** And how long before they land wherever they have got to, for a room that keeps moving it. */
const MOST_MS = 1600;
/** A chip's thumbnail's corner (`Composer.tsx`), and a tile's (`Attachments.tsx`). */
const CHIP_CORNER = RADIUS.sm;
const TILE_CORNER = RADIUS.md;
/** The route's copy grows from the field's faces to the route's (`AddressInField.tsx`, `Line.tsx`). */
const ROUTE_FROM = avatarSide("xs") / avatarSide("sm");

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where the layer is on the screen, and how wide. */
interface Origin extends Point {
  readonly width: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

interface FlightProps {
  /** What the bubble's time says now: "sending…", or the time once the server has the line. */
  readonly stamp: string;
  /** The bubble closes up to one of yours above it, and its top corner with it (`cornersOf`). */
  readonly joins: boolean;
  readonly told: Told;
  /** The tiles' watches, in the pictures' order (`sendLanding.ts`). */
  readonly tolds: readonly Told[];
  /** The route's watch, for a send whose line will wear one (ADR 0081). */
  readonly routeTold: Told;
  /** The names a route's copy draws its faces with. */
  readonly directory: Directory;
  readonly field: Field;
  /** On the bubble: the room draws it where the copy is, and the copy goes (`useSendFlight`). */
  readonly onLanded: (id: number) => void;
}

/**
 * The room's layer for its sends' words, over the room and its composer, there and measured for
 * as long as the room is open; and in it, the words of the send in the air, if any.
 */
export function FlightLayer({
  flying,
  ...props
}: FlightProps & { readonly flying: Flying | undefined }) {
  const host = useAnimatedRef<View>();
  const laid = useSharedValue(0);
  const origin = useSharedValue<Origin | undefined>(undefined);
  useAnimatedReaction(
    () => laid.value,
    (now) => {
      if (now === 0) return;
      const box = measure(host);
      if (box !== null) origin.value = { x: box.pageX, y: box.pageY, width: box.width };
    },
  );
  return (
    <Animated.View
      ref={host}
      collapsable={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={() => {
        laid.value += 1;
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {flying === undefined ? null : (
        <Flight key={flying.id} flying={flying} origin={origin} {...props} />
      )}
    </Animated.View>
  );
}

/** One picture's copy: where it is in the layer, how far grown from the chip to the tile, and how fast. */
interface Copy {
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  /** Nought at the chip's size, one at the tile's. */
  readonly grown: SharedValue<number>;
  readonly vx: SharedValue<number>;
  readonly vy: SharedValue<number>;
  readonly vg: SharedValue<number>;
  /** The tile's size, once the room has said; the copy is laid out at it. */
  readonly tile: SharedValue<Size | undefined>;
}

function useCopy(picture: Picture | undefined, origin: SharedValue<Origin | undefined>): Copy {
  const [start] = useState(() => {
    const at = origin.value ?? { x: 0, y: 0 };
    return picture === undefined
      ? { x: 0, y: 0 }
      : { x: picture.from.x - at.x, y: picture.from.y - at.y };
  });
  return {
    x: useSharedValue(start.x),
    y: useSharedValue(start.y),
    grown: useSharedValue(0),
    vx: useSharedValue(0),
    vy: useSharedValue(0),
    vg: useSharedValue(0),
    tile: useSharedValue<Size | undefined>(undefined),
  };
}

/**
 * The route's copy: where its left edge and its middle are in the layer, how big against the
 * route's own size, and how fast each is moving.
 */
interface RouteCopy {
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  readonly scale: SharedValue<number>;
  readonly vx: SharedValue<number>;
  readonly vy: SharedValue<number>;
  readonly vs: SharedValue<number>;
  /** Its own size, laid out at the route's. */
  readonly size: SharedValue<Size | undefined>;
}

function useRouteCopy(
  route: RouteLaunch | undefined,
  origin: SharedValue<Origin | undefined>,
): RouteCopy {
  const [start] = useState(() => {
    const at = origin.value ?? { x: 0, y: 0 };
    return route === undefined
      ? { x: 0, y: 0 }
      : { x: route.from.x - at.x, y: route.from.y + route.from.height / 2 - at.y };
  });
  return {
    x: useSharedValue(start.x),
    y: useSharedValue(start.y),
    scale: useSharedValue(ROUTE_FROM),
    vx: useSharedValue(0),
    vy: useSharedValue(0),
    vs: useSharedValue(0),
    size: useSharedValue<Size | undefined>(undefined),
  };
}

/** A copy's own size, once it is in the tree (`ui/measured.ts`); nothing before. */
function sizeOf(ref: AnimatedRef<View>): Size | undefined {
  "worklet";
  const box = measured(ref);
  return box === null || box.width <= 0 ? undefined : { width: box.width, height: box.height };
}

function Flight({
  flying,
  origin,
  stamp,
  joins,
  told,
  tolds,
  routeTold,
  directory,
  field,
  onLanded,
}: FlightProps & { readonly flying: Flying; readonly origin: SharedValue<Origin | undefined> }) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const { id, words, text, rest, pictures, route } = flying;
  // How many pictures fly, which is all the frame's worklets may know of them: a picture can carry
  // its decoded image, a native object no worklet can be handed (`useStaged`).
  const flown = pictures.length;
  const { aim, settled } = told;
  const { viewportTop, viewportHeight, scroll, lifting, goal } = field;
  // The copy, and its own size once it is drawn: what the place it is going to is reckoned from
  // while the room has not said.
  const body = useAnimatedRef<View>();
  const size = useSharedValue<Size | undefined>(undefined);
  // Where the words sat, with the bubble's padding round them, in this layer: known before the
  // copy is drawn, so its first frame is there.
  const [start] = useState(() => {
    const at = origin.value ?? { x: 0, y: 0 };
    return words === undefined
      ? { x: 0, y: 0 }
      : { x: words.x - at.x - BUBBLE.padX, y: words.y - at.y - BUBBLE.padY };
  });
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const across = useSharedValue(0);
  const up = useSharedValue(0);
  const clock = useSharedValue(0);
  // The frame the clock last moved in, on the frames' own clock.
  const last = useSharedValue(-1);
  const ground = useSharedValue(0);
  const done = useSharedValue(0);
  // Set when the room has been waited on long enough.
  const late = useSharedValue(0);
  // The pictures' copies, one set of springs each, made up front: hooks are counted.
  const copies = [
    useCopy(pictures[0], origin),
    useCopy(pictures[1], origin),
    useCopy(pictures[2], origin),
    useCopy(pictures[3], origin),
  ];
  const routed = useRouteCopy(route, origin);
  const routeBody = useAnimatedRef<View>();
  // The room's column, less the far quarter a bubble of yours leaves clear (`Line.tsx`).
  const most = (width - 2 * SPACE.lg) * (Number.parseFloat(BUBBLE.maxWidth) / 100);
  // And all of it for a table, as the bubble is (ADR 0184).
  const wide = useMemo(() => holdsTable(text), [text]);
  const ink = palette.ink;

  // Where the words are going. Once the room has said where the bubble is: there, which is where
  // it will stand once the room has risen to it. Until then they wait where they were typed, the
  // colour coming up under them: the room starts rising in the frame it draws the line, and the
  // words set off in that frame too, on the same spring, so the room and the words go as one body.
  // They were meant to set off at the tap, for where the field reckons the bubble will rest, but
  // could not until `onLayout` had told them their own size, a fifth of a second in — by when the
  // room had been rising without them for a tenth (the simulator, 4 October 2026). A room slow to
  // draw the line is not waited on for long: past `GRACE_MS` they go for the field's reckoning, a
  // bubble of this size against the column's right edge, and turn for the bubble when the room says.
  //
  // Where the bubble will stand is where the room says it is, less what the room has yet to move
  // it: a send from a little above the foot takes the list down to it as the words go (`homeward`,
  // in `RoomMotion.tsx`), and the bubble goes up with the list. Going for where it is at each
  // frame, the words would chase it up the glass a spring behind the room.
  const coming = (): number => {
    "worklet";
    return lifting.value === 1 ? goal.value - scroll.value : 0;
  };
  const target = (from: Origin): Point | undefined => {
    "worklet";
    const at = aim.value;
    if (at !== undefined) return { x: at.x - from.x, y: at.y + coming() - from.y };
    const laid = size.value;
    if (clock.value < GRACE_MS || rest === undefined || laid === undefined) return undefined;
    return { x: from.width - SPACE.lg - laid.width, y: rest - from.y - laid.height };
  };

  // Where a picture is going: its tile, once the room has said where that is, as for the words.
  // A tile's place is not reckoned ahead: the album's shapes are the line's to decide, and the
  // room says a frame after the line is drawn.
  const tileOf = (index: number, from: Origin): Rect | undefined => {
    "worklet";
    const at = tolds[index]?.aim.value;
    if (at === undefined) return undefined;
    return { x: at.x - from.x, y: at.y + coming() - from.y, width: at.width, height: at.height };
  };

  // One step of the two springs towards the bubble at (toX, toY); whether they are on it, and it
  // is standing still there.
  const towards = (toX: number, toY: number, seconds: number): boolean => {
    "worklet";
    across.value += (-ACROSS.stiffness * (x.value - toX) - ACROSS.damping * across.value) * seconds;
    up.value += (-UP.stiffness * (y.value - toY) - UP.damping * up.value) * seconds;
    x.value += across.value * seconds;
    y.value += up.value * seconds;
    const near = Math.abs(x.value - toX) < ARRIVED && Math.abs(y.value - toY) < ARRIVED;
    const still = Math.abs(across.value) < RESTING && Math.abs(up.value) < RESTING;
    if (!near || !still || settled.value !== 1) return false;
    x.value = toX;
    y.value = toY;
    return true;
  };

  // One step of a picture's springs towards its tile: across, up, and grown, the last two on the
  // room's spring so the picture is its tile's size as it reaches its tile's height.
  const towardsTile = (copy: Copy, to: Rect, seconds: number): boolean => {
    "worklet";
    copy.tile.value = { width: to.width, height: to.height };
    copy.vx.value +=
      (-ACROSS.stiffness * (copy.x.value - to.x) - ACROSS.damping * copy.vx.value) * seconds;
    copy.vy.value += (-UP.stiffness * (copy.y.value - to.y) - UP.damping * copy.vy.value) * seconds;
    copy.vg.value +=
      (-UP.stiffness * (copy.grown.value - 1) - UP.damping * copy.vg.value) * seconds;
    copy.x.value += copy.vx.value * seconds;
    copy.y.value += copy.vy.value * seconds;
    copy.grown.value += copy.vg.value * seconds;
    const span = Math.max(to.width, to.height);
    const near =
      Math.abs(copy.x.value - to.x) < ARRIVED &&
      Math.abs(copy.y.value - to.y) < ARRIVED &&
      Math.abs(1 - copy.grown.value) * span < ARRIVED;
    const still =
      Math.abs(copy.vx.value) < RESTING &&
      Math.abs(copy.vy.value) < RESTING &&
      Math.abs(copy.vg.value) * span < RESTING;
    return near && still;
  };

  // The route's arrow and faces, a step nearer the route over the bubble: across, up, and grown to
  // the route's size on the room's spring. Whether they are on it, and it is still. Nothing to do
  // for a send whose line wears no route.
  const flyRoute = (from: Origin, seconds: number): boolean => {
    "worklet";
    if (route === undefined) return true;
    const at = routeTold.aim.value;
    if (at === undefined) return false;
    const toX = at.x - from.x;
    const toY = at.y + at.height / 2 + coming() - from.y;
    const r = routed;
    r.vx.value += (-ACROSS.stiffness * (r.x.value - toX) - ACROSS.damping * r.vx.value) * seconds;
    r.vy.value += (-UP.stiffness * (r.y.value - toY) - UP.damping * r.vy.value) * seconds;
    r.vs.value += (-UP.stiffness * (r.scale.value - 1) - UP.damping * r.vs.value) * seconds;
    r.x.value += r.vx.value * seconds;
    r.y.value += r.vy.value * seconds;
    r.scale.value += r.vs.value * seconds;
    const span = Math.max(at.width, at.height);
    const near =
      Math.abs(r.x.value - toX) < ARRIVED &&
      Math.abs(r.y.value - toY) < ARRIVED &&
      Math.abs(1 - r.scale.value) * span < ARRIVED;
    const still =
      Math.abs(r.vx.value) < RESTING &&
      Math.abs(r.vy.value) < RESTING &&
      Math.abs(r.vs.value) * span < RESTING;
    return near && still && routeTold.settled.value === 1;
  };

  // Landed: the route's copy put exactly on the route, when the room has said where it is.
  const settleRoute = (from: Origin): void => {
    "worklet";
    const at = routeTold.aim.value;
    if (route === undefined || at === undefined) return;
    routed.x.value = at.x - from.x;
    routed.y.value = at.y + at.height / 2 + coming() - from.y;
    routed.scale.value = 1;
  };

  // The words, a step nearer their bubble; whether they are on it. Nothing to do for a send with
  // no words, which is on its bubble already.
  const flyWords = (from: Origin, seconds: number): boolean => {
    "worklet";
    if (words === undefined) return true;
    const to = target(from);
    return to !== undefined && towards(to.x, to.y, seconds);
  };

  // Every picture, a step nearer its tile; whether all are on theirs, and the tiles still.
  const flyPictures = (from: Origin, seconds: number): boolean => {
    "worklet";
    let all = true;
    for (let index = 0; index < flown; index += 1) {
      const copy = copies[index];
      const to = tileOf(index, from);
      if (copy === undefined || to === undefined) {
        all = false;
        continue;
      }
      const on = towardsTile(copy, to, seconds);
      if (!on || tolds[index]?.settled.value !== 1) all = false;
    }
    return all;
  };

  // Landed: every picture that knows its tile put exactly on it.
  const settlePictures = (from: Origin): void => {
    "worklet";
    for (let index = 0; index < flown; index += 1) {
      const copy = copies[index];
      const to = tileOf(index, from);
      if (copy === undefined || to === undefined) continue;
      copy.x.value = to.x;
      copy.y.value = to.y;
      copy.grown.value = 1;
    }
  };

  // The copies' own sizes, taken once each is in the tree.
  const measureCopies = (): void => {
    "worklet";
    if (words !== undefined && size.value === undefined) size.value = sizeOf(body);
    if (route !== undefined && routed.size.value === undefined) {
      routed.size.value = sizeOf(routeBody);
    }
  };

  // One frame of the flight. Made once, for the flight's life: Reanimated registers a frame
  // callback afresh whenever it is a new function, and the room draws the flight again on every
  // word the store hears while the words are in the air — the server's answer, a harness starting
  // its run. The first frame of a callback registered again was told nothing of the frame before,
  // and the clock jumped by its most (the simulator, 4 October 2026): a leap of more than two
  // frames' worth, in one, on a phone drawing at 120 Hz. The clock is moved by the frames' own
  // times instead, kept here, so a frame moves it by what it took, and never by more than
  // `STEADY_MS`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one flight, keyed by its id; made once.
  const frame = useCallback((info: FrameInfo) => {
    "worklet";
    if (done.value === 1) return;
    const was = last.value;
    last.value = info.timestamp;
    const step = was < 0 ? 0 : Math.min(STEADY_MS, Math.max(0, info.timestamp - was));
    clock.value += step;
    ground.value = 1 - (1 - Math.min(1, clock.value / GROUND_MS)) ** 3;
    measureCopies();
    const seconds = step / 1000;
    // All are stepped every frame, whichever is there first.
    const from = origin.value ?? { x: 0, y: 0, width };
    const wordsOn = flyWords(from, seconds);
    const picturesOn = flyPictures(from, seconds);
    const routeOn = flyRoute(from, seconds);
    // On it, or waited on long enough: the bubble and tiles are drawn where the copies are, and the
    // copies go (`useSendFlight`).
    if (!(wordsOn && picturesOn && routeOn) && late.value === 0) return;
    settlePictures(from);
    settleRoute(from);
    done.value = 1;
    scheduleOnRN(onLanded, id);
  }, []);
  useFrameCallback(frame);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one flight, keyed by its id; set once.
  useEffect(() => {
    const unheard = setTimeout(() => {
      if (aim.value === undefined && pictures.length === 0) late.value = 1;
    }, AIM_MS);
    const most = setTimeout(() => {
      late.value = 1;
    }, MOST_MS);
    return () => {
      clearTimeout(unheard);
      clearTimeout(most);
    };
  }, []);

  const box = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  const colour = useAnimatedStyle(() => ({ opacity: ground.value }));
  const unlit = useAnimatedStyle(() => ({ opacity: 1 - ground.value }));
  const time = useAnimatedStyle(() => ({ opacity: STAMP_INK * ground.value }));
  // The room's colour field, taken where the words are, as each bubble takes it where it is
  // (`ScrollColours.tsx`): the colour they land in is the colour the bubble shows.
  const sample = useAnimatedStyle(() => {
    const from = origin.value;
    const tall = viewportHeight.value;
    const at = placeField(viewportTop.value, tall > 0 ? tall : 1, (from?.y ?? 0) + y.value);
    return {
      opacity: tall > 0 ? 1 : 0,
      transform: [{ translateY: at.translateY }, { scaleX: FIELD_STRETCH }, { scaleY: at.scaleY }],
    };
  });
  return (
    <>
      {words === undefined ? null : (
        <Animated.View
          ref={body}
          collapsable={false}
          style={[
            styles.flight,
            joins ? styles.joins : null,
            { maxWidth: most },
            wide ? { width: most } : null,
            box,
          ]}
          testID="send-flight"
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: OUTGOING.ground }, colour]}
          >
            <Animated.View style={[styles.field, sample]}>
              <FieldPicture />
            </Animated.View>
          </Animated.View>
          {/* The words as the bubble draws them, in its white; and over them in the page's ink,
              fading as its colour comes up, so every run turns white on it, links and code too. */}
          <View>
            <Markdown text={text} ink={OUTGOING.ink} />
            <Animated.View style={[StyleSheet.absoluteFill, unlit]}>
              <Markdown text={text} ink={ink} />
            </Animated.View>
          </View>
          <Animated.Text
            maxFontSizeMultiplier={BUBBLE.maxScale}
            style={[styles.stamp, { color: OUTGOING.ink }, time]}
          >
            {stamp}
          </Animated.Text>
        </Animated.View>
      )}
      {pictures.map((picture, index) => {
        const copy = copies[index];
        return copy === undefined ? null : (
          <PictureCopy key={picture.attachmentId} picture={picture} copy={copy} />
        );
      })}
      {route === undefined ? null : (
        <RouteFlight route={route} copy={routed} body={routeBody} directory={directory} />
      )}
    </>
  );
}

/**
 * The capsule's arrow and faces on their way to the route over the bubble: laid out as the route
 * draws them, and scaled about their left edge and middle from the capsule's size to the route's.
 */
function RouteFlight({
  route,
  copy,
  body,
  directory,
}: {
  readonly route: RouteLaunch;
  readonly copy: RouteCopy;
  /** Measured by the flight as soon as it is drawn: until then, unseen. */
  readonly body: AnimatedRef<View>;
  readonly directory: Directory;
}) {
  const { x, y, scale, size } = copy;
  const moving = useAnimatedStyle(() => {
    const laid = size.value;
    const width = laid?.width ?? 0;
    const height = laid?.height ?? 0;
    return {
      opacity: laid === undefined ? 0 : 1,
      transform: [
        { translateX: x.value - (width * (1 - scale.value)) / 2 },
        { translateY: y.value - height / 2 },
        { scale: scale.value },
      ],
    };
  });
  return (
    <Animated.View
      ref={body}
      collapsable={false}
      style={[styles.route, moving]}
      testID="send-flight-route"
    >
      <Arrow />
      <Faces step={stepOf(directory, route.to)} />
    </Animated.View>
  );
}

/**
 * A picture on its way from its chip to its tile: laid out at the tile's size once the room says
 * it, scaled down to the chip's forty points and up again as it grows, its corner going from the
 * chip's to the tile's. The picture inside is scaled back by as much, and a little more, so it
 * covers the box at every size the way the chip's thumbnail and the tile both do.
 */
function PictureCopy({ picture, copy }: { readonly picture: Picture; readonly copy: Copy }) {
  const { from } = picture;
  const { x, y, grown, tile } = copy;
  const outer = useAnimatedStyle(() => {
    const box = tile.value ?? { width: from.width, height: from.height };
    const done = Math.max(0, Math.min(1, grown.value));
    const scaleX = from.width / box.width + (1 - from.width / box.width) * grown.value;
    const scaleY = from.height / box.height + (1 - from.height / box.height) * grown.value;
    const corner = CHIP_CORNER + (TILE_CORNER - CHIP_CORNER) * done;
    return {
      width: box.width,
      height: box.height,
      borderRadius: corner / Math.min(scaleX, scaleY),
      transform: [
        { translateX: x.value - (box.width * (1 - scaleX)) / 2 },
        { translateY: y.value - (box.height * (1 - scaleY)) / 2 },
        { scaleX },
        { scaleY },
      ],
    };
  });
  const inner = useAnimatedStyle(() => {
    const box = tile.value ?? { width: from.width, height: from.height };
    const scaleX = from.width / box.width + (1 - from.width / box.width) * grown.value;
    const scaleY = from.height / box.height + (1 - from.height / box.height) * grown.value;
    const cover = Math.max(scaleX, scaleY);
    return { transform: [{ scaleX: cover / scaleX }, { scaleY: cover / scaleY }] };
  });
  return (
    <Animated.View style={[styles.picture, outer]} testID="send-flight-picture">
      <Animated.View style={[StyleSheet.absoluteFill, inner]}>
        <Image
          source={picture.picture ?? { uri: picture.uri }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A bubble of yours (`Line.tsx`), put at the top left of the layer and moved from there.
  flight: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
    borderRadius: BUBBLE.radius,
    paddingHorizontal: BUBBLE.padX,
    paddingVertical: BUBBLE.padY,
    alignSelf: "flex-start",
  },
  joins: { borderTopRightRadius: BUBBLE.inner },
  stamp: { fontSize: TEXT.xs, alignSelf: "flex-end" },
  field: { position: "absolute", top: 0, left: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT },
  // A tile of yours (`Attachments.tsx`), the same way.
  picture: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  // The route's arrow and faces (`Line.tsx`), the same way.
  route: {
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
  },
});
