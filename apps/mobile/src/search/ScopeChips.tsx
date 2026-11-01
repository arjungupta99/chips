/**
 * The chips under the search field (ADR 0132): All, Spaces, Agents, Messages. One is chosen, and
 * the results show that kind alone. Neither `Choices`, a list of radios, nor `Segment`, the
 * autonomy dial, is this: these are filters a thumb flicks between while reading.
 *
 * Flat, as every control is here: the chosen one is ink on the page's colour, the rest the quiet
 * surface, and nothing glows.
 *
 * A row of a fixed height (`CHIPS_HEIGHT`), so the screen can make room for it in the frame it
 * appears rather than measure it first (`Screen`'s `under`); the words grow with the reader's text
 * size only as far as that keeps them inside it.
 */

import { SEARCH_SCOPES, type SearchScope } from "@chipschat/core";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/** The row's height, every chip's. */
export const CHIPS_HEIGHT = 32;

/** How far the chips' words grow with the reader's text size: as far as the row has room for. */
const MAX_SCALE = 1.35;

export function ScopeChips({
  scope,
  onChange,
}: {
  readonly scope: SearchScope;
  readonly onChange: (scope: SearchScope) => void;
}) {
  const palette = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.strip}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      testID="scope-chips"
    >
      {SEARCH_SCOPES.map((each) => {
        const chosen = each.scope === scope;
        return (
          <Pressable
            key={each.scope}
            accessibilityRole="tab"
            accessibilityLabel={each.title}
            aria-selected={chosen}
            onPress={() => onChange(each.scope)}
            testID={`scope-${each.scope}`}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: chosen ? palette.ink : palette.surface2,
                opacity: pressed && !chosen ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[styles.title, { color: chosen ? palette.bg : palette.ink }]}
              maxFontSizeMultiplier={MAX_SCALE}
              numberOfLines={1}
            >
              {each.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { height: CHIPS_HEIGHT, flexGrow: 0 },
  row: { gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  chip: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    height: CHIPS_HEIGHT,
    justifyContent: "center",
  },
  title: { fontSize: TEXT.md, fontWeight: "600" },
});
