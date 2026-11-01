/**
 * "Lead", worn by the agent that leads a room (ADR 0104): flat, in the room's gold. The room
 * sheet puts it on the lead's row among the members, and the field's list of who a message goes
 * to puts it beside the lead's name (ADR 0110), so the agent that hands out the work is the same one
 * in both.
 */

import { StyleSheet, Text, View } from "react-native";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

export function LeadMark() {
  const palette = usePalette();
  return (
    <View style={[styles.mark, { backgroundColor: palette.goldSoft }]} testID="lead-mark">
      <Text style={[styles.words, { color: palette.goldDeep }]}>Lead</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { borderRadius: 999, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  words: {
    fontSize: TEXT.xs,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
