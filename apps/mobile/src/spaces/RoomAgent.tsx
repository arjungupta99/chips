/**
 * An agent's card, or its message history, as a page of a space's details where they stand in a
 * column beside the room (ADR 0276): a row in the details pushes it inside the column, with the way
 * back to them, rather than closing them and standing the card over the room. Arjun, 3 November
 * 2026: "space detail section, tap agent, you enter agent detail page abruptly, ideally content
 * opens in the third column itself when it is opened from there".
 *
 * The card is the one beside the Agents list (`AgentCard`), at the column's width. Where the
 * details are a sheet, a row still closes it and opens the card over the room.
 */

import { nameOf, type Snapshot, type Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AgentCard } from "../agents/AgentCard";
import { History } from "../agents/History";
import { fileHref } from "../context/owner";
import { PageBack } from "../ui/PageBack";
import { SPACE } from "../ui/tokens";

export function AgentPage({
  store,
  snapshot,
  agentId,
  selfId,
  history,
  onBack,
  onHistory,
  onOpenAgent,
  onOpenRoom,
  onDeleted,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string;
  /** Its message history rather than its card. */
  readonly history: boolean;
  /** Back to the details from its card, or to its card from its history. */
  readonly onBack: () => void;
  readonly onHistory: () => void;
  /** Another agent's card: the one a copy was forked from, or one its history names. */
  readonly onOpenAgent: (agentId: string) => void;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Deleted from here (ADR 0095): back to the details. */
  readonly onDeleted: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.page} testID={history ? "room-sheet-history" : "room-sheet-agent"}>
      <PageBack
        title={history ? "Message history" : nameOf(snapshot.directory, agentId)}
        onBack={onBack}
        testID="room-sheet-agent-back"
      />
      {/* The card's groups keep their own margins, so it stands out to the column's edges. */}
      <View style={styles.card}>
        {history ? (
          <History
            store={store}
            snapshot={snapshot}
            agentId={agentId}
            selfId={selfId}
            onOpenRoom={onOpenRoom}
            onOpenAgent={onOpenAgent}
          />
        ) : (
          <AgentCard
            store={store}
            snapshot={snapshot}
            agentId={agentId}
            selfId={selfId}
            onHistory={onHistory}
            onPermissions={() => router.push(`/agents/${agentId}/permissions`)}
            context={{
              focus: 0,
              onOpenFile: (name, mode) =>
                router.push(fileHref({ kind: "agent", id: agentId }, name, mode)),
              onOpenHarness: (harnessId) => router.push(`/harnesses/${harnessId}`),
            }}
            onOpenRoom={onOpenRoom}
            onOpenAgent={onOpenAgent}
            onDeleted={onDeleted}
          />
        )}
      </View>
    </View>
  );
}

// As every page of the details: as tall as what it holds, and shrunk to what the column leaves it
// (`SheetPages`), the card's own scroll taking the rest.
const styles = StyleSheet.create({
  page: { flexShrink: 1, minHeight: 0 },
  card: { flexShrink: 1, minHeight: 0, marginHorizontal: -SPACE.lg },
});
