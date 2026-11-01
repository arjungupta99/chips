/**
 * When it asks you (ADR 0195), from its row on a harness's page (ADR 0254), where it once stood
 * whole: who decides when and who decides the answer, the three things that are always true, what
 * a person allowed always with a switch on each, and the asks so far as dots (`Asking.tsx`), which
 * open every ask (ADR 0255).
 *
 * Under it, only for a harness that hands its permissions to Chips (ADR 0046), the dial: how far it
 * is trusted. Jacobian's permissions are its own, and a dial that changed nothing it could see was
 * a lie with a label. The dial turns for an owner or an admin alone (SEC-1): the server refuses
 * anybody else's turn, so for them it shows the level and will not move. Its rules are When it asks
 * you's list, so they are sent back as they stand with each turn.
 *
 * The section's Undo pill and the layer its dust is drawn in stand beside the scroll (`overlays`).
 */

import type { HarnessPolicyModel, Snapshot, Store } from "@chipschat/core";
import { mayTurnDial, takesAutonomy } from "@chipschat/core";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Card } from "../../ui/Card";
import { useColumn } from "../../ui/Screen";
import { Segment } from "../../ui/Segment";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import type { AutonomyLevel } from "../../ui/vocabulary";
import { useAsking } from "../Asking";

export function WhenItAsks({
  store,
  snapshot,
  harnessId,
  selfId,
  onOpenAsks,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** Opens every ask so far: the dots' tap (ADR 0255). */
  readonly onOpenAsks: () => void;
}) {
  const column = useColumn();
  const asking = useAsking({ store, snapshot, harnessId, selfId, onOpenAsks });
  return (
    <>
      <ScrollView contentContainerStyle={[styles.body, column]} testID="when-it-asks">
        {asking.group}
        {takesAutonomy(snapshot.directory, harnessId) ? (
          <Trust
            store={store}
            harnessId={harnessId}
            policy={snapshot.model.harnesses[harnessId]}
            turns={mayTurnDial(snapshot.model, selfId)}
          />
        ) : null}
      </ScrollView>
      {asking.overlays}
    </>
  );
}

/** How far a harness is trusted: the dial, or a line saying it has no policy yet. */
function Trust({
  store,
  harnessId,
  policy,
  turns,
}: {
  readonly store: Store;
  readonly harnessId: string;
  readonly policy: HarnessPolicyModel | undefined;
  /** Whether the reader may turn it (`mayTurnDial`). */
  readonly turns: boolean;
}) {
  const palette = usePalette();
  return (
    <Card>
      <Text style={[styles.heading, { color: palette.ink }]}>How far it is trusted</Text>
      {policy === undefined ? (
        <Text style={[styles.note, { color: palette.ink3 }]}>
          No policy yet. It gets one the first time it asks for something.
        </Text>
      ) : (
        <Segment
          value={policy.autonomy}
          max={policy.maxAutonomy}
          onChange={
            turns
              ? (level: AutonomyLevel) =>
                  store.setAutonomy({ harnessId, level, rules: policy.rules })
              : undefined
          }
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
  heading: { fontSize: TEXT.md, fontWeight: "700" },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
});
