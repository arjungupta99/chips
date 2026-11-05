/**
 * One person's page (people review, Phase 1): their role, the spaces you share, a new phone for
 * them (ADR 0206), and Remove.
 */

import { nameOf } from "@chipschat/core";
import { Stack, useLocalSearchParams } from "expo-router";
import { Person } from "../../src/people/Person";
import { useChips, useSnapshot } from "../../src/store/provider";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function PersonScreen() {
  const { paired } = useChips();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "people", person: id }} />;
  return <One paired={paired} personId={id} />;
}

function One({
  paired,
  personId,
}: {
  readonly paired: NonNullable<ReturnType<typeof useChips>["paired"]>;
  readonly personId: string;
}) {
  const snapshot = useSnapshot(paired.store);
  const { device } = paired;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: nameOf(snapshot.directory, personId) }} />
      <Person
        store={paired.store}
        selfId={device.participantId}
        personId={personId}
        workspace={snapshot.workspaceName ?? device.workspaceName ?? device.workspaceId}
        serverUrl={device.serverUrl}
      />
    </Screen>
  );
}
