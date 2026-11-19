/**
 * New rule for every harness (ADR 0299), from You → Permissions: pushed over it on a phone, and
 * back to it once saved. On a wide screen it stands in a third column beside that page instead.
 */

import { EVERY_HARNESS, NEW_RULE_TITLE, type Store } from "@chipschat/core";
import { Stack, useRouter } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { NewRule } from "../src/harnesses/permissions/NewRule";
import { useChips, useSnapshot } from "../src/store/provider";
import { BackToTabs } from "../src/ui/backToTabs";
import { useLayout } from "../src/ui/layout";
import { Screen, useColumn } from "../src/ui/Screen";
import { SPACE } from "../src/ui/tokens";

export default function RuleScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) return <BackToTabs tab="/(tabs)/you" params={{ page: "permissions", third: "rule" }} />;
  return <Page store={paired.store} />;
}

function Page({ store }: { readonly store: Store }) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  const column = useColumn();
  return (
    <Screen grouped>
      <Stack.Screen options={{ title: NEW_RULE_TITLE }} />
      <ScrollView
        contentContainerStyle={[styles.body, column]}
        keyboardShouldPersistTaps="handled"
        testID="rule-screen"
      >
        <NewRule
          store={store}
          snapshot={snapshot}
          harnessId={EVERY_HARNESS}
          onDone={() => router.back()}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
});
