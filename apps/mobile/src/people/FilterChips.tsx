/**
 * People's filters (ADR 0209): All, Owners and admins, Members, Guests, each with how many, in a
 * row that scrolls when it is wider than the phone. The one chosen wears the ink, and the ink
 * slides to the next one picked on the app's spring rather than jumping: the motion is the point,
 * the chips themselves are flat.
 */

import { useState } from "react";
import { type LayoutRectangle, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as feel from "../ui/haptics";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Thumb } from "./PeopleMotion";

export interface Chip<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly count: number;
}

const HEIGHT = 34;

export function FilterChips<K extends string>({
  chips,
  chosen,
  onChoose,
  label,
  testID,
}: {
  readonly chips: readonly Chip<K>[];
  readonly chosen: K;
  readonly onChoose: (key: K) => void;
  /** What the row is, to a screen reader. */
  readonly label: string;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const [frames, setFrames] = useState<Partial<Record<K, LayoutRectangle>>>({});
  const at = frames[chosen];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={styles.track}>
        <Thumb x={at?.x} width={at?.width} height={HEIGHT} colour={palette.ink} />
        {chips.map((chip) => {
          const on = chip.key === chosen;
          return (
            <Pressable
              key={chip.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${chip.label}, ${chip.count}`}
              onLayout={(event) => {
                const frame = event.nativeEvent.layout;
                setFrames((was) => ({ ...was, [chip.key]: frame }));
              }}
              onPress={() => {
                if (on) return;
                feel.tick();
                onChoose(chip.key);
              }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: on ? "transparent" : palette.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID={`filter-${chip.key}`}
            >
              <Text style={[styles.word, { color: on ? palette.bg : palette.ink2 }]}>
                {chip.label}
                <Text style={{ color: on ? palette.ink4 : palette.ink3 }}>{`  ${chip.count}`}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
  track: { flexDirection: "row", gap: SPACE.sm },
  chip: {
    height: HEIGHT,
    paddingHorizontal: SPACE.md + 2,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  word: { fontSize: TEXT.md, fontWeight: "500" },
});
