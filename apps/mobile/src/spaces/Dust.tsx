/**
 * A message breaking into dust as it is deleted, and forming again from it on Undo (ADR 0165).
 *
 * Two pieces, because the dust outlives the line. The eraser stands over what breaks — the bubble
 * and what hangs off it — in the room's own ground, and grows across it from the left edge as the
 * wipe crosses (`Eraser`): the bubble is hidden by being painted over, so no line in the room
 * carries a view or a worklet of its own for a deletion until it is asked for one. The specks are
 * drawn in the room's layer for them, over the list and its composer (`DustLayer`), as the send's
 * words are (`SendFlight.tsx`); the line can leave the list as soon as the wipe has crossed it, and
 * the room close over it, while its dust is still in the air.
 *
 * Where the specks start is measured on the UI thread, as the flight measures its bubbles: the list
 * is inverted, and `measureInWindow` places a bubble in it ten points out (`BubbleWatch.tsx`). The
 * specks themselves are core's (`makeSpecks`, `speckAt`), so the desktop's dust moves the same way;
 * here each is a view moved by transforms and opacity, one clock for all of them.
 *
 * With Reduce Motion there is no dust: the eraser fades over the bubble, and away on Undo.
 */

import { DUST_MS, makeSpecks, SPECKS, type Speck, WIPE_MS } from "@chipschat/core";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Dimensions, StyleSheet, type View } from "react-native";
import Animated, {
  type AnimatedRef,
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import * as feel from "../ui/haptics";
import { measured } from "../ui/measured";
import { usePalette } from "../ui/theme";
import { groundAt, shaded, speckAtNow } from "./dustMath";
import type { Field } from "./ScrollColours";

/** The eraser fades over the bubble in this long when there is no dust. */
const FADE_MS = 220;

/** What breaks, as the line asks for it. */
export interface Crumbling {
  /** Away, or back by Undo. */
  readonly backwards: boolean;
  /** The bubble's ground: a colour, or the room's field for your own. */
  readonly ground: string | "field";
  /** The words' ink, which some specks wear. */
  readonly ink: string;
}

/** One deletion's dust, as the layer draws it. */
interface Ask extends Crumbling {
  readonly id: string;
  /** The eraser's box, which is the box of what breaks. */
  readonly box: AnimatedRef<View>;
  /** How far the wipe has crossed: nought to one. */
  readonly wipe: SharedValue<number>;
  readonly onWiped: () => void;
  readonly onDone: () => void;
}

/**
 * How a line asks for dust: the same object for the room's life, so a row given it is not drawn
 * again each time some dust goes up or settles.
 */
export interface Asker {
  readonly ask: (ask: Ask) => void;
  /** No dust: Reduce Motion, or a target that cannot draw it. */
  readonly still: boolean;
}

/** The room's dust: what is in the air, for its layer, and how a line asks for more. */
export interface Dust {
  readonly asks: readonly Ask[];
  readonly gone: (id: string) => void;
  readonly asker: Asker;
}

export function useDust(still: boolean): Dust {
  const [asks, setAsks] = useState<readonly Ask[]>([]);
  const ask = useCallback((next: Ask) => setAsks((all) => [...all, next]), []);
  const gone = useCallback(
    (id: string) => setAsks((all) => all.filter((each) => each.id !== id)),
    [],
  );
  const asker = useMemo(() => ({ ask, still }), [ask, still]);
  return useMemo(() => ({ asks, gone, asker }), [asks, gone, asker]);
}

/**
 * Over what breaks, in the room's ground: across it from the left as the wipe goes, or over all of
 * it from the first frame for a line coming back. `onWiped` is when the line may go; `onDone` when
 * the dust has settled, or the bubble formed again.
 */
export function Eraser({
  crumbling,
  dust,
  onWiped,
  onDone,
  paint,
}: {
  readonly crumbling: Crumbling;
  readonly dust: Asker;
  readonly onWiped: () => void;
  readonly onDone: () => void;
  /** What it paints over with: the room's ground, unless it stands on a card (ADR 0195). */
  readonly paint?: string | undefined;
}) {
  const palette = usePalette();
  const id = useId();
  const box = useAnimatedRef<View>();
  const wipe = useSharedValue(crumbling.backwards ? 1 : 0);
  const { still } = dust;
  const style = useAnimatedStyle(() =>
    still ? { opacity: wipe.value } : { transform: [{ scaleX: wipe.value }] },
  );
  // Asked once, as it is first drawn: what it asks for does not change while it stands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, with what it was drawn with
  useEffect(() => {
    if (!crumbling.backwards) feel.crumble();
    if (still) {
      wipe.value = withTiming(crumbling.backwards ? 0 : 1, { duration: FADE_MS }, (finished) => {
        if (!finished) return;
        if (!crumbling.backwards) scheduleOnRN(onWiped);
        scheduleOnRN(onDone);
      });
      return;
    }
    dust.ask({ ...crumbling, id, box, wipe, onWiped, onDone });
  }, []);
  // The outer box is what is measured; the inner one is the paint that grows across. It has no
  // way out of its own: it goes once it covers all of what it stood over, or none of it.
  return (
    <Animated.View
      ref={box}
      collapsable={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.left,
          { backgroundColor: paint ?? palette.bg },
          style,
        ]}
      />
    </Animated.View>
  );
}

/**
 * Over what hangs off a breaking bubble — its photos, its files — in the room's ground: fading in
 * as the bubble breaks, and away as it forms again. No dust of its own.
 */
export function Veil({ backwards }: { readonly backwards: boolean }) {
  const palette = usePalette();
  const shown = useSharedValue(backwards ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it is drawn
  useEffect(() => {
    shown.value = withTiming(backwards ? 0 : 1, { duration: backwards ? DUST_MS / 2 : WIPE_MS });
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }, style]}
    />
  );
}

/** Where the layer is on the page, once it has been laid out. */
interface Origin {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the glass stands, for specks that wear the room's field. A list whose rows go to dust
 * (`SelectMotion.tsx`, ADR 0181) has no field, and gives what it has.
 */
type Glass = Pick<Field, "viewportTop" | "viewportHeight">;

/**
 * How few specks a breaking row may have when a list shares out its budget (`DustLayer`'s
 * `budget`): fewer and it reads as a handful of crumbs rather than dust.
 */
const FEWEST = 48;

/**
 * The room's layer for dust, over the room and its composer. `budget`, for a list, is how many
 * specks all that breaks at once shares: every speck is a view moved on every frame, and nine rows
 * deleted together at a bubble's count were two thousand of them (ADR 0181 addendum).
 */
export function DustLayer({
  dust,
  field,
  budget,
}: {
  readonly dust: Dust;
  readonly field: Glass;
  readonly budget?: number | undefined;
}) {
  const host = useAnimatedRef<View>();
  const laid = useSharedValue(0);
  const origin = useSharedValue<Origin | undefined>(undefined);
  useAnimatedReaction(
    () => laid.value,
    (now) => {
      if (now === 0) return;
      const at = measured(host);
      if (at !== null) origin.value = { x: at.pageX, y: at.pageY };
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
      {dust.asks.map((ask) => (
        <Crumble
          key={ask.id}
          ask={ask}
          origin={origin}
          field={field}
          count={
            budget === undefined
              ? SPECKS
              : Math.max(FEWEST, Math.min(SPECKS, Math.round(budget / dust.asks.length)))
          }
          onGone={dust.gone}
        />
      ))}
    </Animated.View>
  );
}

/** Where what breaks is in the layer, and where the room's glass was as it broke. */
interface Placed {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly viewportTop: number;
  readonly viewportHeight: number;
}

/** How many frames a box not yet laid out is asked again for, before the dust gives up on it. */
const TRIES = 8;

function Crumble({
  ask,
  origin,
  field,
  count: share,
  onGone,
}: {
  readonly ask: Ask;
  readonly origin: SharedValue<Origin | undefined>;
  readonly field: Glass;
  /** Its share of the specks, as it was asked: what breaks with it is asked in the same draw. */
  readonly count: number;
  readonly onGone: (id: string) => void;
}) {
  const [placed, setPlaced] = useState<Placed>();
  const [count] = useState(share);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured once, as it is asked for
  useEffect(() => {
    const { box } = ask;
    const { viewportTop, viewportHeight } = field;
    let tries = 0;
    let frame: number | undefined;
    let over = false;
    const giveUp = () => {
      // Nothing to draw it over: the line goes, or comes back, at once.
      if (!ask.backwards) ask.onWiped();
      ask.wipe.value = ask.backwards ? 0 : 1;
      ask.onDone();
      onGone(ask.id);
    };
    // Asked again a frame later from here, never by the worklet calling itself from a frame on
    // the UI thread: whatever throws there ends the app, and a tombstone's eraser, looking a
    // second time for a box that had gone, did (14 October 2026).
    const again = () => {
      if (over) return;
      tries += 1;
      if (tries > TRIES) giveUp();
      else frame = requestAnimationFrame(() => scheduleOnUI(find));
    };
    const screen = Dimensions.get("window").height;
    const find = () => {
      "worklet";
      const at = measured(box);
      const from = origin.value;
      if (at === null || from === undefined || at.width <= 0) {
        scheduleOnRN(again);
        return;
      }
      // Off the screen, nobody sees it break: it goes at once, and no speck is made for it. A
      // list's rows picked with Select all can be anywhere down it.
      if (at.pageY > screen || at.pageY + at.height < 0) {
        scheduleOnRN(giveUp);
        return;
      }
      scheduleOnRN(setPlaced, {
        x: at.pageX - from.x,
        y: at.pageY - from.y,
        width: at.width,
        height: at.height,
        viewportTop: viewportTop.value - from.y,
        viewportHeight: viewportHeight.value,
      });
    };
    scheduleOnUI(find);
    return () => {
      over = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);
  if (placed === undefined) return null;
  return <Specks ask={ask} placed={placed} count={count} onGone={onGone} />;
}

/** One speck as drawn: core's, with the colour it wears. */
interface Painted extends Speck {
  readonly colour: string;
}

function Specks({
  ask,
  placed,
  count,
  onGone,
}: {
  readonly ask: Ask;
  readonly placed: Placed;
  readonly count: number;
  readonly onGone: (id: string) => void;
}) {
  const specks = useMemo<readonly Painted[]>(
    () =>
      makeSpecks(placed, Math.random, count).map((speck) => ({
        ...speck,
        colour: speck.ink ? ask.ink : shaded(groundAt(ask.ground, placed, speck.v), speck.shade),
      })),
    [ask, placed, count],
  );
  const t = useSharedValue(ask.backwards ? DUST_MS : 0);
  const wiped = useSharedValue(false);
  const { wipe, onWiped, backwards } = ask;
  useAnimatedReaction(
    () => t.value,
    (now) => {
      wipe.value = Math.min(1, Math.max(0, now / WIPE_MS));
      if (!backwards && !wiped.value && now >= WIPE_MS) {
        wiped.value = true;
        scheduleOnRN(onWiped);
      }
    },
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: one clock, started once
  useEffect(() => {
    const finish = () => {
      ask.onDone();
      onGone(ask.id);
    };
    t.value = withTiming(
      backwards ? 0 : DUST_MS,
      { duration: DUST_MS, easing: Easing.linear },
      (finished) => {
        if (finished) scheduleOnRN(finish);
      },
    );
  }, []);
  return (
    <>
      {specks.map((speck) => (
        // Where a speck starts in the box is its own: no two start in one place.
        <SpeckView key={`${speck.u}:${speck.v}`} speck={speck} t={t} placed={placed} />
      ))}
    </>
  );
}

function SpeckView({
  speck,
  t,
  placed,
}: {
  readonly speck: Painted;
  readonly t: SharedValue<number>;
  readonly placed: Placed;
}) {
  const style = useAnimatedStyle(() => {
    const now = speckAtNow(speck, t.value, placed);
    if (now === undefined) return { opacity: 0 };
    return {
      opacity: now.opacity,
      transform: [
        { translateX: now.x - speck.size / 2 },
        { translateY: now.y - speck.size / 2 },
        { scale: now.size / speck.size },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.speck,
        { width: speck.size, height: speck.size, backgroundColor: speck.colour },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // The eraser grows from the bubble's left edge.
  left: { transformOrigin: "left" },
  speck: { position: "absolute", left: 0, top: 0 },
});
