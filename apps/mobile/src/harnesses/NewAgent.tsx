/**
 * New agent, from a harness's page (ADR 0190, point 4): the thing the old "Add an agent" tile was
 * named for, one tap from the harness that makes it. It asks for the agent's name, offering the
 * first name it would be given (ADR 0150), and makes a space named after it with the ask in it
 * (`askIntoNewRoom`, ADR 0108's ask), then opens that space, where the ask's line says "Asking
 * Hermes for Ivy…" until Ivy joins. An agent is in one room at a time (ADR 0087), so a new one
 * needs a room of its own; one for an existing room is that room's Add.
 *
 * Not the + window, which the mock drew: the + asks only harnesses that take new spaces, which
 * Hermes and OpenCode do not, and it names a space where this names an agent.
 */

import {
  heldNamesFor,
  nameOf,
  pageAgentHint,
  pageAgentName,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { lift } from "../ui/haptics";
import { CLOSE_ROOM, Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

export function NewAgentSheet({
  store,
  snapshot,
  selfId,
  harnessId,
  onClose,
  onMade,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  /** The harness asked, or nothing while the sheet is shut. */
  readonly harnessId: string | undefined;
  readonly onClose: () => void;
  /** The space it made, once the sheet has gone: the caller opens it. */
  readonly onMade: (spaceId: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const { directory, model } = snapshot;
  // The last harness asked about, so the sheet still says it while it slides away.
  const [shown, setShown] = useState(harnessId);
  const [offered, setOffered] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const made = useRef<string | undefined>(undefined);
  // A first name for it as the sheet opens, nobody's here and no room's (ADR 0150), held while it
  // is open so it does not change under the person reading it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once each time it opens.
  useEffect(() => {
    if (harnessId === undefined) return;
    setShown(harnessId);
    setTyped("");
    setFailed(undefined);
    const self = directory[selfId]?.displayName;
    setOffered(
      heldNamesFor([harnessId], directory, model.spaces, self === undefined ? [] : [self])[
        harnessId
      ] ?? "",
    );
  }, [harnessId]);
  const id = harnessId ?? shown ?? "";
  const harness = nameOf(directory, id);
  const name = pageAgentName(directory, id, typed, offered);
  const create = async () => {
    if (harnessId === undefined || busy || name === "") return;
    setBusy(true);
    setFailed(undefined);
    lift();
    try {
      made.current = await store.askIntoNewRoom(harnessId, name);
      onClose();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : `${harness} would not make a new agent.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={harnessId !== undefined}
      onClose={busy ? () => undefined : onClose}
      closable={!busy}
      keyboard
      onGone={() => {
        const spaceId = made.current;
        made.current = undefined;
        if (spaceId !== undefined) onMade(spaceId);
      }}
      testID="new-agent-sheet"
    >
      <View style={[styles.who, { backgroundColor: on.fill }]}>
        <Avatar name={harness} kind="harness" size="md" decorative />
        <Text style={[styles.harness, { color: palette.ink }]} numberOfLines={1}>
          {harness}
        </Text>
      </View>
      <Text accessibilityRole="header" style={[styles.ask, { color: palette.ink }]}>
        New {harness} agent
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>
        {harness} makes it for a space of its own, where it starts with nothing from elsewhere.
      </Text>
      <Text style={[styles.label, { color: palette.ink3 }]}>Name</Text>
      <View style={[styles.field, { backgroundColor: on.fill }]}>
        <TextInput
          accessibilityLabel="Name"
          testID="new-agent-name"
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => void create()}
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={120}
          placeholder={offered}
          placeholderTextColor={palette.ink3}
          style={[styles.fieldWords, { color: palette.ink }]}
        />
      </View>
      <Text style={[styles.hint, { color: palette.ink3 }]} testID="new-agent-hint">
        {pageAgentHint(directory, id, typed, offered)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Create ${name}`}
        accessibilityState={{ busy, disabled: busy || name === "" }}
        disabled={busy || name === ""}
        onPress={() => void create()}
        testID="new-agent-create"
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: palette.gold, opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.goWords}>{busy ? `Asking ${harness}…` : `Create ${name}`}</Text>
      </Pressable>
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.redInk }]} testID="new-agent-failed">
          {failed}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  who: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.xxl,
    marginTop: SPACE.sm,
    marginBottom: SPACE.lg,
    // Short of the sheet's X, at the right of this line (ADR 0169).
    marginRight: CLOSE_ROOM,
  },
  harness: { flex: 1, fontSize: TEXT.body, fontWeight: "500" },
  ask: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3, marginBottom: SPACE.xs },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
  label: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    marginTop: SPACE.lg,
    marginBottom: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
  field: { borderRadius: RADIUS.xl, minHeight: 52, justifyContent: "center" },
  fieldWords: { fontSize: TEXT.body, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  hint: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    marginTop: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
  go: {
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.xl,
  },
  // Gold is the same in both themes, so the ink on it is too.
  goWords: { fontSize: TEXT.body, fontWeight: "600", color: "#14161b" },
  failed: { fontSize: TEXT.sm, fontWeight: "600", marginTop: SPACE.md },
});
