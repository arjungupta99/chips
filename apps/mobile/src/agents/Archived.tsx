/**
 * The archived agents (ADR 0087, Phase 5): archived in their harness, or in no room since theirs
 * was archived. The ones whose last room the reader can read come first, newest first, since their
 * histories have lines to read; the ones in rooms the reader isn't in are folded under a row of
 * their own, since their histories are counts. On Jacobian that is most of them: its helper Spaces,
 * in rooms Arjun left on 5 September.
 *
 * Pushing a row left shows Unarchive and Delete (ADR 0095), to whoever may (`Keep`). Select, at the
 * bar's right, picks several to unarchive or delete together, as the Agents tab picks agents to
 * archive or delete (ADR 0182; Arjun, 16 October 2026: "add Select to the Archived page too").
 * Unarchive puts them back at once; Delete asks first. A locked one (ADR 0199) slides on Unarchive
 * and Locked, which opens its card with the lock's row glowing, and is never picked.
 */

import { agentsTab, type Directory, type AgentRow as Row, type Store } from "@chipschat/core";
import { Stack, useRouter } from "expo-router";
import { type ReactElement, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { keepLeaving } from "../spaces/picking";
import { PickBar, PickNote, PickRoom, SelectButton } from "../spaces/Selecting";
import { ListDust, PickMotion } from "../spaces/SelectMotion";
import { useSnapshot } from "../store/provider";
import { Empty, Screen, UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { Fold } from "./Agents";
import { type Keep, KeepRow, useKeep } from "./Keep";
import { AgentsBatch, Going, pickOf, useAgentPicking } from "./Picking";

type Picks = ReturnType<typeof useAgentPicking>;

export function Archived({
  store,
  selfId,
  harnessId,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** One harness's, from its page. */
  readonly harnessId?: string | undefined;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  const palette = usePalette();
  const column = useColumn();
  const [elsewhereShown, setElsewhereShown] = useState(false);
  const { here, elsewhere } = agentsTab(snapshot.model, snapshot.directory, selfId, {
    harnessId,
  }).archived;
  const open = (id: string) => router.push(`/agents/${id}`);
  // A locked agent's Locked (ADR 0199): its card, the lock's row glowing; beside the Agents list
  // on a wide screen, where the card's route sends it.
  const keep = useKeep(store, snapshot, selfId, {
    onLocked: (id) => router.push({ pathname: "/agents/[id]", params: { id, lock: "1" } }),
  });
  const inHere = new Set(here.map((row) => row.id));
  const picks = useAgentPicking({
    store,
    snapshot,
    selfId,
    items: [...here, ...elsewhere],
    visible: elsewhereShown ? [...here, ...elsewhere] : here,
    runOf: (row) => (inHere.has(row.id) ? "here" : "elsewhere"),
    archived: true,
    closeRow: keep.closeOpen,
  });
  const { picking, going, none } = picks;
  // Nothing left to pick from, as another device unarchived the last of them: picking stops.
  const empty = here.length + elsewhere.length === 0;
  useEffect(() => {
    if (empty) none();
  }, [empty, none]);
  // Rows unarchived or deleted, held where they stood in their run until they have gone.
  const held = [...going.leaving.values()];
  const shown = {
    here: keepLeaving(
      here,
      held.filter((each) => each.run === "here"),
    ),
    elsewhere: keepLeaving(
      elsewhere,
      held.filter((each) => each.run === "elsewhere"),
    ),
  };
  const title = pickTitle(picking, picks.chosen.length);
  const select =
    picking || picks.any ? (
      <SelectButton
        picking={picking}
        onPress={picking ? picks.stop : picks.start}
        testID="select-archived"
      />
    ) : null;
  if (shown.here.length + shown.elsewhere.length === 0) {
    return (
      <Screen>
        <Bar title={title} select={null} />
        <Empty>No archived agents.</Empty>
      </Screen>
    );
  }
  const row = (each: Row, at: number) => (
    <ArchivedRow
      key={each.id}
      row={each}
      first={at === 0}
      keep={keep}
      picks={picks}
      directory={snapshot.directory}
      onOpen={open}
    />
  );
  return (
    <Screen under={picks.under}>
      <Bar title={title} select={select} />
      <UnderName contentContainerStyle={[styles.list, column]} testID="archived-list">
        <Text style={[styles.note, { color: palette.ink3 }]}>
          Archived in their harness or here, or freed when their space was. Unarchive one to put it
          back in its space.
        </Text>
        <PickMotion.Provider value={picks.motion}>
          {shown.here.map(row)}
          {elsewhere.length === 0 ? null : (
            <Fold
              words={`In spaces you're not in · ${elsewhere.length}`}
              onPress={() => setElsewhereShown(!elsewhereShown)}
              testID="archived-elsewhere"
            />
          )}
          {elsewhereShown ? shown.elsewhere.map(row) : null}
        </PickMotion.Provider>
        <PickRoom shown={picking} />
      </UnderName>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ListDust dust={picks.dust} />
      </View>
      <PickBar shown={picking} left={picks.left} erase={picks.erase} />
      <PickNote note={picks.note} onGone={picks.clearNote} />
      <AgentsBatch store={store} snapshot={snapshot} selfId={selfId} sheet={picks.sheet} />
      {keep.sheet}
    </Screen>
  );
}

/** One archived agent's row: pushed left for its acts, or a checkbox while the page picks. */
function ArchivedRow({
  row,
  first,
  keep,
  picks,
  directory,
  onOpen,
}: {
  readonly row: Row;
  readonly first: boolean;
  readonly keep: Keep;
  readonly picks: Picks;
  /** Who is who, for whether its changes are locked (ADR 0199). */
  readonly directory: Directory;
  readonly onOpen: (id: string) => void;
}) {
  // Asked of the page as it is now, not of the row, which catches up once it has moved (`usePick`).
  const press = (id: string) => (picks.picking ? picks.row.onPick(row) : onOpen(id));
  const pick = { ...pickOf(row, picks.row, directory), onPick: () => press(row.id) };
  return (
    <Going row={row} going={picks.going}>
      {(away, cover) => (
        <KeepRow
          keep={keep}
          row={row}
          first={first}
          onPress={press}
          still={picks.picking || away}
          gone={away}
          pick={pick}
          cover={cover}
        />
      )}
    </Going>
  );
}

/**
 * The page's bar: its name, and while it picks, how many are picked; Select, or Done, at its
 * right. On iOS the bar's own item, its glass hidden so the capsule draws its own, as the Media
 * page's Select; elsewhere, the bar's right-hand slot.
 */
function Bar({ title, select }: { readonly title: string; readonly select: ReactElement | null }) {
  return (
    <Stack.Screen
      options={{
        title,
        unstable_headerRightItems: () =>
          select === null ? [] : [{ type: "custom", element: select, hidesSharedBackground: true }],
        headerRight: () => select,
      }}
    />
  );
}

/** The page's name, and while it picks, how many are picked. */
function pickTitle(picking: boolean, count: number): string {
  if (!picking) return "Archived";
  return count === 0 ? "Select agents" : `${count} selected`;
}

const styles = StyleSheet.create({
  list: { paddingBottom: SPACE.xxl * 2 },
  note: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
  },
});
