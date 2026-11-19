/**
 * You → Permissions (ADR 0299): every harness's asks at once, from its row on You, in the place
 * Allowed always had. On a wide screen it opens beside You's list instead.
 */

import type { Store } from "@chipschat/core";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { useChips, useSnapshot } from "../src/store/provider";
import { BackToTabs } from "../src/ui/backToTabs";
import { useLayout } from "../src/ui/layout";
import { Screen, useColumn } from "../src/ui/Screen";
import { SPACE } from "../src/ui/tokens";
import { useYouPermissions } from "../src/you/YouPermissions";

export default function PermissionsScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "permissions" }} />;
  return <Page store={paired.store} selfId={paired.device.participantId} />;
}

function Page({ store, selfId }: { readonly store: Store; readonly selfId: string }) {
  const snapshot = useSnapshot(store);
  const column = useColumn();
  const page = useYouPermissions({ store, snapshot, selfId });
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: "Permissions" }} />
      <ScrollView contentContainerStyle={[styles.body, column]} testID="permissions-screen">
        {page.body}
      </ScrollView>
      {page.over}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.lg },
});
