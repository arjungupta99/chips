/**
 * A segmented control: two to four short words in a track, and a tile that slides under the one
 * chosen. A phone's own settings pick Light or Dark this way, and a choice of three that is
 * always the same three reads faster as one control than as three buttons (ADR 0085).
 *
 * The tile moves on the spring the rest of the app moves on, by transform, so nothing is laid out
 * again as it goes. Flat: a tile a shade off the track, no shadow and no gloss. A screen reader
 * hears a radio group, each segment a radio saying whether it is the one.
 */

import { useEffect, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useGround } from "./ground";
import * as feel from "./haptics";
import { IOS_SPRING } from "./motion";
import { usePalette, useScheme } from "./theme";
import { TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

export interface Segment {
  readonly value: string;
  readonly label: string;
}

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
              backgroundColor: scheme === "dark" ? palette.surface3 : palette.surface,
              transform: [{ translateX: x }],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const on = option.value === chosen;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={option.label}
            onPress={() => {
              if (on) return;
              feel.tick();
              onChoose(option.value);
            }}
            style={styles.segment}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.word,
                { color: on ? palette.ink : palette.ink2, fontWeight: on ? "600" : "500" },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: 12, padding: PAD },
  tile: { position: "absolute", top: PAD, bottom: PAD, left: PAD, borderRadius: 9 },
  segment: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center" },
  word: { fontSize: TEXT.md, paddingHorizontal: 4 },
});
