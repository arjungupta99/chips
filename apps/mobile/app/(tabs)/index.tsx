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
import { useDeferredValue, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AgentPane } from "../../src/agents/AgentPane";
import { useLanding } from "../../src/pairing/landing";
import { useWordsLead } from "../../src/spaces/heldWidth";
import { List } from "../../src/spaces/List";
import { RoomPane } from "../../src/spaces/RoomPane";
import { stepSpace } from "../../src/spaces/step";
import { useChips, useDeferredSnapshot } from "../../src/store/provider";
import { useChrome } from "../../src/ui/chrome";
import { useLayout } from "../../src/ui/layout";
import { useMenuCommand } from "../../src/ui/menuBar";
import { useOpened } from "../../src/ui/opened";
import { PaneEmpty } from "../../src/ui/Pane";
import { PaneLead } from "../../src/ui/PaneMotion";
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
  const { space, agent, history, permissions } = opened;
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
  // The panes wait for the room's words to go before they move (ADR 0279), while the room is what
  // the pane shows rather than an agent's card over it.
  const lead = useWordsLead(shown !== undefined && agent === undefined);
  const { room, asked } = useDrawnRoom(shown, { at, words, add, sheet });
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
          permissions={permissions !== undefined}
          // From the room's band, back is the room; from the card, the card (ADR 0286).
          onBack={
            history !== undefined || permissions === "card"
              ? () => go({ space: shown, agent })
              : back
          }
          onHistory={() => go({ space: shown, agent, history: "1" })}
          onPermissions={() => go({ space: shown, agent, permissions: "card" })}
          onOpenRoom={(id) => (id === shown ? back() : open(id))}
          onOpenAgent={(other) => go({ space: shown, agent: other })}
          onOpenHarness={(harnessId) => router.push(`/harnesses/${harnessId}`)}
          onDeleted={back}
        />
      </View>
    );
  return (
    <PaneLead.Provider value={lead}>
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
          room === undefined ? (
            <PaneEmpty icon="chat" title="No space open">
              {mayOpenSpace(myRole(snapshot.model, selfId))
                ? "Choose a space on the left, or make one with +."
                : "Choose a space on the left."}
            </PaneEmpty>
          ) : (
            <View style={styles.fill}>
              <RoomPane
                key={room}
                store={store}
                spaceId={room}
                selfId={selfId}
                onOpen={open}
                onOpenAgent={(id) => go({ space: room, agent: id })}
                onOpenPermissions={(id) => go({ space: room, agent: id, permissions: "room" })}
                onClose={close}
                {...asked}
                onDetails={(item) => router.push(`/needs/${item.id}`)}
              />
              {card}
            </View>
          )
        }
      />
    </PaneLead.Provider>
  );
}

/**
 * The room drawn beside the list: a step behind the one picked, so the row lights at once and the
 * room is drawn behind that. Drawing a room takes a few hundred milliseconds, and nothing on the
 * screen answered the tap until it had (the iPad simulator, 8 November 2026). A room still being
 * drawn is let go for the next one tapped. What a link asked of a room goes to that room, and not
 * to the one still standing here.
 */
function useDrawnRoom(
  shown: string | undefined,
  link: {
    readonly at?: string | undefined;
    readonly words?: string | undefined;
    readonly add?: string | undefined;
    readonly sheet?: string | undefined;
  },
) {
  const room = useDeferredValue(shown);
  const asked =
    room === shown
      ? { at: link.at, words: link.words, add: link.add === "1", sheet: link.sheet === "1" }
      : UNASKED;
  return { room, asked };
}

const UNASKED = { at: undefined, words: undefined, add: false, sheet: false };

/** What says what is open beside Spaces: the room, and an agent's card over it. */
const SPACES_OPEN = ["space", "agent", "history", "permissions"] as const;

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
