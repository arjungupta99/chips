/**
 * What's new (ADR 0295): what the release this app is changed, from core's `RELEASES`, the words
 * the App Store's What's New says; and the way to every release's notes on GitHub. A version Chips
 * has no entry for (a build between releases) says the newest it has.
 */

import { ABOUT_LINK_ROWS, ABOUT_LINKS, RELEASES, releaseDay, releaseOf } from "@chipschat/core";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Group, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { Icon } from "../ui/Icon";
import { UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { appBuild } from "./build";

export function WhatsNewPage() {
  const palette = usePalette();
  const column = useColumn();
  const release = releaseOf(appBuild().version) ?? RELEASES[0];
  if (release === undefined) return null;
  const changes = release.changes ?? [release.line];
  return (
    <UnderName contentContainerStyle={[styles.page, column]} testID="whats-new-page">
      <View style={styles.head}>
        <Text style={[styles.version, { color: palette.ink }]} accessibilityRole="header">
          Chips {release.version}
        </Text>
        <Text style={[styles.day, { color: palette.ink3 }]}>{releaseDay(release.date)}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: palette.surface }]} testID="whats-new-changes">
        {changes.map((change, index) => (
          <View
            key={change}
            style={[
              styles.change,
              index === 0
                ? null
                : { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: palette.gold }]}>
              <Icon name="sparkle" size={12} color="#231a00" weight={2} />
            </View>
            <Text style={[styles.words, { color: palette.ink }]}>{change}</Text>
          </View>
        ))}
      </View>
      <Group inset={MARKED_INSET}>
        <GroupRow
          label={ABOUT_LINK_ROWS.releases.label}
          mark={<RowMark icon="doc" />}
          onPress={() => void Linking.openURL(ABOUT_LINKS.releases).catch(() => undefined)}
          testID="whats-new-releases"
        />
      </Group>
    </UnderName>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2, gap: SPACE.lg },
  head: { paddingHorizontal: SPACE.lg + SPACE.lg, gap: 2 },
  version: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  day: { fontSize: TEXT.sm },
  card: {
    marginHorizontal: SPACE.lg,
    borderRadius: 22,
    overflow: "hidden",
    paddingVertical: SPACE.xs,
  },
  change: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  words: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
});
