/** Invite someone (people review, Phase 1): an owner's link, from You. */

import { Stack } from "expo-router";
import { Invite } from "../src/people/Invite";
import { useChips } from "../src/store/provider";
import { Screen } from "../src/ui/Screen";

export default function InviteScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  const { device } = paired;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "Invite someone" }} />
      <Invite
        store={paired.store}
        selfId={device.participantId}
        workspace={device.workspaceName ?? device.workspaceId}
      />
    </Screen>
  );
}
