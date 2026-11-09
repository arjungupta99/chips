/**
 * The spaces this device can see: what each is called, who is in it, the last thing said, how
 * many lines have not been read, and how long ago it was live. Open spaces, most recent at the
 * top; closed ones behind one row at the foot that says how many there are, because a closed
 * space is off the list rather than gone — and forty of them under a heading are not off
 * anything. A harness closes the room of something it has put away (Jacobian, an archived
 * Space), so this row is where those go.
 *
 * It is the list a phone draws, and not a card (21 September 2026, on Arjun's call). Rows run to
 * both edges with a hairline between them that starts where the words start, because that inset
 * is the one detail that makes a list read as the platform's own. It used to be one bordered,
 * rounded surface with the page showing round it: a card says *this is a thing*, and twelve
 * rooms are not twelve things — they are one list, and the eye should be able to run down it
 * without stepping over a corner each time. The row is still the desktop sidebar's row —
 * avatar, name, when, snippet, unread — so the same workspace looks like itself on both.
 *
 * Search is a tab of its own since 6 October 2026 (ADR 0132), and the box that stood over this
 * list went with it: one place to search, which finds spaces and agents as well as what was said.
 *
 * A row pushed left shows what can be done to the room from here (22 September 2026): Archive
 * and Delete, or Unarchive and Delete once it is archived (`SwipeRow`), each asked about first
 * (`ConfirmSheet`) but Unarchive. Archived is the word for what the wire calls closed, and the
 * row at the foot says it (ADR 0066); Delete erases the room from the server (ADR 0067). Who is
 * offered which is core's, as the desktop's is. A room whose changes are locked offers neither, and
 * slides on Locked instead (ADR 0156), which opens the room with its sheet up, where the lock is.
 *
 * A row pushed the other way, right, offers what is only the reader's (ADR 0205, his B): Hide, which
 * takes the room off this list into the Hidden heading at the foot and keeps it quiet on their
 * phone, or Unhide on a hidden row. Neither asks; the room's sheet offers the same. Hidden and
 * Archived each stand behind a heading with a chevron that turns as it opens.
 *
 * Pin comes out first on that side (ADR 0240, his A): the room goes to the top of the list, its
 * row lifting and gliding there, and stays there, the newest pin first, whatever is said in the
 * rooms under it. A small pin before its time says why it is there, and the row offers Unpin, which
 * glides it back to where its time puts it. Pins are the reader's own too, and ask nothing.
 *
 * A room that goes, by any of these or from anywhere else, carries on off the edge its act is
 * pushed towards and its place folds shut; where it lands in sight, it slides in from the other
 * edge (ADR 0205's addendum, `roomMoves.ts`). A room moved while the list is out of sight, or behind
 * the sheet that asked, waits where it stood until it can be seen going.
 *
 * Select, at the end of the name, picks rows to archive or delete together (ADR 0181,
 * `Selecting.tsx`): each row becomes a checkbox, the tab bar steps aside for a bar of acts, and a
 * locked room, or the Main room, can't be picked. What goes folds away, a deleted room after going
 * to dust. The bar's first act reads every room, or the picked ones, and their counts go.
 *
 * With no room to show it says what is going on instead (`NoRooms`, ADR 0131): nothing while the
 * cache is read, the server being reached or why it cannot be (once that has lasted, ADR 0166),
 * placeholders for rooms on their way, and "No spaces yet" with a way to make one only once the
 * server has said there are none.
 */

import type { Directory, Snapshot, Space, Store, Welcome } from "@chipschat/core";
import {
  archiveAsking,
  archiveManyAsking,
  type Batch,
  batchOf,
  type EmptyList,
  emptyList,
  eraseAsking,
  eraseManyAsking,
  guestSpaceWords,
  hideAct,
  isShared,
  lastWords,
  listRuns,
  type MoveSide,
  mayArchive,
  mayErase,
  mayLock,
  mayPick,
  NO_PINS,
  ownsWorkspace,
  patientEmpty,
  pausedIn,
  pinAct,
  type RowMove,
  rowMove,
  runFolding,
  spaceFace,
  spaceList,
  spaceTitle,
  spaceWorking,
  troubled,
  unreadCount,
  welcomeFor,
  whyFaceNotSaved,
  whyNotPicked,
  workspaceLabel,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useRouter } from "expo-router";
import {
  createContext,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { PlusRoom } from "../newSpace/plusRoom";
import { SetupRail, useSetup } from "../setup/SetupCard";
import { justArrived, useChips } from "../store/provider";
import { avatarCorner, faceGround, ROW_AVATAR } from "../ui/Avatar";
import type { SheetFrom } from "../ui/beside";
import { ConnectionMark, type MarkedBy } from "../ui/Connection";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { mixHex } from "../ui/lit";
import { MainTag } from "../ui/MainTag";
import { Dot, Pill } from "../ui/Pill";
import { type Opens, Screen, UnderName, useColumn } from "../ui/Screen";
import { SharedTag } from "../ui/SharedTag";
import { useSplitSide } from "../ui/Split";
import { RiseIn, Settling } from "../ui/SwitchMotion";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { usePatience } from "../ui/usePatience";
import { useSteady } from "../ui/useSteady";
import { useWorkspaceTitle, WorkspacesSheet, type WorkspaceTitle } from "../workspaces/Switcher";
import { ConfirmSheet, type Who } from "./ConfirmSheet";
import { type Asker, Eraser } from "./Dust";
import { IconSheet } from "./IconSheet";
import { Arrive, NoRooms, tellsConnection } from "./NoRooms";
import { hintWords, keepLeaving, listed } from "./picking";
import { faceName, RowAvatar } from "./RowAvatar";
import { type RoomMoves, type Runs, useRoomMoves } from "./roomMoves";
import {
  type BatchAsk,
  BatchSheet,
  FaceStack,
  ListCorner,
  type Note,
  PickBar,
  PickNote,
  PickRoom,
  whyNotErased,
} from "./Selecting";
import {
  Blink,
  Counted,
  Fade,
  Fold,
  Glide,
  Land,
  ListDust,
  type PickMark,
  PickMotion,
  PickRow,
  readWave,
  Shifted,
  ShiftedText,
  Turned,
  Unfold,
} from "./SelectMotion";
import { actSet, actTone, NO_ACTS, type RoomAct, SwipeRow } from "./SwipeRow";
import { type Going as GoingOf, type Leaving, type Picking as PickingOf, usePick } from "./usePick";
import { relativeTime } from "./when";

/** The gear beside a working room's words, as tall as the caption it stands in. */
const GEAR = 15;

/**
 * Who is reading the list, for what a room with no title is called: "You, Scout", not the
 * reader's own name (ADR 0082). Nobody, and every member is named.
 */
const Reader = createContext<string | undefined>(undefined);

/** What a room is called in this list, for this reader. */
function useTitle(directory: Directory): (space: Space) => string {
  const selfId = useContext(Reader);
  return (space) => spaceTitle(space, directory, selfId);
}

/** Whether somebody besides this reader reads the room, so its row wears the tag (ADR 0234). */
function useShared(space: Space, directory: Directory): boolean {
  const selfId = useContext(Reader);
  return selfId !== undefined && isShared(space, directory, selfId);
}

/** What a swipe asked for, until the sheet that asks first is answered. */
interface Ask {
  readonly kind: "archive" | "delete";
  /** The room as it was when asked about, so the sheet can still name it as it leaves. */
  readonly space: Space;
  /** The row the swipe left open behind the sheet; Cancel closes it. */
  readonly row?: SwipeableMethods | undefined;
}

/** What a row can be pushed to show, and what happens when it is. */
interface RowControls {
  /** Pushed left: what the room's people see done to it. */
  readonly acts: (space: Space) => readonly RoomAct[];
  /** Pushed right: Pin or Unpin, then Hide or Unhide, the reader's own (ADRs 0240, 0205). */
  readonly leading: (space: Space) => readonly RoomAct[];
  readonly onAct: (act: RoomAct, space: Space, row?: SwipeableMethods) => void;
  readonly onOpened: (row: SwipeableMethods) => void;
  readonly onClosed: (row: SwipeableMethods) => void;
  /** Its row is going with its room, left open: it is no longer the one a press closes. */
  readonly forget: (row: SwipeableMethods | undefined) => void;
}

/**
 * What a row needs to know about picking (ADR 0181), whether or not the list is picking: a row
 * keeps its circle, or its padlock, while they slide out after Done, and only rows that can't be
 * picked step back. The rows on their way out, and what they say when they have gone.
 */
type Picking = PickingOf<Space>;
type Going = GoingOf<Space>;

const NO_BATCH: Batch = { archive: [], unarchive: [], erase: [] };

/** None hidden, for a snapshot made without the store. */
const NONE_HIDDEN: ReadonlySet<string> = new Set();

export function List({
  store,
  snapshot,
  selected,
  onOpen,
  selfId,
  server,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  /** The space open beside this list, on a wide screen, so its row can say so. */
  readonly selected?: string | undefined;
  /** What opening a space means here. Absent, it is pushed, which is what a phone does. */
  readonly onOpen?: ((spaceId: string) => void) | undefined;
  /** Who is reading, which decides what a row offers when it is pushed. None, and it offers nothing. */
  readonly selfId?: string | undefined;
  /** Where the server is, as a person would know it (`serverHost`). */
  readonly server?: string | undefined;
}) {
  const router = useRouter();
  const spaces = useMemo(() => spaceList(snapshot.model), [snapshot.model]);
  // Somebody let in by an invite, in no room yet, is welcomed rather than told "No spaces" (JR-4).
  const { paired } = useChips();
  const [switching, setSwitching] = useState(false);
  const workspace = useWorkspaceTitle();
  // What is left to set up (ADR 0170): the owner's card, above the rooms.
  const setup = useSetup(store, snapshot, paired?.device);
  const rise = useRise(setup.decided);
  const welcome =
    selfId === undefined
      ? undefined
      : welcomeFor(
          snapshot.model.people,
          snapshot.directory,
          selfId,
          paired === undefined ? "the workspace" : workspaceLabel(paired.device),
        );
  const pinned = snapshot.pinnedSpaces ?? NO_PINS;
  const { hidden, live, visible, ...runs } = useRuns(
    spaces,
    snapshot.hiddenSpaces,
    pinned,
    selected,
  );
  // What stands where the rooms would be, when there are none to show. With none kept, trouble is
  // said once it has lasted `PATIENCE_MS`, not for a launch's blip (`patientEmpty`).
  const plain = emptyList(snapshot);
  const over = spaces.length > 0 || plain === "reading" || plain === "none";
  const look = patientEmpty(plain, usePatience(over, troubled(plain)));
  // The body says what the connection is doing, so the bar's mark need not say it as well.
  // Removed from the workspace (ADR 0160), the words stand in for whatever rooms the cache holds.
  const telling = (spaces.length === 0 || look === "removed") && tellsConnection(look);
  const go = onOpen ?? ((id: string) => router.push(`/spaces/${id}`));
  const column = useColumn();
  // The row a swipe has left open, if one has: another row coming open closes it, and so does
  // the next press on any row, which closes it rather than opening a room from under it.
  const openRow = useRef<SwipeableMethods | undefined>(undefined);
  const openSpace = (id: string) => {
    if (openRow.current === undefined) return go(id);
    openRow.current.close();
    openRow.current = undefined;
  };
  const [asking, setAsking] = useState<Ask | undefined>(undefined);
  // A locked room's Locked (ADR 0156): the room, with its sheet up on the page the switch is on. A
  // room open beside the list has no sheet, so on a wide screen it is the room.
  const goLocked = onOpen ?? ((id: string) => router.push(`/spaces/${id}?sheet=1`));
  // Why a hide or an unhide did not hold, over the tab bar for a moment.
  const [hideNote, setHideNote] = useState<Note | undefined>(undefined);
  const clearHideNote = useCallback(() => setHideNote(undefined), []);
  const gliding = useGlide();
  const controls = useRowControls(store, snapshot, selfId, hidden, pinned, {
    openRow,
    ask: setAsking,
    goLocked,
    refused: setHideNote,
    glide: gliding.glide,
  });
  // Which row's face is being changed, if any: a long press on the row opens the sheet.
  // The room whose face is being chosen, and where its row was pressed and held.
  const [changing, setChanging] = useState<Changing | undefined>(undefined);
  // The rooms in the order the list draws them, the pinned first (ADR 0240): a row going is held
  // at its place in this. Held at its place in the store's order, a room under the pins jumped
  // above them as the delete went through (ADR 0181's addendum).
  const drawn = useMemo(() => [...live.open, ...live.hidden, ...live.closed], [live]);
  const picks = usePicking(store, snapshot, selfId, drawn, visible, hidden, () => {
    openRow.current?.close();
    openRow.current = undefined;
  });
  const { going, picking } = picks;
  const connection = (by?: MarkedBy) => (
    <ConnectionMark
      state={snapshot.connection}
      link={snapshot.link}
      lostAt={snapshot.lostAt}
      server={server}
      noRelay={paired !== undefined && paired.device.relayUrl === undefined}
      owner={ownsWorkspace(snapshot.directory, selfId)}
      onRetry={store.wake}
      {...by}
    />
  );
  const moved = useRoomMoves({
    store,
    live,
    showHidden: runs.showHidden,
    showClosed: runs.showClosed,
    skip: (id) => going.leaving.has(id),
    quiet: asking !== undefined,
  });
  const { open, closed, hidden: hiddenRows } = withLeaving(live, going.leaving, moved);
  // What a press does is asked of the list as it is now, not of the row: the rows are drawn again
  // for picking only once they have moved (`usePick`), and a press in the meantime picks or opens
  // as Select or Done last said. A swipe begun then goes home.
  const on = useSteady<RowHandlers>({
    press: (space) => (picking ? picks.row.onPick(space) : openSpace(space.id)),
    changeIcon: (spaceId, from) => {
      if (!picking) setChanging({ spaceId, from });
    },
    act: controls.onAct,
    opened: (row) => {
      if (picking) row.close();
      else controls.onOpened(row);
    },
    closed: controls.onClosed,
    folded: (id) => (moved.moves.has(id) ? moved.folded(id) : going.onFolded(id)),
    dusted: going.onDusted,
    slid: moved.slid,
    landed: moved.landed,
  });

  return (
    <Reader.Provider value={selfId}>
      <Screen
        {...headOf(picking, picks.chosen.length, workspace, () => setSwitching(true))}
        testID="spaces"
        glass
        action={
          <ListCorner
            select={selectOf(picks)}
            state={snapshot.connection}
            telling={telling}
            connection={connection}
          />
        }
        under={picks.under}
      >
        <UnderName
          // `automatic`: the phone's tab bar is glass over the list rather than a shelf under it
          // (`app/(tabs)/_layout.tsx`), so the inset that keeps the last row readable is the
          // window's to give and not this layout's. While picking the tab bar is gone and the bar
          // of acts stands there instead, which the list makes room for itself.
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.list, column]}
          keyboardShouldPersistTaps="handled"
        >
          <Settling busy={workspace.arriving} style={styles.settling}>
            <Drawn when={rise.ready}>
              <SetupRail setup={setup} rising={rise.rising} />
              <PickMotion.Provider value={picks.motion}>
                <Listing
                  look={look}
                  awaiting={snapshot.awaiting}
                  server={server}
                  onRetry={store.wake}
                  spaces={spaces}
                  open={open}
                  hidden={hiddenRows}
                  showHidden={runs.showHidden}
                  onAskHidden={runs.toggleHidden}
                  closed={closed}
                  showClosed={runs.showClosed}
                  onAskClosed={runs.toggleClosed}
                  snapshot={snapshot}
                  selected={selected}
                  acts={controls.acts}
                  leading={controls.leading}
                  pinned={pinned}
                  gliding={gliding.id}
                  on={on}
                  welcome={welcome}
                  picking={picks.row}
                  going={going}
                  moves={moved.moves}
                  rising={rise.rising}
                />
              </PickMotion.Provider>
            </Drawn>
          </Settling>
          <PlusRoom />
          <PickRoom shown={picking} gap={styles.list.gap} />
        </UnderName>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ListDust dust={picks.dust} />
        </View>
        <PickBar shown={picking} read={picks.read} left={picks.left} erase={picks.erase} />
        <PickNote note={picks.note} onGone={picks.clearNote} />
        <PickNote note={hideNote} onGone={clearHideNote} />
        <SpacesBatch
          store={store}
          snapshot={snapshot}
          // Nobody reading, and nothing is ever picked to ask about.
          selfId={selfId ?? ""}
          sheet={picks.sheet}
        />
        <PutAway
          store={store}
          snapshot={snapshot}
          selfId={selfId}
          ask={asking}
          onDone={(acted) => {
            // The row the swipe left open is going: the next press opens a room, not closes it.
            if (acted) controls.forget(asking?.row);
            setAsking(undefined);
          }}
        />
        <ChangeFace
          store={store}
          snapshot={snapshot}
          space={spaces.find((space) => space.id === changing?.spaceId)}
          from={changing?.from}
          onClose={() => setChanging(undefined)}
        />
        <WorkspacesSheet open={switching} onClose={() => setSwitching(false)} />
      </Screen>
    </Reader.Provider>
  );
}

/**
 * The longest the rooms of a workspace that has just taken the front wait for its setup card's
 * answers before rising without it: the card is read from its server, and a slow one is not to
 * keep the rooms from view.
 */
const RISE_WAIT_MS = 600;

/** What is drawn only `when`: the card and the rooms, held back a moment as a switch lands. */
function Drawn({ when, children }: { readonly when: boolean; readonly children: ReactNode }) {
  return when ? children : null;
}

/** How the rooms of a list come: risen into place or simply there, and whether they are drawn yet. */
interface Rise {
  /** Drawn as a switch handed this workspace the front (ADR 0197): the card and rooms rise. */
  readonly rising: boolean;
  /** The card and rooms are drawn: at once, unless rising and the card is still undecided. */
  readonly ready: boolean;
}

/**
 * Whether the card and rooms rise, and when they are drawn: drawn as a switch hands this workspace
 * the front, once what the setup card is decided by has been read, so it rises with them rather
 * than coming after and pushing them down, and no longer waiting for it after `RISE_WAIT_MS`.
 * They are mounted then, and rise as they are (`RiseIn`).
 */
function useRise(decided: boolean): Rise {
  const { paired, arrival } = useChips();
  const [rising] = useState(() => justArrived(arrival, paired?.device.deviceId, Date.now()));
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!rising) return;
    const timer = setTimeout(() => setWaited(true), RISE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [rising]);
  return { rising, ready: !rising || decided || waited };
}

/**
 * The list's name: the workspace in front's, which opens the switcher (ADR 0197's addendum), and
 * while it picks, how many are picked.
 */
function headOf(
  picking: boolean,
  count: number,
  workspace: WorkspaceTitle,
  onOpen: () => void,
): { readonly title: string; readonly opens: Opens | undefined } {
  if (picking) {
    return { title: count === 0 ? "Select spaces" : `${count} selected`, opens: undefined };
  }
  return {
    title: workspace.name,
    opens: {
      onPress: onOpen,
      hint: "Shows your workspaces",
      dot: workspace.elsewhere,
      busy: workspace.arriving,
      // The made-up workspace says so beside its name (ADR 0213).
      tag: workspace.demo ? "Demo" : undefined,
      testID: "workspace-title",
    },
  };
}

/**
 * The list's runs (ADR 0205): its open rooms, those the reader hid, and the archived ones, which a
 * hidden room may be too; and whether each put-away run shows. Put away until somebody asks, and
 * the person's word holds once given. Before it is, the room that is open beside the list stays in
 * sight, hidden or archived. What shows is what Select can pick from.
 */
function useRuns(
  spaces: readonly Space[],
  hiddenSpaces: ReadonlySet<string> | undefined,
  pinned: readonly string[],
  selected: string | undefined,
) {
  const hidden = hiddenSpaces ?? NONE_HIDDEN;
  // Kept between draws while the rooms are, for the moves to be worked out against (`useRoomMoves`).
  // The open run starts with the rooms pinned (ADR 0240).
  const live = useMemo(() => listRuns(spaces, hidden, pinned), [spaces, hidden, pinned]);
  const [askedClosed, setAskedClosed] = useState<boolean | undefined>(undefined);
  const [askedHidden, setAskedHidden] = useState<boolean | undefined>(undefined);
  const showClosed = askedClosed ?? live.closed.some((space) => space.id === selected);
  const showHidden = askedHidden ?? live.hidden.some((space) => space.id === selected);
  return {
    hidden,
    live,
    showClosed,
    showHidden,
    toggleClosed: () => setAskedClosed(!showClosed),
    toggleHidden: () => setAskedHidden(!showHidden),
    visible: [...live.open, ...(showHidden ? live.hidden : []), ...(showClosed ? live.closed : [])],
  };
}

/**
 * The rooms in each run, with those on their way out drawn where they stood: Select's (ADR 0181),
 * and those moving from one run to another (ADR 0205's addendum), which are drawn where they land
 * only once they have gone from where they stood.
 */
function withLeaving(
  live: Runs,
  leaving: ReadonlyMap<string, Leaving<Space>>,
  moved: RoomMoves,
): { open: Space[]; hidden: Space[]; closed: Space[] } {
  const held = [...leaving.values()];
  const kept = (run: "open" | "hidden" | "closed") =>
    moved.drawn(
      run,
      keepLeaving(
        live[run],
        held.filter((each) => each.run === run),
      ),
    );
  return { open: kept("open"), hidden: kept("hidden"), closed: kept("closed") };
}

/** Select's, or Done's while picking; nothing where there is nothing it could pick. */
function selectOf(picks: ReturnType<typeof usePicking>) {
  if (!picks.picking && !picks.any) return undefined;
  return { picking: picks.picking, onPress: picks.picking ? picks.stop : picks.start };
}

/** What the list is showing: what stands in for rooms, or the rooms. */
function Listing({
  look,
  awaiting,
  server,
  onRetry,
  spaces,
  open,
  hidden,
  showHidden,
  onAskHidden,
  closed,
  showClosed,
  onAskClosed,
  snapshot,
  selected,
  acts,
  leading,
  pinned,
  gliding,
  on,
  welcome,
  picking,
  going,
  moves,
  rising,
}: {
  readonly look: EmptyList;
  readonly awaiting: number | undefined;
  readonly server: string | undefined;
  readonly onRetry: () => void;
  readonly spaces: readonly Space[];
  readonly open: readonly Space[];
  /** The rooms the reader hid (ADR 0205), behind their heading. */
  readonly hidden: readonly Space[];
  readonly showHidden: boolean;
  readonly onAskHidden: () => void;
  readonly closed: readonly Space[];
  readonly showClosed: boolean;
  readonly onAskClosed: () => void;
  readonly snapshot: Snapshot;
  readonly selected: string | undefined;
  readonly acts: RowControls["acts"];
  readonly leading: RowControls["leading"];
  /** The rooms the reader pinned (ADR 0240), newest first. */
  readonly pinned: readonly string[];
  /** The room a pin or an unpin is gliding to its place, while it does. */
  readonly gliding: string | undefined;
  readonly on: RowHandlers;
  readonly welcome?: Welcome | undefined;
  readonly picking: Picking;
  readonly going: Going;
  /** Rooms on their way from one run to another (ADR 0205's addendum). */
  readonly moves: RoomMoves["moves"];
  /** The workspace has just taken the front: its open rooms rise into place. */
  readonly rising: boolean;
}) {
  // Whether the list has drawn its rooms before: a heading that comes after opens into its place,
  // and one there as the rooms first come is simply there.
  const drawnBefore = useRef(false);
  const drawnRooms = spaces.length > 0 && look !== "removed";
  useEffect(() => {
    if (drawnRooms) drawnBefore.current = true;
  }, [drawnRooms]);
  // Whether something stood in for the rooms, so that they fade in over it when they come, and
  // are simply there when they were there from the first frame.
  const stoodIn = useRef(false);
  const standing = spaces.length === 0 && look !== "reading";
  useEffect(() => {
    if (standing) stoodIn.current = true;
    else if (spaces.length > 0) stoodIn.current = false;
  }, [standing, spaces.length]);
  if (spaces.length === 0 || look === "removed")
    return (
      <NoRooms
        look={look}
        awaiting={awaiting}
        server={server}
        onRetry={onRetry}
        welcome={welcome}
      />
    );
  const rest = { snapshot, selected, acts, leading, on, picking, going, moves } as const;
  const later = drawnBefore.current;
  return (
    <Arrive fade={stoodIn.current} style={styles.rooms}>
      <Group spaces={open} run="open" rising={rising} pinned={pinned} gliding={gliding} {...rest} />
      <GuestNote snapshot={snapshot} />
      {hidden.length === 0 ? null : (
        <>
          <PutAwayRow
            kind="hidden"
            count={hidden.length}
            shown={showHidden}
            onPress={onAskHidden}
            later={later}
            folding={runFolding("hidden", hidden, moves)}
          />
          <Unfold shown={showHidden}>
            <Group spaces={hidden} run="hidden" {...rest} />
          </Unfold>
        </>
      )}
      {closed.length === 0 ? null : (
        <>
          <PutAwayRow
            kind="archived"
            count={closed.length}
            shown={showClosed}
            onPress={onAskClosed}
            later={later}
            folding={runFolding("closed", closed, moves)}
          />
          <Unfold shown={showClosed}>
            <Group spaces={closed} run="closed" {...rest} />
          </Unfold>
        </>
      )}
    </Arrive>
  );
}

/** Under a guest's one room, why there is one: whose guest they are (ADR 0196). */
function GuestNote({ snapshot }: { readonly snapshot: Snapshot }) {
  const palette = usePalette();
  const selfId = useContext(Reader);
  const words =
    selfId === undefined ? undefined : guestSpaceWords(snapshot.model, snapshot.directory, selfId);
  if (words === undefined) return null;
  return (
    <Text style={[styles.guest, { color: palette.ink3 }]} testID="spaces-guest-note">
      {words}
    </Text>
  );
}

/** A room whose face is being chosen, and its row, which was pressed and held. */
interface Changing {
  readonly spaceId: string;
  readonly from: SheetFrom;
}

/** The sheet a room's face is chosen on, for whichever row was pressed and held. */
function ChangeFace({
  store,
  snapshot,
  space,
  from,
  onClose,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  /** Nothing when no row is being changed, which is nearly always. */
  readonly space: Space | undefined;
  /** Its row, which was pressed and held. */
  readonly from: SheetFrom | undefined;
  readonly onClose: () => void;
}) {
  const titleOf = useTitle(snapshot.directory);
  // Why the last pick did not stick. The store puts the old face back when the server refuses;
  // this is what says so, rather than the sheet looking like a row of dead buttons.
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // The room the sheet is about, held past the close. A caller that unmounts the sheet to close
  // it gets no exit at all (`Sheet`), which is why the dismissal looked abrupt rather than
  // sliding away: `open` goes false, the panel leaves, and `onGone` is when it may unmount.
  const [showing, setShowing] = useState<Space | undefined>(space);
  useEffect(() => {
    if (space !== undefined) setShowing(space);
  }, [space]);

  if (showing === undefined) return null;
  const room = showing;
  return (
    <IconSheet
      open={space !== undefined}
      onClose={() => {
        setFailed(undefined);
        onClose();
      }}
      onGone={() => setShowing(undefined)}
      from={from}
      title={titleOf(room)}
      // Empty is nothing to say, not a blank line under the name.
      subtitle={
        lastWords(room, snapshot.directory) === "" ? undefined : lastWords(room, snapshot.directory)
      }
      kind={spaceFace(room, snapshot.directory).kind}
      chosen={snapshot.spaceIcons.get(room.id)}
      failed={failed}
      onChoose={(icon) => {
        setFailed(undefined);
        void store
          .setSpaceIcon(room.id, icon)
          .catch((error: unknown) => setFailed(whyFaceNotSaved(error)));
      }}
    />
  );
}

/**
 * The rooms put away, as one row each kind: how many there are, and a press to see them or put
 * them out of sight, the chevron turning down while they show. Archived is what the wire calls
 * closed (ADR 0066): put away by a person here, or by a harness for something it put away itself.
 * Hidden is the reader's own (ADR 0205), and wears the shut eye.
 */
function PutAwayRow({
  kind,
  count,
  shown,
  onPress,
  later,
  folding,
}: {
  readonly kind: "hidden" | "archived";
  readonly count: number;
  readonly shown: boolean;
  readonly onPress: () => void;
  /** It comes after the list was first drawn, with the first room put under it: it opens into place. */
  readonly later: boolean;
  /** Its last room is folding away, and it goes with it (ADR 0205's addendum). */
  readonly folding: boolean;
}) {
  const name = kind === "hidden" ? "Hidden" : "Archived";
  return (
    <Fold folding={folding} onFolded={NOTHING}>
      <Land from={later ? "open" : undefined}>
        <PutAwayHeading kind={kind} name={name} count={count} shown={shown} onPress={onPress} />
      </Land>
    </Fold>
  );
}

function NOTHING() {}

/** The heading itself: its name and count, Hidden's shut eye blinking as a room comes under it. */
function PutAwayHeading({
  kind,
  name,
  count,
  shown,
  onPress,
}: {
  readonly kind: "hidden" | "archived";
  readonly name: string;
  readonly count: number;
  readonly shown: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count}`}
      aria-expanded={shown}
      onPress={onPress}
      style={styles.closed}
      testID={`${kind}-toggle`}
    >
      <View style={styles.headed}>
        {kind === "hidden" ? (
          <Blink count={count}>
            <Icon name="hide" size={15} color={palette.ink3} weight={2} />
          </Blink>
        ) : null}
        <Text style={[styles.heading, { color: palette.ink3 }]}>{`${name} \u00b7 ${count}`}</Text>
      </View>
      <Turned down={shown}>
        <Icon name="next" size={16} color={palette.ink3} weight={2} />
      </Turned>
    </Pressable>
  );
}

const CHANGE_ICON = { name: "changeIcon", label: "Change icon" } as const;

/** What a screen reader says for each act, which it cannot swipe to. */
const ACT_LABEL: Readonly<Record<RoomAct, string>> = {
  archive: "Archive",
  unarchive: "Unarchive",
  delete: "Delete",
  locked: "Locked, show details",
  hide: "Hide",
  unhide: "Unhide",
  pin: "Pin",
  unpin: "Unpin",
};

/** A long press's act and the swipes', as a screen reader is offered them. */
function rowActions(acts: readonly RoomAct[]) {
  return [CHANGE_ICON, ...acts.map((act) => ({ name: act, label: ACT_LABEL[act] }))];
}

/**
 * What a row does when it is pressed, pushed or has gone: one object for the list's life, each call
 * going to what the list holds at its last draw (`useSteady`). A row's own props are what it shows,
 * so a row is drawn again only when that changes.
 */
interface RowHandlers {
  /** Picks the room while the list picks, and opens it otherwise. */
  readonly press: (space: Space) => void;
  /** A long press: where everything that is about a row rather than in it lives. The row with it. */
  readonly changeIcon: (spaceId: string, from: SheetFrom) => void;
  readonly act: RowControls["onAct"];
  readonly opened: RowControls["onOpened"];
  readonly closed: RowControls["onClosed"];
  readonly folded: (spaceId: string) => void;
  readonly dusted: (spaceId: string) => void;
  /** Its room is moving (ADR 0205's addendum): the row is off its edge, and has landed. */
  readonly slid: (spaceId: string) => void;
  readonly landed: (spaceId: string) => void;
}

/** A plain run of rows: no border, no corners, a hairline inset to where the words start. */
function Group({
  spaces,
  run,
  snapshot,
  selected,
  acts,
  leading,
  on,
  picking,
  going,
  moves,
  rising = false,
  pinned = NO_PINS,
  gliding,
}: {
  readonly spaces: readonly Space[];
  /** Which of the list's runs it is. */
  readonly run: "open" | "hidden" | "closed";
  readonly snapshot: Snapshot;
  readonly selected: string | undefined;
  readonly acts: RowControls["acts"];
  readonly leading: RowControls["leading"];
  readonly on: RowHandlers;
  /** Rows picked to archive or delete together (ADR 0181). */
  readonly picking: Picking;
  readonly going: Going;
  readonly moves: RoomMoves["moves"];
  /** Rise into place, a beat apart, as they are drawn: the workspace has just taken the front. */
  readonly rising?: boolean;
  /** The open run's pinned rooms (ADR 0240), which wear a pin before their time. */
  readonly pinned?: readonly string[];
  /** The room a pin or an unpin is gliding to its place, and the run's rows glide with it. */
  readonly gliding?: string | undefined;
}) {
  const palette = usePalette();
  const arrived = useArrived(spaces, (id) => rowMove(moves, id, run) === undefined);
  if (spaces.length === 0) return null;
  return (
    <View testID="space-list">
      {spaces.map((space, index) => {
        const move = rowMoveProps(rowMove(moves, space.id, run));
        const row = (
          <ListRow
            key={space.id}
            space={space}
            // No hairline at the top, nor either side of the row open beside the list.
            first={index === 0 || space.id === selected || spaces[index - 1]?.id === selected}
            directory={snapshot.directory}
            icon={snapshot.spaceIcons.get(space.id)}
            unread={unreadCount(space, snapshot.readState)}
            // Worked out at every draw of the list, so a row's time is as fresh as the list is.
            when={
              space.lastActivityAt === undefined ? undefined : relativeTime(space.lastActivityAt)
            }
            selected={space.id === selected}
            acts={acts(space)}
            leading={leading(space)}
            // The reader's hidden rooms (ADR 0205), under Hidden or, archived too, under Archived.
            hidden={snapshot.hiddenSpaces?.has(space.id) === true}
            pinned={run === "open" && pinned.includes(space.id)}
            active={picking.active}
            mark={markOf(space, picking)}
            may={picking.may(space)}
            picked={picking.picked.has(space.id)}
            shake={picking.shakes.get(space.id) ?? 0}
            away={going.leaving.get(space.id)}
            moving={move.moving}
            folding={move.folding}
            landing={move.landing}
            dust={going.dust}
            on={on}
          />
        );
        // The open run's rows glide when a pin moves them (ADR 0240); the others never move so.
        const placed =
          run === "open" ? (
            <Glide
              key={space.id}
              armed={gliding !== undefined}
              lifted={gliding === space.id}
              ground={palette.bg}
            >
              {row}
            </Glide>
          ) : (
            row
          );
        // After the setup card, which rises first when it is there: the rooms drawn as the
        // workspace took the front, not one that comes after, which opens its place below.
        if (rising && !arrived.has(space.id))
          return (
            <RiseIn key={space.id} order={index + 1}>
              {placed}
            </RiseIn>
          );
        // A room that comes after the run was drawn opens its place, rather than standing there
        // in a frame and pushing the rows under it down.
        return arrived.has(space.id) ? (
          <Land key={space.id} from="open">
            {placed}
          </Land>
        ) : (
          placed
        );
      })}
    </View>
  );
}

/**
 * The rooms that came to a run after it was first drawn, and not by a move of their own (a move
 * lands its row itself). A workspace rising into place rises the rooms of its first draw; one that
 * comes later arrives as here. A room keeps its place's wrapper while it stays, so it is never
 * drawn afresh; one that goes and comes back arrives again.
 */
function useArrived(
  spaces: readonly Space[],
  arrives: (spaceId: string) => boolean,
): ReadonlySet<string> {
  const seen = useRef<Set<string> | undefined>(undefined);
  const arrived = useRef(new Set<string>());
  const here = new Set(spaces.map((space) => space.id));
  if (seen.current === undefined) seen.current = new Set(here);
  // Only ever added to or taken from by what is drawn, so drawing it twice changes nothing.
  for (const id of here) {
    if (seen.current.has(id)) continue;
    seen.current.add(id);
    if (arrives(id)) arrived.current.add(id);
  }
  for (const id of seen.current) {
    if (here.has(id)) continue;
    seen.current.delete(id);
    arrived.current.delete(id);
  }
  return arrived.current;
}

/** What a row is told of its room's move, if it is moving (ADR 0205's addendum). */
function rowMoveProps(move: RowMove | undefined): {
  readonly moving: MoveSide | undefined;
  readonly folding: boolean;
  readonly landing: MoveSide | undefined;
} {
  if (move === undefined) return { moving: undefined, folding: false, landing: undefined };
  if ("landing" in move) return { moving: undefined, folding: false, landing: move.landing };
  return { moving: move.going, folding: move.folding, landing: undefined };
}

/** What a row wears at its leading edge while the list picks, and keeps as it stops. */
function markOf(space: Space, picking: Picking): PickMark {
  if (space.locked === true) return "locked";
  if (!picking.may(space)) return "none";
  return picking.picked.has(space.id) ? "on" : "off";
}

/** What a screen reader calls a row: its name, and what kind of room it is where that matters. */
function rowLabel(
  title: string,
  space: Space,
  shared: boolean,
  hidden: boolean,
  active: boolean,
  may: boolean,
): string {
  const named = space.home === true ? `${title}, Main space` : title;
  const kind = shared ? `${named}, shared` : named;
  const main = hidden ? `${kind}, hidden` : kind;
  if (!active || may) return main;
  return space.locked === true ? `${main}, locked` : `${main}, can't be picked`;
}

/**
 * A room in the list, folding away when it is archived. Drawn again only when what it shows
 * changes: its room, its face, its count, or its part in picking.
 */
const ListRow = memo(function ListRow({
  space,
  first,
  directory,
  icon,
  unread,
  when,
  selected,
  acts,
  leading,
  hidden,
  pinned,
  active,
  mark,
  may,
  picked,
  shake,
  away,
  moving,
  folding,
  landing,
  dust,
  on,
}: {
  readonly space: Space;
  /** No hairline over it: the first row, and the open row and the one under it. */
  readonly first: boolean;
  readonly directory: Directory;
  readonly icon: SpaceIcon | undefined;
  readonly unread: number;
  /** When it was last busy, as the row says it: "2h". */
  readonly when: string | undefined;
  /** It is the room open beside the list, on a wide screen. */
  readonly selected: boolean;
  readonly acts: readonly RoomAct[];
  /** What it offers pushed right: Hide or Unhide (ADR 0205). */
  readonly leading: readonly RoomAct[];
  /** It is a room the reader hid (ADR 0205). */
  readonly hidden: boolean;
  /** It is a room the reader pinned, standing at the top (ADR 0240). */
  readonly pinned: boolean;
  /** The list is picking (ADR 0181). */
  readonly active: boolean;
  readonly mark: PickMark;
  /** It can be picked. */
  readonly may: boolean;
  readonly picked: boolean;
  /** How many times it has been pressed while it can't be picked: each shakes it. */
  readonly shake: number;
  /** On its way out of the list with Select, archived or deleted (ADR 0181). */
  readonly away: Leaving<Space> | undefined;
  /**
   * Its room is moving to another run, or off the list (ADR 0205's addendum): the edge it is going
   * off, and whether it has gone and is folding shut.
   */
  readonly moving: MoveSide | undefined;
  readonly folding: boolean;
  /** Its room has just moved here: the edge it lands from. */
  readonly landing: MoveSide | undefined;
  readonly dust: Asker;
  readonly on: RowHandlers;
}) {
  const titleOf = useTitle(directory);
  const palette = usePalette();
  const inset = useSplitSide() === "list";
  const title = titleOf(space);
  const shared = useShared(space, directory);
  // A row that came to land keeps its place's wrapper for good, so it is never drawn afresh.
  const [landed] = useState(landing);
  // Not on its way anywhere, with Select or by a move: a thumb may push it, and a press open it.
  const still = away === undefined && moving === undefined;
  // The row, which the face sheet opens beside on an iPad.
  const self = useRef<View>(null);
  const onAction = (name: string) => {
    if (name === "changeIcon") on.changeIcon(space.id, self);
    else on.act(name as RoomAct, space);
  };
  // Made here, not under the press: the same element under a finger and lifted is not drawn again.
  const content = (
    <>
      <PickRow
        picking={active}
        mark={mark}
        dim={!may}
        shake={shake}
        edge={SPACE.lg}
        // Inset to the text, not to the edge, and drawn inside the row rather than as its
        // border so the pressed background runs under it the way a phone's list does.
        line={first ? undefined : { color: palette.line, inset: ROW_AVATAR + SPACE.md }}
        style={styles.row}
      >
        <Row
          space={space}
          directory={directory}
          icon={icon}
          unread={unread}
          when={when}
          title={title}
          hidden={hidden}
          pinned={pinned}
          shared={shared}
        />
        {/* Beside the room on an iPad a row opens there, not onward, as Agents' rows: no chevron. */}
        {inset ? null : (
          <Fade shown={!active}>
            <Text style={[styles.chevron, { color: palette.ink4 }]}>{"\u203a"}</Text>
          </Fade>
        )}
      </PickRow>
      {away?.kind === "delete" && away.phase !== "held" ? (
        <Eraser
          crumbling={{
            backwards: false,
            ground: faceGround(faceName(space, directory, title), icon),
            ink: palette.ink3,
          }}
          dust={dust}
          onWiped={() => undefined}
          onDone={() => on.dusted(space.id)}
        />
      ) : null}
    </>
  );
  const drawn = (
    <Fold folding={away?.phase === "folding" || folding} onFolded={() => on.folded(space.id)}>
      <SwipeRow
        acts={acts}
        leading={leading}
        palette={palette}
        onAct={(act, row) => on.act(act, space, row)}
        onOpen={on.opened}
        onClose={on.closed}
        enabled={!active && still}
        going={moving}
        onGone={() => on.slid(space.id)}
        testID={`swipe-${space.id}`}
      >
        <Pressable
          accessibilityRole={active ? "checkbox" : "button"}
          accessibilityLabel={rowLabel(title, space, shared, hidden, active, may)}
          // The `aria-` spelling: React Native maps it to the native state, and the web
          // target, which dropped `accessibilityState`, renders it as the attribute a spec
          // can read.
          aria-selected={active ? undefined : selected}
          aria-checked={active ? picked : undefined}
          disabled={!still}
          onPress={() => on.press(space)}
          onLongPress={active ? undefined : () => on.changeIcon(space.id, self)}
          ref={self}
          // What the long press and the swipe do, for a screen reader, which can make neither.
          accessibilityActions={active ? undefined : rowActions([...leading, ...acts])}
          onAccessibilityAction={(event) => onAction(event.nativeEvent.actionName)}
          style={({ pressed }) => ({
            // The row that is open beside the list wears the quiet surface, as the desktop's
            // does, and a picked row a wash of the tick's blue. Otherwise the page's own colour,
            // not none: a swipe slides the row over its buttons, and a clear row would show them
            // through it. In a split the quiet surface is a tile set in from the edges (`Tile`).
            backgroundColor: picked
              ? mixHex(palette.bg, palette.blue, PICKED_WASH)
              : !inset && (pressed || (!active && selected))
                ? palette.surface2
                : palette.bg,
          })}
        >
          {({ pressed }) => (
            <>
              <Tile
                lit={inset && !picked && (pressed || (!active && selected))}
                chosen={selected}
              />
              {content}
            </>
          )}
        </Pressable>
      </SwipeRow>
    </Fold>
  );
  return (
    <Landed from={landed} onLanded={() => on.landed(space.id)}>
      {drawn}
    </Landed>
  );
});

/**
 * Beside a room, the row that is open there, and one under a finger, as a rounded tile set in from
 * the list's edges, as an iPad's lists draw them (ADR 0256); on a phone the row is the band.
 */
function Tile({ lit, chosen }: { readonly lit: boolean; readonly chosen: boolean }) {
  const palette = usePalette();
  if (!lit) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.tile, { backgroundColor: chosen ? palette.surface3 : palette.surface2 }]}
      testID="row-tile"
    />
  );
}

/** A row as it is, or landing where its room has moved to, for a row that came to land. */
function Landed({
  from,
  onLanded,
  children,
}: {
  readonly from: MoveSide | undefined;
  readonly onLanded: () => void;
  readonly children: ReactNode;
}) {
  if (from === undefined) return children;
  return (
    <Land from={from} onLanded={onLanded}>
      {children}
    </Land>
  );
}

/** How much of the tick's blue a picked row is washed with. */
const PICKED_WASH = 0.08;

/**
 * What each row offers when pushed, and what each act does. Unarchive happens at once — it only
 * puts a room back — and the other two ask first, so they are handed to the sheet. Locked asks
 * nothing either: the row goes home and the room opens with its sheet up (ADR 0156), the swipe's
 * button having given its light tap already (`SwipeRow`). Hide and Unhide, from the row's other
 * end, ask nothing (ADR 0205): the room moves, and a refusal puts it back and is said over the tab
 * bar. A row whose room goes is left open, and carries on off its edge from there (ADR 0205's
 * addendum).
 */
function useRowControls(
  store: Store,
  snapshot: Snapshot,
  selfId: string | undefined,
  hidden: ReadonlySet<string>,
  pinned: readonly string[],
  {
    openRow,
    ask,
    goLocked,
    refused,
    glide,
  }: {
    readonly openRow: { current: SwipeableMethods | undefined };
    readonly ask: (asking: Ask) => void;
    readonly goLocked: (spaceId: string) => void;
    readonly refused: (note: Note) => void;
    readonly glide: Glider["glide"];
  },
): RowControls {
  const onOpened = useCallback(
    (row: SwipeableMethods) => {
      if (openRow.current !== undefined && openRow.current !== row) openRow.current.close();
      openRow.current = row;
    },
    [openRow],
  );
  const onClosed = useCallback(
    (row: SwipeableMethods) => {
      if (openRow.current === row) openRow.current = undefined;
    },
    [openRow],
  );
  const acts = (space: Space): readonly RoomAct[] => {
    if (selfId === undefined) return NO_ACTS;
    const out: RoomAct[] = [];
    if (mayArchive(snapshot.model, space, selfId)) {
      out.push(space.state === "closed" ? "unarchive" : "archive");
    }
    if (mayErase(snapshot.model, space, selfId)) out.push("delete");
    // Core offers neither Archive nor Delete while the room's changes are locked (ADR 0156):
    // whoever may let them go is shown why, and the way there.
    if (space.locked === true && mayLock(space, selfId)) out.push("locked");
    return actSet(out);
  };
  const leading = (space: Space): readonly RoomAct[] => {
    if (selfId === undefined) return NO_ACTS;
    const offered = [pinAct(space, selfId, pinned, hidden), hideAct(space, selfId, hidden)];
    return actSet(offered.filter((act) => act !== undefined));
  };
  // A row whose room goes is left open as it goes, and carries on off its edge from there (ADR
  // 0205's addendum): the next press opens a room rather than closing it.
  const forget = (row: SwipeableMethods | undefined) => {
    if (row !== undefined && openRow.current === row) openRow.current = undefined;
  };
  const onAct = (act: RoomAct, space: Space, row?: SwipeableMethods) => {
    if (act === "hide" || act === "unhide") {
      forget(row);
      store.setSpaceHidden(space.id, act === "hide").then(feel.success, (error: unknown) => {
        feel.warning();
        refused({ key: Date.now(), words: notTaken(act, error), locked: false });
      });
      return;
    }
    if (act === "pin" || act === "unpin") {
      // The row stays on the list: home first, then it lifts and glides to its new place.
      row?.close();
      glide(space.id, () => {
        store.setSpacePinned(space.id, act === "pin").then(feel.success, (error: unknown) => {
          feel.warning();
          refused({ key: Date.now(), words: notTaken(act, error), locked: false });
        });
      });
      return;
    }
    if (act === "locked") {
      row?.close();
      goLocked(space.id);
      return;
    }
    if (act !== "unarchive") {
      ask({ kind: act, space, row });
      return;
    }
    forget(row);
    store.updateSpace({ spaceId: space.id, state: "open" });
    feel.success();
  };
  return { acts, leading, onAct, onOpened, onClosed, forget };
}

const NOT_TAKEN = {
  hide: "Not hidden",
  unhide: "Not unhidden",
  pin: "Not pinned",
  unpin: "Not unpinned",
} as const;

/** Why a hide, a pin or their undoing did not hold, in words worth reading. */
function notTaken(act: keyof typeof NOT_TAKEN, error: unknown): string {
  const not = NOT_TAKEN[act];
  const said = error instanceof Error ? error.message : "";
  // A server from before ADR 0205, or 0240 for a pin, has no such route, and says so as a 404.
  if (/404|no route matches/i.test(said)) return `${not}: this server is older than the app.`;
  return said === "" ? `${not}: the server would not take it.` : `${not}: ${said}`;
}

/**
 * The room a pin or an unpin is gliding to its place (ADR 0240). The run's rows are armed to glide
 * first and the pin is asked a beat later, since a row takes up a layout transition only after the
 * draw that gave it one: the draw that moves the rows has to be the next. Disarmed once the glide
 * is over, so nothing else the list does glides.
 */
interface Glider {
  readonly id: string | undefined;
  readonly glide: (spaceId: string, then: () => void) => void;
}

/** How long after the row starts home its room moves: the swipe has mostly closed by then. */
const GLIDE_ARM_MS = 180;
/** How long the rows stay armed, and the row lifted: the glide's spring has settled. */
const GLIDE_MS = 900;

function useGlide(): Glider {
  const [id, setId] = useState<string | undefined>(undefined);
  const over = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(over.current), []);
  const glide = useCallback((spaceId: string, then: () => void) => {
    setId(spaceId);
    // The pin itself is always asked, whatever comes after it; only the disarming waits on the last.
    setTimeout(then, GLIDE_ARM_MS);
    clearTimeout(over.current);
    over.current = setTimeout(() => setId(undefined), GLIDE_ARM_MS + GLIDE_MS);
  }, []);
  return { id, glide };
}

/** Why a room was not deleted, in words worth reading (`whyNotErased`). */
function notErased(error: unknown): string {
  return `Not deleted: ${whyNotErased(error)}`;
}

/**
 * Picking rows to archive or delete together (ADR 0181), and the rows on their way out after:
 * which are picked while it lasts, what the bar's acts would take, the sheet that asks, and the
 * rows held where they stood while they fold away or go to dust.
 */
function usePicking(
  store: Store,
  snapshot: Snapshot,
  selfId: string | undefined,
  spaces: readonly Space[],
  visible: readonly Space[],
  hidden: ReadonlySet<string>,
  closeRow: () => void,
) {
  const [ask, setAsk] = useState<BatchAsk<Space> | undefined>(undefined);
  const may = useCallback(
    (space: Space) => selfId !== undefined && mayPick(snapshot.model, space, selfId),
    [snapshot.model, selfId],
  );
  const locked = visible.some((space) => space.locked === true);
  const pick = usePick({
    items: spaces,
    visible,
    may,
    whyNot: (space) => ({
      words: whyNotPicked(space, spaceTitle(space, snapshot.directory, selfId)),
      locked: space.locked === true,
    }),
    hint: {
      words: hintWords(
        locked,
        visible.some((space) => space.home === true && !may(space)),
      ),
      locked,
    },
    runOf: (space) =>
      space.state === "closed" ? "closed" : hidden.has(space.id) ? "hidden" : "open",
    closeRow,
  });
  const { chosen, stop, none, hold, move, afterSheet, letGo } = pick;
  const batch = selfId === undefined ? NO_BATCH : batchOf(snapshot.model, chosen, selfId);
  // Nobody to pick as, or nothing left to pick from: picking stops.
  const empty = selfId === undefined || spaces.length === 0;
  useEffect(() => {
    if (empty) none();
  }, [empty, none]);
  const unarchive = () => {
    // At once, as a swipe's Unarchive is: it only puts rooms back.
    for (const space of batch.unarchive) store.updateSpace({ spaceId: space.id, state: "open" });
    feel.success();
    stop();
  };
  const archive = (from: SheetFrom) =>
    setAsk({ kind: "archive", going: batch.archive, staying: [], from });
  const onlyUnarchive = batch.archive.length === 0 && batch.unarchive.length > 0;
  // Read (ADR 0181 addendum): every room with nothing picked, locked, Main and archived ones too,
  // or the picked rooms; it counts those with anything unread. At once, and picking ends.
  const all = chosen.length === 0;
  const reading = (all ? spaces : chosen).filter(
    (space) => unreadCount(space, snapshot.readState) > 0,
  );
  const read = () => {
    readWave();
    store.markSpacesRead(reading.map((space) => space.id));
    feel.success();
    stop();
  };
  return {
    ...pick,
    read: { all, count: reading.length, onPress: read },
    left: onlyUnarchive
      ? { act: "unarchive" as const, count: batch.unarchive.length, onPress: unarchive }
      : { act: "archive" as const, count: batch.archive.length, onPress: archive },
    erase: {
      count: batch.erase.length,
      onPress: (from: SheetFrom) =>
        setAsk({
          kind: "delete",
          going: batch.erase,
          staying: chosen.filter((space) => !batch.erase.includes(space)),
          from,
        }),
    },
    sheet: {
      ask,
      onClose: () => setAsk(undefined),
      onActing: (kind: BatchAsk<Space>["kind"], going: readonly Space[]) =>
        hold(going, kind, "held"),
      onDone: (
        kind: BatchAsk<Space>["kind"],
        done: readonly string[],
        refused: readonly string[],
      ) => {
        letGo(refused);
        const phase = kind === "archive" ? "folding" : "going";
        // The sheet stays up with what was refused, and the rows that went go behind it.
        if (refused.length > 0) {
          move(done, phase);
          return;
        }
        afterSheet(done, phase);
        setAsk(undefined);
        stop();
      },
    },
  };
}

/**
 * The sheet that asks before picked rooms are archived or deleted (ADR 0181): what core says of
 * them, their faces, and every room asked of the server at once, the lone agent of those the switch
 * is about going with it.
 */
function SpacesBatch({
  store,
  snapshot,
  selfId,
  sheet,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly sheet: ReturnType<typeof usePicking>["sheet"];
}) {
  const titleOf = (space: Space) => spaceTitle(space, snapshot.directory, selfId);
  const named = (space: Space) => ({ space, name: titleOf(space) });
  return (
    <BatchSheet<Space>
      {...sheet}
      asking={(kind, going, staying) =>
        kind === "archive"
          ? archiveManyAsking(going.map(named), snapshot.directory)
          : eraseManyAsking(going.map(named), staying.map(named), snapshot.directory, selfId)
      }
      who={(going) => spacesWho(going, snapshot, titleOf)}
      nameOf={titleOf}
      act={(kind, space, plan) =>
        kind === "archive"
          ? store.updateSpace({ spaceId: space.id, state: "closed" })
          : store.eraseSpace(space.id, {
              deleteAgent: plan.too && plan.asking.agentsToo?.spaceIds.includes(space.id) === true,
            })
      }
      why={(_kind, error) => whyNotErased(error)}
    />
  );
}

/** What a batch sheet is about: one room as its row draws it, or several as a stack of faces. */
function spacesWho(
  rooms: readonly Space[],
  snapshot: Snapshot,
  titleOf: (space: Space) => string,
): Who {
  const [only] = rooms;
  if (rooms.length === 1 && only !== undefined) {
    return {
      face: (
        <RowAvatar
          space={only}
          directory={snapshot.directory}
          title={titleOf(only)}
          icon={snapshot.spaceIcons.get(only.id)}
        />
      ),
      name: titleOf(only),
      last: lastWords(only, snapshot.directory),
    };
  }
  return {
    face: (
      <FaceStack
        faces={rooms.map((space) => ({
          key: space.id,
          corner: avatarCorner("md", spaceFace(space, snapshot.directory).kind),
          face: (
            <RowAvatar
              space={space}
              directory={snapshot.directory}
              title={titleOf(space)}
              icon={snapshot.spaceIcons.get(space.id)}
              size="md"
            />
          ),
        }))}
      />
    ),
    name: `${rooms.length} spaces`,
    last: listed(rooms.map(titleOf)),
  };
}

/**
 * The sheet that asks before Archive and Delete, for whichever row asked. It holds the room past
 * the close, so the sheet can still name it while it slides away — a deleted room is gone from
 * the snapshot by then — and unmounts when the exit is done (`Sheet`).
 */
function PutAway({
  store,
  snapshot,
  selfId,
  ask,
  onDone,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string | undefined;
  readonly ask: Ask | undefined;
  /** The sheet is answered: whether the room went, or the asking was let be. */
  readonly onDone: (acted: boolean) => void;
}) {
  const titleOf = useTitle(snapshot.directory);
  const palette = usePalette();
  const [showing, setShowing] = useState<Ask | undefined>(ask);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // Whether a room's one agent goes in its harness too (ADR 0087, rule 5): on until turned off.
  const [agentToo, setAgentToo] = useState(true);
  useEffect(() => {
    if (ask === undefined) return;
    setShowing(ask);
    setFailed(undefined);
    setAgentToo(true);
  }, [ask]);
  if (showing === undefined) return null;
  const { kind, space, row } = showing;
  const name = titleOf(space);
  const asking =
    kind === "archive"
      ? archiveAsking(space, name, snapshot.directory)
      : eraseAsking(space, name, snapshot.directory, selfId ?? "");
  const cancel = () => {
    row?.close();
    onDone(false);
  };
  // The row stays open behind the sheet, and goes off its edge from there once the sheet has sunk
  // (ADR 0205's addendum).
  const confirm = async () => {
    if (kind === "archive") {
      store.updateSpace({ spaceId: space.id, state: "closed" });
      feel.success();
      onDone(true);
      return;
    }
    setBusy(true);
    setFailed(undefined);
    try {
      await store.eraseSpace(space.id, {
        deleteAgent: asking.agentToo !== undefined && agentToo,
      });
      feel.warning();
      onDone(true);
    } catch (error) {
      setFailed(notErased(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmSheet
      open={ask !== undefined}
      onClose={cancel}
      onGone={() => setShowing(undefined)}
      room={{
        face: (
          <RowAvatar
            space={space}
            directory={snapshot.directory}
            title={name}
            icon={snapshot.spaceIcons.get(space.id)}
          />
        ),
        name,
        last: lastWords(space, snapshot.directory),
      }}
      confirming={{ asking, tone: actTone(kind, palette), busy, failed }}
      onConfirm={() => void confirm()}
      too={{ on: agentToo, onChange: setAgentToo }}
    />
  );
}

/**
 * A room's face, name, time, last line and unread count. What moves over while the list picks is
 * wrapped to (`Shifted`); the time and the count stay. Drawn again only when what it shows
 * changes: the list's picking redraws every row's checkbox, never its face.
 */
const Row = memo(function Row({
  space,
  directory,
  icon,
  unread,
  when,
  title,
  hidden,
  pinned,
  shared,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly icon: SpaceIcon | undefined;
  readonly unread: number;
  readonly when: string | undefined;
  readonly title: string;
  /** A room the reader hid (ADR 0205): the shut eye before its time, and its count in grey. */
  readonly hidden: boolean;
  /** A room the reader pinned (ADR 0240): a pin before its time, leaning in the time's grey. */
  readonly pinned: boolean;
  /** Somebody besides the reader reads it (ADR 0234). */
  readonly shared: boolean;
}) {
  const palette = usePalette();
  // Work going in the room, whether a run of its own or a turn out of the harness's queue
  // (ADR 0090, ADR 0285): the face wears the pins, and the gear stands where the harness's own
  // thought-bubble emoji used to be read out.
  const working = spaceWorking(space);
  return (
    <>
      <Shifted>
        <RowAvatar space={space} directory={directory} title={title} icon={icon} busy={working} />
      </Shifted>
      <View style={styles.body}>
        <View style={styles.top}>
          <ShiftedText style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
            {title}
          </ShiftedText>
          {hidden ? (
            <View style={styles.shut} testID="hidden-mark">
              <Icon name="hide" size={13} color={palette.ink3} weight={2} />
            </View>
          ) : pinned ? (
            <View style={[styles.shut, styles.leaning]} testID="pinned-mark">
              <Icon name="pin" size={13} color={palette.ink3} weight={2} />
            </View>
          ) : null}
          {when === undefined ? null : (
            <Text
              style={[
                styles.when,
                hidden || pinned ? styles.whenShut : null,
                { color: palette.ink3 },
              ]}
            >
              {when}
            </Text>
          )}
        </View>
        <RowLine
          space={space}
          directory={directory}
          title={title}
          icon={icon}
          working={working}
          shared={shared}
        />
      </View>
      <Counted count={unread}>
        {(count) => (
          <Text
            testID="unread"
            style={[
              styles.count,
              hidden
                ? { backgroundColor: palette.surface3, color: palette.ink2 }
                : { backgroundColor: palette.gold },
            ]}
          >
            {count}
          </Text>
        )}
      </Counted>
    </>
  );
});

/** A row's second line: the Main tag, what waits, is paused or works, and the last words. */
function RowLine({
  space,
  directory,
  title,
  icon,
  working,
  shared,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly title: string;
  readonly icon: SpaceIcon | undefined;
  readonly working: boolean;
  readonly shared: boolean;
}) {
  const palette = usePalette();
  const waiting = space.run?.state === "waiting";
  // Chips holds the agents' messages to each other here until a person acts (ADR 0097): the row
  // says so in red, over what was said last.
  const paused = pausedIn(space);
  // A room with something to answer says so instead of quoting itself: the answer is the point.
  const snippet = paused ? "Chips paused the agents" : lastWords(space, directory);
  // A harness's Main room says so, in its face's colour (ADR 0145).
  const main = space.home === true;
  if (snippet === "" && !main && !shared) return null;
  return (
    <Shifted style={styles.sub}>
      {main ? <MainTag hue={faceGround(faceName(space, directory, title), icon)} /> : null}
      {/* Somebody besides the reader reads it, after Main and before the rest (ADR 0234). */}
      {shared ? <SharedTag /> : null}
      {waiting ? <Dot tone="amber" /> : null}
      {paused ? (
        <View testID="paused">
          <Pill tone="red" dot="solid">
            Paused
          </Pill>
        </View>
      ) : null}
      {working ? (
        <View testID="working-gear">
          <Icon name="cog" size={GEAR} color={palette.ink3} />
        </View>
      ) : null}
      <Text
        style={[styles.last, { color: waiting ? palette.amberInk : palette.ink3 }]}
        numberOfLines={1}
      >
        {snippet}
      </Text>
    </Shifted>
  );
}

const styles = StyleSheet.create({
  tile: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: SPACE.sm,
    right: SPACE.sm,
    borderRadius: RADIUS.xl,
  },
  // The rows go to both edges.
  list: { gap: SPACE.md, paddingBottom: SPACE.xxl },
  // The list's own gap, kept between the setup card and the rooms it holds.
  settling: { gap: SPACE.md },
  // The connection's mark, when there is one, and Select.
  // The list's own gap, between the open rooms, the archived row and the archived rooms.
  rooms: { gap: SPACE.md },
  // The line under a guest's one room, level with the rows' faces.
  guest: {
    fontSize: TEXT.sm,
    lineHeight: Math.round(TEXT.sm * 1.4),
    paddingHorizontal: SPACE.lg,
  },
  heading: { fontSize: TEXT.sm, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  // A row a thumb can find: the words are small, the target is not.
  closed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: SPACE.lg,
  },
  // A heading's mark and words, side by side.
  headed: { flexDirection: "row", alignItems: "center", gap: 6 },
  // A hidden room's shut eye, at the end of the name's line, its time after it.
  shut: { marginLeft: "auto", alignSelf: "center" },
  whenShut: { marginLeft: 4 },
  // The pin leans as a pushpin stuck in a board does.
  leaning: { transform: [{ rotate: "40deg" }] },
  // One height for every row, whether or not there is a last line to show: a list where the
  // rows are two heights reads as two lists. Eighty points is the height a phone's own lists of
  // conversations stand at once the face is 56, which is what makes room for a face a thumb can
  // aim at. It was 76 at a 44-point face until 21 September 2026.
  // The leading padding is the motion's to set (`PickRow`): the row's edge, and the circle's room
  // while the list picks. The hairline starts where the name does, and moves over with it.
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: SPACE.lg,
    paddingVertical: SPACE.md,
    minHeight: 80,
  },
  chevron: { fontSize: TEXT.body, opacity: 0.8 },
  body: { flex: 1, gap: 2 },
  // On the baseline, not the middle: the time is smaller than the name and sits level with it
  // at the top of the row, which is where a phone puts it and where the eye goes back for it.
  top: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  name: { fontSize: TEXT.body, fontWeight: "600", flexShrink: 1 },
  when: { fontSize: TEXT.sm, marginLeft: "auto" },
  sub: { flexDirection: "row", alignItems: "center", gap: 6 },
  last: { fontSize: TEXT.sm, flexShrink: 1 },
  count: {
    fontSize: TEXT.xs,
    fontWeight: "700",
    color: "#14161b",
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
});
