/**
 * Every ask of a harness so far (ADR 0255), from the dots on When it asks you: newest first under
 * the day it was asked, and All, Yes and No at the top when they are not all one or the other. A
 * row opens the ask whole (`app/needs/[id].tsx`), where an answered one says when it was answered
 * and opens its space, and one still waiting is answered.
 */

import {
  ASKS_NONE,
  type AskFilter,
  askFilters,
  askRows,
  byDay,
  type AskRow as Row,
  rowsUnder,
  type Snapshot,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Group, GroupHeading } from "../../ui/Group";
import { useColumn } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import { ASK_INSET, AskRow } from "../AskRow";

export function AskList({
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
  // The days are read against when the page opened: Today stays Today while it is read.
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<AskFilter>("all");
  const rows = useMemo(
    () => askRows(snapshot.model, snapshot.directory, harnessId, selfId, now),
    [snapshot.model, snapshot.directory, harnessId, selfId, now],
  );
  const filters = askFilters(rows);
  // A filter that is no longer offered, as when the last no was its only one, shows them all.
  const shown = filters.some((each) => each.id === filter) ? rowsUnder(rows, filter) : rows;
  const open = useCallback((row: Row) => router.push(`/needs/${row.approvalId}`), [router]);
  return (
    <ScrollView contentContainerStyle={[styles.body, column]} testID="ask-list">
      {filters.length === 0 ? null : (
        <View style={styles.filters}>
          <Segmented
            label="Which asks"
            options={filters.map((each) => ({ value: each.id, label: each.label }))}
            chosen={filter}
            onChoose={(value) => setFilter(value as AskFilter)}
            testID="ask-filter"
          />
        </View>
      )}
      {shown.length === 0 ? (
        <Text style={[styles.none, { color: palette.ink3 }]}>{ASKS_NONE}</Text>
      ) : (
        byDay(shown).map((day) => (
          <View key={day.day}>
            <GroupHeading>{day.day}</GroupHeading>
            <Group inset={ASK_INSET}>
              {day.rows.map((row) => (
                <AskRow key={row.approvalId} row={row} onOpen={open} />
              ))}
            </Group>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.sm, paddingBottom: SPACE.xxl * 2 },
  filters: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm },
  none: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
    paddingTop: SPACE.lg,
  },
});
