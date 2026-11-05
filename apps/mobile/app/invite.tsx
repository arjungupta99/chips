/** Invite someone (people review, Phase 1): an owner's link, from You. */

import { Stack } from "expo-router";
import { Invite } from "../src/people/Invite";
import { useChips } from "../src/store/provider";
import { BackToTabs } from "../src/ui/backToTabs";
import { useLayout } from "../src/ui/layout";
import { Screen } from "../src/ui/Screen";

export default function InviteScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "invite" }} />;
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
