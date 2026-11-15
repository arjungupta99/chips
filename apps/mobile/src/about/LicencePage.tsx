/**
 * Licence (ADR 0295): the split licence (ADR 0128) in plain words, and the ways to the licence
 * itself and to the map of which licence covers which part.
 */

import { ABOUT_LINK_ROWS, ABOUT_LINKS, LICENCE_WORDS } from "@chipschat/core";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Group, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

export function LicencePage() {
  const palette = usePalette();
  const column = useColumn();
  return (
    <UnderName contentContainerStyle={[styles.page, column]} testID="licence-page">
      <View style={[styles.card, { backgroundColor: palette.surface }]}>
        {LICENCE_WORDS.map((words) => (
          <Text key={words} style={[styles.words, { color: palette.ink }]}>
            {words}
          </Text>
        ))}
      </View>
      <Group inset={MARKED_INSET}>
        <GroupRow
          label={ABOUT_LINK_ROWS.readLicence.label}
          mark={<RowMark icon="doc" />}
          onPress={() => open(ABOUT_LINKS.licence)}
          testID="licence-read"
        />
        <GroupRow
          label={ABOUT_LINK_ROWS.licensing.label}
          sub={ABOUT_LINK_ROWS.licensing.sub}
          mark={<RowMark icon="doc" />}
          onPress={() => open(ABOUT_LINKS.licensing)}
          testID="licence-licensing"
        />
      </Group>
    </UnderName>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2, gap: SPACE.xl },
  card: {
    marginHorizontal: SPACE.lg,
    borderRadius: 22,
    paddingHorizontal: SPACE.lg + 2,
    paddingVertical: SPACE.md,
    gap: SPACE.md,
  },
  words: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
});
