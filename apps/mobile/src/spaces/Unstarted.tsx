/**
 * What a room shows where its lines would be before anybody has said anything in it:
 *
 * - With nobody in it but people (ADR 0148): faces still to come, drawn in dashes, that nobody is
 *   here yet, and Add agents, which opens the room's sheet on its Add. A room made Empty from the
 *   + is one; so is any room of people that has not started.
 * - With agents in it (ADR 0149): their faces, and what the person would like to do, since none of
 *   them says anything until the person's first message. A room made from the + with a face picked
 *   is one, its harness waiting in it to make its agent; so is an Empty room once filled.
 * - Otherwise, that nothing has been said here yet.
 *
 * The words are core's (`AWAITING_AGENTS`, `WAITING_ROOM`, `waitingRoomWords`), so the desktop says
 * the same. Each face that waits has its name under it, and its harness under that where the name
 * does not say it: a room from the + calls each harness by the first name held for its agent
 * (ADR 0150), "Milo", with "Jacobian" under it.
 */

import {
  AWAITING_AGENTS,
  awaitsAgents,
  type Directory,
  harnessUnder,
  nameOf,
  type Space,
  WAITING_ROOM,
  waitingIn,
  waitingRoomWords,
} from "@chipschat/core";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { Avatar, avatarCorner, avatarSide } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { Empty } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

const FACE = avatarSide("pick");
/** The most faces the middle draws; the words count the rest. */
const MOST_FACES = 3;

export function Unstarted({
  space,
  directory,
  onAdd,
}: {
  readonly space: Space;
  readonly directory: Directory;
  /** Opens the room's sheet on its Add; absent where the room has no sheet to open. */
  readonly onAdd?: (() => void) | undefined;
}) {
  if (onAdd !== undefined && awaitsAgents(space, directory)) {
    return (
      <View style={styles.fill} pointerEvents="box-none">
        <AwaitingAgents onAdd={onAdd} />
      </View>
    );
  }
  const waiting = waitingIn(space, directory);
  if (waiting.length > 0) {
    return (
      <View style={styles.fill} pointerEvents="none">
        <WaitingRoom ids={waiting} directory={directory} />
      </View>
    );
  }
  return (
    <View style={styles.fill} pointerEvents="none" testID="space-empty">
      <Empty>Nothing has been said here yet.</Empty>
    </View>
  );
}

function AwaitingAgents({ onAdd }: { readonly onAdd: () => void }) {
  const palette = usePalette();
  return (
    <View style={styles.box} pointerEvents="box-none" testID="space-awaiting">
      <View style={styles.faces} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.ghost, { borderColor: palette.ink4, backgroundColor: palette.bg }]} />
        <View
          style={[
            styles.ghost,
            styles.middle,
            { borderColor: palette.ink3, backgroundColor: palette.bg },
          ]}
        >
          <Icon name="plus" size={20} color={palette.ink3} />
        </View>
        <View style={[styles.ghost, { borderColor: palette.ink4, backgroundColor: palette.bg }]} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {AWAITING_AGENTS.title}
      </Text>
      <Text style={[styles.body, { color: palette.ink3 }]}>{AWAITING_AGENTS.body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={AWAITING_AGENTS.add}
        onPress={onAdd}
        testID="space-awaiting-add"
        style={({ pressed }) => [
          styles.add,
          { backgroundColor: palette.gold, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Icon name="plus" size={18} color="#231a00" />
        <Text style={styles.addWords}>{AWAITING_AGENTS.add}</Text>
      </Pressable>
    </View>
  );
}

/** Who waits for the first message, by face and by name, and the room's question. */
function WaitingRoom({
  ids,
  directory,
}: {
  readonly ids: readonly string[];
  readonly directory: Directory;
}) {
  const palette = usePalette();
  return (
    <View style={styles.box} testID="space-waiting">
      <View
        style={[styles.faces, styles.spread]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {ids.slice(0, MOST_FACES).map((id) => (
          <View key={id} style={styles.who} testID={`space-waiting-${id}`}>
            <Avatar
              name={nameOf(directory, id)}
              {...faceProps(directory, id)}
              size="pick"
              decorative
            />
            <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
              {nameOf(directory, id)}
            </Text>
            {harnessUnder(directory, id) === undefined ? null : (
              <Text numberOfLines={1} style={[styles.harness, { color: palette.ink3 }]}>
                {harnessUnder(directory, id)}
              </Text>
            )}
          </View>
        ))}
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {WAITING_ROOM.title}
      </Text>
      <Text style={[styles.body, { color: palette.ink3 }]}>
        {waitingRoomWords(ids.map((id) => nameOf(directory, id)))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the list, in its box, so the composer stays on the bottom edge under it.
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  box: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.xxl,
  },
  faces: { flexDirection: "row", marginBottom: SPACE.lg },
  spread: { gap: SPACE.lg },
  // A face, its name, and its harness under that, each as wide as the longest of them.
  who: { alignItems: "center", maxWidth: 96 },
  name: { fontSize: TEXT.sm, fontWeight: "600", marginTop: SPACE.xs },
  harness: { fontSize: TEXT.xs },
  ghost: {
    width: FACE,
    height: FACE,
    borderRadius: avatarCorner("pick", "agent"),
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  // The one in the middle stands a little forward of the two it overlaps.
  middle: { marginHorizontal: -10, zIndex: 1, transform: [{ translateY: -4 }] },
  title: { fontSize: TEXT.xl, fontWeight: "700", letterSpacing: -0.3, textAlign: "center" },
  body: {
    fontSize: TEXT.md,
    lineHeight: 21,
    textAlign: "center",
    marginTop: SPACE.xs,
    marginBottom: SPACE.lg,
    maxWidth: 260,
  },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 22,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.lg,
  },
  addWords: { color: "#231a00", fontSize: TEXT.md, fontWeight: "600" },
});
