/**
 * Allowed always, for the whole workspace (ADR 0195): a sheet off You's workspace group, which only
 * an owner or an admin sees. Each harness that is allowed something always, by name, with what a
 * person's Always let it go ahead with, switched and swiped as on the harness's own page
 * (`AlwaysList`); the harnesses allowed nothing are one line under them. The same Undo after a
 * removal, and the same dust.
 *
 * With nothing allowed anywhere it says so once (Arjun's A of 26 October 2026, after six boxes that
 * each said "Nothing allowed always."): the ask flying from the harnesses to the reader, how a rule
 * comes to be here, why the asks that matter never do, and the dots of every ask so far.
 *
 * It is a shortcut to the harness pages' lists, not a setting of its own: two people running one
 * workspace see one truth, and asking is the harness's, not the person's.
 */

import {
  alwaysAsking,
  alwaysByHarness,
  alwaysNone,
  alwaysSheetWhy,
  mayTurnDial,
  REMOVED_WORDS,
  type Snapshot,
  type Store,
  workspaceAskHistory,
} from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import { AlwaysList } from "../harnesses/AlwaysList";
import { DotRow, Hero, PromiseMark, useMarks } from "../harnesses/AskingMotion";
import { useAlways } from "../harnesses/useAlways";
import { useDust } from "../spaces/Dust";
import { ListDust } from "../spaces/SelectMotion";
import { UndoPill } from "../spaces/UndoPill";
import { Group, GroupFoot, GroupHeading } from "../ui/Group";
import { Sheet, SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { SheetHead } from "./SheetHead";

export function AlwaysSheet({
  open,
  onClose,
  store,
  snapshot,
  selfId,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
}) {
  const palette = usePalette();
  const dust = useDust(useReduceMotion());
  const always = useAlways(store, snapshot);
  const harnesses = alwaysByHarness(always.model, snapshot.directory, selfId);
  const allowing = harnesses.filter((harness) => harness.rules.length > 0);
  const asking = alwaysAsking(harnesses);
  return (
    <Sheet open={open} onClose={onClose} sizing="bounded" cap={0.9} testID="always-sheet">
      <SheetHead title="Allowed always" />
      <SheetScroll style={styles.shrink} contentContainerStyle={styles.body}>
        {allowing.length === 0 ? (
          <Nothing
            snapshot={snapshot}
            selfId={selfId}
            names={harnesses.map((harness) => harness.name)}
          />
        ) : (
          <>
            <Text style={[styles.why, { color: palette.ink3 }]}>{alwaysSheetWhy()}</Text>
            {allowing.map((harness) => (
              <View key={harness.harnessId} style={styles.harness}>
                <GroupHeading>{harness.name}</GroupHeading>
                <Group>
                  <AlwaysList
                    rules={harness.rules}
                    always={always}
                    dust={dust.asker}
                    may={mayTurnDial(snapshot.model, selfId)}
                    paint={palette.surface}
                    testID={`always-sheet-${harness.harnessId}`}
                  />
                </Group>
              </View>
            ))}
          </>
        )}
        {asking === undefined ? null : <GroupFoot testID="always-sheet-asking">{asking}</GroupFoot>}
      </SheetScroll>
      <ListDust dust={dust} />
      <UndoPill
        undoing={
          always.removed === undefined
            ? undefined
            : { lineId: always.removed.key, at: always.removed.at }
        }
        bottom={SPACE.xl}
        words={REMOVED_WORDS}
        hint="Puts the rule back, so it goes ahead without asking again"
        onUndo={always.undo}
        onGone={always.settled}
      />
    </Sheet>
  );
}

/** Nothing allowed anywhere, said once, with every ask so far under it. */
function Nothing({
  snapshot,
  selfId,
  names,
}: {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly names: readonly string[];
}) {
  const palette = usePalette();
  const marks = useMarks();
  const none = alwaysNone(snapshot.directory, selfId);
  const history = workspaceAskHistory(snapshot.model, snapshot.directory, selfId);
  const me = snapshot.directory[selfId];
  return (
    <>
      <Group>
        <View style={styles.pad} testID="always-none">
          {names.length === 0 ? null : (
            <Hero
              harness={names[0] ?? ""}
              also={names.slice(1, 3)}
              label={names.length === 1 ? undefined : `${names.length} harnesses`}
              person={none.yours ? "You" : "A person"}
              personName={me?.displayName ?? "?"}
              face={me?.face}
            />
          )}
          <Text style={[styles.headline, { color: palette.ink }]}>{none.headline}</Text>
          <Text style={[styles.line, { color: palette.ink2 }]}>{none.line}</Text>
        </View>
      </Group>
      <Group>
        <View style={[styles.pad, styles.matters]}>
          <View style={[styles.tile, { backgroundColor: palette.amberSoft }]}>
            <PromiseMark id="big" ink={palette.amberInk} t={marks} />
          </View>
          <Text style={[styles.note, styles.grow, { color: palette.ink2 }]}>{none.matters}</Text>
        </View>
      </Group>
      {history === undefined ? null : (
        <View style={styles.harness}>
          <GroupHeading>Asks so far</GroupHeading>
          <Group>
            <View
              style={[styles.pad, styles.history]}
              accessible
              accessibilityLabel={history.line}
              testID="always-none-history"
            >
              <DotRow dots={history.dots} />
              <Text style={[styles.note, { color: palette.ink3 }]}>{history.line}</Text>
            </View>
          </Group>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  // A Group keeps its own margin from the edge, as on a screen: the sheet adds none of its own.
  body: { paddingBottom: SPACE.xxl, gap: SPACE.lg },
  why: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45, paddingHorizontal: SPACE.lg + SPACE.lg },
  harness: { gap: SPACE.xs },
  pad: { padding: SPACE.lg, gap: SPACE.sm },
  headline: { fontSize: TEXT.body, lineHeight: 22, fontWeight: "600" },
  line: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  matters: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.md },
  tile: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1 },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  history: { gap: SPACE.sm },
});
