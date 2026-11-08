/**
 * Allowed always, for the whole workspace (ADR 0195): a sheet off You's workspace group, which only
 * an owner or an admin sees. Each harness that is allowed something always, by name, with what a
 * person's Always let it go ahead with, switched and swiped as on the harness's own page
 * (`AlwaysList`); the harnesses allowed nothing are one line under them. The same Undo after a
 * removal, and the same dust.
 *
 * With nothing allowed anywhere it says so once (Arjun's A of 26 October 2026, after six boxes that
 * each said "Nothing allowed always."): the ask flying from the harnesses to the reader, how a rule
 * comes to be here, why the asks that matter never do, and the dots of every ask so far. The dots
 * open every ask, as a harness's own do (ADR 0255): on a phone the sheet goes down and the list
 * comes up over You; on an iPad it stands in a third column beside the page (ADR 0276).
 *
 * Above them, the agents let work without asking just now (ADR 0281), each with the room it works
 * in, until when, and Stop: a yes that holds on is listed beside the Always rules, since it is
 * one too, and this is where it is found again away from its room.
 *
 * It is a shortcut to the harness pages' lists, not a setting of its own: two people running one
 * workspace see one truth, and asking is the harness's, not the person's.
 *
 * Beside the list on an iPad the same is a page (`AlwaysPage`), with the Undo over its foot.
 */

import {
  ASKS_SO_FAR,
  alwaysAsking,
  alwaysByHarness,
  alwaysNone,
  alwaysSheetWhy,
  mayTurnDial,
  REMOVED_WORDS,
  type Snapshot,
  type Store,
  WORKING_HEADING,
  workingWithoutAsking,
  workspaceAskHistory,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlwaysList } from "../harnesses/AlwaysList";
import { DotRow, Hero, PromiseMark, useMarks } from "../harnesses/AskingMotion";
import { useAlways } from "../harnesses/useAlways";
import { useDust } from "../spaces/Dust";
import { BandIn } from "../spaces/LetWorkMotion";
import { ListDust } from "../spaces/SelectMotion";
import { UndoPill } from "../spaces/UndoPill";
import { Button } from "../ui/Button";
import { Group, GroupFoot, GroupHeading } from "../ui/Group";
import { Icon } from "../ui/Icon";
import { Sheet, SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useNow } from "../ui/useNow";
import { useReduceMotion } from "../ui/useReduceMotion";
import { SheetPage, useThirdPage } from "./pages";
import { SheetHead } from "./SheetHead";

const TITLE = "Allowed always";

/** How the dots open every ask, and whether the list they open stands beside them. */
interface OpensAsks {
  readonly onPress: () => void;
  readonly selected: boolean | undefined;
}

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
  const router = useRouter();
  // The dots take the sheet down first, and the list comes up once it has gone, as a room's
  // details open an agent's card.
  const asking = useRef(false);
  const asks = {
    onPress: () => {
      asking.current = true;
      onClose();
    },
    selected: undefined,
  };
  const always = useAlwaysBody({ store, snapshot, selfId, asks });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onGone={() => {
        if (!asking.current) return;
        asking.current = false;
        router.push("/asks");
      }}
      sizing="bounded"
      cap={0.9}
      testID="always-sheet"
    >
      <SheetHead title={TITLE} />
      <SheetScroll style={styles.shrink} contentContainerStyle={styles.body}>
        {always.body}
      </SheetScroll>
      {always.over}
    </Sheet>
  );
}

export function AlwaysPage({
  store,
  snapshot,
  selfId,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
}) {
  const router = useRouter();
  const asks = useThirdPage("asks", () => router.push("/asks"));
  const always = useAlwaysBody({ store, snapshot, selfId, asks });
  return (
    <SheetPage title={TITLE} over={always.over} testID="always-page">
      <View style={styles.body}>{always.body}</View>
    </SheetPage>
  );
}

/** What the sheet and the page hold, and what stands over it: the dust, and Undo after a removal. */
function useAlwaysBody({
  store,
  snapshot,
  selfId,
  asks,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly asks: OpensAsks;
}) {
  const palette = usePalette();
  const dust = useDust(useReduceMotion());
  const always = useAlways(store, snapshot);
  const harnesses = alwaysByHarness(always.model, snapshot.directory, selfId);
  const allowing = harnesses.filter((harness) => harness.rules.length > 0);
  const asking = alwaysAsking(harnesses);
  const body = (
    <>
      <Working store={store} snapshot={snapshot} />
      {allowing.length === 0 ? (
        <Nothing
          snapshot={snapshot}
          selfId={selfId}
          names={harnesses.map((harness) => harness.name)}
          asks={asks}
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
    </>
  );
  const over = (
    <>
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
    </>
  );
  return { body, over };
}

/** The agents let work without asking now (ADR 0281), each with where, until when, and Stop. */
function Working({ store, snapshot }: { readonly store: Store; readonly snapshot: Snapshot }) {
  const palette = usePalette();
  const now = useNow(snapshot.model.spaces.some((space) => space.letWork !== undefined));
  const rows = workingWithoutAsking(snapshot.model, snapshot.directory, now);
  if (rows.length === 0) return null;
  return (
    <View style={styles.harness} testID="always-working">
      <GroupHeading>{WORKING_HEADING}</GroupHeading>
      <Group>
        {rows.map((row, index) => (
          <BandIn
            key={`${row.spaceId} ${row.held.asker}`}
            style={[
              styles.pad,
              styles.opens,
              index === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth },
              { borderColor: palette.line },
            ]}
            testID={`always-working-${row.held.asker}`}
          >
            <View style={[styles.grow, styles.working]}>
              <Text style={[styles.name, { color: palette.ink }]}>{row.name}</Text>
              <Text style={[styles.note, { color: palette.ink3 }]}>{row.line}</Text>
            </View>
            <Button
              label="Stop"
              onPress={() => store.stopLetWork({ spaceId: row.spaceId, asker: row.held.asker })}
              testID={`always-working-stop-${row.held.asker}`}
            />
          </BandIn>
        ))}
      </Group>
    </View>
  );
}

/** Nothing allowed anywhere, said once, with every ask so far under it. */
function Nothing({
  snapshot,
  selfId,
  names,
  asks,
}: {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly names: readonly string[];
  readonly asks: OpensAsks;
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
          <GroupHeading>{ASKS_SO_FAR}</GroupHeading>
          <Group>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${ASKS_SO_FAR}: ${history.line}`}
              accessibilityHint="Opens every ask"
              accessibilityState={
                asks.selected === undefined ? undefined : { selected: asks.selected }
              }
              onPress={asks.onPress}
              testID="always-none-history"
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.pad,
                    styles.opens,
                    {
                      backgroundColor: asks.selected
                        ? palette.surface3
                        : pressed
                          ? palette.surface2
                          : palette.surface,
                    },
                  ]}
                >
                  <View style={[styles.grow, styles.history]}>
                    <DotRow dots={history.dots} />
                    <Text style={[styles.note, { color: palette.ink3 }]}>{history.line}</Text>
                  </View>
                  <Icon name="next" size={16} color={palette.ink4} />
                </View>
              )}
            </Pressable>
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
  working: { gap: 2 },
  name: { fontSize: TEXT.md, fontWeight: "600" },
  // The dots and their line, and the chevron of a row that opens something.
  opens: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
});
