/**
 * "Shared", worn by a room somebody besides the reader reads (ADR 0234, `isShared`): a person and
 * the word in the palette's violet, which means only this, at the start of a Spaces row's second
 * line and beside who is here on its details. Shaped as the Main tag is, so the two sit together
 * on a Main room somebody else is in. A label, not a state, so it has no dot.
 */

import { StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";

export function SharedTag() {
  const palette = usePalette();
  return (
    <View style={[styles.tag, { backgroundColor: palette.violetSoft }]} testID="shared-tag">
      <Icon name="user" size={11} color={palette.violetInk} weight={2.4} />
      <Text style={[styles.word, { color: palette.violetInk }]} maxFontSizeMultiplier={1.3}>
        shared
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: SPACE.sm,
    paddingVertical: 2,
    flexShrink: 0,
  },
  word: { fontSize: TEXT.xs, fontWeight: "600" },
});
