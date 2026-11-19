/**
 * A segmented control: two to four short words in a track, and a tile that slides under the one
 * chosen. A phone's own settings pick Light or Dark this way, and a choice of three that is
 * always the same three reads faster as one control than as three buttons (ADR 0085).
 *
 * The tile moves on the spring the rest of the app moves on, by transform, so nothing is laid out
 * again as it goes. Flat: a tile a shade off the track, no shadow and no gloss. A screen reader
 * hears a radio group, each segment a radio saying whether it is the one.
 *
 * A segment can wear a gold dot on its word's shoulder for something new behind it (`NewDot`; the
 * Desktop tab's, ADR 0227's addendum of 17 November 2026), and a screen reader hears "new".
 */

import { useEffect, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useGround } from "./ground";
import * as feel from "./haptics";
import { IOS_SPRING } from "./motion";
import { NewDot } from "./NewDot";
import { usePalette, useScheme } from "./theme";
import { TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

export interface Segment {
  readonly value: string;
  readonly label: string;
  /**
   * The gold dot on its word: lit while something behind it is new. Left out, there is none to go
   * out; false, it goes out.
   */
  readonly dot?: boolean | undefined;
}

/** How long a dot waits to come in, so it isn't lost in what it stands on settling (a sheet rising). */
const DOT_WAITS_MS = 350;

/** The track's padding, and the gap between segments. */
const PAD = 3;

export function Segmented({
  label,
  options,
  chosen,
  onChoose,
  testID,
}: {
  /** What the group is, to a screen reader. */
  readonly label: string;
  readonly options: readonly Segment[];
  readonly chosen: string;
  readonly onChoose: (value: string) => void;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  // The track is set into what it stands on: a card's grey, or under the grouped ground.
  const { sunk } = useGround();
  const scheme = useScheme();
  const still = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === chosen),
  );
  const segment = width === 0 ? 0 : (width - PAD * 2) / options.length;
  const tileColor = scheme === "dark" ? palette.surface3 : palette.surface;
  const [x] = useState(() => new Animated.Value(0));
  const placed = useRef(false);

  useEffect(() => {
    if (segment === 0) return;
    const to = index * segment;
    // The first placing is where it is, not a slide from the left edge.
    if (!placed.current || still) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.spring(x, { toValue: to, ...IOS_SPRING, useNativeDriver: true }).start();
  }, [index, segment, still, x]);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      testID={testID}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: sunk }]}
    >
      {segment === 0 ? null : (
        <Animated.View
          style={[
            styles.tile,
            {
              width: segment,
              backgroundColor: tileColor,
              transform: [{ translateX: x }],
            },
          ]}
        />
      )}
      {options.map((option) => (
        <SegmentButton
          key={option.value}
          option={option}
          on={option.value === chosen}
          ground={{ tile: tileColor, track: sunk }}
          onChoose={onChoose}
          testID={testID}
        />
      ))}
    </View>
  );
}

/** One segment: its word, the gold dot on it when it has one, and a radio to a screen reader. */
function SegmentButton({
  option,
  on,
  ground,
  onChoose,
  testID,
}: {
  readonly option: Segment;
  readonly on: boolean;
  /** The tile's colour and the track's, for the dot's rim on whichever it stands on. */
  readonly ground: { readonly tile: string; readonly track: string };
  readonly onChoose: (value: string) => void;
  readonly testID: string | undefined;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={option.dot === true ? `${option.label}, new` : option.label}
      onPress={() => {
        if (on) return;
        feel.tick();
        onChoose(option.value);
      }}
      style={styles.segment}
    >
      <View style={styles.label}>
        <Text
          numberOfLines={1}
          style={[
            styles.word,
            { color: on ? palette.ink : palette.ink2, fontWeight: on ? "600" : "500" },
          ]}
        >
          {option.label}
        </Text>
        {option.dot === undefined ? null : (
          <NewDot
            lit={option.dot}
            rim={on ? ground.tile : ground.track}
            waitMs={DOT_WAITS_MS}
            style={styles.dot}
            testID={testID === undefined ? undefined : `${testID}-${option.value}-dot`}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: 12, padding: PAD },
  tile: { position: "absolute", top: PAD, bottom: PAD, left: PAD, borderRadius: 9 },
  segment: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center" },
  label: { maxWidth: "100%" },
  word: { fontSize: TEXT.md, paddingHorizontal: 4 },
  // On the word's shoulder: its gold starts 3 pt past the last letter, its top level with the caps.
  dot: { top: -2, right: -9 },
});
