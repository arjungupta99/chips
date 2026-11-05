/**
 * A space in the detail half of a wide screen's split: the phone's room, beside the list (ADR
 * 0177).
 *
 * The same room as a phone's in everything but where it stands. Its name floats in the room's
 * glass capsule with who is in there under it, and opens the room's sheet; the connection's mark
 * stands at the bar's trailing end; the conversation runs up under both on the band of blur a
 * phone's room stands its bar on. It stops short of the iPad's own tab bar, above them
 * (`useTabTop`): a list that runs under the system's bar is given the system's edge effect, and on
 * a room's list, which is drawn upside down, that washed the whole conversation pale (the iPad
 * simulator, 16 October 2026; the phone's room turns it off on its own bar, `app/spaces/[id].tsx`,
 * which a tab's bar has no option for). Its band of blur still runs on up under the tab bar to the
 * window's top (`bandReach`), so what passes under the name is not cut off in a line there.
 *
 * A room made empty from the + opens on its Add, a locked room's Locked opens its sheet, and the
 * new-space window dissolves into the room once it has drawn itself, as on a phone
 * (`RoomHead.tsx`). Where there is no glass the bar stands above the room, ruled, as a pane's
 * does.
 *
 * On an iPad the bar has a button each side of the name (ADR 0256): at its left, put the list away
 * and give the room the window, or bring it back; at its right, the space's details. They are the
 * split's third column (ADR 0276), 420 across on the room's right, the room's sheet standing in it
 * (`SheetDock`), and they stay open from space to space until closed, as an inspector does. The room
 * narrows for them, and where it would be left under 540 the list steps aside while they stand
 * (`useListBesideThird`, `app/(tabs)/index.tsx`): upright, where they were a popover over the room
 * until 3 November 2026. A row in them pushes its page inside the column, as the sheet's pages do.
 * Where there is no room for a third column (an iPad mini upright), the button opens the sheet, as
 * the name does.
 *
 * Beside Search's results the room is seen before it is gone to (ADR 0256): at the line found, the
 * words ringed in gold as in Spaces, with Open in Spaces where those two buttons stand. Its details
 * are the sheet there, and the list stays.
 *
 * A thread the log holds — opened before 15 September 2026, or by a harness — is named as one,
 * with a way back to the space it grew from: the same words the pushed screen uses on a phone,
 * because a screen that looks exactly like the space it grew from, and is not it, is the one
 * place somebody can send a reply to the wrong audience without noticing. Neither client offers
 * to open one (ADR 0035's addendum).
 */

import { type NeedsYouItem, ownsWorkspace, type Store, serverHost } from "@chipschat/core";
import { useIsFocused, useRouter } from "expo-router";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChips } from "../store/provider";
import { ConnectionMark, useMarking } from "../ui/Connection";
import { useChrome } from "../ui/chrome";
import { Capsule, useGlassy } from "../ui/Glass";
import { MarkBeside } from "../ui/MarkBeside";
import { useMenuCommand } from "../ui/menuBar";
import { PANE_BAR, PaneBar, PaneButton, PaneWordsButton } from "../ui/Pane";
import { SheetDock } from "../ui/Sheet";
import { THIRD, useThirdFits } from "../ui/Split";
import { usePalette } from "../ui/theme";
import { useTabTop } from "../ui/windowInsets";
import { RoomDrop } from "./RoomDrop";
import { type Room, RoomName, UniverseButton, useRoom } from "./RoomHead";
import { RoomSheet } from "./RoomSheet";
import { SpaceView } from "./SpaceView";
import { UniverseSheet } from "./Universe";
import { useUniverseCall } from "./universeSeen";

export function RoomPane({
  store,
  spaceId,
  selfId,
  onOpen,
  onOpenAgent,
  onClose,
  at,
  words,
  add = false,
  sheet = false,
  onDetails,
  preview,
  onGoTo,
}: {
  readonly store: Store;
  readonly spaceId: string;
  readonly selfId: string;
  /** Open another space in this same pane: a lane's other end, or the space a thread grew from. */
  readonly onOpen: (spaceId: string) => void;
  /** Open an agent's card over the room, in this same pane, with the way back to the room. */
  readonly onOpenAgent: (agentId: string) => void;
  /** The room is gone from under the reader: left, or taken out and seen. The pane empties. */
  readonly onClose: () => void;
  /** Where to land in it, as a link or a push says it. */
  readonly at?: string | undefined;
  /** What a search looked for, when it opened the room at a message (ADR 0133). */
  readonly words?: string | undefined;
  /** A room made empty from the +: it opens on its Add (ADR 0148). */
  readonly add?: boolean | undefined;
  /** A locked room's Locked on Spaces: it opens on its sheet (ADR 0156). */
  readonly sheet?: boolean | undefined;
  readonly onDetails?: ((item: NeedsYouItem) => void) | undefined;
  /**
   * Seen from Search beside its results (ADR 0256): Open in Spaces, in place of the list's and the
   * details' buttons.
   */
  readonly preview?: (() => void) | undefined;
  /** A line its sheet goes to: the route's `at`, unless the pane keeps where it is itself. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const router = useRouter();
  const { paired } = useChips();
  // Beside the list the room does not slide in: it has landed as it is drawn.
  const room = useRoom({ store, spaceId, selfId, add, sheet, landed: true });
  const { snapshot, space, name } = room;
  const glassy = useGlassy();
  const {
    marking,
    room: markRoom,
    markedBy,
  } = useMarking(snapshot.connection, space?.project !== undefined);
  const top = useTabTop();
  // The bar's own height, measured, as the phone's is: a larger text size makes it taller.
  const [bar, setBar] = useState(PANE_BAR);
  const details = useDetails(room, preview !== undefined);
  // Universe, from the bar's right (ADR 0227), calling while the project has a change for this
  // reader that they haven't opened it at: in the details' column where they have one, in its
  // place (ADR 0276's addendum), and a sheet anywhere else.
  const { universe, setUniverse } = useUniverse(details.docked);
  const universeCall = useUniverseCall(spaceId, space?.project, selfId);
  useRoomCommands(details, space, preview);
  const parent = space?.parentSpaceId;
  const head = (
    <PaneBar
      onBack={parent === undefined ? undefined : () => onOpen(parent)}
      ruled={!glassy}
      ends={barEnds(preview !== undefined, marking, space?.project !== undefined)}
      leading={<ListToggle shown={preview === undefined} />}
      trailing={
        <>
          <Marks
            room={markRoom}
            mark={
              marking ? (
                <ConnectionMark
                  state={snapshot.connection}
                  link={snapshot.link}
                  lostAt={snapshot.lostAt}
                  server={serverHost(paired?.device.serverUrl)}
                  noRelay={paired !== undefined && paired.device.relayUrl === undefined}
                  owner={ownsWorkspace(snapshot.directory, selfId)}
                  onRetry={store.wake}
                  {...markedBy}
                />
              ) : null
            }
            onUniverse={
              space?.project === undefined
                ? undefined
                : // Its button puts it away again, as the details' does (Arjun, 4 November 2026).
                  () => {
                    if (universe) return setUniverse(false);
                    universeCall.opened();
                    setUniverse(true);
                  }
            }
            calling={universeCall.calling}
          />
          <DetailsOrOpen details={details} shown={space !== undefined} preview={preview} />
        </>
      }
    >
      <RoomName room={{ ...room, sheet: { ...room.sheet, show: details.show } }} glassy={glassy} />
    </PaneBar>
  );
  const body = (
    <RoomDrop>
      <SpaceView
        store={store}
        snapshot={snapshot}
        spaceId={spaceId}
        selfId={selfId}
        onOpenSpace={onOpen}
        onOpenAgent={onOpenAgent}
        at={at}
        words={words}
        onDetails={onDetails}
        onTakenSeen={onClose}
        headHeight={glassy ? bar : 0}
        bandReach={glassy ? top : 0}
        onOpenRoom={details.show}
        // A frame on, so what was laid out has been drawn, and the new-space window can go into it.
        onListed={() => requestAnimationFrame(room.drawn)}
        onDrawn={() => requestAnimationFrame(room.drawn)}
      />
    </RoomDrop>
  );
  const sheetUp =
    space === undefined ? null : (
      <RoomSheet
        store={store}
        snapshot={snapshot}
        space={space}
        title={name}
        selfId={selfId}
        open={details.open}
        opensOn={room.sheet.opensOn}
        onClose={details.close}
        files={paired?.files}
        workspace={paired?.device.workspaceName ?? "the workspace"}
        onGoTo={onGoTo ?? ((lineId) => goTo(router, lineId))}
        // An agent's row opens its card over the room, in this pane (ADR 0111's addendum); in the
        // column beside the room, inside the column (ADR 0276).
        onOpenAgent={onOpenAgent}
        onOpenSpace={onOpen}
        onOpenMedia={() => router.push(`/media?space=${encodeURIComponent(space.id)}`)}
        onLeft={onClose}
        from={details.from}
      />
    );
  const universeUp = (
    <UniverseSheet
      store={store}
      space={space}
      selfId={selfId}
      title={name}
      open={universe}
      onClose={() => setUniverse(false)}
    />
  );
  // In a column beside the room, or over the window from the foot; and so is Universe.
  const sheetBeside = details.docked ? (
    <SheetDock.Provider value={THIRD}>
      {sheetUp}
      {universeUp}
    </SheetDock.Provider>
  ) : null;
  const sheetOver = details.docked ? null : (
    <>
      {sheetUp}
      {universeUp}
    </>
  );
  if (!glassy) {
    return (
      <SafeAreaView edges={TOP_AND_RIGHT} style={[styles.pane, { backgroundColor: palette.bg }]}>
        {head}
        <View style={[styles.pane, styles.row]}>
          <View style={styles.pane}>{body}</View>
          {sheetBeside}
        </View>
        {sheetOver}
      </SafeAreaView>
    );
  }
  return (
    <View style={[styles.pane, styles.row, { backgroundColor: palette.bg, paddingTop: top }]}>
      <View style={styles.pane}>
        {body}
        <View
          style={styles.floating}
          pointerEvents="box-none"
          onLayout={(event) => setBar(event.nativeEvent.layout.height)}
        >
          {head}
        </View>
      </View>
      {sheetBeside}
      {sheetOver}
    </View>
  );
}

/** A line the room's sheet goes to, on the route, which the room lands on. */
function goTo(router: ReturnType<typeof useRouter>, lineId: string) {
  router.setParams({ at: `line:${lineId}`, words: undefined });
}

/**
 * How many round buttons the bar's fuller end is as wide as: the list's and the details', or the
 * marks' and Open in Spaces, which is as wide as four.
 */
function barEnds(previewing: boolean, marking: boolean, project: boolean): number {
  if (!previewing) return 2;
  return marking || project ? 5 : 4;
}

/**
 * The menu bar's for a room (ADR 0256): its details and the list, as its bar's buttons do, while
 * Spaces is in front with the room open beside the list. Not for a room seen from a search.
 */
function useRoomCommands(details: Details, space: unknown, preview: (() => void) | undefined) {
  const focused = useIsFocused();
  const { listHidden, setListHidden } = useChrome();
  const on = space !== undefined && preview === undefined && focused;
  useMenuCommand(
    "details",
    on ? details.toggle : undefined,
    details.open ? "Hide Details" : "Show Details",
  );
  useMenuCommand(
    "list",
    on ? () => setListHidden(!listHidden) : undefined,
    listHidden ? "Show List" : "Hide List",
  );
}

/** Put the list away, and the room has the window; or bring it back. Not seen from a search. */
function ListToggle({ shown }: { readonly shown: boolean }) {
  const { listHidden, setListHidden } = useChrome();
  if (!shown) return null;
  return (
    <PaneButton
      icon="sidebar"
      label={listHidden ? "Show the list" : "Hide the list"}
      on={listHidden}
      onPress={() => setListHidden(!listHidden)}
      testID="room-list-toggle"
    />
  );
}

/** The details' button, or Open in Spaces for a room seen from a search. */
function DetailsOrOpen({
  details,
  shown,
  preview,
}: {
  readonly details: Details;
  readonly shown: boolean;
  readonly preview: (() => void) | undefined;
}) {
  if (preview === undefined) return <DetailsToggle details={details} shown={shown} />;
  return (
    <PaneWordsButton
      label="Open in Spaces"
      icon="next"
      onPress={preview}
      testID="room-open-in-spaces"
    />
  );
}

/** The space's details: a column beside the room in a window that wide, the sheet otherwise. */
function DetailsToggle({
  details,
  shown,
}: {
  readonly details: Details;
  /** Not for a room the reader was taken out of, which has none. */
  readonly shown: boolean;
}) {
  if (!shown) return null;
  return (
    <PaneButton
      icon="details"
      label={details.open ? "Hide details" : "Show details"}
      on={details.docked && details.open}
      onPress={details.toggle}
      anchor={details.toggleAt}
      testID="room-details-toggle"
    />
  );
}

interface Details {
  /** They stand in a column beside the room, rather than in a sheet over it. */
  readonly docked: boolean;
  readonly open: boolean;
  readonly show: Room["sheet"]["show"];
  readonly close: () => void;
  readonly toggle: () => void;
  /** The details' button, which a popover it opens stands beside. */
  readonly toggleAt: RefObject<View | null>;
  /**
   * What the popover stands beside, where there is no column for them: the button, when it opened
   * them (ADR 0256, a popover beside what opened it), else the room's name.
   */
  readonly from: RefObject<View | null>;
}

/**
 * The room's sheet, or its details column where the window has room for one. A column once opened
 * stays open from space to space until it is closed (`chrome.tsx`), so it opens on its first page
 * in the next space; a route that opens the sheet (on Add, or on its lock) opens the column.
 */
function useDetails(room: Room, previewing: boolean): Details {
  // Seen from a search, the details are the sheet, and the room folds nothing away.
  const docked = useThirdFits() && !previewing;
  const { details, setDetails } = useChrome();
  const { open: sheetOpen, show: showSheet, close: closeSheet } = room.sheet;
  const open = docked ? details : sheetOpen;
  // A route's sheet, opened by the room itself, opens the column.
  useEffect(() => {
    if (docked && sheetOpen) setDetails(true);
  }, [docked, sheetOpen, setDetails]);
  const show = useCallback(
    (page?: Parameters<Details["show"]>[0]) => {
      showSheet(page);
      if (docked) setDetails(true);
    },
    [docked, showSheet, setDetails],
  );
  const close = useCallback(() => {
    closeSheet();
    if (docked) setDetails(false);
  }, [docked, closeSheet, setDetails]);
  const toggleAt = useRef<View>(null);
  const [byToggle, setByToggle] = useState(false);
  useEffect(() => {
    if (!open) setByToggle(false);
  }, [open]);
  const toggle = useCallback(() => {
    if (open) return close();
    setByToggle(true);
    show();
  }, [open, close, show]);
  const from = byToggle ? toggleAt : room.sheet.from;
  return { docked, open, show, close, toggle, toggleAt, from };
}

/**
 * Whether the room's Universe is open: in the column beside the room, held with the details' (one
 * or the other, `chrome.tsx`) and put away as the room is left, since it is the room's project's;
 * or as a sheet over the room, where there is no column.
 */
function useUniverse(docked: boolean) {
  const [sheet, setSheet] = useState(false);
  const { universe: beside, setUniverse: setBeside } = useChrome();
  useEffect(() => () => setBeside(false), [setBeside]);
  return docked
    ? { universe: beside, setUniverse: setBeside }
    : { universe: sheet, setUniverse: setSheet };
}

const TOP_AND_RIGHT = ["top", "right"] as const;

/** The bar's capsule: the connection's mark while it shows, and Universe for a room with a project. */
function Marks({
  mark,
  room,
  onUniverse,
  calling,
}: {
  readonly mark: ReactNode;
  readonly room: boolean;
  readonly onUniverse: (() => void) | undefined;
  readonly calling: string | undefined;
}) {
  if (mark === null && onUniverse === undefined) return null;
  return (
    <Capsule style={styles.mark}>
      <MarkBeside mark={mark} open={room}>
        {onUniverse === undefined ? null : (
          <UniverseButton onPress={onUniverse} calling={calling} />
        )}
      </MarkBeside>
    </Capsule>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  row: { flexDirection: "row" },
  floating: { position: "absolute", top: 0, left: 0, right: 0 },
  mark: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // The connection's mark and Universe's sit apart as on a phone's bar (`MarkBeside`).
    paddingHorizontal: 12,
  },
});
