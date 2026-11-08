/**
 * How the room moves (ADR 0074, ADR 0075): one transition for everything in it, on one spring and
 * one clock, so that whatever moves together stays together.
 *
 * Whatever changes at the room's foot — a line landing, a reply under the thinking bubble, the
 * bubble coming, growing a line or going, a bubble giving its time up to the one that joins it,
 * the composer growing under the lines — React lays the room out once, at its new size, and every
 * row and bubble whose frame changed is taken from where it was drawn to where it now stands, in
 * the frame the change is drawn, on one spring. That is Reanimated's layout transition: it is run
 * on the UI thread from the mount, and each frame of it sets the views' frames there, with no
 * render, no Yoga and no commit (the layout animations proxy), so a busy JavaScript thread can
 * neither start it late nor stall it.
 *
 * Three rules keep the rows together, however the changes come:
 *
 * - A move that lands on a move keeps its speed (`roomSpring`). The spring is linear, so a row
 *   sent on while it is going goes where the first move and the second, added up, would take it —
 *   and two rows sent on by the same changes stay the same distance apart, whenever the changes
 *   come. A move that started again from a standstill did not: the reply before still rising on
 *   its own speed and the rows round it starting from nothing, two grouped bubbles closed their
 *   two-point gap and ran into each other for a tenth of a second, five replies 350 ms apart (the
 *   simulator, 25 September 2026).
 * - Everything in the room keeps one clock (`Clock`), which a frame moves by at most a frame and a
 *   fifth: a stall costs every row the same pause, never a jump, and never one row ahead of another.
 * - A row that lands comes in under the row above it as that row is drawn and moving, not under
 *   where that row will stand (`arrive`): the row above is still on its way from the last landing,
 *   and a row that rose only its own height came up into it.
 *
 * And every animation here says where it rests a frame before it says it has finished (`landed`),
 * because Reanimated never draws the frame an animation finishes in.
 *
 * What comes in rises in with the rows above it, as one body, fading up as it comes. What goes
 * fades where it stands while the rows close over it.
 *
 * Except that somebody else's line taller than the glass rises only until its first line is under
 * the bar, and is read from there (Arjun, 6 October 2026: "show the start of long replies"). The
 * rows rise by all of its height, as the layout says; the list's offset goes up by what would have
 * taken its start past the top, from the same instant on the same spring and clock (`Lift`). A
 * row's place on the glass is where it is in the list less the offset, and the two are the same
 * spring at different sizes, so on the glass it is one rise, shorter, and the reader is left up the
 * history, at the start, as one who scrolled there.
 *
 * A reader up the history is not moved: the transition goes at once, and the room moves the list's
 * offset with the line across the foot of the glass, so the glass does not change (`keep`) — except
 * by what they do there themselves. A line they delete closes on the room's spring, and one they
 * bring back by Undo opens its place on it, where they are reading (ADR 0167, `madeHere`): at once,
 * the rows over it jumped shut in a frame, and open again in another (the simulator, 15 October
 * 2026, on Arjun's "the scrolling moves abruptly"). With
 * Reduce Motion, nothing travels; what comes and goes fades. What moves them is what they asked
 * for: a line of theirs sent from up there takes the list to the foot (`send`), and the answer to
 * it to its start, or the foot when it is shorter than the glass (`answer`), on the room's spring.
 *
 * Nearer the foot than that the room keeps nobody's place, and the list's offset stays where it is
 * while the rows rise; so a line of theirs sent from a little above the foot takes the list down to
 * it too, from the change that draws it (`homeward`), or it lands as far below its place as the list
 * was above the foot — under the field.
 */

import {
  ROOM_FADE_IN_MS as FADE_IN_MS,
  ROOM_FADE_OUT_MS as FADE_OUT_MS,
  ROOM_SPRING,
  STEADY_FRAME_MS,
  springAt,
} from "@chipschat/core";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";
import {
  type FlatList,
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  type AnimatableValue,
  type AnimatedRef,
  type Animation,
  cancelAnimation,
  defineAnimation,
  Easing,
  type EntryAnimationsValues,
  type LayoutAnimation,
  LayoutAnimationConfig,
  type LayoutAnimationFunction,
  type LayoutAnimationsValues,
  measure,
  type SharedValue,
  scrollTo,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { useReduceMotion } from "../ui/useReduceMotion";
import type { Field, Own } from "./field";
import { GLIDE } from "./heldWidth";
import { movedGoal } from "./liftGoal";
import { wholeFrame } from "./roomFrame";
import type { Row } from "./spaces";

/** Within this many points of the foot the room moves with what lands; further up, it holds still. */
export const NEAR = 100;
/** And back within this many, it moves again: a margin, so a reader resting at the line does not flicker. */
export const BACK = 60;
/** How long a bubble's corners take to round or sharpen as it joins a turn or leaves one. */
const CORNER_MS = 320;
const CORNERS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
] as const;
/**
 * Moves started closer together than this are one change to the room. A mount starts all of its
 * moves at once, one after another in the same pass on the UI thread, before any frame is drawn.
 */
const ONE_CHANGE_MS = 16;

/**
 * The room's clock: where it stands (`at`, in milliseconds of its own) as of the frame it last
 * moved in (`last`, on the frames' clock). A frame moves it by what the frame took, but never by
 * more than a frame and a fifth (`STEADY_FRAME_MS`), so a frame the phone could not draw holds the
 * room where it was rather than skipping it on — the mount that sets a move going can take fifty
 * milliseconds of the UI thread (the simulator, 25 September 2026).
 */
interface Clock {
  readonly last: number;
  readonly at: number;
}

/**
 * The lowest row the change being mounted moves: where it stands (`target`), how far it is drawn
 * from there (`offset`, points), how fast it is closing that (`velocity`, points a second), and
 * when this was said (`stamp`, on the frames' clock). A row landing under it in the same change
 * comes in under it as it is drawn, at its speed (`arrive`).
 */
interface Lowest {
  readonly stamp: number;
  readonly target: number;
  readonly offset: number;
  readonly velocity: number;
}

/**
 * How long a change the reader asks for has to be drawn: a deletion for them alone, or Undo, is the
 * store's at once, and its mount follows within a render or two.
 */
const OWN_MS = 1000;

/**
 * The reader is making a change in the room themselves (`Field.own`): the next mount that moves
 * its rows, within `ms`, is theirs, and moves on the room's spring even up the history.
 */
export function madeHere(field: Field, ms: number = OWN_MS): void {
  field.own.value = { until: Date.now() + ms, at: 0 };
}

/**
 * Whether the move started `now` is the reader's own change: the first mount after they asked,
 * and every move that mount starts, which all start within `ONE_CHANGE_MS` of the first.
 */
function owned(own: SharedValue<Own>, now: number): boolean {
  "worklet";
  const { until, at } = own.value;
  if (at !== 0) return now - at <= ONE_CHANGE_MS;
  if (Date.now() > until) return false;
  own.value = { until: 0, at: now };
  return true;
}

/**
 * How long a send's ask for the foot waits for the change that draws its line: the store has the
 * line within a frame or two of the tap, and the room draws it in the render after.
 */
const HOME_MS = 1000;

/**
 * A message of yours has gone from near the foot (`Field.home`): the change that draws its line,
 * within `ms`, takes the list down to the foot if it is not there — from the same instant, on the
 * same spring and clock, as the rows that change moves up (`transitionOf`, `row`).
 *
 * Near the foot the room does not keep the reader's place; the rows rise by what lands, and the
 * list's offset stays where it is. A reader a few dozen points up — a thumb's nudge, a reply a
 * little taller than the glass read from its start — had their own line put that far below its
 * place, under the field, and its words flew down onto the field to meet it (Arjun, 20 October
 * 2026; the simulator, PH-21).
 */
export function homeward(field: Field, ms: number = HOME_MS): void {
  field.home.value = Date.now() + ms;
}

/** The frames' clock, which the UI thread keeps between frames as well as in them. */
function timestamp(): number {
  "worklet";
  return (
    globalThis as unknown as { _getAnimationTimestamp: () => number }
  )._getAnimationTimestamp();
}

/**
 * Where the room's clock stands for a move started `now`. The clock does not move for it: a mount
 * starts every move it makes one after another, and Reanimated takes each one's first step as it
 * starts it, so a clock moved by those steps started the rows of one change ten milliseconds of the
 * spring apart — three points at its fastest, and the two-point gap between two bubbles of a turn
 * closed (the simulator, 25 September 2026). What the mount took is a pause for all of them.
 */
function started(clock: SharedValue<Clock>, now: number): number {
  "worklet";
  const { last, at } = clock.value;
  if (now > last) clock.value = { last: now, at };
  return at;
}

/** The room's clock for the frame drawn at `now`: moved once a frame, whichever move asks first. */
function ticked(clock: SharedValue<Clock>, now: number): number {
  "worklet";
  const { last, at } = clock.value;
  if (now <= last) return at;
  const next = at + Math.min(STEADY_FRAME_MS, now - last);
  clock.value = { last: now, at: next };
  return next;
}

/**
 * The frame an animation says it has finished in is the one Reanimated's layout proxy never draws:
 * it marks the view settled, then passes over settled views as it sets the frame (`addOngoingAnimations`,
 * in its legacy proxy). So each of the room's animations says where it rests one frame before it
 * says it has finished. A move that finished in its first frame — the jump that was a timing of no
 * length, up the history — was never drawn at all: the rows stood where they were, and the lines
 * that landed under them were drawn over them (Arjun, 25 September 2026: "if I scroll while
 * messages are coming in sometimes they overlap").
 */
function landed(animation: { landed: boolean }): boolean {
  "worklet";
  if (animation.landed) return true;
  animation.landed = true;
  return false;
}

interface RoomSpring extends Animation<RoomSpring> {
  readonly room: true;
  /** Where it was let go, from where it is going; how fast; and when, on the room's clock. */
  offset: number;
  velocity: number;
  since: number;
  current: number;
  landed: boolean;
}

/** How a spring is let go (`roomSpring`). */
interface LetGo {
  /** At this speed, points a second, rather than the speed of the move it takes over from. */
  readonly velocity?: number;
  /** Says its speed there, when that names its target: the lowest row a change moves. */
  readonly lowest?: SharedValue<Lowest>;
  /**
   * Up the history: where it is drawn for the frame it starts in, then where it is laid out, the
   * frame the list's offset goes with it (`transitionOf`, `keep`).
   */
  readonly still?: boolean;
  /** From here, rather than from where the view is drawn: the list's offset, moved at once (`Lift`). */
  readonly from?: number;
  /** Told where it stands at every step: the list's offset is set there, not drawn (`Lift`). */
  readonly each?: (at: number) => void;
  /** Told when it has finished, or been taken over or stopped. */
  readonly done?: (finished?: boolean) => void;
}

/**
 * How fast a spring is let go, at `since` on the room's clock: at rest when it is already where it
 * is going, at the speed it is given, or at the speed of the room's spring it takes over from.
 */
function speedOf(letGo: LetGo, previous: unknown, since: number): number {
  "worklet";
  if (letGo.still === true) return 0;
  if (letGo.velocity !== undefined) return letGo.velocity;
  const before = previous as Partial<RoomSpring> | undefined | null;
  if (before?.room !== true) return 0;
  const { offset = 0, velocity = 0, since: then = since } = before;
  return springAt(ROOM_SPRING, offset, velocity, since - then).velocity;
}

/**
 * Where a view is drawn as a move starts: where the room's spring it takes over from last put it,
 * else where the layout says it was. A row still coming in reports where it was a frame before it
 * was drawn, and a reply that the thinking bubble's going sent on a frame into its rise went from
 * there — back a frame, sixty points, the gap over it opening and staying (the simulator,
 * 6 October 2026).
 */
function drawnFrom(previous: unknown, value: AnimatableValue, by = 0): number {
  "worklet";
  const before = previous as Partial<RoomSpring & RoomGlide> | undefined | null;
  const ours = before?.room === true || before?.glide === true;
  return ours && before?.current !== undefined ? before.current - by : Number(value);
}

/**
 * The room's spring to `to`, on the room's clock, let go from where the view is drawn at the speed
 * it already has: the speed it is given, or that of the move it takes over from.
 */
function roomSpring(to: number, clock: SharedValue<Clock>, letGo: LetGo = {}): number {
  "worklet";
  return defineAnimation<RoomSpring>(to, () => {
    "worklet";
    const onStart = (
      animation: RoomSpring,
      value: AnimatableValue,
      now: number,
      previous: Animation<RoomSpring> | undefined,
    ) => {
      const since = started(clock, now);
      const speed = speedOf(letGo, previous, since);
      animation.offset = (letGo.from ?? drawnFrom(previous, value)) - to;
      animation.velocity = speed;
      animation.since = since;
      animation.current = to + animation.offset;
      animation.landed = false;
      const { lowest } = letGo;
      // Where the row a landing comes in under is drawn, and how fast it goes: from the spring.
      if (lowest !== undefined && lowest.value.target === to) {
        lowest.value = { ...lowest.value, offset: animation.offset, velocity: speed };
      }
    };
    const onFrame = (animation: RoomSpring, now: number) => {
      const t = ticked(clock, now) - animation.since;
      // Up the history: where it is drawn for the frame it was started in, and where it is laid
      // out from the next — the frame the list's offset goes with it (`transitionOf`, `keep`).
      if (letGo.still === true) {
        animation.current = t > 0 ? to : to + animation.offset;
        return t > 0 && landed(animation);
      }
      const state = springAt(ROOM_SPRING, animation.offset, animation.velocity, t);
      animation.current = to + state.offset;
      letGo.each?.(animation.current);
      return state.settled && landed(animation);
    };
    return {
      onStart,
      onFrame,
      callback: letGo.done,
      room: true,
      offset: 0,
      velocity: 0,
      since: 0,
      current: to,
      landed: false,
    } as unknown as RoomSpring;
  }) as unknown as number;
}

interface RoomFade extends Animation<RoomFade> {
  from: number;
  since: number;
  current: number;
  landed: boolean;
}

/** A fade to `to` over `ms`, easing out, on the room's clock: what lands fades up as it rises. */
function roomFade(to: number, ms: number, clock: SharedValue<Clock>): number {
  "worklet";
  return defineAnimation<RoomFade>(to, () => {
    "worklet";
    const onStart = (animation: RoomFade, value: AnimatableValue, now: number) => {
      animation.from = Number(value);
      animation.since = started(clock, now);
      animation.current = animation.from;
      animation.landed = false;
    };
    const onFrame = (animation: RoomFade, now: number) => {
      const share = Math.min(1, (ticked(clock, now) - animation.since) / ms);
      const eased = 1 - (1 - share) * (1 - share);
      animation.current = animation.from + (to - animation.from) * eased;
      return share >= 1 && landed(animation);
    };
    return {
      onStart,
      onFrame,
      from: to,
      since: 0,
      current: to,
      landed: false,
    } as unknown as RoomFade;
  }) as unknown as number;
}

/** The panes' ease out (`PadBarMotion.tsx`'s `EASE`), as a function a worklet can call. */
const PANES_EASE = Easing.bezierFn(0.32, 0.72, 0, 1);

interface RoomGlide extends Animation<RoomGlide> {
  readonly glide: true;
  from: number;
  since: number;
  current: number;
  landed: boolean;
}

/** Where a glide sets off from, and what it tells (`roomGlide`). */
interface GlideFrom {
  /** From here, rather than from where the view is drawn: the list's offset (`Lift.slide`). */
  readonly from?: number;
  /** When, on the room's clock: that of the rows it goes with, set off a frame before (`Lift.slide`). */
  readonly since?: number;
  /** Told where it stands at every step: the list's offset is set there, not drawn (`Lift`). */
  readonly each?: (at: number) => void;
  /** Told when it has finished, or been taken over or stopped. */
  readonly done?: (finished?: boolean) => void;
  /**
   * How far what holds the view moved with this change, at once (the lines' column, `Field.shift`):
   * a move it takes over from was drawn that much off where it now stands in what holds it.
   */
  readonly by?: number;
}

/**
 * A glide to `to` on the panes' ease out over `GLIDE`, on the room's clock: how a row and a bubble
 * take a change of the room's width (ADR 0279), their words out of sight. Every view the one layout
 * moved sets off at the same instant on the clock, whatever order the mount starts them in, and
 * they all land together, before the words come back: on the room's spring a long row was still
 * settling as the frost that hid them then cleared.
 */
function roomGlide(to: number, clock: SharedValue<Clock>, from: GlideFrom = {}): number {
  "worklet";
  return defineAnimation<RoomGlide>(to, () => {
    "worklet";
    const onStart = (
      animation: RoomGlide,
      value: AnimatableValue,
      now: number,
      previous: Animation<RoomGlide> | undefined,
    ) => {
      animation.from = from.from ?? drawnFrom(previous, value, from.by);
      animation.since = from.since ?? started(clock, now);
      animation.current = animation.from;
      animation.landed = false;
    };
    const onFrame = (animation: RoomGlide, now: number) => {
      const share = Math.min(1, Math.max(0, (ticked(clock, now) - animation.since) / GLIDE));
      animation.current = animation.from + (to - animation.from) * PANES_EASE(share);
      from.each?.(animation.current);
      return share >= 1 && landed(animation);
    };
    return {
      onStart,
      onFrame,
      callback: from.done,
      glide: true,
      from: to,
      since: 0,
      current: to,
      landed: false,
    } as unknown as RoomGlide;
  }) as unknown as number;
}

/**
 * How a line that has just landed comes in, decided once, as its cell is first drawn (`useArrivals`,
 * in `SpaceView.tsx`):
 *
 * - `rises`: in under the row above it, with the rows above it, wherever that leaves it. A line
 *   of yours: its words flew to it from the field, and the room rose to meet them.
 * - `sent`: the same, and from up the history the list goes to the foot for it. A line of yours
 *   sent from up there, whose words did not fly.
 * - `opens`: the same, but a line taller than the glass rises only until its start is under the
 *   bar. Somebody else's line, which is read from the top.
 * - `answers`: the same, and from up the history the list goes to it — its start, or the foot when
 *   it is shorter than the glass. The first line said after one of yours.
 */
export type Arrival = "rises" | "sent" | "opens" | "answers";

/** The room's transition, as views take it (`Moving`, `MovingBubble`, `MovingCell`, `Coming`). */
export interface Transition {
  /** A view whose frame changed: from where it is drawn to where it is laid out. */
  readonly move: LayoutAnimationFunction;
  /** The foot's cell: moves as `move` does, and takes a lift with what it moves (`Lift`). */
  readonly foot: LayoutAnimationFunction;
  /** A row's cell: moves as `move` does, and says where it is for a row landing under it. */
  readonly row: LayoutAnimationFunction;
  /** A row's cell that has just landed: in under the row above it, as that row is drawn. */
  readonly arrive: (values: EntryAnimationsValues) => LayoutAnimation;
  /** As `arrive`, and gone to from up the history (`Arrival`, `sent`). */
  readonly send: (values: EntryAnimationsValues) => LayoutAnimation;
  /** As `arrive`, read from its start when it is taller than the glass (`Arrival`, `opens`). */
  readonly open: (values: EntryAnimationsValues) => LayoutAnimation;
  /** As `open`, and gone to from up the history (`Arrival`, `answers`). */
  readonly answer: (values: EntryAnimationsValues) => LayoutAnimation;
  /** A rise of `by` points into place, fading up, on the room's clock. */
  readonly rise: (by: number) => () => LayoutAnimation;
}

/**
 * The list's offset, moved by the room rather than the reader: on the room's spring and clock, set
 * on the list at each step rather than drawn (`roomSpring`'s `each`), or at once.
 *
 * On the spring, to a line read from its start (`to`). Started in the mount that lays the line out,
 * it keeps time with the rows that change starts: one rise on the glass. While it moves the offset
 * is the room's, so the list's scroll handler leaves `far` alone (`lifting`) and is told where the
 * reader stands when it stops (`onRest`). A finger on the glass stops it, and none starts under a
 * finger or the coast after one (`held`). What changes at the foot while it goes moves the line it
 * goes to, and it goes the same way (`follow`).
 *
 * At once, under a reader up the history (`keep`): the rows they are reading moved at once, and
 * the offset goes with them, so the glass does not change.
 */
export interface Lift {
  readonly lifting: SharedValue<number>;
  readonly held: SharedValue<number>;
  /** To `y`, from where the list is, or from where the lift going now is, at its speed. */
  readonly to: (y: number) => void;
  /** As `to`, a frame from now: after the list has kept a reader's place in this mount. */
  readonly later: (y: number) => void;
  /** Where it goes moved by `by`: what changed at the foot moved the line it goes to. */
  readonly follow: (by: number) => void;
  /** The offset, and where any lift goes, moved by `by` at once. */
  readonly keep: (by: number) => void;
  /**
   * The offset moved by `by` on the glide of the rows it is kept among (`roomGlide`, ADR 0279), as
   * of when they set off (`since`, on the room's clock), so the line across the foot of the glass
   * stays where it is on the glass while the rows round it glide. Under a lift or a finger, at once,
   * as `keep`.
   */
  readonly slide: (by: number, since: number) => void;
  readonly stop: () => void;
}

function liftOf(
  list: AnimatedRef<FlatList<Row>>,
  scroll: SharedValue<number>,
  clock: SharedValue<Clock>,
  onRest: (offset: number) => void,
  shared: {
    readonly offset: SharedValue<number>;
    readonly goal: SharedValue<number>;
    readonly set: SharedValue<number>;
    readonly lifting: SharedValue<number>;
    readonly held: SharedValue<number>;
  },
): Lift {
  const { offset, goal, set, lifting, held } = shared;
  const place = (at: number) => {
    "worklet";
    if (at === set.value) return;
    set.value = at;
    scroll.value = at;
    scrollTo(list, 0, at, false);
  };
  const go = (y: number, from: number | undefined) => {
    "worklet";
    if (lifting.value === 0) {
      offset.value = scroll.value;
      set.value = scroll.value;
    }
    lifting.value = 1;
    goal.value = y;
    offset.value = roomSpring(y, clock, {
      ...(from === undefined ? {} : { from }),
      each: place,
      done: (finished) => {
        "worklet";
        // Taken over by the next lift, or stopped by a finger, which says where it is itself.
        if (finished !== true) return;
        lifting.value = 0;
        onRest(y);
      },
    });
  };
  const to = (y: number) => {
    "worklet";
    if (held.value === 0) go(y, undefined);
  };
  const later = (y: number) => {
    "worklet";
    requestAnimationFrame(() => to(y));
  };
  // Never in a mount: a scroll there wakes the list's scroll handler, whose updates commit the tree
  // the mount is holding, and the app stopped (the simulator, 6 October 2026). The next frame. A
  // lift to the foot itself follows nothing: nought is the foot however the foot changes
  // (`movedGoal`).
  const follow = (by: number) => {
    "worklet";
    requestAnimationFrame(() => {
      const next = movedGoal(goal.value, by);
      if (lifting.value === 1 && next !== goal.value) go(next, undefined);
    });
  };
  // The reader's place is kept at once wherever the lift goes; the lift goes on from there to the
  // line it went to, moved, or to the foot, which is where it was.
  const keep = (by: number) => {
    "worklet";
    if (lifting.value === 0) {
      place(scroll.value + by);
      return;
    }
    const from = offset.value + by;
    place(from);
    go(movedGoal(goal.value, by), from);
  };
  const slide = (by: number, since: number) => {
    "worklet";
    if (lifting.value === 1 || held.value !== 0) {
      keep(by);
      return;
    }
    const from = scroll.value;
    const y = from + by;
    offset.value = from;
    set.value = from;
    lifting.value = 1;
    goal.value = y;
    offset.value = roomGlide(y, clock, {
      from,
      since,
      each: place,
      done: (finished) => {
        "worklet";
        if (finished !== true) return;
        lifting.value = 0;
        onRest(y);
      },
    });
  };
  const stop = () => {
    "worklet";
    if (lifting.value === 0) return;
    cancelAnimation(offset);
    lifting.value = 0;
    onRest(scroll.value);
  };
  return { lifting, held, to, later, follow, keep, slide, stop };
}

/**
 * The room's transition: from the frame a view was drawn at to the one it is laid out at, on the
 * room's spring — or at once while the reader is up the history (`far`), where the room keeps their
 * place (`keep`) and anything moving would be the room moving under them. Unless the change is the
 * reader's own (`madeHere`): what moves then is what they did, where they are looking.
 */
function transitionOf(
  field: Field,
  clock: SharedValue<Clock>,
  lowest: SharedValue<Lowest>,
  kept: SharedValue<number>,
  lift: Lift,
): Transition {
  const { far, own, home, scroll, top, viewportHeight, list, glide, shift } = field;
  // Up the history, in a change that is not the reader's own: where the room keeps their place.
  const away = (now: number) => {
    "worklet";
    return far.value === 1 && !owned(own, now);
  };
  // The one layout an iPad's room takes as its column moves, mounting (`useHeldWidth`, ADR 0279).
  const gliding = () => {
    "worklet";
    return Date.now() <= glide.value;
  };
  // A row's cell stands in the lines' column, whose start a change of width may move at once
  // (`Field.shift`): the cell sets off from where it was drawn on the glass, and glides with the
  // column's start as it does with its own width. What stands in a cell moves with the cell. The
  // shift is that one layout's: every cell it moves is started in the same mount, and what moves
  // in a frame after it has not been moved by it.
  const frame = (
    values: LayoutAnimationsValues,
    reporting: boolean,
    cell = false,
  ): LayoutAnimation => {
    "worklet";
    if (gliding()) {
      const by = cell ? shift.value : 0;
      if (by !== 0) {
        requestAnimationFrame(() => {
          shift.value = 0;
        });
      }
      return {
        initialValues: {
          originX: values.currentOriginX - by,
          originY: values.currentOriginY,
          width: values.currentWidth,
          height: values.currentHeight,
        },
        animations: wholeFrame(values, (value, which) =>
          roomGlide(value, clock, which === "originX" ? { by } : {}),
        ),
      };
    }
    const still = away(timestamp());
    const to = (value: number, lowest?: SharedValue<Lowest>) =>
      roomSpring(value, clock, lowest === undefined ? { still } : { still, lowest });
    return {
      initialValues: {
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight,
      },
      animations: wholeFrame(values, (value, which) =>
        to(value, which === "originY" && reporting ? lowest : undefined),
      ),
    };
  };
  const move = (values: LayoutAnimationsValues): LayoutAnimation => {
    "worklet";
    return frame(values, false);
  };
  // The foot changing moves every row above it, the line a lift goes to among them: at the foot
  // the rows go on the spring, and the lift goes on with them to where that line now stands.
  const foot = (values: LayoutAnimationsValues): LayoutAnimation => {
    "worklet";
    const was = values.currentOriginY + values.currentHeight;
    const is = values.targetOriginY + values.targetHeight;
    if (far.value === 0 && is !== was) lift.follow(is - was);
    return frame(values, false, true);
  };
  // Up the history the rows a change moves go at once, and the list's offset goes with the one
  // across the foot of the glass, so the reader sees nothing move. React Native's own way of doing
  // this (`maintainVisibleContentPosition`) picks that row only while it is on, and kept the one it
  // last picked when it was not: turned on again past `NEAR`, it moved the list by everything that
  // had landed since, a reply or two up the history (the simulator, 6 October 2026). Left on, it
  // took the room's transition at the foot for a reader's place to keep, a frame at a time.
  //
  // The offset goes in the frame after the mount, never in it: a scroll there wakes the list's
  // scroll handler, whose updates commit the tree the mount is holding, and the app stopped. So the
  // rows hold where they are drawn for the mount's frame (`roomSpring`, `still`) and go in the
  // next, with the offset.
  //
  // A change of the room's width glides every row (`gliding`), up the history too, and the offset
  // glides with the row across the foot of the glass, from the same instant on the room's clock, so
  // on the glass that row holds still and the rows round it glide (`Lift.slide`, ADR 0279).
  const keep = (values: LayoutAnimationsValues, now: number, glides: boolean) => {
    "worklet";
    const at = scroll.value;
    const by = values.targetOriginY - values.currentOriginY;
    if (by === 0 || now - kept.value <= ONE_CHANGE_MS) return;
    if (at < values.currentOriginY || at >= values.currentOriginY + values.currentHeight) return;
    kept.value = now;
    if (!glides) {
      requestAnimationFrame(() => lift.keep(by));
      return;
    }
    const since = clock.value.at;
    requestAnimationFrame(() => lift.slide(by, since));
  };
  // A message of yours sent from near the foot (`homeward`): the change that draws it takes the list
  // down to the foot, with the rows it moves up, so on the glass the room rises once, by the line
  // and by what the list was off its foot. The first row the change moves answers, once.
  const homeFor = () => {
    "worklet";
    if (home.value === 0) return;
    const asked = Date.now() <= home.value;
    home.value = 0;
    if (asked && scroll.value > 0) lift.to(0);
  };
  const glideRow = (values: LayoutAnimationsValues): LayoutAnimation => {
    "worklet";
    if (far.value === 1) keep(values, timestamp(), true);
    return frame(values, false, true);
  };
  const row = (values: LayoutAnimationsValues): LayoutAnimation => {
    "worklet";
    if (gliding()) return glideRow(values);
    // The rows a change moves are started one after another in the mount; the lowest of them is
    // the one a row landing in the same change comes in under. The list is inverted, so the
    // lowest row is the one nearest the start of its content.
    const now = timestamp();
    const holding = away(now);
    const was = lowest.value;
    const lower = now - was.stamp > ONE_CHANGE_MS || values.targetOriginY <= was.target;
    lowest.value = lower
      ? {
          stamp: now,
          target: values.targetOriginY,
          offset: holding ? 0 : values.currentOriginY - values.targetOriginY,
          velocity: 0,
        }
      : { ...was, stamp: now };
    if (holding) keep(values, now, false);
    else homeFor();
    return frame(values, lower);
  };
  const arrive = (values: EntryAnimationsValues): LayoutAnimation => {
    "worklet";
    const place = {
      originX: values.targetOriginX,
      width: values.targetWidth,
      height: values.targetHeight,
    };
    const fade = { opacity: roomFade(1, FADE_IN_MS, clock) };
    const now = timestamp();
    const was = lowest.value;
    // Nothing moved over it — the first line of a room, a line landing up the history — and it
    // fades up where it stands.
    if (far.value === 1 || now - was.stamp > ONE_CHANGE_MS) {
      return {
        initialValues: { ...place, originY: values.targetOriginY, opacity: 0 },
        animations: fade,
      };
    }
    // The next line of the same change lands under this one, as the same body.
    lowest.value = { ...was, stamp: now };
    return {
      initialValues: { ...place, originY: values.targetOriginY + was.offset, opacity: 0 },
      animations: {
        ...fade,
        originY: roomSpring(values.targetOriginY, clock, { velocity: was.velocity }),
      },
    };
  };
  const rise = (by: number) => (): LayoutAnimation => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: by }] },
      animations: {
        opacity: roomFade(1, FADE_IN_MS, clock),
        transform: [{ translateY: by === 0 ? 0 : roomSpring(0, clock, { velocity: 0 }) }],
      },
    };
  };
  // The offset that stands a line laid out at `values` with its start where the room's first line
  // stands, under the bar: the list is inverted, so its start is the far end of its frame. The
  // glass measured now, not as it was at the last scroll: the keyboard may have gone since, and the
  // drag that took it ended before it had.
  const startOf = (values: EntryAnimationsValues) => {
    "worklet";
    const glass = measure(list);
    const height = glass === null ? viewportHeight.value : glass.height;
    return values.targetOriginY + values.targetHeight + top.value - height;
  };
  const open = (values: EntryAnimationsValues): LayoutAnimation => {
    "worklet";
    const landing = arrive(values);
    // At the foot, and only taller than the glass: a line that fits ends at the foot, as before.
    if (far.value === 0 && viewportHeight.value > 0) {
      const y = startOf(values);
      if (y > scroll.value + 1) lift.to(y);
    }
    return landing;
  };
  const answer = (values: EntryAnimationsValues): LayoutAnimation => {
    "worklet";
    if (far.value === 0) return open(values);
    // Up the history the list keeps the reader's place as this mounts, and goes once it has.
    if (viewportHeight.value > 0) lift.later(Math.max(0, startOf(values)));
    return arrive(values);
  };
  const send = (values: EntryAnimationsValues): LayoutAnimation => {
    "worklet";
    if (far.value === 1) lift.later(0);
    return arrive(values);
  };
  return { move, foot, row, arrive, send, open, answer, rise };
}

/**
 * Tells the room's moves that the change of width the lines take next is a glide (`Field.glide`),
 * which moves the start of their column `by` points on the glass (`Field.shift`), and then has them
 * take it (`take`). Told on the UI thread, before the lines are laid out: written from JavaScript as
 * they took it, the moves sometimes heard after the layout had been drawn, and its rows went on the
 * room's spring with the column, which jumped (the simulator, 6 November 2026).
 */
export function glideFor(field: Field, by: number, take: () => void) {
  const { glide, shift } = field;
  scheduleOnUI(() => {
    "worklet";
    shift.value = by;
    glide.value = Date.now() + GLIDE;
    scheduleOnRN(take);
  });
}

/**
 * The room's transition, made once per room — none where the room does not move (`Field.moves`) —
 * and the lift that moves its list's offset on the same clock. `onRest` is told where the list
 * stands when a lift stops, and must be made once.
 */
export function useRoomTransition(
  field: Field,
  moves: boolean,
  onRest: (offset: number) => void,
): { readonly transition: Transition | undefined; readonly lift: Lift } {
  const clock = useSharedValue<Clock>({ last: 0, at: 0 });
  const lowest = useSharedValue<Lowest>({ stamp: 0, target: 0, offset: 0, velocity: 0 });
  // When the place under a reader was last kept: once a change (`keep`).
  const kept = useSharedValue(0);
  const offset = useSharedValue(0);
  const set = useSharedValue(0);
  const held = useSharedValue(0);
  // Where a lift goes, and whether one is going, are the field's: a send's words read them.
  const { goal, lifting } = field;
  const lift = useMemo(
    () => liftOf(field.list, field.scroll, clock, onRest, { offset, goal, set, lifting, held }),
    [field.list, field.scroll, clock, onRest, offset, goal, set, lifting, held],
  );
  const transition = useMemo(
    () => (moves ? transitionOf(field, clock, lowest, kept, lift) : undefined),
    [field, clock, lowest, kept, lift, moves],
  );
  return { transition, lift };
}

/** The room's transition, for a bubble deep in a row to move on as its row does. */
export const RoomTransition = createContext<Transition | undefined>(undefined);

/** The entering animation each way of landing takes (`Arrival`). */
const ENTERING = { rises: "arrive", sent: "send", opens: "open", answers: "answer" } as const;

/**
 * A row's cell in the room's list: it moves with the room, and a row that has just landed
 * (`arrives`, read once, when the cell mounts) comes in under the row above it, as its `Arrival`
 * says. The foot is a cell too, and moves as any view does: it is not a row a line lands under.
 */
export function MovingCell({
  foot,
  arrives,
  onArrived,
  style,
  onLayout,
  children,
}: {
  readonly foot: boolean;
  readonly arrives: Arrival | undefined;
  /**
   * Told once the cell is in with its row's arrival: the mount, and not the drawing, says so,
   * because a drawing can be thrown away before it is put on the glass (`useCell`, in
   * `ScrollColours.tsx`).
   */
  readonly onArrived?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly children: ReactNode;
}) {
  const transition = useContext(RoomTransition);
  const arriving = useRef(arrives).current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the cell's first mount, once.
  useEffect(() => {
    if (arriving !== undefined) onArrived?.();
  }, []);
  return (
    <Animated.View
      {...(transition === undefined ? {} : { layout: foot ? transition.foot : transition.row })}
      {...(transition === undefined || arriving === undefined
        ? {}
        : { entering: transition[ENTERING[arriving]] })}
      onLayout={onLayout}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A box that moves with the room when its own size changes: the thinking bubble growing a line,
 * a bubble giving its time up. Its children are laid out at the new size at once; it clips them to
 * its own corner, so what is going is covered as it closes.
 */
export function Moving({
  style,
  testID,
  onLayout,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly children: ReactNode;
}) {
  const transition = useContext(RoomTransition);
  return (
    <Animated.View
      {...(transition === undefined ? {} : { layout: transition.move })}
      style={style}
      testID={testID}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A bubble: it moves as `Moving` does, and rounds or sharpens its corners as it joins a turn or
 * leaves one. It no longer lifts under a thumb itself: a press and hold lifts a copy of it out of
 * the room (`LiftedMenu.tsx`, ADR 0200) while it stands out of sight.
 *
 * A bubble that goes — its line deleted for everyone, the tombstone in its place — goes whole and
 * at once, as a row does (`Whole`): its time fading as it went kept the bubble's ground standing
 * empty over the tombstone.
 */
export function MovingBubble({
  corners,
  style,
  testID,
  children,
}: {
  /** The bubble's four corners (`cornersOf`, in `Line.tsx`). */
  readonly corners: ViewStyle;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly children: ReactNode;
}) {
  const transition = useContext(RoomTransition);
  const less = useReduceMotion();
  const rounding = useMemo(
    () =>
      less || transition === undefined
        ? corners
        : {
            ...corners,
            transitionProperty: CORNERS,
            transitionDuration: CORNER_MS,
            transitionTimingFunction: "ease-out" as const,
          },
    [corners, less, transition],
  );
  return (
    <LayoutAnimationConfig skipExiting>
      <Animated.View
        {...(transition === undefined ? {} : { layout: transition.move })}
        style={[style, rounding]}
        testID={testID}
      >
        {children}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

/**
 * Something that comes and goes at the room's foot of its own accord — the thinking bubble: it
 * rises a little into its place as it fades up, and when it goes it fades where it stood while the
 * room closes over it. Going is the UI thread's: the view is out of the room the moment it is not
 * wanted, and a reply landing in the same breath rises through where it was.
 *
 * It moves as any view does when its place in the foot changes, since with a bubble for each
 * harness at work the one above it can go while it stays: it goes up the foot on the room's spring
 * as the foot closes on the same spring from the same instant, and so stands still on the glass.
 */
export function Coming({
  rise,
  children,
}: {
  readonly rise: number;
  readonly children: ReactNode;
}) {
  const less = useReduceMotion();
  const transition = useContext(RoomTransition);
  const entering = useRef(
    transition === undefined ? fadeIn : transition.rise(less ? 0 : rise),
  ).current;
  return (
    <Animated.View
      entering={entering}
      exiting={fadeOut}
      {...(transition === undefined ? {} : { layout: transition.move })}
    >
      {children}
    </Animated.View>
  );
}

function fadeIn(): LayoutAnimation {
  "worklet";
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration: FADE_IN_MS }) },
  };
}

function fadeOut(): LayoutAnimation {
  "worklet";
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration: FADE_OUT_MS }) },
  };
}

/**
 * A line's row: when it leaves the room — deleted for the reader (ADR 0167), its dust already in
 * the air — it goes whole and at once. What fades inside it as it changes, its eraser or its time
 * (`Leaving`), would otherwise fade as it leaves, and Fabric keeps whatever holds a fading view: the
 * bubble's ground came back empty over the place the room was closing (14 October 2026).
 *
 * The row is never flattened, because Reanimated reads "not as it leaves" from the removed view's
 * own node, and a view flattened away has none.
 */
export function Whole({
  style,
  testID,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly children: ReactNode;
}) {
  return (
    <LayoutAnimationConfig skipExiting>
      <View collapsable={false} style={style} testID={testID}>
        {children}
      </View>
    </LayoutAnimationConfig>
  );
}

/**
 * Something a line gives up — its time, to the line that joins it — fading where it stood. Inside
 * a bubble, the bubble closes over it as it goes.
 */
export function Leaving({
  style,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View exiting={fadeOut} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * Something kept out of sight while something else lands on the place beside it, faded up once it
 * is let go — and simply there when it never was held, as on a room opened with it already drawn.
 * The sender's face in the route a send's copy has just landed on (ADR 0081).
 */
export function FadingUp({
  held,
  children,
}: {
  readonly held: boolean;
  readonly children: ReactNode;
}) {
  const wasHeld = useRef(held);
  const shown = useSharedValue(held ? 0 : 1);
  useEffect(() => {
    if (held) {
      wasHeld.current = true;
      shown.value = 0;
    } else if (wasHeld.current) {
      shown.value = withTiming(1, { duration: FADE_IN_MS });
    }
  }, [held, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
