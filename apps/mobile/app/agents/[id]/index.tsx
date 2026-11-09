/**
 * An agent's card (ADR 0087, Phase 5). A route of its own, so a tap from the Agents tab, the
 * archived list or a harness's page lands here — and, on a wide screen, beside the list instead.
 * `lock=1` is a locked agent's Locked (ADR 0199): the card's lock row glows once as it comes in.
 */

import type { Store } from "@chipschat/core";
import { nameOf } from "@chipschat/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AgentCard } from "../../../src/agents/AgentCard";
import { fileHref } from "../../../src/context/owner";
import { useFocusCount } from "../../../src/context/useFocusCount";
import { useChips, useSnapshot } from "../../../src/store/provider";
import { BackToTabs } from "../../../src/ui/backToTabs";
import { useLayout } from "../../../src/ui/layout";
import { Screen } from "../../../src/ui/Screen";

export default function AgentScreen() {
  const { paired } = useChips();
  const { id, lock } = useLocalSearchParams<{ id: string; lock?: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) {
    const params = lock === undefined ? { agent: id } : { agent: id, lock };
    return <BackToTabs tab="/(tabs)/agents" params={params} />;
  }
  return (
    <Card
      store={paired.store}
      selfId={paired.device.participantId}
      agentId={id}
      lockGlow={lock === "1"}
    />
  );
}

function Card({
  store,
  selfId,
  agentId,
  lockGlow,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly agentId: string;
  readonly lockGlow: boolean;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  // Read again each time the card comes to the front.
  const focus = useFocusCount();
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: nameOf(snapshot.directory, agentId) }} />
      <AgentCard
        store={store}
        snapshot={snapshot}
        agentId={agentId}
        selfId={selfId}
        lockGlow={lockGlow}
        context={{
          focus,
          onOpenFile: (name, mode) =>
            router.push(fileHref({ kind: "agent", id: agentId }, name, mode)),
          // A shared file is on the harness's Context files page (ADR 0254).
          onOpenHarness: (harnessId, fileId) =>
            router.push(
              fileId === undefined
                ? { pathname: "/harnesses/[id]", params: { id: harnessId } }
                : {
                    pathname: "/harnesses/[id]/[part]",
                    params: { id: harnessId, part: "context", file: fileId },
                  },
            ),
        }}
        onHistory={() => router.push(`/agents/${agentId}/history`)}
        onPermissions={() => router.push(`/agents/${agentId}/permissions`)}
        onOpenRoom={(spaceId) => router.push(`/spaces/${spaceId}`)}
        onOpenAgent={(other) => router.push(`/agents/${other}`)}
        // Deleted from its own card: there is nothing left here to show.
        onDeleted={() => router.back()}
      />
    </Screen>
  );
}
