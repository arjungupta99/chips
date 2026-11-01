/**
 * Which room an agent goes to, from its card (ADR 0087, Phase 5): a new room with it, for a free
 * one, or one of the reader's open rooms. An agent is in one room at a time, so a move takes it
 * out of the one it is in, which says where it went; a free agent's waiting words are said in
 * the room it joins. Never a Main room, which takes people and no other agent (rule 7).
 *
 * A fork (ADR 0087, Fork) picks the room its copy joins the same way: a new room for the copy,
 * named as the copy will be, or one of the reader's. The agent stays where it is.
 */

import {
  forkRoomTitle,
  mayOpenSpace,
  myRole,
  roomName,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { Sheet, SheetCard, SheetRow, SheetScroll, SheetTitle } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

export function RoomPicker({
  store,
  snapshot,
  selfId,
  agentId,
  mode,
  open,
  onClose,
  onOpenRoom,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly agentId: string;
  /**
   * `put` for a free agent, which any member may add; `move` for one in a room; `fork` for a copy
   * of one in a room, in another.
   */
  readonly mode: "put" | "move" | "fork";
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const router = useRouter();
  // A new room is for whoever may open one: an owner or an admin (ADR 0196).
  const opens = mayOpenSpace(myRole(snapshot.model, selfId));
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // One ask at a time: a second tap while the first is on its way was a second room, a second
  // ask and a second copy (agents review, finding 20).
  const [busy, setBusy] = useState(false);
  const agent = snapshot.directory[agentId];
  const name = agent?.displayName ?? "It";
  const here = typeof agent?.room === "string" ? agent.room : undefined;
  const rooms = snapshot.model.spaces
    .filter(
      (space) =>
        space.state === "open" &&
        space.kind !== "channel" &&
        space.home !== true &&
        space.parentSpaceId === undefined &&
        space.id !== here,
    )
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));

  const copyTitle = forkRoomTitle(snapshot.directory, agentId);
  const words = WORDS[mode](name, roomName(snapshot.model, here, snapshot.directory));
  // What the sheet shows, kept as it stood while it goes down: once it closes its mode is gone,
  // and the pick has changed the rooms (the copy's new one, the room the agent left) and the next
  // copy's name. Seen in the film (ADR 0217): a fork's sheet went down titled as a move, listing
  // the copy's own room.
  const shown = useRef({ mode, rooms, words, copyTitle });
  if (open) shown.current = { mode, rooms, words, copyTitle };

  /** One ask, with the sheet busy until it is answered, and the server's words when it fails. */
  const asking = async (ask: () => Promise<string>, opened: (spaceId: string) => void) => {
    if (busy) return;
    setBusy(true);
    setFailed(undefined);
    try {
      const spaceId = await ask();
      onClose();
      opened(spaceId);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };
  const go = (spaceId: string) =>
    asking(async () => {
      if (mode === "put") store.addMember({ spaceId, participantId: agentId, kind: "agent" });
      else if (mode === "fork") await store.forkAgent(agentId, spaceId);
      else await store.moveAgent(agentId, spaceId);
      return spaceId;
    }, onOpenRoom);
  // A new room is named after the agent, as its harness would have named it, and opens at once:
  // the room and the agent are sent in order through the same outbox, and its words follow. A
  // copy's room is named as the copy will be; the ask waits for the room to reach the server, and
  // a room whose ask is refused goes again.
  const fresh = () =>
    asking(
      async () => {
        if (mode === "fork") return store.forkIntoNewRoom(agentId, copyTitle);
        const spaceId = store.createSpace({ title: name });
        store.addMember({ spaceId, participantId: agentId, kind: "agent" });
        return spaceId;
      },
      (spaceId) => router.push(`/spaces/${spaceId}`),
    );

  return (
    <Sheet open={open} onClose={onClose} sizing="bounded" cap={0.8} testID="room-picker">
      <SheetTitle hint={shown.current.words.hint}>{shown.current.words.title}</SheetTitle>
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.list}>
        {shown.current.mode === "move" || !opens ? null : (
          <SheetCard>
            <SheetRow
              key="new"
              icon="plus"
              label={
                shown.current.mode === "fork" ? "A new space with the copy" : "A new space with it"
              }
              hint={`Named ${shown.current.mode === "fork" ? shown.current.copyTitle : name}`}
              onPress={() => void fresh()}
              disabled={busy}
              testID="picker-new"
            />
          </SheetCard>
        )}
        <Text style={[styles.heading, { color: palette.ink3 }]}>Your spaces</Text>
        <View
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}
        >
          {shown.current.rooms.map((space, at) => {
            const title = roomName(snapshot.model, space.id, snapshot.directory);
            return (
              <Pressable
                key={space.id}
                accessibilityRole="button"
                accessibilityLabel={title}
                onPress={() => void go(space.id)}
                disabled={busy}
                testID={`picker-${space.id}`}
                style={({ pressed }) => [
                  styles.row,
                  at === 0
                    ? null
                    : { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth },
                  pressed ? { backgroundColor: on.sunk } : null,
                ]}
              >
                <Avatar
                  name={title}
                  kind="person"
                  size="md"
                  icon={snapshot.spaceIcons.get(space.id)}
                  decorative
                />
                <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {failed === undefined ? null : (
          <Text style={[styles.failed, { color: palette.amberInk }]} testID="picker-failed">
            {failed}
          </Text>
        )}
      </SheetScroll>
    </Sheet>
  );
}

/** What the picker says it is for, by what it does. */
const WORDS: Readonly<
  Record<
    "put" | "move" | "fork",
    (name: string, here: string) => { readonly title: string; readonly hint: string }
  >
> = {
  put: (name) => ({
    title: `Put ${name} in a space`,
    hint: "It's in one space at a time. What it said while in none is said there.",
  }),
  move: (name) => ({
    title: `Move ${name} to another space`,
    hint: "It's in one space at a time, so it leaves the one it's in.",
  }),
  // One line, as every sheet's hint is: what a fork does to the agent, which the title doesn't say.
  fork: (name, here) => ({
    title: `Fork ${name} into a space`,
    hint: `A copy joins. ${name} stays in ${here}.`,
  }),
};

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  list: { paddingBottom: SPACE.lg, gap: SPACE.sm },
  heading: { fontSize: TEXT.sm, fontWeight: "600", marginTop: SPACE.md, marginLeft: SPACE.xs },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 58,
    paddingHorizontal: SPACE.md,
  },
  name: { fontSize: TEXT.body, flexShrink: 1 },
  failed: { fontSize: TEXT.sm, marginTop: SPACE.sm },
});
