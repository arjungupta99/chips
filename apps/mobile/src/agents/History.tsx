/**
 * An agent's message history (ADR 0087, rule 3.11, Phase 5): what it was asked and what it
 * answered, in every room it has been in, oldest first, each room's stretch under a divider with
 * the room's face, its name and its dates — the room it is in now marked *now*. A room the reader
 * isn't in is a divider with its dates and a count, and no name.
 *
 * The lines are the rooms' own, from what this phone already holds, drawn by the room's own `Line`
 * and read only: a bubble, a lane's card and a photo look here as they do in the room. Like a
 * room, it opens at the newest. Tapping a divider opens that room.
 *
 * A fork's copy (ADR 0087, Fork) starts at the fork, under a line to the agent it was forked from,
 * whose history holds what the copy knew before then; the line opens that agent's card.
 */

import {
  agentHistory,
  awayWords,
  forkedFrom,
  type Lane,
  type Line as LineModel,
  type Run,
  type Snapshot,
  type Store,
  type Stretch,
  stretchDates,
} from "@chipschat/core";
import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Line } from "../spaces/Line";
import { groupLines, type Place, saidBy } from "../spaces/spaces";
import { separatorLabel } from "../spaces/when";
import { useChips } from "../store/provider";
import { Avatar } from "../ui/Avatar";
import { Empty } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { type FaceProps, faceProps } from "./face";
import { useStays } from "./stays";

type Item =
  | { readonly kind: "divider"; readonly key: string; readonly stretch: Stretch }
  | { readonly kind: "away"; readonly key: string; readonly count: number }
  | {
      readonly kind: "line";
      readonly key: string;
      readonly line: LineModel;
      readonly place: Place;
      readonly separator: boolean;
      readonly spaceId: string;
    }
  | { readonly kind: "quiet"; readonly key: string }
  | {
      readonly kind: "from";
      readonly key: string;
      readonly agentId: string;
      readonly name: string;
      /** The original's outline and its own face. */
      readonly face: FaceProps;
      /** When the copy's history starts: its first room's first day. */
      readonly at: string | undefined;
    };

/** The stretches as the list's rows, oldest first. */
export function historyItems(
  stretches: readonly Stretch[],
  directory: Snapshot["directory"],
  copyOf?: { readonly agentId: string; readonly name: string } | undefined,
): Item[] {
  const from: Item[] =
    copyOf === undefined
      ? []
      : [
          {
            kind: "from",
            key: "from",
            ...copyOf,
            face: faceProps(directory, copyOf.agentId),
            at: stretches[0]?.from,
          },
        ];
  return from.concat(stretchItems(stretches, directory));
}

function stretchItems(stretches: readonly Stretch[], directory: Snapshot["directory"]): Item[] {
  return stretches.flatMap((stretch, at): Item[] => {
    const divider: Item = { kind: "divider", key: `divider-${at}`, stretch };
    if (stretch.kind === "away") {
      return [divider, { kind: "away", key: `away-${at}`, count: stretch.count }];
    }
    if (stretch.lines.length === 0) return [divider, { kind: "quiet", key: `quiet-${at}` }];
    const drawn = groupLines(stretch.lines, (line) => saidBy(line, directory).id);
    return [
      divider,
      ...drawn.map(
        (each): Item => ({
          kind: "line",
          key: `${at}-${each.line.id}`,
          line: each.line,
          place: each.place,
          separator: each.separator,
          spaceId: stretch.spaceId,
        }),
      ),
    ];
  });
}

export function History({
  store,
  snapshot,
  agentId,
  selfId,
  onOpenRoom,
  onOpenAgent,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Opens another agent's card: the one this copy was forked from. */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const files = useChips().paired?.files;
  const { model, directory, spaceIcons } = snapshot;
  const { stays, failed } = useStays(store, agentId, directory[agentId]?.room);
  const items = useMemo(
    () =>
      stays === undefined
        ? []
        : historyItems(
            agentHistory(model, directory, agentId, stays),
            directory,
            forkedFrom(directory, agentId),
          ).reverse(),
    [stays, model, directory, agentId],
  );
  const runs = useMemo(
    () => new Map(model.spaces.flatMap((space) => space.runs).map((run) => [run.runId, run])),
    [model],
  );

  if (failed !== undefined && stays === undefined) return <Empty>{failed}</Empty>;
  if (stays !== undefined && stays.length === 0) {
    return <Empty>Nothing yet. What it's asked and what it answers will be here.</Empty>;
  }

  return (
    <FlatList
      // Inverted, as a room is, so it opens at the newest line.
      inverted
      data={items}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.list}
      testID="agent-history-list"
      renderItem={({ item }) => {
        if (item.kind === "divider") {
          return <Divider stretch={item.stretch} snapshot={snapshot} onOpenRoom={onOpenRoom} />;
        }
        if (item.kind === "from") return <ForkedFrom item={item} onOpenAgent={onOpenAgent} />;
        if (item.kind === "away") {
          return (
            <Text
              style={[styles.count, { color: palette.ink3, borderColor: palette.line2 }]}
              testID="away-count"
            >
              {awayWords(item.count)}
            </Text>
          );
        }
        if (item.kind === "quiet") {
          return (
            <Text style={[styles.quiet, { color: palette.ink3 }]}>Nothing said here yet.</Text>
          );
        }
        const { run, lane } = behind(runs, model.lanes, item.line);
        return (
          <View>
            {item.separator ? (
              <Text style={[styles.separator, { color: palette.ink3 }]}>
                {separatorLabel(item.line.ts, Date.now())}
              </Text>
            ) : null}
            <Line
              line={item.line}
              directory={directory}
              selfId={selfId}
              named
              place={item.place}
              run={run}
              lane={lane}
              busy={false}
              offline={false}
              onOpenSpace={onOpenRoom}
              here={item.spaceId}
              files={files}
              faces={spaceIcons}
            />
          </View>
        );
      }}
    />
  );
}

/** The run a summary closes, and the lane a lane's card draws. */
function behind(
  runs: ReadonlyMap<string, Run>,
  lanes: readonly Lane[],
  line: LineModel,
): { readonly run: Run | undefined; readonly lane: Lane | undefined } {
  return {
    run: line.runId === undefined ? undefined : runs.get(line.runId),
    lane: line.laneId === undefined ? undefined : lanes.find((each) => each.laneId === line.laneId),
  };
}

/** The head of a copy's history: the agent it was forked from, and when. */
function ForkedFrom({
  item,
  onOpenAgent,
}: {
  readonly item: Extract<Item, { kind: "from" }>;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const when = item.at === undefined ? undefined : stretchDates(item.at, item.at).dates;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Forked from ${item.name}`}
      disabled={onOpenAgent === undefined}
      onPress={() => onOpenAgent?.(item.agentId)}
      testID="forked-from"
      style={({ pressed }) => [
        styles.from,
        {
          backgroundColor: palette.surface,
          borderColor: palette.line,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Avatar name={item.name} {...item.face} size="sm" decorative />
      <View style={styles.fromWords}>
        <Text style={[styles.fromTitle, { color: palette.ink }]}>
          Forked from <Text style={styles.fromName}>{item.name}</Text>
        </Text>
        <Text style={[styles.fromSub, { color: palette.ink3 }]}>
          {when === undefined ? "" : `${when}. `}What it knew before then is in {item.name}'s
          history.
        </Text>
      </View>
    </Pressable>
  );
}

/** A stretch's divider: a room's, which opens it, or one the reader isn't in. */
function Divider({
  stretch,
  snapshot,
  onOpenRoom,
}: {
  readonly stretch: Stretch;
  readonly snapshot: Snapshot;
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  const palette = usePalette();
  const { dates, ongoing } = stretchDates(stretch.from, stretch.to);
  return (
    <View
      style={styles.divider}
      testID={stretch.kind === "room" && stretch.now ? "divider-now" : "divider"}
    >
      <View style={[styles.rule, { backgroundColor: palette.line2 }]} />
      {stretch.kind === "room" ? (
        <RoomPill
          room={stretch}
          dates={dates}
          ongoing={ongoing}
          snapshot={snapshot}
          onOpenRoom={onOpenRoom}
        />
      ) : (
        <View style={[styles.pill, { backgroundColor: palette.surface2 }]}>
          <Text style={[styles.dividerWords, { color: palette.ink3 }]} numberOfLines={1}>
            {`A space you're not in · ${dates}${ongoing ? " now" : ""}`}
          </Text>
        </View>
      )}
      <View style={[styles.rule, { backgroundColor: palette.line2 }]} />
    </View>
  );
}

/** A room's face, its name and its dates, gold and *now* for the room the agent is in. */
function RoomPill({
  room,
  dates,
  ongoing,
  snapshot,
  onOpenRoom,
}: {
  readonly room: Extract<Stretch, { kind: "room" }>;
  readonly dates: string;
  readonly ongoing: boolean;
  readonly snapshot: Snapshot;
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.name}, ${dates}${ongoing ? " now" : ""}`}
      onPress={() => onOpenRoom(room.spaceId)}
      style={[styles.pill, { backgroundColor: room.now ? palette.goldSoft : palette.surface2 }]}
    >
      <Avatar
        name={room.name}
        kind="person"
        size="xs"
        icon={snapshot.spaceIcons.get(room.spaceId)}
        decorative
      />
      <Text style={[styles.dividerName, { color: palette.ink }]} numberOfLines={1}>
        {room.name}
      </Text>
      <Text style={[styles.dividerWords, { color: palette.ink3 }]} numberOfLines={1}>
        {` · ${dates}`}
        {ongoing ? <Text style={[styles.now, { color: palette.ink }]}> now</Text> : null}
        {room.archived ? " · archived" : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.lg, gap: SPACE.sm },
  separator: {
    alignSelf: "center",
    fontSize: TEXT.sm,
    fontWeight: "600",
    paddingVertical: SPACE.sm,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xs,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "88%",
    paddingVertical: 4,
    paddingLeft: 5,
    paddingRight: SPACE.md,
    borderRadius: 999,
  },
  dividerName: { fontSize: TEXT.sm, fontWeight: "600", flexShrink: 1 },
  dividerWords: { fontSize: TEXT.sm, flexShrink: 0 },
  now: { fontStyle: "italic" },
  count: {
    alignSelf: "center",
    fontSize: TEXT.md,
    textAlign: "center",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
  },
  quiet: { alignSelf: "center", fontSize: TEXT.sm, paddingVertical: SPACE.sm },
  from: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: SPACE.sm + 2,
    paddingHorizontal: SPACE.md,
    marginTop: SPACE.sm,
  },
  fromWords: { flex: 1, gap: 2 },
  fromTitle: { fontSize: TEXT.md },
  fromName: { fontWeight: "600" },
  fromSub: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.35 },
});
