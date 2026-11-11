/**
 * A harness's runs (ADR 0254), from Recent runs on its page: the newest first, a row each with what
 * it was asked, where and when, how it ended and what it cost, each opening its space. Until ADR
 * 0254 the page itself listed the last five as lines of text.
 */

import { type Snapshot, spaceTitle } from "@chipschat/core";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { relativeTime } from "../../spaces/when";
import { Group, GroupRow } from "../../ui/Group";
import { useColumn } from "../../ui/Screen";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import { harnessRuns } from "../words";

/** As many as are worth scrolling through on a phone. */
const SHOWN = 100;

/** How a run ended, or where it is, in the word its row says. */
const STATE_WORDS = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export function RecentRuns({
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
  const runs = harnessRuns(snapshot, harnessId, SHOWN);
  const now = Date.now();
  const where = (spaceId: string) => {
    const space = snapshot.model.spaces.find((each) => each.id === spaceId);
    return space === undefined ? undefined : spaceTitle(space, snapshot.directory, selfId);
  };
  return (
    <ScrollView contentContainerStyle={[styles.body, column]} testID="recent-runs">
      {runs.length === 0 ? (
        <Text style={[styles.none, { color: palette.ink3 }]}>Nothing yet.</Text>
      ) : (
        <Group>
          {runs.map((run) => (
            <GroupRow
              key={run.runId}
              label={run.goal}
              labelLines={2}
              sub={[
                where(run.spaceId),
                run.startedAt === undefined ? undefined : relativeTime(run.startedAt, now),
                STATE_WORDS[run.state],
              ]
                .filter((each) => each !== undefined && each !== "")
                .join(" · ")}
              value={run.costUsd === undefined ? undefined : `$${run.costUsd.toFixed(2)}`}
              onPress={() => router.push(`/spaces/${run.spaceId}`)}
              testID={`run-${run.runId}`}
            />
          ))}
        </Group>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
  none: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
  },
});
