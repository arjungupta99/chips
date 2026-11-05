/** Connection (ADR 0211): which way this phone reaches its server, from the row on You. */

import { Stack } from "expo-router";
import { useChips } from "../src/store/provider";
import { BackToTabs } from "../src/ui/backToTabs";
import { useLayout } from "../src/ui/layout";
import { Screen } from "../src/ui/Screen";
import { ConnectionPage } from "../src/you/ConnectionPage";

export default function ConnectionScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "connection" }} />;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "Connection" }} />
      <ConnectionPage store={paired.store} device={paired.device} />
    </Screen>
  );
}
