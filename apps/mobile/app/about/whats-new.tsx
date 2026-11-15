/** What's new in this version, from About (ADR 0295). On a wide screen it opens beside About, in a third column. */

import { WHATS_NEW_TITLE } from "@chipschat/core";
import { Stack } from "expo-router";
import { WhatsNewPage } from "../../src/about/WhatsNewPage";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function WhatsNewScreen() {
  const { wide } = useLayout();
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "about", third: "whats-new" }} />;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: WHATS_NEW_TITLE }} />
      <WhatsNewPage />
    </Screen>
  );
}
