/**
 * A table too wide for its bubble (ADR 0184), saying there is more of it (ADR 0186, Arjun's C).
 * It scrolls sideways inside the bubble; the side with more of it fades into the bubble, each
 * fade as strong as there is table past it, and a dot per column above its far corner lights the
 * columns in view as one capsule that stretches and slides with the finger.
 *
 * Everything that moves with the scroll is an opacity or a transform, set on the UI thread from
 * the scroll's offset (`useAnimatedScrollHandler`): nothing is laid out again as it moves. The
 * fade is a `MaskedView` whose mask is UIKit's own `maskView`, so a mask's opacity changing is the
 * mask changing. The numbers are core's (`tableDots`), which the web draws by too.
 */

import {
  capsule,
  columnsInView,
  dotShown,
  dotsWidth,
  edgeStrength,
  TABLE_DOT,
  TABLE_FADE,
} from "@chipschat/core";
import MaskedView from "@react-native-masked-view/masked-view";
import { type ReactNode, useId, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { usePalette } from "../ui/theme";
import { BUBBLE, SPACE } from "../ui/tokens";
import type { TableLayout } from "./tableLayout";

export function WideTable({
  layout,
  room,
  ink,
  children,
}: {
  readonly layout: TableLayout;
  /** How wide the table's box is: the bubble's width, edge to edge. */
  readonly room: number;
  /** The bubble's ink, when it is not the page's (your own bubble). */
  readonly ink: string | undefined;
  readonly children: ReactNode;
}) {
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      x.value = event.contentOffset.x;
    },
  });
  const widths = useMemo(() => layout.columns.map((column) => column.width), [layout]);
  const scroller = (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ width: layout.width }}
      testID="md-table-scrolls"
    >
      {children}
    </Animated.ScrollView>
  );
  return (
    <View>
      <Dots widths={widths} room={room} x={x} ink={ink} />
      {/* The web target has no mask to draw through, and drew nothing under it: the table goes
          without its fades there, its dots still saying there is more. */}
      {Platform.OS === "web" ? (
        scroller
      ) : (
        <MaskedView maskElement={<Edges x={x} far={Math.max(0, layout.width - room)} />}>
          {scroller}
        </MaskedView>
      )}
    </View>
  );
}

/**
 * The mask: solid, but for a fade in from each side. A side's fade is a ramp under a solid cover,
 * and the cover gives way as there is more table past that side, so the fade comes up as the
 * finger moves rather than all at once.
 */
function Edges({ x, far }: { readonly x: SharedValue<number>; readonly far: number }) {
  const start = useAnimatedStyle(() => ({ opacity: 1 - edgeStrength(x.value) }));
  const end = useAnimatedStyle(() => ({ opacity: 1 - edgeStrength(far - x.value) }));
  return (
    <View style={styles.mask} pointerEvents="none">
      <View style={styles.edge}>
        <Ramp toward="start" />
        <Animated.View style={[StyleSheet.absoluteFill, styles.solid, start]} />
      </View>
      <View style={[styles.middle, styles.solid]} />
      <View style={styles.edge}>
        <Ramp toward="end" />
        <Animated.View style={[StyleSheet.absoluteFill, styles.solid, end]} />
      </View>
    </View>
  );
}

/** Clear at the table's side, solid a fade's length in, eased so it melts rather than stops. */
function Ramp({ toward }: { readonly toward: "start" | "end" }) {
  const id = useId().replace(/:/g, "");
  const outward = toward === "start" ? 0 : 1;
  return (
    // In a unit box stretched to the edge at every draw (`FieldPicture`, in `ScrollColours.tsx`).
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id={id} x1={outward} y1="0" x2={1 - outward} y2="0">
          <Stop offset={0} stopColor="#000" stopOpacity={0} />
          <Stop offset={0.42} stopColor="#000" stopOpacity={0.45} />
          <Stop offset={1} stopColor="#000" stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A dot per column, and over them a capsule for the columns in view: a cap at each end and the
 * run between them, each moved and the run stretched by a transform, so a column's worth of
 * swipe slides the capsule a dot along.
 */
function Dots({
  widths,
  room,
  x,
  ink,
}: {
  readonly widths: readonly number[];
  readonly room: number;
  readonly x: SharedValue<number>;
  readonly ink: string | undefined;
}) {
  const palette = usePalette();
  const lit = useAnimatedStyle(() => {
    const { from, to } = columnsInView(widths, x.value, room);
    return { transform: [{ translateX: capsule(from, to).left }] };
  });
  const farCap = useAnimatedStyle(() => {
    const { from, to } = columnsInView(widths, x.value, room);
    const { left, width } = capsule(from, to);
    return { transform: [{ translateX: left + width - TABLE_DOT.size }] };
  });
  const run = useAnimatedStyle(() => {
    const { from, to } = columnsInView(widths, x.value, room);
    const { left, width } = capsule(from, to);
    // A run one point wide, stretched about its middle to reach from one cap's middle to the other's.
    const span = Math.max(0, width - TABLE_DOT.size);
    return {
      transform: [
        { translateX: left + TABLE_DOT.size / 2 + span / 2 - 0.5 },
        { scaleX: Math.max(span, 0.01) },
      ],
    };
  });
  const dot = { backgroundColor: ink ?? palette.ink3 };
  const capsuleInk = { backgroundColor: ink ?? palette.ink2 };
  return (
    <View
      style={styles.dotsRow}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="md-table-dots"
    >
      <View style={[styles.track, { width: dotsWidth(widths.length) }]}>
        {widths.map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a column's dot is only ever its own.
          <Dot key={index} index={index} widths={widths} room={room} x={x} ink={dot} />
        ))}
        {/* One layer, so where its pieces overlap is no darker than the rest of it. */}
        <View style={[StyleSheet.absoluteFill, ink === undefined ? null : styles.ownCapsule]}>
          <Animated.View style={[styles.cap, capsuleInk, lit]} />
          <Animated.View style={[styles.runBase, capsuleInk, run]} />
          <Animated.View style={[styles.cap, capsuleInk, farCap]} />
        </View>
      </View>
    </View>
  );
}

/** A dot the capsule is clear of, faint. */
const DOT_REST = 0.3;

/** A column's dot, fading as the capsule slides over it, so no sliver shows past its end. */
function Dot({
  index,
  widths,
  room,
  x,
  ink,
}: {
  readonly index: number;
  readonly widths: readonly number[];
  readonly room: number;
  readonly x: SharedValue<number>;
  readonly ink: { readonly backgroundColor: string };
}) {
  const shown = useAnimatedStyle(() => {
    const { from, to } = columnsInView(widths, x.value, room);
    const { left, width } = capsule(from, to);
    return { opacity: DOT_REST * dotShown(index, left, width) };
  });
  return <Animated.View style={[styles.dot, ink, shown]} testID="md-table-dot" />;
}

const styles = StyleSheet.create({
  mask: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row" },
  edge: { width: TABLE_FADE.length },
  middle: { flex: 1 },
  solid: { backgroundColor: "#000" },
  // Over the table's far corner, in line with the words' edge.
  dotsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingRight: BUBBLE.padX,
    marginBottom: SPACE.sm,
  },
  track: { flexDirection: "row", gap: TABLE_DOT.gap, height: TABLE_DOT.size },
  dot: { width: TABLE_DOT.size, height: TABLE_DOT.size, borderRadius: TABLE_DOT.size / 2 },
  cap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: TABLE_DOT.size,
    height: TABLE_DOT.size,
    borderRadius: TABLE_DOT.size / 2,
  },
  runBase: { position: "absolute", top: 0, left: 0, width: 1, height: TABLE_DOT.size },
  ownCapsule: { opacity: 0.9 },
});
