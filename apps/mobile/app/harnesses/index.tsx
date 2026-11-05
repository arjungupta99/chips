/**
 * Every harness's card (ADR 0185), from View all under the Agents tab's shelf. The Harnesses tab
 * became Agents on 30 September 2026 (ADR 0087, Phase 5), and this route only led there until the
 * shelf; on a wide screen it still does, and the list opens beside the tab's own.
 */

import { Stack, useRouter } from "expo-router";
import { All } from "../../src/harnesses/All";
import { useChips } from "../../src/store/provider";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function HarnessesScreen() {
  const { paired } = useChips();
  const router = useRouter();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/agents" params={{ harnesses: "all" }} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: "Harnesses" }} />
      <All
        store={paired.store}
        selfId={paired.device.participantId}
        onOpen={(id) => router.push(`/harnesses/${id}`)}
      />
    </Screen>
  );
}
