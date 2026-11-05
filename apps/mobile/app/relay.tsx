/** Relay (ADR 0211, Phase 4): the owner's switch for the server's relay, from the row on You. */

import { Stack } from "expo-router";
import { useChips } from "../src/store/provider";
import { BackToTabs } from "../src/ui/backToTabs";
import { useLayout } from "../src/ui/layout";
import { Screen } from "../src/ui/Screen";
import { RelayPage } from "../src/you/RelayPage";

export default function RelayScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "relay" }} />;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "Relay" }} />
      <RelayPage store={paired.store} device={paired.device} />
    </Screen>
  );
}
