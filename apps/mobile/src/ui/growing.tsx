/**
 * What grows on the UI thread: the field opening into the list of who a message goes to
 * (`spaces/AddressInField.tsx`), and the list's rows coming into it. Reanimated's layout
 * transitions, whose frames are set on the UI thread with no render and no commit (ADR 0061).
 *
 * Quick and plain, with no overshoot: the menu the list replaced swung past its size for half a
 * second, "too slow and excessive" (Arjun, 28 September 2026). The room rises after the field on
 * its own spring, as it does for any change at its foot (ADR 0075).
 *
 * Under Jest this file is mocked to plain views, as the other Reanimated files here are.
 */

import { GlassView } from "expo-glass-effect";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  FadeIn,
  FadeOut,
  type LayoutAnimation,
  LayoutAnimationConfig,
  type LayoutAnimationsValues,
  LinearTransition,
  withTiming,
} from "react-native-reanimated";

const GROW_MS = 190;
const GROW_EASING = Easing.out(Easing.cubic);
const GROW_TIMING = { duration: GROW_MS, easing: GROW_EASING };
const AT_ONCE = { duration: 0 };

/** How what is inside a capsule that grows moves to its new place in it: the words' row. */
export const GROWS = LinearTransition.duration(GROW_MS).easing(GROW_EASING);

/**
 * `GROWS` up and down only: across, the new place and width at once, as the field's own glass takes
 * them (`GROWS_UP`). For what is inside a room's field, which on an iPad narrows and widens every
 * frame as the panes move: the words' row, and Send, which trailed the glass's edge out past it.
 */
export function RISES(values: LayoutAnimationsValues): LayoutAnimation {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX,
      originY: values.currentOriginY,
      width: values.targetWidth,
      height: values.currentHeight,
    },
    animations: {
      originY: withTiming(values.targetOriginY, GROW_TIMING),
      height: withTiming(values.targetHeight, GROW_TIMING),
    },
  };
}

/**
 * How a capsule that grows moves to its new size: up from its foot, which stays where it was drawn.
 *
 * A transition moves a view within its parent, and the parent here does not move: it jumps. The
 * room's foot is pinned to the bottom of the glass and is as tall as what it holds, so when the
 * field opens into its list every view in the foot is put the list's height higher at once, and a
 * plain transition grew the glass down from its new top: opening, the words leapt up to where the
 * list would start and slid back down; closing, they rose out from behind the keys (Arjun's phone,
 * 10 October 2026). The parent jumps by exactly what the capsule grows, since the capsule is the
 * tallest thing on its row, so the capsule starts where its top was drawn — its new foot less its
 * old height — and only its top moves. The words' row inside moves on `GROWS`, on the same clock
 * and curve, by the same distance the other way, and so holds still.
 *
 * Across, it takes its new place and width at once: it grows up, not sideways. A room's composer on
 * an iPad goes with the panes as the list steps aside or comes back (`Clearing`), a new width every
 * frame, and each began a transition of its own from where the last had got to, so the field
 * trailed the + beside it and was drawn over it (the 13-inch simulator upright, 7 November 2026).
 */
export function GROWS_UP(values: LayoutAnimationsValues): LayoutAnimation {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX,
      originY: values.targetOriginY + values.targetHeight - values.currentHeight,
      width: values.targetWidth,
      height: values.currentHeight,
    },
    animations: {
      originY: withTiming(values.targetOriginY, GROW_TIMING),
      height: withTiming(values.targetHeight, GROW_TIMING),
    },
  };
}

/**
 * How the field's words move aside for the faces in front of them as those change (a pick, a slide
 * up the column, an @): across, on the faces' own clock and curve, so they keep pace with the edge
 * of the capsule that grows or shrinks beside them rather than jump ahead of it in a frame (Arjun,
 * 6 November 2026: "super smooth motion"). Only across: the rest of the frame lands at once, so a
 * line typed changes the words' height as it always did. All four values are named, as a move
 * merged into one still going needs (`spaces/roomFrame.ts`).
 */
export function ASIDE(values: LayoutAnimationsValues): LayoutAnimation {
  "worklet";
  return {
    initialValues: {
      originX: values.currentOriginX,
      originY: values.targetOriginY,
      width: values.targetWidth,
      height: values.targetHeight,
    },
    animations: {
      originX: withTiming(values.targetOriginX, GROW_TIMING),
      originY: withTiming(values.targetOriginY, AT_ONCE),
      width: withTiming(values.targetWidth, AT_ONCE),
      height: withTiming(values.targetHeight, AT_ONCE),
    },
  };
}

/**
 * How what opens into a capsule above what it held comes in: from no height to its own, clipped, on
 * the glass's clock and curve, so it is never taller than the glass has grown for it. The strip a
 * reply holds (`ReplyStrip.tsx`) is the one. Drawn whole at once, it stood over the words for the
 * glass's first frames, since the words are held where they were as the glass grows up past them
 * (the simulator, 23 October 2026). It goes at once, as the rows of the list do.
 */
export function OPENS(values: EntryAnimationsValues): LayoutAnimation {
  "worklet";
  return {
    initialValues: { height: 0, opacity: 0 },
    animations: {
      height: withTiming(values.targetHeight, GROW_TIMING),
      opacity: withTiming(1, GROW_TIMING),
    },
  };
}

/**
 * How what opened goes: back to no height as it fades, on the same clock and curve, while what stood
 * under it moves up into its place on `GROWS`. A program's Stop and Run again on Universe's Desktop
 * tab, as it stops (ADR 0227's second addendum).
 */
export function CLOSES(values: ExitAnimationsValues): LayoutAnimation {
  "worklet";
  return {
    initialValues: { height: values.currentHeight, opacity: 1 },
    animations: {
      height: withTiming(0, GROW_TIMING),
      opacity: withTiming(0, GROW_TIMING),
    },
  };
}

/**
 * Where something may open into a capsule (`OPENS`): only once the capsule is drawn. What a room
 * opens with already in it is there, as the glass round it is.
 */
export function Opens({ children }: { readonly children: ReactNode }) {
  return <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>;
}

/** The system's glass, for a capsule that grows: its frame is set on the UI thread as it moves. */
export const GrowingGlass = Animated.createAnimatedComponent(GlassView);

/** A painted capsule that grows, and what moves inside one as it does. */
export const GrowingView = Animated.View;

/**
 * A list whose rows move to their new places on `GROWS` when rows above them come or go: Media on
 * this phone's tiles closing up after a Delete (ADR 0159). Its `itemLayoutAnimation` is the cell's.
 */
export const GrowingList: typeof Animated.FlatList = Animated.FlatList;

/**
 * The rows come a moment after the field has begun to open, and go at once as it closes: a row
 * left to fade out stood where the field's top had been, and the shrinking glass carried it down
 * through the words for a frame or two (the simulator, 28 September 2026).
 */
const ROWS_IN = FadeIn.duration(150).delay(40).easing(Easing.out(Easing.cubic));

/**
 * A group's copy, coming in over the blank that stood for it on an agent's card (ADR 0238's
 * addendum: "it needs to transition appear in", Arjun, 28 October 2026). The copy fades in while
 * the blank holds, then the blank fades from under it, so the group's ground never thins between
 * the two; whichever of them is drawn on top, the place is always covered.
 */
const LAND_MS = 200;
const LANDS = FadeIn.duration(LAND_MS).easing(GROW_EASING);
const STOOD = FadeOut.delay(LAND_MS - 60)
  .duration(140)
  .easing(Easing.in(Easing.quad));

/**
 * Where one of an agent's groups stands on its card: it takes its new size on `GROWS`, clipped, so
 * a copy longer than its blank opens down into its place rather than drawing over what is under
 * it, and it moves on `GROWS` when a group above it does.
 */
export function GroupPlace({ children }: { readonly children: ReactNode }) {
  return (
    <Animated.View layout={GROWS} style={{ overflow: "hidden" }}>
      {children}
    </Animated.View>
  );
}

/** A group's blank: when its copy lands, it holds while the copy comes in, then fades. */
export function Stands({ children }: { readonly children: ReactNode }) {
  return <Animated.View exiting={STOOD}>{children}</Animated.View>;
}

/**
 * What took a blank's place: faded in when a blank stood for it (`after`), and drawn as it is when
 * it was there from the first frame, as a copy kept from before is.
 */
export function Lands({
  after,
  children,
}: {
  readonly after: boolean;
  readonly children: ReactNode;
}) {
  return <Animated.View {...(after ? { entering: LANDS } : {})}>{children}</Animated.View>;
}

/** What comes into a capsule as it grows, and is gone as it shrinks: the list's rows. */
export function Appearing({
  style,
  testID,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <Animated.View entering={ROWS_IN} accessibilityRole="menu" style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}
