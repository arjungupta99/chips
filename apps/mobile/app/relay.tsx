/** Relay (ADR 0211, Phase 4): the owner's switch for the server's relay, from the row on You. */

import { Stack } from "expo-router";
import { useChips } from "../src/store/provider";
import { Screen } from "../src/ui/Screen";
import { RelayPage } from "../src/you/RelayPage";

export default function RelayScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "Relay" }} />
      <RelayPage store={paired.store} device={paired.device} />
    </Screen>
  );
}
