/** People (people review, Phase 1): everyone in the workspace, from You. */

import { Stack } from "expo-router";
import { People } from "../../src/people/People";
import { useChips } from "../../src/store/provider";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function PeopleScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "people" }} />;
  const { device } = paired;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "People" }} />
      <People
        store={paired.store}
        selfId={device.participantId}
        workspace={device.workspaceName ?? device.workspaceId}
      />
    </Screen>
  );
}
