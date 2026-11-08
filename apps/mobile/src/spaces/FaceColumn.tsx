/**
 * Who a message goes to, picked in one movement (ADR 0229, Arjun's B of
 * `docs/proposals/slide-to-pick-mocks.html`, 25 October 2026: "Go with B, the column of faces").
 * The finger lands on the faces at the front of the field and slides up: a column of faces grows
 * out of them, one for each agent and person in the room, the lead at the top and Everyone at the
 * foot, nearest the thumb. The face level with the finger is drawn bigger, its neighbours a little,
 * and its name stands in a tag on top of the column, where neither thumb covers it (the addendum of
 * 25 October: beside the face, a right thumb lay over it), while the field says who the words
 * would go to. Letting go on a face picks it alone, as a tap on a name in
 * the field's list does (`AddressInField.tsx`); letting go anywhere else leaves who it goes to as
 * it was. A tap on the faces still opens the list, which keeps the circles for picking several.
 *
 * It follows the finger on the UI thread. Only a move up past `START` starts it, so a tap is still
 * a tap, and a finger that goes down first is not this. Where the room has more faces than the
 * column has room for (`shapeOf`), the faces nearest Everyone show first, and a finger held at the
 * column's top brings the rest down into sight. JavaScript hears which face is under the finger,
 * each time it changes, which is when the phone ticks (`haptics.ts`), and the pick.
 *
 * The column and the tag are the system's glass, so they grow out of the faces and shrink back
 * into them, and never fade: glass that comes into being under an opacity of nought is drawn
 * without its material (`LiftedMotion.tsx`). On the web target there is no column, but in the
 * film's render (`FILM_SOURCE`): the list is the way there, as on the Mac, whose menu takes a press,
 * a slide and a release from the mouse.
 *
 * While the column is up, the rest of the screen dims a little, and comes back as it goes (Arjun,
 * 25 October 2026). The room's bar is the navigator's and stands over the room, so on iOS the dim
 * and the column are drawn on a layer over the window (`FullWindowOverlay`, as a lifted message's
 * menu is), the column where a stand-in in the field's row is measured to be. Elsewhere they stay
 * in the field's row, and the dim reaches what is drawn under the field: the room, not its bar.
 *
 * Under Jest this file is mocked (`jest.setup.js`): how the faces are picked is tested through
 * what the hook is told, and how the column moves is the phone's.
 */

import type { Directory } from "@chipschat/core";
import MaskedView from "@react-native-masked-view/masked-view";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, type PanGesture } from "react-native-gesture-handler";
import Animated, {
  type AnimatedRef,
  Easing,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";
import { scheduleOnRN } from "react-native-worklets";
import { FILM_SOURCE } from "../demo/filmSource";
import { Fades } from "../ui/Fades";
import { alpha, Capsule } from "../ui/Glass";
import { measured } from "../ui/measured";
import { usePalette, useScheme } from "../ui/theme";
import { SPACE } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { type Choice, ChoiceWords } from "./AddressInField";
import {
  type ColumnShape,
  FOOT,
  faceAt,
  GAP,
  grownBy,
  liftedBy,
  middleOf,
  PAD,
  SLOT,
  START,
  scrollSpeed,
  shapeOf,
  WIDTH,
} from "./faceColumnMath";
import { Faces, stepOf } from "./LaneChain";

/** Up out of the faces, a little past its size and back, as a thing picked up does. */
const UP = { stiffness: 340, damping: 26, mass: 1 } as const;
/** And back into them quickly: out of the way. */
const DOWN_MS = 140;
/** How small it starts and ends: a speck, never nought, which has no inverse. */
const SMALL = 0.01;
/** How far the faces fade in at the column's top while there are more above. */
const FADE = 18;
/** Between the column's top and the tag on it: with the tag's height, the column's `CROWN`. */
const TAG_GAP = SPACE.sm + 4;
/** How wide the tag may run from the column's left edge, clear of the screen's edge. */
const TAG_ROOM = 230;
/**
 * The screen behind the column, dimmer: black, at less in light mode, where it shows more. The first
 * build's 14% and 30%, a fifth more, then 30% more again (Arjun, 25 October 2026: "increase dimming
 * by 20%", "another 30% darker please").
 */
const SHADE = "#000000";
const DIM = { light: 0.22, dark: 0.47 } as const;
/** How long the dim takes to come, and to go. */
const DIM_IN_MS = 220;
const DIM_OUT_MS = 200;
/** Far enough past the field's row, every way, to cover the screen from it. */
const EVERYWHERE = -4000;

/** What drives the column: the pan on the faces, and where the finger is. */
export interface FaceSlide {
  readonly pan: PanGesture;
  readonly anchor: AnimatedRef<View>;
  readonly shape: ColumnShape;
  /** The shape, for the UI thread. */
  readonly form: SharedValue<ColumnShape>;
  /** The finger's height over the column's foot, and how far it is from its middle. */
  readonly up: SharedValue<number>;
  readonly across: SharedValue<number>;
  /** How far the faces have been brought down, in a room with more than fit. */
  readonly lift: SharedValue<number>;
  /** The choice under the finger, or -1. */
  readonly lit: SharedValue<number>;
  /** How much of the column is out, from nought to one. */
  readonly shown: SharedValue<number>;
  /** Where the column's foot and middle are on the screen, measured as a slide starts. */
  readonly foot: SharedValue<number>;
  readonly middle: SharedValue<number>;
  /** How dim the screen behind the column is, from nought to one. */
  readonly dimmed: SharedValue<number>;
  /** Whether the top face is in sight, so the column's top needs no fade. */
  readonly topped: boolean;
}

export function useFaceSlide({
  faces,
  room,
  enabled,
  onTouch,
  onLit,
  onPick,
}: {
  /** How many faces stand over Everyone. */
  readonly faces: number;
  /** How tall the column may stand over the field (`listRoom`), once measured. */
  readonly room: number | undefined;
  readonly enabled: boolean;
  /** A finger is down on the faces: the field may want to measure where it is. */
  readonly onTouch: () => void;
  /** The finger is over another choice, or none (-1). */
  readonly onLit: (index: number) => void;
  /** It let go over a choice. */
  readonly onPick: (index: number) => void;
}): FaceSlide {
  const still = useReduceMotion();
  const shape = useMemo(() => shapeOf(faces, room), [faces, room]);
  const anchor = useAnimatedRef<View>();
  const form = useSharedValue(shape);
  const up = useSharedValue(0);
  const across = useSharedValue(0);
  const lift = useSharedValue(0);
  const lit = useSharedValue(-1);
  const shown = useSharedValue(0);
  const dimmed = useSharedValue(0);
  const foot = useSharedValue(0);
  const middle = useSharedValue(0);
  const sliding = useSharedValue(false);
  const atTop = useSharedValue(true);
  const [topped, setTopped] = useState(true);
  // The shape reaches the UI thread as a value, so a measure taken mid-slide does not make a new
  // gesture, which would drop the one under the finger.
  useEffect(() => {
    form.value = shape;
  }, [form, shape]);
  // The latest of what to tell, read when it is told.
  const told = useRef({ onTouch, onLit, onPick });
  told.current = { onTouch, onLit, onPick };
  const litNow = (index: number) => told.current.onLit(index);
  // The choice under the finger, told to JavaScript when it changes.
  const light = (index: number) => {
    "worklet";
    if (index === lit.value) return;
    lit.value = index;
    scheduleOnRN(litNow, index);
  };
  // Held at the column's top, the faces come down; the face under the finger changes as they do.
  const frame = useFrameCallback((info) => {
    if (!sliding.value) return;
    const now = form.value;
    const speed = scrollSpeed(up.value, across.value, now, lift.value);
    if (speed === 0) return;
    lift.value = liftedBy(lift.value, speed, (info.timeSincePreviousFrame ?? 16) / 1000, now);
    const top = lift.value >= now.most;
    if (top !== atTop.value) {
      atTop.value = top;
      scheduleOnRN(setTopped, top);
    }
    light(faceAt(up.value, across.value, now, lift.value));
  }, false);
  // Made once for the faces: a new gesture would drop the one under the finger. `light` is made
  // afresh each draw, but reads only the values here and the ref of what to tell.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  const pan = useMemo(() => {
    const touched = () => told.current.onTouch();
    const picked = (index: number) => told.current.onPick(index);
    const running = (on: boolean) => frame.setActive(on);
    const follow = (x: number, y: number) => {
      "worklet";
      up.value = foot.value - y;
      across.value = x - middle.value;
      light(faceAt(up.value, across.value, form.value, lift.value));
    };
    return (
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(-START)
        .failOffsetY(START * 1.5)
        .onBegin(() => {
          scheduleOnRN(touched);
        })
        .onStart((event) => {
          // Measured as it starts: the field may have grown, or the keys come, since the last slide.
          const at = measured(anchor);
          if (at === null) return;
          foot.value = at.pageY + at.height;
          middle.value = at.pageX + at.width / 2;
          lift.value = 0;
          const top = form.value.most <= 0;
          atTop.value = top;
          scheduleOnRN(setTopped, top);
          sliding.value = true;
          shown.value = still ? 1 : withSpring(1, UP);
          // A dimming is a fade, which Reduce Motion keeps.
          dimmed.value = withTiming(1, { duration: DIM_IN_MS, easing: Easing.out(Easing.cubic) });
          scheduleOnRN(running, true);
          follow(event.absoluteX, event.absoluteY);
        })
        .onUpdate((event) => {
          if (sliding.value) follow(event.absoluteX, event.absoluteY);
        })
        .onEnd((_event, success) => {
          if (success && sliding.value && lit.value >= 0) scheduleOnRN(picked, lit.value);
        })
        // A tap ends here too, never having slid: there is nothing of the column to put away.
        .onFinalize(() => {
          if (!sliding.value) return;
          sliding.value = false;
          shown.value = still
            ? 0
            : withTiming(0, { duration: DOWN_MS, easing: Easing.in(Easing.quad) });
          dimmed.value = withTiming(0, { duration: DIM_OUT_MS, easing: Easing.out(Easing.cubic) });
          scheduleOnRN(running, false);
          light(-1);
        })
    );
  }, [
    enabled,
    still,
    anchor,
    form,
    up,
    across,
    lift,
    shown,
    dimmed,
    foot,
    middle,
    sliding,
    atTop,
    frame,
  ]);
  return {
    pan,
    anchor,
    shape,
    form,
    up,
    across,
    lift,
    lit,
    shown,
    foot,
    middle,
    dimmed,
    topped,
  };
}

/** The faces at the front of the field, which the finger slides up from. */
export function FaceSlideOn({
  slide,
  children,
}: {
  readonly slide: FaceSlide;
  readonly children: ReactNode;
}) {
  if (Platform.OS === "web" && !FILM_SOURCE) return <>{children}</>;
  return (
    <GestureDetector gesture={slide.pan}>
      {/* On the web (the film's render) the browser keeps the pointer for the element it went down
          on: a face here is drawn afresh as the field's faces change under the slide, which let it
          go, and the slide heard nothing more. The press is this view's own there. */}
      <View collapsable={false} pointerEvents={Platform.OS === "web" ? "box-only" : "auto"}>
        {children}
      </View>
    </GestureDetector>
  );
}

/**
 * The column, standing over the field with its middle over the first face, and the tag that names
 * the face under the finger. It takes no touches: the finger is the pan's, on the faces.
 */
export function FaceColumn({
  slide,
  choices,
  directory,
  lit,
  left,
}: {
  readonly slide: FaceSlide;
  /** The field's list (`choicesOf`): each agent and person, then Everyone. */
  readonly choices: readonly Choice[];
  readonly directory: Directory;
  /** The choice under the finger, as JavaScript has heard it: the tag's words. */
  readonly lit: number;
  /** Where its left edge stands in the field's row. */
  readonly left: number;
}) {
  const palette = usePalette();
  const shade = alpha(SHADE, useScheme() === "dark" ? DIM.dark : DIM.light);
  // The values alone go to the UI thread: the gesture beside them in `slide` cannot be copied there.
  const { shape, shown, lift, form, foot, middle, dimmed } = slide;
  const everyone = choices.at(-1);
  const popped = useAnimatedStyle(() => ({
    transform: [{ scale: SMALL + (1 - SMALL) * shown.value }],
  }));
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: dimmed.value }));
  // Where the stand-in was measured, on the window's layer.
  const placed = useAnimatedStyle(() => ({
    transform: [
      { translateX: middle.value - WIDTH / 2 },
      { translateY: foot.value - form.value.height },
    ],
  }));
  const stack = (
    <View style={[styles.window, { height: shape.view }]}>
      <Animated.View style={[styles.stack, lifted]}>
        {choices.slice(0, -1).map((choice, index) => (
          <Slot
            key={choice.ids.join(",")}
            slide={slide}
            index={index}
            choice={choice}
            directory={directory}
            ground={palette.surface}
          />
        ))}
      </Animated.View>
    </View>
  );
  const column = (
    <>
      <Animated.View style={[styles.grows, popped]}>
        <Capsule style={[styles.glass, { height: shape.height }]}>
          {shape.most <= 0 ? (
            stack
          ) : (
            <MaskedView
              style={{ height: shape.view }}
              maskElement={<Fades axis="y" start={!slide.topped} end={false} length={FADE} />}
            >
              {stack}
            </MaskedView>
          )}
          {everyone === undefined ? null : (
            <View style={[styles.foot, { borderColor: palette.line }]}>
              <Slot
                slide={slide}
                index={shape.faces}
                choice={everyone}
                directory={directory}
                ground={palette.surface}
                foot
              />
            </View>
          )}
        </Capsule>
      </Animated.View>
      <Tag slide={slide} choice={lit >= 0 ? choices[lit] : undefined} />
    </>
  );
  const sized = { width: WIDTH, height: shape.height };
  if (Platform.OS !== "ios") {
    return (
      <Animated.View
        ref={slide.anchor}
        collapsable={false}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.anchor, sized, { left }]}
        testID="face-column"
      >
        <Animated.View style={[styles.everywhere, { backgroundColor: shade }, dim]} />
        {column}
      </Animated.View>
    );
  }
  // The layer is the window's, over the bar too; VoiceOver is not kept in it, as it is by default.
  return (
    <>
      <Animated.View
        ref={slide.anchor}
        collapsable={false}
        pointerEvents="none"
        style={[styles.anchor, sized, { left }]}
        testID="face-column"
      />
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: shade }, dim]} />
          <Animated.View style={[styles.onWindow, sized, placed]}>{column}</Animated.View>
        </View>
      </FullWindowOverlay>
    </>
  );
}

/** One face in the column, drawn bigger the nearer the finger is to it. */
function Slot({
  slide,
  index,
  choice,
  directory,
  ground,
  foot = false,
}: {
  readonly slide: FaceSlide;
  readonly index: number;
  readonly choice: Choice;
  readonly directory: Directory;
  readonly ground: string;
  /**
   * Everyone's, under the line: the mark from two (`marked`), as big as the faces above it and
   * with no number, so it stands on their line and the tag says who.
   */
  readonly foot?: boolean;
}) {
  const { form, lift, up, across } = slide;
  const grown = useAnimatedStyle(() => {
    const shape = form.value;
    const at = middleOf(index, shape, lift.value);
    return { transform: [{ scale: grownBy(at, up.value, across.value, shape) }] };
  });
  return (
    <View style={[styles.slot, foot ? styles.footSlot : null]}>
      <Animated.View style={grown}>
        <Faces
          step={stepOf(directory, choice.ids)}
          ground={ground}
          everyone={choice.pick === "all"}
          counted={false}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The name of the face under the finger, on top of the column, where neither thumb covers it: a
 * right thumb reaching the column lies almost flat from the screen's edge, over anything beside the
 * face it is on. It stays put as the finger moves, and its words change. It keeps the last name
 * while it shrinks away, so it never empties as it goes.
 */
function Tag({
  slide,
  choice,
}: {
  readonly slide: FaceSlide;
  readonly choice: Choice | undefined;
}) {
  const kept = useRef<Choice | undefined>(choice);
  if (choice !== undefined) kept.current = choice;
  const { form, lit, shown } = slide;
  const placed = useAnimatedStyle(() => {
    const on = lit.value >= 0 && shown.value > 0;
    // The column grows from its foot, so its top, and the tag on it, come up with it.
    const grown = SMALL + (1 - SMALL) * shown.value;
    return {
      transform: [
        { translateY: form.value.height * (1 - grown) },
        { scale: withTiming(on ? 1 : SMALL, { duration: on ? 110 : DOWN_MS }) },
      ],
    };
  });
  // A room of its own over the column, as wide as a name may run: laid out in the column's own
  // fifty-four points, the words had none, and the walk's tag said "Fa…" for Fab Analyst.
  return (
    <View style={styles.tagRoom}>
      <Animated.View style={[styles.tag, placed]}>
        <Capsule style={styles.tagGlass}>
          {kept.current === undefined ? null : <ChoiceWords choice={kept.current} grows={false} />}
        </Capsule>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the field's row, its foot the gap above the field's top.
  anchor: { position: "absolute", bottom: "100%", marginBottom: GAP },
  // On the window's layer, moved to where the stand-in in the field's row is.
  onWindow: { position: "absolute", left: 0, top: 0 },
  everywhere: {
    position: "absolute",
    left: EVERYWHERE,
    right: EVERYWHERE,
    top: EVERYWHERE,
    bottom: EVERYWHERE,
  },
  grows: { flex: 1, transformOrigin: "center bottom" },
  glass: { width: WIDTH, borderRadius: WIDTH / 2, paddingVertical: PAD },
  window: { overflow: "hidden" },
  stack: { position: "absolute", left: 0, right: 0, bottom: 0 },
  slot: { height: SLOT, alignItems: "center", justifyContent: "center" },
  foot: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: SPACE.sm },
  footSlot: { height: FOOT - StyleSheet.hairlineWidth },
  // On the column's top, its left edge on the column's.
  tagRoom: {
    position: "absolute",
    left: 0,
    bottom: "100%",
    marginBottom: TAG_GAP,
    width: TAG_ROOM,
    alignItems: "flex-start",
  },
  tag: { transformOrigin: "left bottom" },
  tagGlass: {
    borderRadius: 18,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs + 2,
  },
});
