/** People (people review, Phase 1): everyone in the workspace, from You. */

import { Stack } from "expo-router";
import { People } from "../../src/people/People";
import { useChips } from "../../src/store/provider";
import { Screen } from "../../src/ui/Screen";

export default function PeopleScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
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
