/**
 * Every agent of one harness (ADR 0254), from See all on its page, which shows five: a field that
 * finds one by its name or where it is, its Main agent first, then the rest in the Agents tab's own
 * order, and its archived ones behind a row at the foot.
 */

import { agentsTab, nameOf, permissionsRow, type Snapshot } from "@chipschat/core";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AgentRow } from "../../agents/AgentRow";
import { ROW_AVATAR } from "../../ui/Avatar";
import { Group, GroupHeading, GroupRow } from "../../ui/Group";
import { Icon } from "../../ui/Icon";
import { useColumn } from "../../ui/Screen";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";

/** Where a row's words start: past the margin, the face and the gap. */
const INSET = SPACE.lg + ROW_AVATAR + SPACE.md;

type Row = ReturnType<typeof agentsTab>["agents"][number];

/** Whether a row is one the field asks for: its name or where it is, in any case. */
const matches = (row: Row, words: string) =>
  words === "" || `${row.name} ${row.line}`.toLowerCase().includes(words);

export function AllAgents({
  snapshot,
  harnessId,
  selfId,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string;
}) {
  const palette = usePalette();
  const router = useRouter();
  const column = useColumn();
  const [typed, setTyped] = useState("");
  const tab = agentsTab(snapshot.model, snapshot.directory, selfId, { harnessId });
  const all = tab.leads.length + tab.agents.length;
  const archived = tab.archived.here.length + tab.archived.elsewhere.length;
  const words = typed.trim().toLowerCase();
  const leads = tab.leads.filter((row) => matches(row, words));
  const agents = tab.agents.filter((row) => matches(row, words));
  const open = (id: string) => router.push(`/agents/${id}`);
  const rows = (list: readonly Row[]) =>
    list.map((row) => (
      <AgentRow
        key={row.id}
        row={row}
        first
        permission={permissionsRow(snapshot, row.id)}
        onPress={open}
        ground={palette.surface}
      />
    ));
  return (
    <ScrollView
      contentContainerStyle={[styles.body, column]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      testID="all-agents"
    >
      <View style={[styles.field, { backgroundColor: palette.surface2 }]}>
        <Icon name="search" size={17} color={palette.ink3} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={`Search ${all} ${all === 1 ? "agent" : "agents"}`}
          placeholderTextColor={palette.ink3}
          style={[styles.input, { color: palette.ink }]}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel={`Search ${nameOf(snapshot.directory, harnessId)}'s agents`}
          testID="all-agents-search"
        />
      </View>
      {leads.length === 0 ? null : (
        <>
          <GroupHeading>Main</GroupHeading>
          <Group inset={INSET}>{rows(leads)}</Group>
        </>
      )}
      {agents.length === 0 ? null : (
        <>
          <GroupHeading>{`Agents · ${agents.length}`}</GroupHeading>
          <Group inset={INSET}>{rows(agents)}</Group>
        </>
      )}
      {words !== "" && leads.length + agents.length === 0 ? (
        <Text style={[styles.none, { color: palette.ink3 }]} testID="all-agents-none">
          No agent's name or space has “{typed.trim()}” in it.
        </Text>
      ) : null}
      {archived === 0 || words !== "" ? null : (
        <View style={styles.foot}>
          <Group>
            <GroupRow
              label={`Archived · ${archived}`}
              onPress={() => router.push(`/agents/archived?harness=${harnessId}`)}
              testID="all-agents-archived"
            />
          </Group>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.sm, paddingBottom: SPACE.xxl * 2 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    marginHorizontal: SPACE.lg,
    paddingHorizontal: SPACE.md,
    borderRadius: 12,
    minHeight: 40,
  },
  input: { flex: 1, fontSize: TEXT.body, paddingVertical: SPACE.sm },
  none: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingTop: SPACE.xxl,
  },
  foot: { paddingTop: SPACE.xxl },
});
