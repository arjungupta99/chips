/** The open-source packages the app ships and their licences, from About (ADR 0295). On a wide screen it opens beside About, in a third column. */

import { NOTICES_TITLE } from "@chipschat/core";
import { Stack } from "expo-router";
import { NoticesPage } from "../../src/about/NoticesPage";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function NoticesScreen() {
  const { wide } = useLayout();
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "about", third: "notices" }} />;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: NOTICES_TITLE }} />
      <NoticesPage />
    </Screen>
  );
}
