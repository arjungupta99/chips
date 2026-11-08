/**
 * The room's banner while Chips holds its agents' messages to each other (ADR 0097): who paused
 * them — Chips, at the referee's ceiling or at the room's spend ceiling with what the job spent
 * (ADR 0118), or a person — and *Let them carry on*, which is a person acting, so the count starts
 * again, what was held is handed over and a new job begins. It stays until a person acts. The
 * words are core's (`pauseWords`), so the desktop says the same.
 *
 * Held at the spend ceiling, it offers the way on at the ceiling there is, *Carry on at $3.00*,
 * and, for whoever may set the ceiling, *Raise the limit* first: the room's Spend per job, whose
 * Save lets them carry on too (ADR 0282, Arjun's C of the mock "Spend in Chips explain").
 */

import {
  carryOnWords,
  maySetSpend,
  pauseWords,
  RAISE_LIMIT,
  type Snapshot,
  type Space,
  type Store,
} from "@chipschat/core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

export function PausedBanner({
  store,
  space,
  snapshot,
  selfId,
  onRaise,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  /** Raise the limit: the room's Spend per job, opened to carry on with what is saved. */
  readonly onRaise?: (() => void) | undefined;
}) {
  const palette = usePalette();
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const words = pauseWords(space, snapshot.directory);
  if (space.state !== "open" || words === undefined) return null;
  const carryOn = () => {
    setFailed(undefined);
    store.setExchange(space.id, "going").catch((error: unknown) => {
      setFailed(error instanceof Error ? error.message : "The server would not let them go on.");
    });
  };
  // Held at the ceiling, and not paused by a person since.
  const atCeiling = space.pausedSpend !== undefined && space.pausedBy === undefined;
  const raises = atCeiling && onRaise !== undefined && maySetSpend(space, snapshot.model, selfId);
  return (
    <View
      style={[styles.banner, { backgroundColor: palette.redSoft, borderColor: palette.red }]}
      accessibilityRole="summary"
      testID="paused-banner"
    >
      <Text style={[styles.words, { color: palette.redInk }]}>{words}</Text>
      <View style={styles.acts}>
        {raises ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRaise}
            style={[styles.act, { borderColor: palette.redInk, backgroundColor: palette.redInk }]}
            testID="raise-limit"
          >
            <Text style={[styles.actWords, { color: palette.redSoft }]}>{RAISE_LIMIT}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={carryOn}
          style={[styles.act, { borderColor: palette.redInk }]}
          testID="carry-on"
        >
          <Text style={[styles.actWords, { color: palette.redInk }]}>
            {atCeiling ? carryOnWords(space) : "Let them carry on"}
          </Text>
        </Pressable>
      </View>
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.redInk }]}>{failed}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.sm,
  },
  words: { fontSize: TEXT.md, lineHeight: 20 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  act: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  actWords: { fontSize: TEXT.md, fontWeight: "600" },
  failed: { fontSize: TEXT.sm },
});
