/** About Chips (ADR 0295), from the row on You. On a wide screen it opens beside You's list. */

import { ABOUT_TITLE } from "@chipschat/core";
import { Stack } from "expo-router";
import { AboutPage } from "../../src/about/AboutPage";
import { useChips } from "../../src/store/provider";
import { BackToTabs } from "../../src/ui/backToTabs";
import { useLayout } from "../../src/ui/layout";
import { Screen } from "../../src/ui/Screen";

export default function AboutScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "about" }} />;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: ABOUT_TITLE }} />
      <AboutPage store={paired.store} />
    </Screen>
  );
}
