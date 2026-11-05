/** An agent's message history (ADR 0087, rule 3.11, Phase 5), pushed from its card. */

import type { Store } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { History } from "../../../src/agents/History";
import { useChips, useSnapshot } from "../../../src/store/provider";
import { BackToTabs } from "../../../src/ui/backToTabs";
import { useLayout } from "../../../src/ui/layout";
import { Screen } from "../../../src/ui/Screen";

export default function HistoryScreen() {
  const { paired } = useChips();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) {
    return <BackToTabs tab="/(tabs)/agents" params={{ agent: id, history: "1" }} />;
  }
  return <One store={paired.store} selfId={paired.device.participantId} agentId={id} />;
}

function One({
  store,
  selfId,
  agentId,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly agentId: string;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  return (
    <Screen>
      <Stack.Screen
        options={{ title: nameOf(snapshot.directory, agentId), headerBackTitle: "Card" }}
      />
      <History
        store={store}
        snapshot={snapshot}
        agentId={agentId}
        selfId={selfId}
        onOpenRoom={(spaceId) => router.push(`/spaces/${spaceId}`)}
        onOpenAgent={(other) => router.push(`/agents/${other}`)}
      />
    </Screen>
  );
}
