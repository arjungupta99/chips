/**
 * A file its harness keeps read only, to read (ADR 0135, the mock's scene 4): its tile, what it
 * is and why it can't be changed here, a **Read only** tag, the text on the page's quieter
 * surface; and, for a file several agents share, how many use it.
 */

import type { ContextRow } from "@chipschat/core";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Group, GroupFoot, GroupHeading, GroupRow } from "../ui/Group";
import { useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { markdownSpans } from "./markdown";
import { RoleTile, Tag } from "./rows";

export function ReadOnlyPage({
  row,
  harnessName,
  usedBy,
}: {
  readonly row: ContextRow;
  readonly harnessName: string;
  /** For a shared file: how many agents use it, when the harness says. */
  readonly usedBy?: number | undefined;
}) {
  const palette = usePalette();
  const column = useColumn();
  const what = row.line === "" ? row.name : row.line;
  return (
    <>
      <Stack.Screen options={{ title: row.title }} />
      <ScrollView contentContainerStyle={[styles.body, column]} testID="context-read-only">
        <View style={styles.meta}>
          <RoleTile row={row} side={26} />
          <Text style={[styles.what, { color: palette.ink }]} numberOfLines={1}>
            {what}
            <Text style={[styles.why, { color: palette.ink3 }]}>
              {` · ${row.whyReadOnly ?? "read only"}`}
            </Text>
          </Text>
          <Tag tag="read_only" harnessName={harnessName} />
        </View>
        <View style={[styles.card, { backgroundColor: palette.surface2 }]}>
          <Text selectable style={[styles.text, { color: palette.ink2 }]}>
            {markdownSpans(row.text ?? "", {
              mark: palette.ink4,
              strong: palette.ink,
              code: palette.blue,
            })}
          </Text>
        </View>
        {usedBy === undefined || usedBy === 0 ? null : (
          <>
            <GroupHeading>Used by</GroupHeading>
            <Group>
              <GroupRow
                label={`${usedBy} ${usedBy === 1 ? "agent" : "agents"}`}
                sub={`Every ${harnessName} agent without a ${row.title} of its own`}
                testID="context-used-by"
              />
            </Group>
            <GroupFoot>{`${harnessName} gives each of them this at the start of every turn.`}</GroupFoot>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: SPACE.xxl * 2 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SPACE.xxl,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  what: { flex: 1, fontSize: TEXT.md, fontWeight: "600" },
  why: { fontWeight: "400" },
  card: { marginHorizontal: SPACE.lg, borderRadius: 22, padding: 18 },
  text: { fontSize: 16, lineHeight: 26 },
});
