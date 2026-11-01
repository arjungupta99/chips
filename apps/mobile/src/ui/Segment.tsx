/**
 * The autonomy dial as a segmented control: L0 to L3, and the sentence saying what the level
 * means underneath it. Trust is a dial, not a switch.
 *
 * The workspace cap always wins — levels above it are drawn and cannot be chosen, because
 * hiding them would make the ceiling invisible and a person would go looking for a setting that
 * is not theirs. A screen reader hears each segment as a radio, so the group reads as one
 * choice rather than four buttons.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";
import { AUTONOMY_LEVELS, type AutonomyLevel, autonomyInfo } from "./vocabulary";

export function Segment({
  value,
  onChange,
  max = 3,
  busy = false,
}: {
  readonly value: AutonomyLevel;
  /** Absent, the dial is read-only: the level, drawn, with nothing to press. */
  readonly onChange?: ((level: AutonomyLevel) => void) | undefined;
  /** The workspace cap. */
  readonly max?: AutonomyLevel;
  readonly busy?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={styles.group}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Autonomy"
        style={[styles.track, { backgroundColor: palette.surface2, borderColor: palette.line }]}
      >
        {AUTONOMY_LEVELS.map((info) => {
          const chosen = info.level === value;
          const capped = info.level > max;
          const off = capped || busy || onChange === undefined;
          return (
            <Pressable
              key={info.level}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen, disabled: off }}
              accessibilityLabel={`L${info.level}, ${info.name}`}
              accessibilityHint={capped ? "Above this workspace's limit" : undefined}
              disabled={off}
              onPress={() => onChange?.(info.level)}
              style={[
                styles.segment,
                chosen ? { backgroundColor: palette.surface, borderColor: palette.line2 } : null,
                capped ? styles.capped : null,
              ]}
            >
              <Text
                style={[
                  styles.level,
                  {
                    color: chosen ? palette.ink : palette.ink3,
                    fontWeight: chosen ? "700" : "600",
                  },
                ]}
              >
                L{info.level}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.name, { color: palette.ink }]}>{autonomyInfo(value).name}</Text>
      <Text style={[styles.summary, { color: palette.ink3 }]}>{autonomyInfo(value).summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.xs },
  track: {
    flexDirection: "row",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  capped: { opacity: 0.4 },
  level: { fontSize: TEXT.md },
  name: { fontSize: TEXT.md, fontWeight: "600", paddingTop: SPACE.xs },
  summary: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
});
