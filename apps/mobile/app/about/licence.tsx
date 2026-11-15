/** The licence in plain words, from About (ADR 0295). On a wide screen it opens beside About, in a third column. */

import { LICENCE_TITLE } from "@chipschat/core";
import { Stack } from "expo-router";
import { LicencePage } from "../../src/about/LicencePage";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function LicenceScreen() {
  const { wide } = useLayout();
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "about", third: "licence" }} />;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: LICENCE_TITLE }} />
      <LicencePage />
    </Screen>
  );
}
