/**
 * The spaces tab, and the index route, so it is where the app opens (ADR 0065). The list itself
 * is `src/spaces/List.tsx`; this is the route.
 *
 * On a wide screen the list and the room sit side by side, and the room open, and an agent's card
 * over it, are kept by the tabs (`ui/opened.tsx`), so a room is still open when Spaces is come back
 * to (ADR 0177). A link, a push and a search result ask for a room with `?space=`, as they did when
 * that param was where it was kept, and land the same way as a row in the list.
 */

import { listRuns, mayOpenSpace, myRole, type Store, serverHost, spaceList } from "@chipschat/core";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AgentPane } from "../../src/agents/AgentPane";
import { useLanding } from "../../src/pairing/landing";
import { List } from "../../src/spaces/List";
import { RoomPane } from "../../src/spaces/RoomPane";
import { stepSpace } from "../../src/spaces/step";
import { useChips, useDeferredSnapshot } from "../../src/store/provider";
import { useChrome } from "../../src/ui/chrome";
import { useLayout } from "../../src/ui/layout";
import { useMenuCommand } from "../../src/ui/menuBar";
import { useOpened } from "../../src/ui/opened";
import { PaneEmpty } from "../../src/ui/Pane";
import { Split, THIRD, useListBesideThird, useThirdFits } from "../../src/ui/Split";
import { usePalette } from "../../src/ui/theme";

export default function SpacesScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  return (
    <Spaces
      store={paired.store}
      selfId={paired.device.participantId}
      server={serverHost(paired.device.serverUrl)}
    />
  );
}

/**
 * How a room stands beside the list: the list put away from the room's bar (ADR 0256), while there
 * is a room to give the window to, or stepped aside for the room's details where the room would be
 * too narrow beside both (ADR 0276); and how wide the details, or its Universe, stand beside the
 * room, so the capsule knows how wide the room is under it.
 */
function useRoomBeside(room: boolean): { readonly away: boolean; readonly docked: number } {
  const { listHidden, details, universe } = useChrome();
  const thirdFits = useThirdFits();
  const listBeside = useListBesideThird();
  const docked = room && (details || universe) && thirdFits;
  return { away: room && (listHidden || (docked && !listBeside)), docked: docked ? THIRD : 0 };
}

function Spaces({
  store,
  selfId,
  server,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly server: string | undefined;
}) {
  const snapshot = useDeferredSnapshot(store);
  const router = useRouter();
  const palette = usePalette();
  const { wide } = useLayout();
  // Where to land in the room, and what to open it on: each asked for once, with the room.
  const { at, words, add, sheet } = useLocalSearchParams<{
    at?: string;
    words?: string;
    add?: string;
    sheet?: string;
  }>();
  const [opened, go] = useOpened("spaces", SPACES_OPEN);
  const { space, agent, history } = opened;
  // A room opened is the top of the pane: whatever was over the last one goes with it, and so does
  // where a link said to land in the last one.
  const open = (id: string) => {
    go({ space: id });
    if (at !== undefined || words !== undefined)
      router.setParams({ at: undefined, words: undefined });
  };
  // A space a link brought this person into opens once it is here (ADR 0168).
  useLanding(
    (id) => snapshot.model.spaces.some((each) => each.id === id),
    (id) => (wide ? open(id) : router.push(`/spaces/${id}`)),
  );
  // A room deleted while it was open beside the list (ADR 0067), here or on another device: the
  // pane says to choose one rather than drawing a room that is not there.
  const shown = snapshot.model.spaces.some((each) => each.id === space) ? space : undefined;
  useSpaceSteps(wide, snapshot, shown, open);
  const { away, docked } = useRoomBeside(shown !== undefined);
  if (!wide) return <List store={store} snapshot={snapshot} selfId={selfId} server={server} />;
  const close = () => go({});
  // An agent's card opened from the room stands over it in the pane, with the way back to it, as a
  // phone pushes the card over the room (ADR 0177); the room stays drawn under it, where it was.
  const back = () => go({ space: shown });
  const card =
    shown === undefined || agent === undefined ? null : (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
        <AgentPane
          store={store}
          snapshot={snapshot}
          agentId={agent}
          selfId={selfId}
          history={history !== undefined}
          onBack={history === undefined ? back : () => go({ space: shown, agent })}
          onHistory={() => go({ space: shown, agent, history: "1" })}
          onOpenRoom={(id) => (id === shown ? back() : open(id))}
          onOpenAgent={(other) => go({ space: shown, agent: other })}
          onOpenHarness={(harnessId) => router.push(`/harnesses/${harnessId}`)}
          onDeleted={back}
        />
      </View>
    );
  return (
    <Split
      tab="index"
      away={away}
      docked={docked}
      list={
        <List
          store={store}
          snapshot={snapshot}
          selected={shown}
          onOpen={open}
          selfId={selfId}
          server={server}
        />
      }
      detail={
        shown === undefined ? (
          <PaneEmpty icon="chat" title="No space open">
            {mayOpenSpace(myRole(snapshot.model, selfId))
              ? "Choose a space on the left, or make one with +."
              : "Choose a space on the left."}
          </PaneEmpty>
        ) : (
          <View style={styles.fill}>
            <RoomPane
              key={shown}
              store={store}
              spaceId={shown}
              selfId={selfId}
              onOpen={open}
              onOpenAgent={(id) => go({ space: shown, agent: id })}
              onClose={close}
              at={at}
              words={words}
              add={add === "1"}
              sheet={sheet === "1"}
              onDetails={(item) => router.push(`/needs/${item.id}`)}
            />
            {card}
          </View>
        )
      }
    />
  );
}

/** What says what is open beside Spaces: the room, and an agent's card over it. */
const SPACES_OPEN = ["space", "agent", "history"] as const;

/**
 * Previous Space and Next Space, from the menu bar or ⌥↑ ⌥↓ (ADR 0256): along the rooms the list
 * shows first, pinned and then the most recently busy, while Spaces is in front beside a room.
 */
function useSpaceSteps(
  wide: boolean,
  snapshot: ReturnType<typeof useDeferredSnapshot>,
  shown: string | undefined,
  open: (id: string) => void,
) {
  const focused = useIsFocused();
  const order = useMemo(
    () =>
      listRuns(spaceList(snapshot.model), snapshot.hiddenSpaces, snapshot.pinnedSpaces).open.map(
        (each) => each.id,
      ),
    [snapshot.model, snapshot.hiddenSpaces, snapshot.pinnedSpaces],
  );
  const step = (by: 1 | -1) => () => {
    const to = stepSpace(order, shown, by);
    if (to !== undefined) open(to);
  };
  const able = wide && focused && order.length > 0;
  useMenuCommand("previous-space", able ? step(-1) : undefined);
  useMenuCommand("next-space", able ? step(1) : undefined);
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
