/**
 * The Agents tab (ADR 0087, Phase 5, the tab Arjun picked on 30 September 2026): the harnesses on
 * a shelf, then every agent in the workspace. Harnesses until then.
 *
 * - **The harnesses.** A shelf of tiles pushed sideways, each opening its harness's page, with
 *   Connect a harness at its end and View all under it for their cards (ADR 0185,
 *   `harnesses/Shelf`). Their cards stood at the foot of the tab until 17 October 2026, three
 *   screens down on Arjun's server.
 * - **The Main agents.** J, which lives in its Main room, first, each wearing the Main tag (ADR
 *   0145) rather than standing under a heading of its own.
 * - **Agents.** Free ones first, since they want a room, then in the order their rooms last
 *   spoke, as Spaces is. Under each name its harness, and its room when the room isn't named
 *   after it; a free one says so in amber, with how many of its words wait.
 * - **Archived · N.** One row, which opens them.
 *
 * Which agents, in what order, and the words under each are core's (`agentsTab`), so the phone and
 * the desktop list the same agents the same way.
 *
 * Pressing and holding an agent's row changes its face (ADR 0089), as it does a room's on Spaces.
 * A guest's rows take no long press: a guest changes nothing about the workspace. Pushing a row
 * left shows Archive and Delete (ADR 0095), to whoever may (`Keep`); a locked agent's shows Locked
 * (ADR 0199), which opens its card with the lock's row glowing, pushed on a phone and beside the
 * list on a wide screen, as a tap opens it. Select, beside the name, picks agents to archive or
 * delete together (ADR 0182, `Picking`), as Spaces picks rooms; never a locked one.
 *
 * All of it is the directory, which this phone keeps from the server's last answer (14 October
 * 2026): a launch lists what it kept at once, offline too. Before the first answer it ever had,
 * the tab said "Agents · 0" and "No agents yet", which was never true; now core's `agentsLook`
 * says what to show instead — blank agents with their pins lit in turn while the list is on its
 * way (`Arriving`), why the server cannot be asked (as Spaces says it, ADR 0131), or that the
 * answer did not come, with Try again — and "No agents yet" only on the server's word.
 */

import {
  type AgentRow as AgentRowData,
  type AgentsTab,
  administers,
  agentsLook,
  agentsTab,
  guestAgentsWords,
  myRole,
  ownsWorkspace,
  patientLook,
  type ShownAgents,
  type Snapshot,
  type Store,
  troubled,
  type WorkspaceRole,
} from "@chipschat/core";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { thisDevice } from "../device/word";
import { useConnect } from "../harnesses/Connect";
import { Shelf } from "../harnesses/Shelf";
import { PlusRoom } from "../newSpace/plusRoom";
import type { Asker } from "../spaces/Dust";
import { Arrive, Centred, SAYING, type Saying, Telling } from "../spaces/NoRooms";
import { keepLeaving } from "../spaces/picking";
import { ListCorner, PickBar, PickNote, PickRoom } from "../spaces/Selecting";
import { ListDust, type PickMark, PickMotion, StepBack } from "../spaces/SelectMotion";
import { actSet, NO_ACTS, type SpaceAct } from "../spaces/SwipeRow";
import type { Leaving, Picking } from "../spaces/usePick";
import { useDeferredSnapshot } from "../store/provider";
import { Button } from "../ui/Button";
import type { SheetFrom } from "../ui/beside";
import { ChipPulse } from "../ui/ChipPulse";
import { ConnectionMark, type MarkedBy } from "../ui/Connection";
import { Screen, UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { usePatience } from "../ui/usePatience";
import { useSteady } from "../ui/useSteady";
import { AgentRow, SectionHeading } from "./AgentRow";
import { Arriving } from "./Arriving";
import { FaceSheet } from "./FaceSheet";
import { type Keep, KeepRow, useKeep } from "./Keep";
import { AgentsBatch, Going, pickOf, useAgentPicking } from "./Picking";

export function Agents({
  store,
  selfId,
  selected,
  onOpen,
  onOpenLocked,
  onOpenHarness,
  onAllHarnesses,
  server,
  noRelay,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** This device knows no relay, so the connection's sheet says it reaches the server only at home. */
  readonly noRelay?: boolean | undefined;
  /** Where the server is, as a person would know it, for the connection's sheet. */
  readonly server?: string | undefined;
  /** The agent or harness open beside this list, on a wide screen. */
  readonly selected?: string | undefined;
  /** What opening an agent means here. Absent, it is pushed, which is what a phone does. */
  readonly onOpen?: ((agentId: string) => void) | undefined;
  /**
   * What a locked agent's Locked opens (ADR 0199): its card, with the lock's row glowing. Absent,
   * it is pushed with `lock=1`.
   */
  readonly onOpenLocked?: ((agentId: string) => void) | undefined;
  readonly onOpenHarness?: ((harnessId: string) => void) | undefined;
  /** What View all under the shelf means here. Absent, the harnesses' list is pushed. */
  readonly onAllHarnesses?: (() => void) | undefined;
}) {
  const snapshot = useDeferredSnapshot(store);
  const opens = useOpens({ onOpen, onOpenLocked, onOpenHarness, onAllHarnesses });
  const column = useColumn();
  // How many words wait for each free agent is read with the directory, so it is read again here.
  useFocusEffect(
    useCallback(() => {
      void store.refreshDirectory();
    }, [store]),
  );
  // The agent whose face is being chosen, while its sheet is up.
  // The agent whose face is being chosen, and where its row was pressed and held.
  const [facing, setFacing] = useState<{
    readonly agentId: string;
    readonly from: SheetFrom;
  }>();
  const keep = useKeep(store, snapshot, selfId, { onLocked: opens.locked });
  const tab = agentsTab(snapshot.model, snapshot.directory, selfId);
  const rows = [...tab.leads, ...tab.agents];
  const picks = useAgentPicking({
    store,
    snapshot,
    selfId,
    items: rows,
    visible: rows,
    runOf: (row) => (row.lead ? "main" : "agents"),
    closeRow: keep.closeOpen,
  });
  const { picking } = picks;
  const look = agentsLook(snapshot);
  // Trouble on the first load is said once it has lasted, not for a launch's blip (`patientLook`).
  const told = usePatience(look === "listed" || look === "reading", troubled(look));
  const shown = patientLook(look, snapshot.connection, told);
  const stoodIn = useStoodIn(shown);
  // The body says what the connection is doing, so the bar's mark need not say it as well.
  const telling = tellsConnection(shown);
  // Select stands only where there is a list, and something in it that could be picked.
  const selects = shown === "listed" && (picking || picks.any);
  const connection = (by?: MarkedBy) => (
    <ConnectionMark
      state={snapshot.connection}
      link={snapshot.link}
      lostAt={snapshot.lostAt}
      server={server}
      noRelay={noRelay}
      owner={ownsWorkspace(snapshot.directory, selfId)}
      onRetry={store.wake}
      {...by}
    />
  );

  return (
    <Screen
      title={pickTitle(picking, picks.chosen.length)}
      glass
      action={
        telling && !selects ? undefined : (
          <ListCorner
            select={
              selects
                ? {
                    picking,
                    onPress: picking ? picks.stop : picks.start,
                    testID: "select-agents",
                  }
                : undefined
            }
            state={snapshot.connection}
            telling={telling}
            connection={connection}
          />
        )
      }
      under={picks.under}
    >
      <UnderName
        // The window's inset, not this layout's: the tab bar is glass over the list. While
        // picking the tab bar is gone and the bar of acts stands there, which the list makes room
        // for itself.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.list, column]}
      >
        {shown !== "listed" ? (
          <NotListed look={shown} store={store} server={server} />
        ) : (
          <Arrive fade={stoodIn}>
            <PickMotion.Provider value={picks.motion}>
              <Listed
                snapshot={snapshot}
                selfId={selfId}
                tab={tab}
                selected={selected}
                keep={keep}
                picking={picks.row}
                live={picking}
                going={picks.going}
                opens={opens}
                onFace={(agentId, from) => setFacing({ agentId, from })}
              />
            </PickMotion.Provider>
          </Arrive>
        )}
        <PlusRoom />
        <PickRoom shown={picking} />
      </UnderName>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ListDust dust={picks.dust} />
      </View>
      <PickBar shown={picking} left={picks.left} erase={picks.erase} />
      <PickNote note={picks.note} onGone={picks.clearNote} />
      <AgentsBatch store={store} snapshot={snapshot} selfId={selfId} sheet={picks.sheet} />
      <FaceSheet
        store={store}
        snapshot={snapshot}
        agentId={facing?.agentId}
        from={facing?.from}
        onClose={() => setFacing(undefined)}
      />
      {keep.sheet}
    </Screen>
  );
}

/**
 * What opening an agent, a locked one's card from its Locked, a harness, or every harness's list
 * does from the tab.
 */
interface Opens {
  readonly agent: (agentId: string) => void;
  readonly locked: (agentId: string) => void;
  readonly harness: (harnessId: string) => void;
  readonly harnesses: () => void;
}

/** What the tab was told opening means, on a wide screen; pushed, which is what a phone does. */
function useOpens(told: {
  readonly onOpen?: ((agentId: string) => void) | undefined;
  readonly onOpenLocked?: ((agentId: string) => void) | undefined;
  readonly onOpenHarness?: ((harnessId: string) => void) | undefined;
  readonly onAllHarnesses?: (() => void) | undefined;
}): Opens {
  const router = useRouter();
  return {
    agent: told.onOpen ?? ((id) => router.push(`/agents/${id}`)),
    locked:
      told.onOpenLocked ??
      ((id) => router.push({ pathname: "/agents/[id]", params: { id, lock: "1" } })),
    harness: told.onOpenHarness ?? ((id) => router.push(`/harnesses/${id}`)),
    harnesses: told.onAllHarnesses ?? (() => router.push("/harnesses")),
  };
}

/** The tab's name, and while it picks, how many are picked. */
function pickTitle(picking: boolean, count: number): string {
  if (!picking) return "Agents";
  return count === 0 ? "Select agents" : `${count} selected`;
}

/** The agents and harnesses, once the server has said who they are, now or when last asked. */
function Listed({
  snapshot,
  selfId,
  tab,
  selected,
  keep,
  picking,
  live,
  going,
  opens,
  onFace,
}: {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly tab: AgentsTab;
  readonly selected: string | undefined;
  readonly keep: Keep;
  /** What the rows are drawn with, which catches up with Select once they have moved (`usePick`). */
  readonly picking: Picking<AgentRowData>;
  /** Whether the tab picks, as Select and Done last said. */
  readonly live: boolean;
  readonly going: ReturnType<typeof useAgentPicking>["going"];
  readonly opens: Opens;
  readonly onFace: (agentId: string, from: SheetFrom) => void;
}) {
  const router = useRouter();
  const archived = tab.archived.here.length + tab.archived.elsewhere.length;
  // Agents archived or deleted, held where they stood until they have gone (`usePick`).
  const agents = keepLeaving(tab.agents, [...going.leaving.values()]);
  const role = myRole(snapshot.model, selfId);
  const faces = role !== "guest";
  const decides = administers(role);
  const adding = useConnect();
  const same = useSameRows();
  // What a press does is asked of the tab as it is now, not of the row: the rows are drawn again for
  // picking only once they have moved (`usePick`). A swipe begun in the meantime goes home.
  const on = useSteady<AgentRowHandlers>({
    press: (agentId) => {
      if (!live) {
        opens.agent(agentId);
        return;
      }
      const row = [...tab.leads, ...agents].find((each) => each.id === agentId);
      if (row !== undefined) picking.onPick(row);
    },
    face: (agentId, from) => {
      if (!live) onFace(agentId, from);
    },
    act: keep.act,
    opened: (row) => {
      if (live) row.close();
      else keep.onOpened(row);
    },
    closed: keep.onClosed,
    folded: going.onFolded,
    dusted: going.onDusted,
  });
  // A Main agent is pushed for nothing: it keeps no swipe (`keeps`).
  const rowOf = (row: AgentRowData, at: number, keeps: boolean) => {
    const pick = pickOf(row, picking, snapshot.directory);
    return (
      <ListedAgent
        key={row.id}
        row={same(row)}
        first={at === 0}
        selected={row.id === selected}
        faces={faces}
        keeps={keeps}
        acts={keeps ? actSet(keep.acts(row.id)) : NO_ACTS}
        active={pick.active}
        mark={pick.mark}
        dim={pick.dim}
        shake={pick.shake}
        leaving={going.leaving}
        dust={going.dust}
        on={on}
      />
    );
  };
  return (
    <>
      {role === "guest" ? null : (
        // A guest runs no harness and may change none: the shelf opened pages with a dial they
        // could not turn and a Pause (the guest walk, 18 October 2026; ADR 0196).
        <StepBack back={live}>
          <Shelf
            snapshot={snapshot}
            tab={tab}
            selected={selected}
            adding={decides ? adding : undefined}
            onOpen={opens.harness}
            onAll={opens.harnesses}
          />
        </StepBack>
      )}
      {tab.leads.map((row, at) => rowOf(row, at, false))}
      <SectionHeading>{`Agents · ${tab.agents.length}`}</SectionHeading>
      {agents.length === 0 ? (
        <None>{emptyWords(role, tab.leads.length > 0)}</None>
      ) : (
        agents.map((row, at) => rowOf(row, at, true))
      )}
      <GuestFoot words={guestAgentsWords(snapshot.model, snapshot.directory, selfId, tab)} />
      <StepBack back={live}>
        {archived === 0 ? null : (
          <Fold
            words={`Archived · ${archived}`}
            onPress={() => router.push("/agents/archived")}
            testID="archived-agents"
          />
        )}
      </StepBack>
    </>
  );
}

/** What an agent's row does when pressed, pushed or gone: one object for the tab's life. */
interface AgentRowHandlers {
  /** Picks the agent while the tab picks, and opens it otherwise. */
  readonly press: (agentId: string) => void;
  /** Pressed and held: its face is changed (ADR 0089). */
  readonly face: (agentId: string, from: SheetFrom) => void;
  readonly act: Keep["act"];
  readonly opened: Keep["onOpened"];
  readonly closed: Keep["onClosed"];
  readonly folded: (agentId: string) => void;
  readonly dusted: (agentId: string) => void;
}

/**
 * The same object for a row that says the same, though the tab is made afresh from the snapshot at
 * every draw (`agentsTab`), so `memo` holds a row whose agent has not changed.
 */
function useSameRows(): (row: AgentRowData) => AgentRowData {
  const held = useRef(new Map<string, AgentRowData>());
  return (row) => {
    const was = held.current.get(row.id);
    if (was !== undefined && sameFields(was, row)) return was;
    held.current.set(row.id, row);
    return row;
  };
}

function sameFields(a: AgentRowData, b: AgentRowData): boolean {
  const keys = Object.keys(a) as (keyof AgentRowData)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * An agent's row on the tab, Main or not: drawn again only when what it shows changes, not each
 * time the store hears anything, which drew all of them twice for every message sent in a room
 * opened over the tab (the simulator, 19 October 2026: 66 rows, some 1,300 animated views).
 */
const ListedAgent = memo(function ListedAgent({
  row,
  first,
  selected,
  faces,
  keeps,
  acts,
  active,
  mark,
  dim,
  shake,
  leaving,
  dust,
  on,
}: {
  readonly row: AgentRowData;
  readonly first: boolean;
  readonly selected: boolean;
  /** Its face can be changed by a long press: not by a guest (ADR 0196). */
  readonly faces: boolean;
  /** It can be pushed for its acts, and is held as it goes: not a Main agent. */
  readonly keeps: boolean;
  readonly acts: readonly SpaceAct[];
  readonly active: boolean;
  readonly mark: PickMark;
  readonly dim: boolean;
  readonly shake: number;
  readonly leaving: ReadonlyMap<string, Leaving<AgentRowData>>;
  readonly dust: Asker;
  readonly on: AgentRowHandlers;
}) {
  const pick = { active, mark, dim, shake, onPick: () => on.press(row.id) };
  const onLongPress = faces ? on.face : undefined;
  if (!keeps) {
    return (
      <AgentRow
        row={row}
        first={first}
        selected={selected}
        onPress={on.press}
        onLongPress={onLongPress}
        pick={pick}
      />
    );
  }
  const keep = { acts: () => acts, act: on.act, onOpened: on.opened, onClosed: on.closed };
  const going = { leaving, dust, onFolded: on.folded, onDusted: on.dusted };
  return (
    <Going row={row} going={going}>
      {(away, cover) => (
        <KeepRow
          keep={keep}
          row={row}
          first={first}
          selected={selected}
          onPress={on.press}
          onLongPress={onLongPress}
          still={active || away}
          gone={away}
          pick={pick}
          cover={cover}
        />
      )}
    </Going>
  );
});

/**
 * Whether something stood in for the list, so that it fades in over it when it comes, and is
 * simply there when it was there from the first frame — on a launch, the kept list is what the
 * launch picture dissolves into, and a fade on top of that is a second arrival (as Spaces').
 */
function useStoodIn(look: ShownAgents): boolean {
  const stoodIn = useRef(false);
  const standing = look !== "listed" && look !== "reading";
  useEffect(() => {
    if (standing) stoodIn.current = true;
  }, [standing]);
  return stoodIn.current;
}

/** Whether the body says why the server can't be asked, as Spaces' does (`tellsConnection`). */
function tellsConnection(
  look: ShownAgents,
): look is Exclude<ShownAgents, "reading" | "listed" | "fetching" | "failed"> {
  return look !== "reading" && look !== "listed" && look !== "fetching" && look !== "failed";
}

/** What Spaces says when the server can't be asked, with the agents in place of the spaces. */
const SAYING_HERE: Readonly<Record<keyof typeof SAYING, Saying>> = {
  ...SAYING,
  connecting: { ...SAYING.connecting, words: "Your agents will show here as soon as it answers." },
  closed: {
    ...SAYING.closed,
    words: `Your agents will show here as soon as it answers. ${thisDevice(true)} keeps trying on its own.`,
  },
  asleep: {
    ...SAYING.asleep,
    words:
      "The relay can't find it: the computer Chips runs on is asleep or switched off. Your agents will show here when it wakes.",
  },
};

/** What stands where the list will be, until this phone has ever had the server's word on it. */
function NotListed({
  look,
  store,
  server,
}: {
  readonly look: Exclude<ShownAgents, "listed">;
  readonly store: Store;
  readonly server: string | undefined;
}) {
  if (look === "reading") return null;
  if (look === "fetching") return <Arriving />;
  if (look === "failed") return <Failed onRetry={store.refreshDirectory} />;
  return (
    <Telling
      look={look}
      saying={SAYING_HERE[look]}
      caption={look === "rejected" || look === "removed" ? undefined : server}
      onRetry={store.wake}
      testID="no-agents"
    />
  );
}

/**
 * The server is there and the list did not come: say so, and ask again on a tap. The mark works
 * while it asks, as the connection's does while it reaches the server.
 */
function Failed({ onRetry }: { readonly onRetry: () => Promise<void> }) {
  const palette = usePalette();
  const [asking, setAsking] = useState(false);
  const retry = () => {
    if (asking) return;
    setAsking(true);
    void onRetry().finally(() => setAsking(false));
  };
  return (
    <Centred
      testID="no-agents-failed"
      title="Couldn't load your agents"
      words="Your server is connected, but its list of agents didn't come through. Trying again usually does it."
      mark={<ChipPulse gold={palette.ink4} ink={palette.ink3} lit={palette.ink} working={asking} />}
    >
      <View style={styles.button}>
        <Button
          label={asking ? "Trying…" : "Try again"}
          disabled={asking}
          style={styles.big}
          onPress={retry}
        />
      </View>
    </Centred>
  );
}

/** Under a guest's agents, whose they are (`guestAgentsWords`, ADR 0196); nothing for anybody else. */
function GuestFoot({ words }: { readonly words: string | undefined }) {
  const palette = usePalette();
  if (words === undefined) return null;
  return (
    <Text style={[styles.foot, { color: palette.ink3 }]} testID="agents-guest-foot">
      {words}
    </Text>
  );
}

/** A section with nothing in it, said under its heading rather than a screen's height below. */
function None({ children }: { readonly children: string }) {
  const palette = usePalette();
  return <Text style={[styles.none, { color: palette.ink3 }]}>{children}</Text>;
}

/**
 * What an empty tab says: an owner or admin can bring an agent in from the shelf (ADR 0122). Under
 * the Main agents listed above it, "No agents yet" said the opposite of the tab (the setup audit,
 * 17 October 2026, M3): it says where more come from, to whoever can make them: the + is an owner's
 * or an admin's, Add in a room anybody's but a guest's (ADR 0196).
 */
export function emptyWords(role: WorkspaceRole | undefined, mainAgents = false): string {
  const decides = administers(role);
  if (mainAgents) {
    if (decides)
      return "None besides the Main agents yet. The + makes more, and so does Add in a space.";
    return role === "guest"
      ? "None besides the Main agents yet."
      : "None besides the Main agents yet. Add in a space makes more.";
  }
  return decides
    ? "No agents yet. Connect a harness from the shelf, or allow one that asks."
    : "No agents yet. A harness's agents come when it connects.";
}

/** A row that opens a list of its own: `Archived · 51 ›`, as Spaces folds its archived rooms. */
export function Fold({
  words,
  onPress,
  testID,
}: {
  readonly words: string;
  readonly onPress: () => void;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.fold,
        { backgroundColor: pressed ? palette.surface3 : palette.surface2 },
      ]}
    >
      <Text style={[styles.foldWords, { color: palette.ink2 }]}>{words}</Text>
      <Text style={[styles.chevron, { color: palette.ink4 }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: SPACE.xxl * 2 },
  // The connection's mark, when there is one, and Select.
  none: {
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * 1.4),
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.sm,
  },
  foot: {
    fontSize: TEXT.sm,
    lineHeight: Math.round(TEXT.sm * 1.4),
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
  },
  button: { marginTop: SPACE.xxl },
  // The one thing to do on a screen with nothing else on it, as Spaces' (`NoRooms`).
  big: { minHeight: 50, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.xxl },
  fold: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: 14,
  },
  foldWords: { fontSize: TEXT.body },
  chevron: { fontSize: TEXT.body + 4 },
});
