/**
 * Every ask in the workspace so far, from the dots on You's Allowed always: the list a harness's own
 * dots open (ADR 0255), with every harness's asks in it. On a wide screen it opens beside Allowed
 * always instead, in a third column (ADR 0276).
 */

import { ASKS_TITLE, type Store } from "@chipschat/core";
import { Stack } from "expo-router";
import { AskList } from "../src/harnesses/parts/AskList";
import { useChips, useSnapshot } from "../src/store/provider";
import { BackToTabs } from "../src/ui/backToTabs";
import { useLayout } from "../src/ui/layout";
import { Screen } from "../src/ui/Screen";

export default function AsksScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "always", third: "asks" }} />;
  return <Asks store={paired.store} selfId={paired.device.participantId} />;
}

function Asks({ store, selfId }: { readonly store: Store; readonly selfId: string }) {
  const snapshot = useSnapshot(store);
  return (
    <Screen>
      <Stack.Screen options={{ title: ASKS_TITLE }} />
      <AskList snapshot={snapshot} harnessId={undefined} selfId={selfId} />
    </Screen>
  );
}
