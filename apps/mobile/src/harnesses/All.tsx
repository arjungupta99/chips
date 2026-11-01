/**
 * Every harness's card, in a list of its own (ADR 0185): what View all under the Agents tab's shelf
 * opens, pushed on a phone and beside the list on a wide screen. The cards say more than a tile has
 * room for — its level, its sessions and spaces, what waits on you, its context and its budget —
 * and stood at the foot of the Agents tab until 17 October 2026. They run in the shelf's order, and
 * a card opens its harness's page. Connect a harness is at the foot, for whoever may.
 */

import { administers, agentsTab, harnessShelf, myRole, type Store } from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import { Fold } from "../agents/Agents";
import { useDeferredSnapshot } from "../store/provider";
import { UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useConnect } from "./Connect";
import { HarnessCard } from "./HarnessCard";

export function All({
  store,
  selfId,
  selected,
  onOpen,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** The harness open beside the list, on a wide screen. */
  readonly selected?: string | undefined;
  readonly onOpen: (harnessId: string) => void;
}) {
  const snapshot = useDeferredSnapshot(store);
  const palette = usePalette();
  const column = useColumn();
  const adding = useConnect();
  const tab = agentsTab(snapshot.model, snapshot.directory, selfId);
  const tiles = harnessShelf(tab, snapshot.directory);
  const decides = administers(myRole(snapshot.model, selfId));
  return (
    <UnderName contentContainerStyle={[styles.list, column]} testID="harnesses-list">
      {tiles.length === 0 ? (
        <Text style={[styles.none, { color: palette.ink3 }]}>
          {decides
            ? "No harnesses yet. Connect one, or allow one that asks."
            : "No harnesses yet. They are added from a computer."}
        </Text>
      ) : (
        <View style={styles.cards}>
          {tiles.map((tile) => (
            <HarnessCard
              key={tile.id}
              snapshot={snapshot}
              harnessId={tile.id}
              name={tile.name}
              selected={tile.id === selected}
              onOpen={onOpen}
            />
          ))}
        </View>
      )}
      {decides ? (
        <Fold
          words={
            adding.waiting === undefined
              ? "Connect a harness"
              : adding.waiting.taken
                ? "Connecting a harness…"
                : `Connect a harness · waiting, ${adding.waiting.left}`
          }
          onPress={adding.open}
          testID="add-agent"
        />
      ) : null}
    </UnderName>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: SPACE.md, paddingBottom: SPACE.xxl * 2 },
  cards: { paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  none: {
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * 1.4),
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
});
