/**
 * What a harness's Permissions (ADR 0299) shares with an agent's: Asks so far (ADR 0255), the dots
 * with their key and the line under them, one press that opens every ask; and the count of rules
 * on, `2 on`, `1 of 2 on`.
 *
 * It once held When it asks you whole (ADR 0195, Arjun's pick of "When it asks you, simpler"): the
 * ask travelling, the opening, the three promises and Allowed always. Its Permissions took that
 * page's place, and what moves is still `AskingMotion.tsx`.
 */

import { ASKS_SO_FAR, type AskKey, alwaysCount, SEE_ALL } from "@chipschat/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/**
 * Asks so far (ADR 0255): the heading and See all, the dots, the key that counts them and the line
 * under it, one press that opens every ask. A harness's Permissions draws it too (ADR 0299).
 */
export function AsksSoFar({
  dots,
  askKey,
  line,
  onOpen,
}: {
  readonly dots: ReactNode;
  readonly askKey: readonly AskKey[];
  readonly line: string;
  readonly onOpen: () => void;
}) {
  const palette = usePalette();
  const fill = {
    yes: palette.green,
    session: palette.green,
    no: palette.red,
    lapsed: palette.ink4,
    open: "transparent",
    snoozed: palette.gold,
  } as const;
  const counted = askKey.map((each) => each.words).join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ASKS_SO_FAR}: ${counted}. ${line}`}
      accessibilityHint="Opens every ask"
      onPress={onOpen}
      testID="asking-history"
    >
      {({ pressed }) => (
        <View
          style={[styles.activity, { backgroundColor: pressed ? palette.surface2 : "transparent" }]}
        >
          <View style={styles.partHead}>
            <Text style={[styles.heading, { color: palette.ink }]}>{ASKS_SO_FAR}</Text>
            <View style={styles.seeAll}>
              <Text style={[styles.seeAllWords, { color: palette.accent }]}>{SEE_ALL}</Text>
              <Icon name="next" size={14} color={palette.accent} weight={2.4} />
            </View>
          </View>
          {dots}
          <View style={styles.key} testID="asking-key">
            {askKey.map((each) => (
              <View key={each.dot} style={styles.keyEntry}>
                <View
                  style={[
                    styles.keyDot,
                    { backgroundColor: fill[each.dot] },
                    each.dot === "open" ? { borderWidth: 2, borderColor: palette.amber } : null,
                  ]}
                />
                <Text style={[styles.keyWords, { color: palette.ink2 }]}>{each.words}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.note, { color: palette.ink3 }]}>{line}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** `2 on` in green while every rule is on, `1 of 2 on` in grey while one is off. */
export function Count({ rules }: { readonly rules: readonly { readonly on: boolean }[] }) {
  const palette = usePalette();
  const words = alwaysCount(rules);
  if (words === undefined) return null;
  const all = rules.every((rule) => rule.on);
  return (
    <View style={[styles.count, { backgroundColor: all ? palette.greenSoft : palette.surface2 }]}>
      <Text
        style={[styles.countWords, { color: all ? palette.greenInk : palette.ink2 }]}
        testID="asking-count"
      >
        {words}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: TEXT.md, fontWeight: "700" },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  partHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  count: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  countWords: { fontSize: TEXT.xs, fontWeight: "600" },
  // Drawn out past the card's padding, so a thumb's grey has room round the words.
  activity: {
    gap: SPACE.sm,
    marginHorizontal: -SPACE.sm,
    marginVertical: -SPACE.xs,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.lg,
  },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllWords: { fontSize: TEXT.md, fontWeight: "500" },
  key: { flexDirection: "row", flexWrap: "wrap", columnGap: SPACE.md, rowGap: SPACE.xs },
  keyEntry: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  keyWords: { fontSize: TEXT.sm, fontWeight: "500" },
});
