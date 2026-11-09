/** An agent's Permissions page (ADR 0286), pushed from its card or its band in a room. */

import { PERMISSIONS_TITLE, type Store } from "@chipschat/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Permissions } from "../../../src/agents/Permissions";
import { useChips, useSnapshot } from "../../../src/store/provider";
import { BackToTabs } from "../../../src/ui/backToTabs";
import { useLayout } from "../../../src/ui/layout";
import { Screen } from "../../../src/ui/Screen";

export default function PermissionsScreen() {
  const { paired } = useChips();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) {
    return <BackToTabs tab="/(tabs)/agents" params={{ agent: id, permissions: "1" }} />;
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
    <Screen grouped>
      <Stack.Screen options={{ title: PERMISSIONS_TITLE }} />
      <Permissions
        store={store}
        snapshot={snapshot}
        agentId={agentId}
        selfId={selfId}
        onOpenHarness={(harnessId) =>
          router.push({ pathname: "/harnesses/[id]", params: { id: harnessId } })
        }
        onOpenAsks={(harnessId) =>
          router.push({
            pathname: "/harnesses/[id]/[part]",
            params: { id: harnessId, part: "asked" },
          })
        }
      />
    </Screen>
  );
}
