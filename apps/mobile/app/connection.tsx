/** Connection (ADR 0211): which way this phone reaches its server, from the row on You. */

import { Stack } from "expo-router";
import { useChips } from "../src/store/provider";
import { Screen } from "../src/ui/Screen";
import { ConnectionPage } from "../src/you/ConnectionPage";

export default function ConnectionScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "Connection" }} />
      <ConnectionPage store={paired.store} device={paired.device} />
    </Screen>
  );
}
