/**
 * The thinking bubble's strip (ADR 0147): a glyph for every call the run has made, in the order
 * it made them, so a long turn reads as work piling up rather than as one line being rewritten.
 *
 * A run of one kind is one glyph and its count — six searches in a row are a glass and a 6 — and
 * the newest is lit, in ink rather than the face's colour, so it reads as *now* without being one
 * more colour in the bubble (Arjun, 10 October 2026: "for the strip highlight square I need a
 * neutral color"). When the glyphs outgrow the strip, the oldest fold into a `+N` at its start:
 * it never scrolls and never wraps, and the newest is always in view (core's `stripOf`,
 * `fitStrip`; four ways were mocked, and this one moved a 107-call turn's strip 9 times where a
 * glyph apiece moved it 96).
 *
 * Calls come in bursts — Jacobian logs three searches in twenty milliseconds — and three glyphs
 * landing in one frame read as a jump. So each call is shown at least `RIPPLE_MS` after the one
 * before it, and a burst ripples in from the left (`useRipple`). A glyph comes in growing from
 * six tenths as it fades up; one that moves slides; one whose count goes up swells a little and
 * settles; one folded into the `+N` fades where it stood.
 *
 * Drawn with `Animated` on the native driver, as the dots are. Reduce Motion shows each call the
 * moment it is made, and moves nothing.
 */

import type { CallKind, PlacedChip, Step } from "@chipschat/core";
import { fitStrip, stripOf } from "@chipschat/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import type { Palette } from "../ui/tokens";

/** What each kind of call is drawn as: the marks the call pill drew, and four more. */
export const GLYPHS: Readonly<Record<CallKind, IconName>> = {
  search: "search",
  web: "globe",
  shell: "terminal",
  image: "image",
  memory: "bookmark",
  edit: "pen",
  file: "doc",
  mail: "mail",
  handoff: "route",
  other: "dot",
};

/** The least time between two calls coming onto the strip. */
export const RIPPLE_MS = 90;
/** A glyph's height, its mark, the gap between two, and how wide a digit of a count is. */
const CHIP = 16;
const MARK = 10;
const GAP = 3;
const DIGIT = 6.4;
const SIZES = {
  chip: (count: number) => (count > 1 ? 19 + DIGIT * String(count).length : CHIP),
  more: (hidden: number) => 13 + DIGIT * String(hidden).length,
  gap: GAP,
};
const COME_MS = 220;
const SLIDE_MS = 280;
const SWELL_MS = 260;

export function CallStrip({
  made,
  palette,
  less,
  lead,
}: {
  /** The calls the run has made, in the order it made them. */
  readonly made: readonly Step[];
  readonly palette: Palette;
  readonly less: boolean;
  /**
   * How long after it opens the first glyph comes, while the row opens under the words; nothing
   * when the bubble came already open, whose calls are there as it arrives.
   */
  readonly lead: number | undefined;
}) {
  const [room, setRoom] = useState<number | undefined>(undefined);
  const shown = useRipple(made.length, lead, less);
  const placed =
    room === undefined ? undefined : fitStrip(stripOf(made.slice(0, shown)), room, SIZES);
  const gone = useGone(placed?.chips ?? [], less);
  const onLayout = (event: LayoutChangeEvent) => setRoom(event.nativeEvent.layout.width);
  return (
    <View
      testID="doing-strip"
      style={styles.strip}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {gone.chips.map((chip) => (
        <Going key={chip.key} chip={chip} palette={palette} onGone={gone.done} />
      ))}
      {placed?.chips.map((chip) => (
        <Chip key={chip.key} chip={chip} palette={palette} less={less} />
      ))}
      {placed === undefined || placed.more === 0 ? null : (
        <More hidden={placed.more} palette={palette} less={less} />
      )}
    </View>
  );
}

/**
 * How many of `count` calls are on the strip yet: each comes `RIPPLE_MS` after the one before, the
 * first `lead` after the strip opened, and with Reduce Motion each as it is made.
 */
function useRipple(count: number, lead: number | undefined, less: boolean): number {
  // When each call comes: those there when the strip came, at once if the bubble came open.
  const times = useRef<number[] | undefined>(undefined);
  if (times.current === undefined) {
    times.current = lead === undefined || less ? Array.from({ length: count }, () => 0) : [];
  }
  const [shown, setShown] = useState(times.current.length);
  useEffect(() => {
    const due = times.current ?? [];
    const now = Date.now();
    for (let index = due.length; index < count; index += 1) {
      const before = due[index - 1];
      const earliest = index === 0 ? now + (lead ?? 0) : now;
      due.push(less ? now : Math.max(earliest, (before ?? 0) + RIPPLE_MS));
    }
  }, [count, lead, less]);
  useEffect(() => {
    const due = times.current ?? [];
    const next = due[shown];
    if (shown >= count || next === undefined) return;
    const timer = setTimeout(
      () => {
        const now = Date.now();
        let ready = shown + 1;
        while (ready < count && (due[ready] ?? 0) <= now) ready += 1;
        setShown(ready);
      },
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [shown, count]);
  return Math.min(shown, count);
}

/**
 * The glyphs folded off the start since the last drawing, kept a moment to fade where they stood.
 * With Reduce Motion they go at once.
 */
function useGone(chips: readonly PlacedChip[], less: boolean) {
  const last = useRef<readonly PlacedChip[]>(chips);
  const [going, setGoing] = useState<readonly PlacedChip[]>([]);
  // After every drawing: what stood last time and stands no longer has just folded off.
  useLayoutEffect(() => {
    const keys = new Set(chips.map((chip) => chip.key));
    const left = last.current.filter((chip) => !keys.has(chip.key));
    last.current = chips;
    if (left.length > 0 && !less) setGoing((was) => [...was, ...left]);
  });
  const done = useCallback(
    (key: string) => setGoing((was) => was.filter((chip) => chip.key !== key)),
    [],
  );
  return { chips: going, done };
}

/** A glyph on the strip, and its count when it stands for more than one call. */
function Chip({
  chip,
  palette,
  less,
}: {
  readonly chip: PlacedChip;
  readonly palette: Palette;
  readonly less: boolean;
}) {
  const x = useRef(new Animated.Value(chip.x)).current;
  const come = useRef(new Animated.Value(less ? 1 : 0)).current;
  const swell = useRef(new Animated.Value(0)).current;
  const was = useRef({ x: chip.x, count: chip.count });
  useEffect(() => {
    if (less) return;
    Animated.timing(come, {
      toValue: 1,
      duration: COME_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [come, less]);
  useEffect(() => {
    if (chip.x === was.current.x) return;
    was.current.x = chip.x;
    if (less) {
      x.setValue(chip.x);
      return;
    }
    Animated.timing(x, {
      toValue: chip.x,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chip.x, less, x]);
  useEffect(() => {
    const more = chip.count > was.current.count;
    was.current.count = chip.count;
    if (!more || less) return;
    swell.setValue(0);
    Animated.timing(swell, {
      toValue: 1,
      duration: SWELL_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [chip.count, less, swell]);
  const scale = Animated.multiply(
    come.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
    swell.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.16, 1] }),
  );
  const ink = chip.lit ? palette.surface : palette.ink3;
  return (
    <Animated.View
      testID={`strip-${chip.kind}`}
      style={[
        styles.chip,
        {
          width: chip.width,
          backgroundColor: chip.lit ? palette.ink2 : palette.surface3,
          opacity: come,
          transform: [{ translateX: x }, { scale }],
        },
      ]}
    >
      <Icon name={GLYPHS[chip.kind]} size={MARK} color={ink} weight={2.2} />
      {chip.count > 1 ? (
        <Text allowFontScaling={false} style={[styles.count, { color: ink }]}>
          {chip.count}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** A glyph folded into the `+N`, fading where it stood as it slides under it. */
function Going({
  chip,
  palette,
  onGone,
}: {
  readonly chip: PlacedChip;
  readonly palette: Palette;
  readonly onGone: (key: string) => void;
}) {
  const go = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const out = Animated.timing(go, {
      toValue: 1,
      duration: COME_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    out.start(() => onGone(chip.key));
    return () => out.stop();
  }, [go, chip.key, onGone]);
  return (
    <Animated.View
      style={[
        styles.chip,
        {
          width: chip.width,
          backgroundColor: palette.surface3,
          opacity: go.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            {
              translateX: go.interpolate({
                inputRange: [0, 1],
                outputRange: [chip.x, chip.x - 19],
              }),
            },
          ],
        },
      ]}
    >
      <Icon name={GLYPHS[chip.kind]} size={MARK} color={palette.ink3} weight={2.2} />
    </Animated.View>
  );
}

/** How many calls have folded off the strip's start: a quiet `+N` standing over where they went. */
function More({
  hidden,
  palette,
  less,
}: {
  readonly hidden: number;
  readonly palette: Palette;
  readonly less: boolean;
}) {
  const come = useRef(new Animated.Value(less ? 1 : 0)).current;
  useEffect(() => {
    if (less) return;
    Animated.timing(come, {
      toValue: 1,
      duration: COME_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [come, less]);
  return (
    <Animated.View
      testID="strip-more"
      style={[
        styles.more,
        { width: SIZES.more(hidden), backgroundColor: palette.surface2, opacity: come },
      ]}
    >
      <Text allowFontScaling={false} style={[styles.moreWords, { color: palette.ink3 }]}>
        +{hidden}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // As tall as a glyph and a point either side, clipped, so nothing sliding off its ends shows.
  strip: { height: CHIP + 2, overflow: "hidden" },
  chip: {
    position: "absolute",
    left: 0,
    top: 1,
    height: CHIP,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  count: { fontSize: 10.5, lineHeight: CHIP, fontWeight: "600", fontVariant: ["tabular-nums"] },
  // Over the glyphs folding under it, in the bubble's own colour.
  more: { position: "absolute", left: 0, top: 0, height: CHIP + 2, zIndex: 2 },
  moreWords: {
    fontSize: 11,
    lineHeight: CHIP + 2,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
