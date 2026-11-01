/**
 * What a room says above its field about its agents (ADR 0087, rules 4 and 10):
 *
 * - **No agent here.** When the last one moved away, was taken out or was archived in its
 *   harness, the room stays open and says so, in amber, as *can't answer* is (ADR 0083): who,
 *   where it went, and that messages reach people only. It offers Move back, where the agent can
 *   be moved, Fork, where its harness makes copies (ADR 0087, Fork), and Add an agent.
 * - **Elsewhere.** An agent the room's archive released, that is in another room now the room is
 *   back, is a row with Move back, and Fork where it may be forked.
 *
 * Move back is one tap; Fork asks first (`ForkSheet`), because a copy is a new agent.
 *
 * The words are core's (`noAgentNotice`, `roomAgents`), so the desktop says the same.
 */

import {
  mayForkInto,
  mayMove,
  nameOf,
  noAgentNotice,
  roomAgents,
  roomName,
  type Snapshot,
  type Space,
  type Store,
} from "@chipschat/core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ForkSheet } from "../agents/ForkSheet";
import { faceProps } from "../agents/face";
import { Avatar } from "../ui/Avatar";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

export function RoomNotice({
  store,
  space,
  snapshot,
  selfId,
  onAdd,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  /** Opens the room's sheet on its Add page. */
  readonly onAdd?: (() => void) | undefined;
}) {
  const palette = usePalette();
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [forking, setForking] = useState<string | undefined>(undefined);
  const { directory, model } = snapshot;
  const notice = noAgentNotice(model, space, directory);
  const { elsewhere } = roomAgents(space, directory);
  if (space.state !== "open" || (notice === undefined && elsewhere.length === 0)) return null;
  const moveBack = (agentId: string) => {
    setFailed(undefined);
    store.moveAgent(agentId, space.id).catch((error: unknown) => {
      setFailed(error instanceof Error ? error.message : "The server would not move it.");
    });
  };
  const back = notice?.moveBack;
  const forkable = (agentId: string) => mayForkInto(model, directory, selfId, agentId, space);
  return (
    <View style={styles.stack}>
      <ForkSheet
        store={store}
        snapshot={snapshot}
        agentId={forking}
        spaceId={space.id}
        onClose={() => setForking(undefined)}
      />
      {notice === undefined ? null : (
        <View style={[styles.notice, { backgroundColor: palette.amberSoft }]} testID="no-agent">
          <Text style={[styles.title, { color: palette.amberInk }]}>{notice.title}</Text>
          <Text style={[styles.body, { color: palette.ink2 }]}>{notice.body}</Text>
          <View style={styles.acts}>
            {back === undefined ? null : (
              <Acts
                move={mayMove(model, directory, selfId, back)}
                fork={forkable(back)}
                onMove={() => moveBack(back)}
                onFork={() => setForking(back)}
                tone="amber"
              />
            )}
            {onAdd === undefined ? null : <Act label="Add an agent" onPress={onAdd} tone="amber" />}
          </View>
        </View>
      )}
      {elsewhere.map(({ agentId, spaceId }) => (
        <View
          key={agentId}
          style={[styles.elsewhere, { borderColor: palette.line2 }]}
          testID="elsewhere"
        >
          <View style={styles.faded}>
            <Avatar
              name={nameOf(directory, agentId)}
              {...faceProps(directory, agentId)}
              size="md"
              decorative
            />
          </View>
          <View style={styles.words}>
            <Text style={[styles.name, { color: palette.ink }]} numberOfLines={2}>
              {nameOf(directory, agentId)} is in {roomName(model, spaceId, directory)}
            </Text>
            <Text style={[styles.under, { color: palette.ink3 }]}>
              It's in one space at a time.
            </Text>
          </View>
          <View style={styles.rowActs}>
            <Acts
              move={mayMove(model, directory, selfId, agentId)}
              fork={forkable(agentId)}
              onMove={() => moveBack(agentId)}
              onFork={() => setForking(agentId)}
              tone="plain"
            />
          </View>
        </View>
      ))}
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.redInk }]}>{failed}</Text>
      )}
    </View>
  );
}

/** Move back and Fork, each where it may be done. */
function Acts(props: {
  readonly move: boolean;
  readonly fork: boolean;
  readonly onMove: () => void;
  readonly onFork: () => void;
  readonly tone: "amber" | "plain";
}) {
  return (
    <>
      {props.move ? <Act label="Move back" onPress={props.onMove} tone={props.tone} /> : null}
      {props.fork ? <Act label="Fork" onPress={props.onFork} tone={props.tone} /> : null}
    </>
  );
}

function Act({
  label,
  onPress,
  tone,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly tone: "amber" | "plain";
}) {
  const palette = usePalette();
  const ground = tone === "amber" ? palette.amberSoft : palette.surface3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.act,
        {
          backgroundColor: ground,
          borderColor: tone === "amber" ? palette.amber : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.actWords, { color: tone === "amber" ? palette.amberInk : palette.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm, marginHorizontal: SPACE.md, marginBottom: SPACE.sm },
  notice: { borderRadius: RADIUS.xl, padding: SPACE.md, gap: SPACE.xs },
  title: { fontSize: TEXT.md, fontWeight: "700" },
  body: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, marginTop: SPACE.xs },
  act: {
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    paddingVertical: 6,
  },
  actWords: { fontSize: TEXT.sm, fontWeight: "600" },
  elsewhere: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: SPACE.md,
  },
  faded: { opacity: 0.4 },
  rowActs: { gap: SPACE.xs },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.md, fontWeight: "600" },
  under: { fontSize: TEXT.sm },
  failed: { fontSize: TEXT.sm, fontWeight: "600", paddingHorizontal: SPACE.xs },
});
