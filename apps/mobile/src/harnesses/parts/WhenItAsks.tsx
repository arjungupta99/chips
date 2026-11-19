/**
 * A harness's Permissions (ADR 0299, made short by ADR 0300), from its row on a harness's page (ADR
 * 0254): who decides what to ask, where it's set, and the asks so far as dots, which open every ask
 * (ADR 0255). Its two rows open its own settings and Chips's rules. The page itself is
 * `permissions/HarnessPermissions.tsx`. The trust dial is gone from it: no harness declares one.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { ScrollView, StyleSheet } from "react-native";
import { useColumn } from "../../ui/Screen";
import { SPACE } from "../../ui/tokens";
import { useHarnessPermissions } from "../permissions/HarnessPermissions";

export function WhenItAsks({
  store,
  snapshot,
  harnessId,
  selfId,
  onOpenAsks,
  onOpenPart,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** Opens every ask so far: the dots' tap (ADR 0255). */
  readonly onOpenAsks: () => void;
  /** Opens its own settings, or Chips's rules (ADR 0300). */
  readonly onOpenPart: (part: "settings" | "chips") => void;
}) {
  const column = useColumn();
  const asking = useHarnessPermissions({
    store,
    snapshot,
    harnessId,
    selfId,
    onOpenAsks,
    onOpenPart,
  });
  return (
    <>
      <ScrollView contentContainerStyle={[styles.body, column]} testID="when-it-asks">
        {asking.page}
      </ScrollView>
      {asking.overlays}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
});
