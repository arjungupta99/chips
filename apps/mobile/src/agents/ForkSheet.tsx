/**
 * What Fork asks first, where it is one tap away (ADR 0087, Fork): the no-agent notice and a row
 * for an agent elsewhere. A copy is a new agent that spends its harness's budget each time it
 * answers, so it is asked for on purpose, as the room sheet's Move page asks before a move. Move
 * back stays one tap.
 */

import { harnessOf, nameOf, roomName, type Snapshot, type Store } from "@chipschat/core";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { CLOSE_ROOM, Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { faceProps } from "./face";

export function ForkSheet({
  store,
  snapshot,
  agentId,
  spaceId,
  onClose,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  /** The agent to copy, or nothing while the sheet is shut. */
  readonly agentId: string | undefined;
  /** The room the copy is for. */
  readonly spaceId: string;
  readonly onClose: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // The last agent asked about, so the sheet still says it while it slides away.
  const [shown, setShown] = useState(agentId);
  useEffect(() => {
    if (agentId === undefined) return;
    setShown(agentId);
    setFailed(undefined);
  }, [agentId]);
  const { directory, model } = snapshot;
  const id = agentId ?? shown ?? "";
  const name = nameOf(directory, id);
  const harness = nameOf(directory, harnessOf(directory, id));
  const where = roomName(model, directory[id]?.room, directory);
  const fork = async () => {
    if (agentId === undefined) return;
    setBusy(true);
    setFailed(undefined);
    try {
      await store.forkAgent(agentId, spaceId);
      onClose();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not ask for a copy.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={agentId !== undefined}
      onClose={busy ? () => undefined : onClose}
      closable={!busy}
      testID="fork-sheet"
    >
      <View style={[styles.who, { backgroundColor: on.fill }]}>
        <Avatar name={name} {...faceProps(directory, id)} size="md" decorative />
        <View style={styles.words}>
          <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
            {harness} · in {where}
          </Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[styles.ask, { color: palette.ink }]}>
        Fork {name} here?
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>
        A copy joins this space, remembering everything up to now. {name} stays in {where}. From
        then on, the two remember separately.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fork"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => void fork()}
        testID="fork-sheet-fork"
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: palette.gold, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.goWords}>Fork</Text>
      </Pressable>
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.redInk }]} testID="fork-sheet-failed">
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
    // Short of the sheet's X, at the right of this line; the X is the way out (ADR 0169).
    marginRight: CLOSE_ROOM,
  },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.body, fontWeight: "500" },
  under: { fontSize: TEXT.sm },
  ask: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3, marginBottom: SPACE.xs },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
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
