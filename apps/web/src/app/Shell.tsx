/**
 * The app shell: subscribes to the store and renders the three panes — the sidebar, the middle
 * (a space, the workspace's log, the harnesses, search or you), and the run panel. It holds only what is
 * not in the log: which space is open, which tab, and a notice for the composer.
 * Everything else is folded from events, and every click becomes a call on the store.
 */

import {
  type AgentsLook,
  type Aim,
  type Approval,
  type Attachment,
  act,
  agentsLook,
  askSeen,
  type Command,
  changedSince,
  closesRun,
  type Device,
  type Directory,
  type EmptyList,
  emptyList,
  FEEDBACK_ASK,
  heldNamesFor,
  hideAct,
  hitWords,
  isDemo,
  type Lane,
  laneChainCostUsd,
  lanesInSpace,
  mayArchive,
  mayChangeProject,
  mayErase,
  mayOpenSpace,
  mayRenameWorkspace,
  mayTurnDial,
  mayUseMac,
  messageRoute,
  myRole,
  newSpaceHarnesses,
  ownerNameOf,
  parseCommand,
  passkeysSupported,
  patientEmpty,
  pinAct,
  type Question,
  type RelayState,
  type Run,
  readUniverse,
  registerPasskey,
  roomDirectory,
  runGoing,
  runsBySession,
  type SearchHit,
  type Snapshot,
  type Space,
  type Store,
  servedThisPage,
  serverHost,
  spaceById,
  spaceTitle,
  type TakenOut,
  THINKING_GRACE_MS,
  troubled,
  turnedBy,
  unreadCount,
  type WorkspaceModel,
  welcomeFor,
  withdrawLeaving,
  workspaceLabel,
} from "@chipschat/core";
import {
  type AutonomyLevel,
  type Connector,
  pairingUrl,
  phonePairingUrl,
} from "@chipschat/protocol";
import { ChipMark, Icon } from "@chipschat/ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { desktop, inDesktop } from "../native.ts";
import type { AgentsService } from "./Agents.tsx";
import type { Chosen } from "./Ask.tsx";
import { AgentPane } from "./agent/AgentPane.tsx";
import { type BannerService, bannerServiceOf } from "./agent/bannerService.ts";
import { Columns, ColumnsShellFrame, useNarrowForThird } from "./Columns.tsx";
import type { DecisionInput } from "./Decide.tsx";
import type { OnFeedback } from "./Feedback.tsx";
import { useFirstRun } from "./FirstRun.tsx";
import { createFileService, type FileService } from "./files.ts";
import { createFolders, type Folders } from "./folders.ts";
import { Harnesses } from "./Harnesses.tsx";
import { JoinRequestDialog, type JoinService, nextAsk } from "./Join.tsx";
import type { LineHandlers, Standing } from "./LineActions.tsx";
import { useMenuCommands } from "./menuCommands.ts";
import { useNewSpaceDialog } from "./NewSpace.tsx";
import { NoRooms } from "./NoRooms.tsx";
import type { RowActs } from "./RowMenu.tsx";
import { RunPanel } from "./RunPanel.tsx";
import type { SpaceActions } from "./room/actions.ts";
import type { ProjectActions } from "./room/Project.tsx";
import { AskedPage } from "./room/Universe.tsx";
import {
  type Beside,
  OpenInSpaces,
  Search,
  type SearchSession,
  useSearchSession,
} from "./Search.tsx";
import {
  DemoTag,
  Sidebar,
  type SidebarProps,
  SpacesList,
  type Tab,
  type WorkspaceTab,
} from "./Sidebar.tsx";
import { type LineFocus, type SheetFor, SpaceView, seedField } from "./SpaceView.tsx";
import type { RoomActs } from "./select/rooms.tsx";
import { Turns } from "./Turns.tsx";
import { type Messaging, useMessaging } from "./useMessaging.ts";
import { useNarrow } from "./useNarrow.ts";
import { usePatience } from "./usePatience.ts";
import { DirectAsks } from "./you/DirectAskDialog.tsx";
import { FEEDBACK_ON } from "./you/Feedback.tsx";
import { OpenRelay } from "./you/openRelay.ts";

/** This page's own address: the server's, when the server served it; a stand-in under Node. */
function pageOrigin(): string {
  return typeof location === "undefined" ? "http://127.0.0.1:4432" : location.origin;
}

/**
 * The server a device talks to, as an origin: the address it paired with, when its page came from
 * elsewhere (the desktop app's is `tauri://localhost`, which no harness can reach), else this
 * page's own, which the server serves, or a dev server proxying `/v1` does.
 */
function serverUrlOf(device: Device): string {
  return device.serverUrl === undefined || device.serverUrl === ""
    ? pageOrigin()
    : device.serverUrl;
}

/** The relay an owner turned off, with their name (ADR 0211, Phase 4). */
function relayOffOf(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): RelayState | undefined {
  const relay = model.relay;
  if (relay?.on !== false) return undefined;
  return { ...relay, by: turnedBy(relay.by, directory, selfId) };
}

/** The server a device talks to, by host: the address it paired with, else this page's own. */
function serverHostOf(device: Device): string {
  return serverHost(device.serverUrl) ?? serverHost(pageOrigin()) ?? pageOrigin();
}

/**
 * Whether a passkey can work here (ADR 0085), so You draws the card only then. A passkey is a
 * browser's, bound to the page's host as its relying party: the desktop app's page comes from
 * the app rather than from the server, so no passkey for the server's address can be used in
 * it; a page on plain HTTP away from loopback has no WebAuthn at all; and Chromium refuses an IP
 * address as the relying party ("This is an invalid domain"), so `127.0.0.1` cannot where
 * `localhost` can. Drawn in those places, the button only ever failed.
 */
export function passkeysWorkHere(where: typeof globalThis = globalThis): boolean {
  if (inDesktop(where) || !passkeysSupported(where) || where.isSecureContext !== true) return false;
  const host = where.location?.hostname ?? "";
  const address =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
  return host !== "" && !address;
}

import { browserPermission } from "./useNotifications.ts";
import {
  BUILD,
  type FeedbackService,
  type LimitsService,
  type NotificationsService,
  type PeopleService,
  type RelayService,
  You,
} from "./You.tsx";

export type { WorkspaceTab } from "./Sidebar.tsx";

/** A change of section fades through: the one going out first, then the one coming in. */
const THROUGH = () => "through" as const;

/** `open`, with `first` done before it; nothing where there is nothing to open. */
function after(
  first: () => void,
  open: ((from: HTMLElement | null) => void) | undefined,
): ((from: HTMLElement | null) => void) | undefined {
  if (open === undefined) return undefined;
  return (from) => {
    first();
    open(from);
  };
}

export function Shell({
  store,
  device,
  files: given,
  openId,
  landIn,
  onLanded,
  onSignOut,
  workspaces,
  onSwitch,
  onPairAnother,
  onMute,
  onRemoveDemo,
  onWatchDemo,
}: {
  readonly store: Store;
  readonly device: Device;
  /** Uploads and fetches; a test hands in a fake. */
  readonly files?: FileService | undefined;
  /**
   * Something to look at, named from outside: a `chips://` link the desktop shell was opened
   * with (M2.2). A space id opens the room; an approval id opens the room it is waiting
   * in, which is where the card is.
   */
  readonly openId?: string | undefined;
  /**
   * A room a link has just let this person into (ADR 0168), opened as soon as it is here, which
   * may be a moment after the join: `onLanded` once it is taken.
   */
  readonly landIn?: string | undefined;
  readonly onLanded?: (() => void) | undefined;
  /** This device withdrawn and forgotten: back to pairing (ADR 0034). */
  readonly onSignOut?: (() => void) | undefined;
  /** Every workspace this browser is paired with, for the switcher (M5.3). */
  readonly workspaces?: readonly WorkspaceTab[] | undefined;
  readonly onSwitch?: ((deviceId: string) => void) | undefined;
  /** Pair with another server, where the app can reach one: the desktop shell. */
  readonly onPairAnother?: (() => void) | undefined;
  /** Mute this workspace on this device, or hear from it again. */
  readonly onMute?: ((deviceId: string, muted: boolean) => void) | undefined;
  /** Take the demo out of the switcher (ADR 0213). */
  readonly onRemoveDemo?: (() => void) | undefined;
  /** Play the demo's films again, from the switcher (ADR 0213). */
  readonly onWatchDemo?: (() => void) | undefined;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const files = useMemo(() => given ?? createFileService(device), [given, device]);
  // Your folder on the Mac (ADR 0224): each room's, kept up to date as its project moves on.
  const folders = useMemo(
    () => createFolders({ store, device, server: serverUrlOf(device), shell: desktop() }),
    [store, device],
  );
  useEffect(() => () => folders.stop(), [folders]);
  const { model, directory, readState, connection, link, busy, receipts, spaceIcons } = snapshot;
  // The rooms this person hid from their list (ADR 0205): under Hidden in the rail, and quiet.
  const hiddenSpaces = snapshot.hiddenSpaces;
  // The rooms this person pinned (ADR 0240): first in the rail, the newest pin on top.
  const pinnedSpaces = snapshot.pinnedSpaces;
  const { notices } = snapshot;
  const empty = usePatientEmpty(snapshot);
  const { workspaceName, workspace } = calledNow(device, snapshot);

  const [tab, setTab] = useState<Tab>("spaces");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // At a phone's width the rail is a menu over the page, open or not (JR-15).
  const [menu, setMenu] = useState(false);
  // The room on screen, taken from this reader by somebody else: its place says by whom (JR-6).
  const [takenFrom, setTakenFrom] = useState<TakenOut | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [pickedSession, setPickedSession] = useState<string | undefined>(undefined);
  /** A space this person just opened, to select the moment its event comes back (M3.3). */
  const [awaited, setAwaited] = useState<string | undefined>(undefined);
  // A room whose sheet comes up as it opens: on Add, made empty from the + (ADR 0148); on Icon,
  // from Change icon on its row in the rail (ADR 0264's addendum).
  const [sheetFor, setSheetFor] = useState<SheetFor | undefined>(undefined);
  const messaging = useMessaging(store, model, device.participantId);
  // The search, kept while the page is away, so a room opened from it and the way back find it
  // as it was (ADR 0132's addendum).
  const searching = useSearchSession(store);
  // An agent a search result opened: the Agents page opens on its page. The rail's own choice of
  // a page opens it on its list again.
  const [agentOpened, setAgentOpened] = useState<string | undefined>(undefined);
  const [permissionsOpened, setPermissionsOpened] = useState(false);
  // You's Connect a harness (ADR 0185's addendum): the Agents page opens with its dialog up, where
  // the harness lands once it has said hello. Any other way to the page opens it without.
  const [connecting, setConnecting] = useState(false);
  // The setup card's Away from home (ADR 0245): You, scrolled to the relay card, which lights. A
  // count of the asks, so asking again while You is open lights it again; 0 is none.
  const [revealRelay, setRevealRelay] = useState(0);
  const relayAsks = useRef(0);
  // A section from the top: its list, or You at the relay card when `reveal` asks.
  const goTo = useCallback((next: Tab, reveal: number) => {
    setAgentOpened(undefined);
    setPermissionsOpened(false);
    setConnecting(false);
    setRevealRelay(reveal);
    setTab(next);
    setMenu(false);
  }, []);
  const selectTab = useCallback((next: Tab) => goTo(next, 0), [goTo]);
  const openRelay = useCallback(() => {
    relayAsks.current += 1;
    goTo("you", relayAsks.current);
  }, [goTo]);
  const openAgent = useCallback((agentId: string) => {
    setAgentOpened(agentId);
    setPermissionsOpened(false);
    setConnecting(false);
    setTab("agents");
  }, []);
  const openPermissions = useCallback((asker: string) => {
    setAgentOpened(asker);
    setPermissionsOpened(true);
    setConnecting(false);
    setTab("agents");
  }, []);
  const connectHarness = useCallback(() => {
    setAgentOpened(undefined);
    setPermissionsOpened(false);
    setConnecting(true);
    setTab("agents");
  }, []);
  const demo = isDemo(device);

  // Which visit each space is pinned to (ADR 0040), once per connection. It is the person's and
  // not the device's, so it is read from the server rather than remembered here: a pin set at
  // the desk is the pin a phone sends by.
  useEffect(() => {
    store.loadSessionPins().catch(() => undefined);
  }, [store]);

  // Open the first space once there is one, and keep a valid selection: a space that is gone —
  // one that was left — leaves nothing selected, and an empty middle pane beside a full list is
  // not a state anybody chose. A thread is never the room on screen, and a closed space is only
  // when nothing is open: it is off the list, and opening it would bring the closed ones back out.
  useEffect(() => {
    // The room on screen taken from this reader by somebody else: its place says so until they
    // say OK, rather than another room standing in it with no word (JR-6). Added back, it returns.
    const notice = takenNotice(model.spaces, model.takenOut, selectedId, takenFrom);
    if (notice === "back") {
      setSelectedId(takenFrom?.spaceId);
      setTakenFrom(undefined);
      return;
    }
    if (notice !== undefined) {
      if (notice !== "kept") setTakenFrom(notice);
      return;
    }
    const open = roomToOpen(model.spaces, selectedId, awaited);
    if (open === undefined) return;
    setSelectedId(open.id);
    if (!open.awaited) return;
    setTab("spaces");
    setAwaited(undefined);
  }, [model.spaces, model.takenOut, selectedId, awaited, takenFrom]);

  const selected = useMemo(
    () => model.spaces.find((space) => space.id === selectedId),
    [model.spaces, selectedId],
  );

  /**
   * Open a space — or, for a thread the log holds, the room it grew in — at a line when one is
   * named (M5.4): a search hit, a pin.
   */
  // Open page from the person's phone (ADR 0227): the window comes forward, on the room, with its
  // page open over it.
  const [pageAsked, closeAsked] = usePageAsked(folders, store, (spaceId) => {
    setSelectedId(spaceId);
    setTab("spaces");
  });
  const select = useCallback((roomId: string) => {
    setSelectedId(roomId);
    setPickedSession(undefined);
    setTab("spaces");
    setMenu(false);
    setTakenFrom(undefined);
  }, []);
  const { open: openIn } = messaging;
  const open = useCallback(
    (spaceId: string, lineId?: string, words?: string) => openIn(spaceId, lineId, select, words),
    [openIn, select],
  );
  const keepTab = useCallback((roomId: string) => {
    setSelectedId(roomId);
    setPickedSession(undefined);
    setTakenFrom(undefined);
  }, []);
  const [searchBeside, besideSearch] = useSearchBeside({
    model,
    onSearch: tab === "search",
    selectedId,
    openIn,
    keepTab,
  });

  // A link from outside. An approval names the space it is waiting in rather than one of
  // its own, so both kinds of link end in the same place: a space, open, on Spaces.
  useEffect(() => {
    if (openId === undefined) return;
    const spaceId = openId.startsWith("spc_")
      ? openId
      : model.needsYou.find((item) => item.id === openId)?.spaceId;
    if (spaceId !== undefined) open(spaceId);
  }, [openId, model.needsYou, open]);

  // A room a link let this person into: awaited, as a room the + asked for is, so it opens the
  // moment the server has sent it (ADR 0168).
  useEffect(() => {
    if (landIn === undefined) return;
    setAwaited(landIn);
    onLanded?.();
  }, [landIn, onLanded]);

  // The first run (ADR 0170): the welcome over the window, the setup card in the rail, and the
  // phone card over the room. None of it for the demo, which has nothing to set up (ADR 0213).
  const join = useMemo(() => joinService(store), [store]);
  const firstRun = withoutFirstRun(
    useFirstRun({
      store,
      snapshot,
      device,
      join,
      desktop: inDesktop(),
      open,
      openRelay,
    }),
    demo,
  );

  // What picked rooms are read, archived, unarchived and deleted through, from the rail (ADR 0181).
  const roomActs = useMemo<RoomActs>(
    () => ({
      archive: (spaceId, archived) =>
        store.updateSpace({ spaceId, state: archived ? "closed" : "open" }),
      erase: (spaceId, options) => store.eraseSpace(spaceId, options),
      read: (spaceIds) => store.markSpacesRead(spaceIds),
    }),
    [store],
  );
  // What a row's menu pins, hides, archives and deletes through: the phone's swipes, on a right-click.
  const rowActs = useMemo<RowActs>(
    () => ({
      pin: (spaceId, pinned) => store.setSpacePinned(spaceId, pinned),
      hide: (spaceId, hidden) => store.setSpaceHidden(spaceId, hidden),
      archive: (spaceId, archived) =>
        store.updateSpace({ spaceId, state: archived ? "closed" : "open" }),
      erase: (spaceId, options) => store.eraseSpace(spaceId, options),
      // The room, and its sheet on Icon: a page, where the phone's long press opens a sheet.
      icon: (spaceId) => {
        open(spaceId);
        setSheetFor({ spaceId, on: "icon" });
      },
    }),
    [store, open],
  );

  // Which visit's run the panel is showing, when a space has more than one open (ADR 0024).
  // Nothing picked means the most recent run in the space, which is what a space with one
  // terminal has always shown.
  const sessions = useMemo(
    () => (selected === undefined ? [] : runsBySession(selected)),
    [selected],
  );
  const picked = sessions.find((each) => each.session.sessionRef === pickedSession)?.run;
  const run = picked ?? selected?.run;

  /**
   * What the composer's line asks for; a command that cannot be done becomes a notice. A message
   * goes where the capsule over the field said, in a room of several harnesses (ADR 0081).
   */
  const carryOut = (
    command: Command,
    attachments: readonly Attachment[] = [],
    aim?: Aim | undefined,
    replyTo?: string | undefined,
  ) => {
    if (selected === undefined) return;
    store.dismissNotice(selected.id);
    setNotice(
      act(
        command,
        {
          store,
          spaceId: selected.id,
          run,
          space: selected,
          directory,
          route: messageRoute(model, selected, store.sessionPin(selected.id)),
          aim,
          replyTo,
        },
        attachments,
      ),
    );
  };

  /** A decision, from a card wherever it is: the approval knows its run and space. */
  const decide = (approval: Approval, input: DecisionInput) => {
    const spaceId = model.spaces.find((c) => c.runs.some((r) => r.runId === approval.runId))?.id;
    if (spaceId === undefined) return;
    store.resolveApproval({
      spaceId,
      runId: approval.runId,
      approvalId: approval.approvalId,
      decision: input.decision,
      scope: input.scope,
      ...(input.everywhere === true ? { everywhere: true } : {}),
      // A yes that holds on, for the hour or until stopped (ADR 0281): it went unsent here from
      // 6 November, so For an hour on the web and the Mac held for nothing past its ask.
      ...(input.forMinutes === undefined ? {} : { forMinutes: input.forMinutes }),
      ...(input.untilStopped === true ? { untilStopped: true } : {}),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      ...(input.updatedInput === undefined ? {} : { updatedInput: input.updatedInput }),
    });
  };

  const answer = (question: Question, answers: readonly Chosen[]) =>
    store.answerQuestion({
      spaceId: question.spaceId,
      runId: question.runId,
      askId: question.askId,
      answers,
    });

  /** A thumb or a note on a line, from its row: the line is in the space that is open (M3.4). */
  const feedback = useCallback<OnFeedback>(
    (line, input) => {
      if (selectedId === undefined) return;
      store.sendFeedback({ spaceId: selectedId, lineId: line.id, ...input });
    },
    [store, selectedId],
  );

  const turnDial = (level: AutonomyLevel) => {
    if (selected === undefined || run === undefined) return;
    store.setAutonomy({
      harnessId: run.harnessId,
      spaceId: selected.id,
      level,
      rules: run.policy?.rules ?? [],
    });
  };

  // One dialog for a new space, opened out of the rail's + or an empty workspace's button.
  const newSpace = useNewSpaceDialog({
    directory,
    workspace: device.deviceId,
    onAsk: (harnessIds, title) =>
      setAwaited(askForSpace(store, device.participantId, harnessIds, title)),
    onGroup: (title) => {
      const spaceId = store.createSpace({ title });
      setAwaited(spaceId);
      // Its sheet, on Add, once the dialog has gone (ADR 0148).
      return () => setSheetFor({ spaceId, on: "add" });
    },
  });

  // Only an owner or an admin opens a space (ADR 0196): nobody else is offered the +.
  const newSpaceFrom = mayOpenSpace(myRole(model, device.participantId))
    ? newSpace.open
    : undefined;

  // The Mac's menus and their keys (ADR 0267); in a browser they are held and never asked.
  useMenuCommands({
    tab,
    selectTab,
    onNewSpace: newSpaceFrom,
    spaces: model.spaces,
    hiddenSpaces,
    pinnedSpaces,
    selectedId,
    open,
    build: BUILD,
  });

  const middle = (
    <MiddlePane
      tab={tab}
      revealRelay={revealRelay}
      model={model}
      joins={snapshot.joins}
      directory={directory}
      busy={busy}
      keepsHeldYes={snapshot.keepsHeldYes}
      selected={selected}
      device={device}
      workspaceName={workspaceName}
      workspace={workspace}
      connection={connection}
      link={link}
      linkSince={snapshot.linkSince}
      linkBefore={snapshot.linkBefore}
      onlyDirect={snapshot.onlyDirect === true}
      myDirectAsk={snapshot.myDirectAsk}
      wentDirect={snapshot.wentDirect === true}
      empty={hasRooms(model) ? undefined : empty}
      agentsLook={agentsLook(snapshot)}
      takenFrom={takenFrom}
      onTakenSeen={() => {
        setTakenFrom(undefined);
        setSelectedId(undefined);
      }}
      onNewSpace={newSpaceFrom}
      sheetFor={sheetFor}
      onSheetShown={() => setSheetFor(undefined)}
      receipts={receipts}
      unsentNotes={snapshot.unsentNotes}
      // A command's own notice, or what the server said of a change to who is in the room that
      // it turned away (agents review, finding 13).
      notice={notice ?? (selected === undefined ? undefined : notices?.get(selected.id))}
      files={files}
      folders={folders}
      store={store}
      open={open}
      decide={decide}
      answer={answer}
      carryOut={carryOut}
      feedback={feedback}
      onSignOut={() => void signOut(store, device, onSignOut)}
      muted={device.muted === true}
      onMute={onMute === undefined ? undefined : (muted) => onMute(device.deviceId, muted)}
      onLine={messaging.handlers}
      standingIn={messaging.standingIn}
      jumpTo={messaging.jumpTo}
      spaceIcons={spaceIcons}
      hiddenSpaces={hiddenSpaces}
      pinnedSpaces={pinnedSpaces}
      searching={searching}
      searchBeside={searchBeside}
      onSearchBeside={besideSearch}
      onOpenInSpaces={select}
      onAgentsList={() => selectTab("agents")}
      agentOpened={agentOpened}
      permissionsOpened={permissionsOpened}
      onOpenPermissions={openPermissions}
      banners={bannerServiceOf(store, snapshot)}
      onOpenAgent={openAgent}
      connecting={connecting}
      onConnectHarness={connectHarness}
      workspaces={workspaces}
      onSwitch={onSwitch}
      cards={firstRun.cards}
    />
  );
  const side = useAfterTheBeat(sideOf(tab, selected, run, sessions));
  const runPanel = (going: Run) => (
    <RunPanel
      run={going}
      directory={directory}
      harness={model.harnesses[going.harnessId]}
      busy={busy.has(going.runId) || busy.has(going.harnessId)}
      sessions={sessions}
      chainCostUsd={laneChainCostUsd(model, going.runId)}
      onPickSession={setPickedSession}
      onPause={() => carryOut({ kind: "pause" })}
      onResume={() => carryOut({ kind: "resume" })}
      onStop={(reason) => carryOut({ kind: "stop", reason })}
      onAutonomy={turnDial}
      turnsDial={mayTurnDial(model, device.participantId)}
    />
  );
  const railProps: SidebarProps = {
    model,
    directory,
    readState,
    spaceIcons,
    hiddenSpaces,
    pinnedSpaces,
    selectedSpaceId: selectedId,
    empty,
    awaiting: snapshot.awaiting,
    reach: {
      connection,
      link,
      lostAt: snapshot.lostAt,
      server: serverHostOf(device),
      rekeyed: snapshot.rekeyed,
      onRetry: store.wake,
    },
    selfId: device.participantId,
    tab,
    onSelectTab: selectTab,
    onSelectSpace: open,
    onNewSpace: after(() => setMenu(false), newSpaceFrom),
    workspaces: workspaces ?? [],
    onSwitch,
    onPairAnother,
    onRemoveDemo,
    onWatchDemo,
    onRenameWorkspace: mayRenameWorkspace(myRole(model, device.participantId))
      ? (name) => store.renameWorkspace(name)
      : undefined,
    desktop: inDesktop(),
    // A demo has nothing to set up, and no welcome (ADR 0213, point 1).
    setup: firstRun.setup,
    roomActs,
    rowActs,
  };
  // At a phone's width the rooms are in the rail's menu; at a desk's, Spaces' first column.
  const narrow = useNarrow();

  return (
    <OpenRelay.Provider value={openRelay}>
      <ColumnsShellFrame room={roomShown(tab, selected, searchBeside)} menu={menu}>
        <NarrowBar
          workspace={workspace}
          demo={demo}
          open={menu}
          onToggle={() => setMenu((open) => !open)}
          unread={model.spaces.some(
            (space) =>
              space.id !== selectedId &&
              space.parentSpaceId === undefined &&
              space.state !== "closed" &&
              hiddenSpaces?.has(space.id) !== true &&
              unreadCount(space, readState) > 0,
          )}
        />
        <Sidebar {...railProps} rooms={narrow} />

        {/* The section, which fades through to the next one (ADR 0274), in its columns (ADR 0284). */}
        <Turns at={tab} depth={0} way={THROUGH} name="section">
          <SpacesColumns
            on={tab === "spaces"}
            rail={railProps}
            narrow={narrow}
            middle={middle}
            room={selected !== undefined}
            side={side}
            runPanel={runPanel}
          />
        </Turns>
        {newSpace.dialog}
        {firstRun.phone}
        {firstRun.welcome}

        <JoinAsks
          store={store}
          joins={snapshot.joins}
          model={model}
          directory={directory}
          selfId={device.participantId}
          workspaceName={workspaceName}
          onOpen={open}
        />
        <DirectAsks
          store={store}
          asks={snapshot.directAsks}
          kept={snapshot.keptShareLink}
          model={model}
          directory={directory}
          selfId={device.participantId}
        />

        <PageAsked
          asked={pageAsked}
          store={store}
          folders={folders}
          selfId={device.participantId}
          files={files}
          onClose={closeAsked}
        />
      </ColumnsShellFrame>
    </OpenRelay.Provider>
  );
}

/** The first run's pieces, or none of them on the demo's device (ADR 0213, point 1). */
function withoutFirstRun(
  run: ReturnType<typeof useFirstRun>,
  demo: boolean,
): ReturnType<typeof useFirstRun> {
  return demo ? { cards: run.cards, welcome: null, setup: null, phone: null } : run;
}

/**
 * Where the notice of a room taken from the reader stands (JR-6): the notice to put up, now that
 * the room on screen has gone and core says who took it; "kept" while one is up; "back" once they
 * were added back before saying OK; nothing when there is none to show.
 */
function takenNotice(
  spaces: readonly Space[],
  takenOut: Readonly<Record<string, TakenOut>>,
  selectedId: string | undefined,
  takenFrom: TakenOut | undefined,
): TakenOut | "back" | "kept" | undefined {
  const here = (id: string | undefined) => spaces.some((space) => space.id === id);
  if (takenFrom !== undefined) return here(takenFrom.spaceId) ? "back" : "kept";
  const taken = selectedId === undefined ? undefined : takenOut[selectedId];
  return taken !== undefined && !here(selectedId) ? taken : undefined;
}

/**
 * The room the shell opens by itself: one the person asked for, now that it has come; else, when
 * what was open is gone, the first open room. Nothing when the selection stands or there is none.
 */
function roomToOpen(
  spaces: readonly Space[],
  selectedId: string | undefined,
  awaited: string | undefined,
): { readonly id: string | undefined; readonly awaited: boolean } | undefined {
  if (spaces.length === 0) return undefined;
  if (awaited !== undefined && spaces.some((space) => space.id === awaited)) {
    return { id: awaited, awaited: true };
  }
  if (spaces.some((space) => space.id === selectedId)) return undefined;
  const rooms = spaces.filter((space) => space.parentSpaceId === undefined);
  return { id: (rooms.find((space) => space.state !== "closed") ?? rooms[0])?.id, awaited: false };
}

/**
 * Where a room was, once somebody else took the reader out of it (JR-6): which room, by whom, and
 * that its words stay with the people still in it. OK, and the next room comes.
 */
function TakenFrom(props: { readonly taken: TakenOut; readonly onSeen: () => void }) {
  const { taken } = props;
  const room = taken.title ?? "this space";
  return (
    <main className="conv conv-none none" aria-label="Space" data-testid="removed-from-room">
      <h1 className="ui-visually-hidden">Space</h1>
      <div className="none-in" aria-live="polite">
        <ChipMark size={64} state="failed" />
        <h2 className="none-t">You're no longer in {room}</h2>
        <p className="none-w">
          {taken.byName} removed you from {room}. What was said there stays with the people still in
          it.
        </p>
        <button type="button" className="none-b" onClick={props.onSeen}>
          OK
        </button>
      </div>
    </main>
  );
}

/**
 * The bar a phone's width shows over the page (JR-15): the rail is a menu there, opened from here
 * and closed by choosing anything in it, by this again, or by Escape. Hidden at a desk's width,
 * where the rail is beside the page.
 */
function NarrowBar(props: {
  readonly workspace: string;
  /** The demo's workspace, which wears its tag here too (ADR 0213). */
  readonly demo: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** Words waiting in a room that is not on screen: a dot, so the menu is worth opening. */
  readonly unread: boolean;
}) {
  const { open, onToggle } = props;
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggle();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onToggle]);
  return (
    <header className="narrow-bar">
      <button
        type="button"
        className="narrow-menu"
        data-testid="narrow-menu"
        aria-expanded={open}
        aria-label={open ? "Close the menu" : "Open the menu"}
        onClick={onToggle}
      >
        <Icon name={open ? "x" : "list"} size={18} />
        <span className="narrow-ws">{props.workspace}</span>
        {props.demo ? <DemoTag /> : null}
        {props.unread && !open ? (
          <span className="narrow-dot" data-testid="narrow-unread" role="img" aria-label="Unread" />
        ) : null}
      </button>
    </header>
  );
}

/** The store's join calls, as the join screens ask for them (ADR 0122). */
function joinService(store: Store): JoinService {
  return {
    makeLink: (capabilities) => store.makeJoinLink(capabilities),
    allow: (requestId, capabilities, code, as) =>
      store.allowJoin(requestId, capabilities, code, as),
    deny: (requestId) => store.denyJoin(requestId),
  };
}

/**
 * Something asks to join (ADR 0122): the request dialog for the oldest request waiting that this
 * device has not shown, to an owner or admin, and a link's to the person who sent it (ADR 0232).
 * One at a time; once it is closed, the next.
 */
function JoinAsks(props: {
  readonly store: Store;
  readonly joins: Snapshot["joins"];
  readonly model: Snapshot["model"];
  readonly directory: Snapshot["directory"];
  readonly selfId: string;
  readonly workspaceName: string | undefined;
  readonly onOpen: (spaceId: string) => void;
}) {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | undefined>(undefined);
  const join = useMemo(() => joinService(props.store), [props.store]);
  const next = nextAsk(props.joins, shown, props.model, props.selfId);
  useEffect(() => {
    if (open !== undefined || next === undefined) return;
    setOpen(next.requestId);
    setShown((before) => new Set(before).add(next.requestId));
  }, [open, next]);
  const request = open === undefined ? undefined : props.joins?.get(open);
  if (request === undefined) return null;
  return (
    <JoinRequestDialog
      key={request.requestId}
      request={request}
      model={props.model}
      directory={props.directory}
      selfId={props.selfId}
      workspaceName={props.workspaceName}
      join={join}
      onOpen={props.onOpen}
      onClosed={() => setOpen(undefined)}
    />
  );
}

interface MiddlePaneProps {
  readonly tab: Tab;
  /** You opened from the setup card's Away from home, to the relay card: which ask (ADR 0245). */
  readonly revealRelay?: number | undefined;
  readonly model: Snapshot["model"];
  readonly joins: Snapshot["joins"];
  readonly directory: Snapshot["directory"];
  readonly busy: Snapshot["busy"];
  readonly keepsHeldYes: Snapshot["keepsHeldYes"];
  readonly selected: Snapshot["model"]["spaces"][number] | undefined;
  readonly device: Device;
  /** What the workspace is called now, and what to call it in a sentence (`workspaceLabel`). */
  readonly workspaceName: string | undefined;
  readonly workspace: string;
  readonly connection: Snapshot["connection"];
  readonly link: Snapshot["link"];
  /** Since when the socket has gone the way it goes, and the way before (ADR 0211). */
  readonly linkSince: Snapshot["linkSince"];
  readonly linkBefore: Snapshot["linkBefore"];
  /** Only direct here, and whether this device has reached its server directly (ADR 0211). */
  readonly onlyDirect: boolean;
  readonly wentDirect: boolean;
  /** This person's own ask to go direct (ADR 0211, Phase 3). */
  readonly myDirectAsk: Snapshot["myDirectAsk"];
  /** What stands in the space's place with no room to open (ADR 0131); nothing while there are rooms. */
  readonly empty: EmptyList | undefined;
  /** Whether the Agents page lists the directory yet, or what stands in for it (`agentsLook`). */
  readonly agentsLook: AgentsLook;
  /** The room on screen, taken from the reader by somebody else (JR-6), until they say OK. */
  readonly takenFrom: TakenOut | undefined;
  readonly onTakenSeen: () => void;
  /** Absent for somebody who may not open a space (ADR 0196). */
  readonly onNewSpace: ((from: HTMLElement | null) => void) | undefined;
  /** The room whose sheet comes up on a page as it opens: Add (ADR 0148) or Icon. */
  readonly sheetFor?: SheetFor | undefined;
  /** Its sheet came up: the next time that room opens, it opens as any room does. */
  readonly onSheetShown: () => void;
  readonly receipts: Snapshot["receipts"];
  readonly unsentNotes: Snapshot["unsentNotes"];
  readonly notice: string | undefined;
  readonly files: FileService;
  /** Your folder on the Mac (ADR 0224). */
  readonly folders?: Folders | undefined;
  readonly store: Store;
  readonly open: (spaceId: string, lineId?: string, words?: string) => void;
  readonly decide: (approval: Approval, input: DecisionInput) => void;
  readonly answer: (question: Question, answers: readonly Chosen[]) => void;
  readonly carryOut: (
    command: Command,
    attachments?: readonly Attachment[],
    aim?: Aim | undefined,
    replyTo?: string | undefined,
  ) => void;
  readonly feedback: OnFeedback;
  readonly onSignOut: () => void;
  readonly muted: boolean;
  readonly onMute: ((muted: boolean) => void) | undefined;
  /** What may be done to a line in the open space (M5.4), and a line to land on. */
  readonly onLine: LineHandlers;
  readonly standingIn: (space: Space) => Standing;
  readonly jumpTo: LineFocus | undefined;
  /** The faces the person chose for spaces, which a lane's card draws its rooms in. */
  readonly spaceIcons: Snapshot["spaceIcons"];
  /** The rooms the person hid from their list (ADR 0205), which the room's sheet offers back. */
  readonly hiddenSpaces: Snapshot["hiddenSpaces"];
  /** The rooms the person pinned (ADR 0240), which the room's sheet offers to let go. */
  readonly pinnedSpaces: Snapshot["pinnedSpaces"];
  readonly searching: SearchSession;
  /** What a result opened beside Search's results (ADR 0269), and opening another there. */
  readonly searchBeside: Beside | undefined;
  readonly onSearchBeside: (opened: Beside) => void;
  /** The room beside Search's results, taken to Spaces. */
  readonly onOpenInSpaces: (spaceId: string) => void;
  /** The Agents page's list: an agent's page beside Search's results goes back to it. */
  readonly onAgentsList: () => void;
  /** An agent a search result opened, which the Agents page opens on. */
  readonly agentOpened: string | undefined;
  readonly permissionsOpened: boolean;
  readonly onOpenPermissions: (asker: string) => void;
  readonly banners: BannerService;
  readonly onOpenAgent: (agentId: string) => void;
  /** The Agents page opens with Connect a harness up: You's card asked for it. */
  readonly connecting: boolean;
  readonly onConnectHarness: () => void;
  /** Every workspace this device holds, which You's Workspace row switches between. */
  readonly workspaces: readonly WorkspaceTab[] | undefined;
  readonly onSwitch: ((deviceId: string) => void) | undefined;
  /** The gallery's cards from the docs (ADR 0171), for Connect a harness. */
  readonly cards?: readonly Connector[] | undefined;
}

/** The line a hit lands on: its own, or for a step the line that closed its run (`closesRun`). */
function hitLine(model: WorkspaceModel, hit: SearchHit): string | undefined {
  if (hit.kind !== "receipt") return hit.lineId;
  const runId = hit.runId;
  if (runId === undefined) return undefined;
  return spaceById(model, hit.spaceId)?.lines.findLast((line) => closesRun(line, runId))?.id;
}

/**
 * What a result opened beside Search's results on a wide window (ADR 0269), kept while the page is
 * away as the search is, and opening another there. A room opened there is the open room, chosen
 * with the Search tab kept (`keepTab`), so it is read, answered and acted on as on Spaces; and back
 * on Search it is the open room again, whatever Spaces looked at meanwhile.
 */
function useSearchBeside(on: {
  readonly model: WorkspaceModel;
  readonly onSearch: boolean;
  readonly selectedId: string | undefined;
  readonly openIn: Messaging["open"];
  readonly keepTab: (roomId: string) => void;
}): readonly [Beside | undefined, (next: Beside) => void] {
  const { model, onSearch, selectedId, openIn, keepTab } = on;
  const [opened, setOpened] = useState<Beside | undefined>(undefined);
  const open = useCallback(
    (next: Beside) => {
      setOpened(next);
      if (next.kind !== "space") return;
      const hit = next.hit;
      const words = hit === undefined ? undefined : hitWords(hit, next.searched ?? "");
      openIn(next.spaceId, hit === undefined ? undefined : hitLine(model, hit), keepTab, words);
    },
    [model, openIn, keepTab],
  );
  const room = opened?.kind === "space" ? spaceById(model, opened.spaceId) : undefined;
  const shown = room?.parentSpaceId ?? room?.id;
  useEffect(() => {
    if (onSearch && shown !== undefined && shown !== selectedId) keepTab(shown);
  }, [onSearch, shown, selectedId, keepTab]);
  return [opened, open];
}

/**
 * What the right-hand column shows: the room's run while one is going in it, else nothing, and the
 * room has the width (ADR 0268). The run shown is the visit picked, which may have ended while
 * another goes on, so the panel's picker can switch back.
 */
type Side = { readonly kind: "run"; readonly room: Space; readonly run: Run } | undefined;

/** Whether a room stands in the second column: Spaces' open room, or the one Search opened beside. */
function roomShown(tab: Tab, selected: Space | undefined, beside: Beside | undefined): boolean {
  if (tab === "spaces") return selected !== undefined;
  return tab === "search" && beside?.kind === "space";
}

/**
 * Spaces in its columns (ADR 0284): the rooms in the first, under the rail's top (in the rail's menu
 * at a phone's width), the room in the second, and the run beside it in the third. The run stands
 * there only where the list keeps its place beside both, so a run starting never puts the list
 * away; narrower, the room's own bar says it. Another section is its own columns already.
 */
function SpacesColumns(props: {
  readonly on: boolean;
  readonly rail: SidebarProps;
  readonly narrow: boolean;
  readonly middle: ReactNode;
  readonly room: boolean;
  readonly side: Side;
  readonly runPanel: (run: Run) => ReactNode;
}) {
  const crowded = useNarrowForThird();
  if (!props.on) return props.middle;
  const run = crowded ? undefined : props.side?.run;
  return (
    <Columns
      name="spaces"
      as="div"
      list={props.narrow ? null : <SpacesList {...props.rail} />}
      detail={props.middle}
      third={run === undefined ? undefined : props.runPanel(run)}
      room={props.room}
    />
  );
}

function sideOf(
  tab: Tab,
  room: Space | undefined,
  run: Run | undefined,
  sessions: readonly { readonly run?: Run }[],
): Side {
  if (tab !== "spaces" || room === undefined || run === undefined) return undefined;
  const going = [room.run, ...sessions.map((each) => each.run)].some(
    (each) => each !== undefined && runGoing(each),
  );
  return going ? { kind: "run", room, run } : undefined;
}

/**
 * The panel once its run has been going the thinking bubble's beat (core's `THINKING_GRACE_MS`), as
 * the bubble waits it: a run over in less never shows it, where the panel slid in and straight back
 * out (ADR 0268 addendum). Counted from the run's own start, so a room opened on a run long going
 * shows it at once, and a clock ahead of the server's waits no more than the beat.
 */
function useAfterTheBeat(side: Side): Side {
  const [, again] = useState(0);
  const started = side === undefined ? Number.NaN : Date.parse(side.run.startedAt ?? "");
  const left = Number.isNaN(started)
    ? 0
    : Math.min(THINKING_GRACE_MS, Math.max(0, started + THINKING_GRACE_MS - Date.now()));
  const waiting = left > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(
      () => again((n) => n + 1),
      Math.max(1, started + THINKING_GRACE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [waiting, started]);
  return waiting ? undefined : side;
}

/**
 * Send feedback (ADR 0237), while its switch is on: the form opens outside Chips (on the Mac, the
 * shell hands it to the browser), and the Main space opens with the line in its field.
 */
function useFeedback(open: (spaceId: string) => void): FeedbackService | undefined {
  const service = useMemo<FeedbackService>(
    () => ({
      openLink: (url) => void window.open(url, "_blank", "noopener,noreferrer"),
      writeWith: (agent) => {
        seedField(agent.spaceId, FEEDBACK_ASK);
        open(agent.spaceId);
      },
    }),
    [open],
  );
  return FEEDBACK_ON ? service : undefined;
}

/** Deleting your own account (ADR 0243), anywhere but the demo's made-up workspace. */
function accountOf(store: Store, device: Device): (() => Promise<void>) | undefined {
  return isDemo(device) ? undefined : () => store.deleteAccount();
}

/** The middle pane: the workspace's log, the agents, you, search, or the space that is open. */
function MiddlePane(p: MiddlePaneProps) {
  // One service for the life of the store: the You screen fetches its lists when the service
  // changes, and a new object on every snapshot would fetch them on every event.
  const people = useMemo<PeopleService>(
    () => ({
      passkeys: () => p.store.passkeys(),
      addPasskey: (name) => registerPasskey(p.device, name),
      revokePasskey: (id) => p.store.revokePasskey(id),
      devices: () => p.store.devices(),
      revokeDevice: (id) => p.store.revokeDevice(id),
      rename: (name) => p.store.rename(name),
      renameWorkspace: (name) => p.store.renameWorkspace(name),
      setMyFace: (face) => p.store.setMyFace(face),
      issuePairingCode: async (forId, replaces) => {
        const issued = await p.store.issuePairingCode(forId, replaces);
        // The server's own answer first: this QR is read by a phone somewhere else, and the only
        // address that works there is one the server knows it answers on. What this page can see
        // is the origin it loaded from — a dev server on another port, or `127.0.0.1`, which
        // names the one device that is not holding the camera. The old guesses stay behind it,
        // for a server that predates the field: the address this device is paired with when the
        // page came from elsewhere (the desktop app), else this page's own origin.
        const base = issued.serverUrl ?? serverUrlOf(p.device);
        return {
          code: issued.code,
          expiresAt: issued.expiresAt,
          relay: issued.relay,
          url: pairingUrl(base, issued.code, { relay: issued.relay, key: issued.serverKey }),
          appUrl: phonePairingUrl(base, issued.code, {
            relay: issued.relay,
            key: issued.serverKey,
          }),
          server: base.replace(/\/$/, ""),
          link: issued.link,
        };
      },
      invites: () => p.store.invites(),
      createInvite: (role, singleUse, spaceId) =>
        p.store.createInvite({
          role,
          singleUse,
          ...(spaceId === undefined ? {} : { spaceId }),
        }),
      revokeInvite: (id) => p.store.revokeInvite(id),
      personDevices: (id) => p.store.personDevices(id),
    }),
    [p.store, p.device],
  );
  const limits = useMemo<LimitsService>(
    () => ({
      set: (caps) => p.store.setAttachmentCaps(caps),
      ceiling: () => p.store.serverLimits().then((found) => found.maxAttachmentBytes),
      setExchange: (next) => p.store.setExchangeLimits(next),
    }),
    [p.store],
  );
  // The Agents page's reads and moves (ADR 0087, Phase 5), one object for the store's life.
  const agents = useMemo<AgentsService>(
    () => ({
      stays: (agentId) => p.store.agentStays(agentId),
      move: (agentId, spaceId) => p.store.moveAgent(agentId, spaceId),
      fork: (agentId, spaceId) => p.store.forkAgent(agentId, spaceId),
      forkRoom: (agentId, title) => p.store.forkIntoNewRoom(agentId, title),
      put: (agentId, spaceId) =>
        p.store.addMember({ spaceId, participantId: agentId, kind: "agent" }),
      newRoom: (agentId, title) => {
        const spaceId = p.store.createSpace({ title });
        p.store.addMember({ spaceId, participantId: agentId, kind: "agent" });
        return spaceId;
      },
      refresh: () => p.store.refreshDirectory(),
      rename: (agentId, name) => p.store.renameAgent(agentId, name),
      archive: (agentId, archived) => p.store.setAgentArchived(agentId, archived),
      remove: (agentId, options) => p.store.deleteAgent(agentId, options),
      lock: (agentId, locked) => p.store.setAgentLock(agentId, locked),
      face: (agentId, face) => p.store.setAgentFace(agentId, face),
    }),
    [p.store],
  );
  // Read by the Connection card on You (ADR 0211), kept the same functions so it does not read
  // them again on every render.
  const roundTrip = useCallback(() => p.store.roundTrip(), [p.store]);
  const goDirect = useCallback(() => p.store.goDirect(), [p.store]);
  const setOnlyDirect = useCallback((on: boolean) => void p.store.setOnlyDirect(on), [p.store]);
  const askDirect = useCallback((tripMs?: number) => p.store.askToGoDirect(tripMs), [p.store]);
  const readMyAsk = useCallback(() => p.store.readMyDirectAsk(), [p.store]);
  const machine = useCallback(
    () => p.store.serverFacts().then((facts) => facts.machine),
    [p.store],
  );
  // The owner's relay switch (ADR 0211, Phase 4); its card draws itself only where there is one.
  const relay = useMemo<RelayService>(
    () => ({
      read: () => p.store.readRelay(),
      set: (on) => p.store.setRelay(on),
      ask: () => p.store.askRelayedToGoDirect(),
      forget: () => p.store.forgetKeptShareLink(),
      relayHost: serverHost(p.device.relayUrl) ?? "The relay",
      serverUrl: p.device.serverUrl,
      machine,
      here: {
        deviceId: p.device.deviceId,
        word: inDesktop() ? "This computer" : "This browser",
      },
      reveal: p.revealRelay,
    }),
    [p.store, p.device, machine, p.revealRelay],
  );
  const notifications = useMemo<NotificationsService>(
    () => ({
      settings: () => p.store.notificationSettings(),
      load: () => p.store.loadNotificationSettings(),
      save: (settings) => p.store.saveNotificationSettings(settings),
      ...(inDesktop() ? {} : { browser: browserPermission() }),
    }),
    [p.store],
  );
  const feedback = useFeedback(p.open);
  if (p.tab === "you") {
    return (
      <You
        feedback={feedback}
        way={{
          connection: p.connection,
          link: p.link,
          since: p.linkSince,
          before: p.linkBefore,
          serverUrl: p.device.serverUrl,
          relayed:
            p.device.relayUrl !== undefined &&
            p.device.serverKey !== undefined &&
            !servedThisPage(p.device.serverUrl ?? ""),
          roundTrip,
          machine,
          owner: myRole(p.model, p.device.participantId) === "owner",
          onlyDirect: p.onlyDirect,
          wentDirect: p.wentDirect,
          goDirect,
          setOnlyDirect,
          myAsk: askSeen(p.myDirectAsk, p.directory),
          askDirect,
          readMyAsk,
          relayOff: relayOffOf(p.model, p.directory, p.device.participantId),
        }}
        relay={relay}
        model={p.model}
        directory={p.directory}
        selfId={p.device.participantId}
        workspaceName={p.workspaceName}
        passkeysWork={passkeysWorkHere()}
        desktop={inDesktop()}
        serverHost={serverHostOf(p.device)}
        busy={p.busy}
        connected={p.connection === "open"}
        people={people}
        onChangeRole={(participantId, role) => p.store.changeRole({ participantId, role })}
        onRemovePerson={(participantId) => p.store.removePerson(participantId)}
        onSignOut={p.onSignOut}
        onDeleteAccount={accountOf(p.store, p.device)}
        muted={p.muted}
        onMute={p.onMute}
        notifications={notifications}
        limits={limits}
        onConnectHarness={p.onConnectHarness}
        workspaces={p.workspaces}
        onSwitch={p.onSwitch}
        onSetRules={(input) => p.store.setRules(input)}
        onStopLetWork={(input) => p.store.stopLetWork(input)}
        spaceIcons={p.spaceIcons}
        onOpenSpace={(spaceId) => p.open(spaceId)}
      />
    );
  }
  if (p.tab === "search") {
    return (
      <Search
        model={p.model}
        directory={p.directory}
        selfId={p.device.participantId}
        session={p.searching}
        online={p.connection === "open"}
        spaceIcons={p.spaceIcons}
        onOpenSpace={(spaceId) => p.open(spaceId)}
        onOpenAgent={p.onOpenAgent}
        onOpenHit={(hit, searched) =>
          p.open(hit.spaceId, hitLine(p.model, hit), hitWords(hit, searched))
        }
        onWake={p.store.wake}
        beside={{
          opened: p.searchBeside,
          onOpen: p.onSearchBeside,
          pane: besidePane(p, agents),
        }}
      />
    );
  }
  if (p.tab === "agents") {
    return (
      <Harnesses
        model={p.model}
        directory={p.directory}
        serverUrl={serverUrlOf(p.device)}
        onOpen={p.open}
        onAdd={(name, { takesDial }) =>
          p.store.addHarness({ name, ...(takesDial ? {} : { capabilities: [] }) })
        }
        selfId={p.device.participantId}
        onTransfer={(harnessId, ownerId) => p.store.transferHarness(harnessId, ownerId)}
        onRemove={(harnessId) => p.store.removeHarness(harnessId)}
        onRestart={(harnessId) => p.store.restartHarness(harnessId)}
        onRun={{
          pause: (run) => p.store.pauseRun(run),
          resume: (run) => p.store.resumeRun(run),
        }}
        onSetRules={(input) => p.store.setRules(input)}
        onSetAutonomy={(input) => p.store.setAutonomy(input)}
        onNewAgent={(harnessId, name) => p.store.askIntoNewRoom(harnessId, name)}
        onDeclare={(harnessId, capabilities) =>
          p.store.declareCapabilities(harnessId, capabilities)
        }
        tokens={{
          list: (harnessId) => p.store.harnessTokens(harnessId),
          issue: (harnessId, name) => p.store.issueHarnessToken(harnessId, name),
          revoke: (harnessId, tokenId) => p.store.revokeHarnessToken(harnessId, tokenId),
        }}
        agents={agents}
        initialAgent={p.agentOpened}
        initialPermissions={p.permissionsOpened}
        banners={p.banners}
        initialAdding={p.connecting}
        files={p.files}
        faces={p.spaceIcons}
        join={joinService(p.store)}
        joins={p.joins}
        cards={p.cards}
        context={p.store}
        heartbeats={p.store}
        windows={p.store}
        models={p.store}
        jobs={p.store}
        look={p.agentsLook}
        connection={p.connection}
        server={serverHostOf(p.device)}
        onWake={p.store.wake}
      />
    );
  }
  const selected = p.selected;
  if (p.takenFrom !== undefined && p.tab === "spaces") {
    return <TakenFrom taken={p.takenFrom} onSeen={p.onTakenSeen} />;
  }
  if (selected === undefined && p.empty !== undefined && p.tab === "spaces") {
    return (
      <NoRooms
        empty={p.empty}
        server={serverHostOf(p.device)}
        harnesses={newSpaceHarnesses(p.directory)}
        onRetry={p.store.wake}
        onNewSpace={p.onNewSpace}
        welcome={welcomeFor(p.model.people, p.directory, p.device.participantId, p.workspace)}
        relay={p.device.relayUrl !== undefined}
      />
    );
  }
  if (selected === undefined) {
    return (
      <main className="conv conv-none" aria-label="Space">
        <h1 className="ui-visually-hidden">Space</h1>
        <p className="conv-empty">Pick a space, or wait for a harness.</p>
      </main>
    );
  }
  return roomView(p, selected);
}

/**
 * What stands beside Search's results (ADR 0269): the room a result opened, at its line, with Open
 * in Spaces at its head, or an agent's page. Nothing for a room or an agent that has gone.
 */
function besidePane(p: MiddlePaneProps, agents: AgentsService): ReactNode {
  const opened = p.searchBeside;
  if (opened === undefined) return undefined;
  if (opened.kind === "agent") {
    if (p.directory[opened.agentId] === undefined) return undefined;
    return (
      <AgentPane
        key={opened.agentId}
        agentId={opened.agentId}
        model={p.model}
        directory={p.directory}
        selfId={p.device.participantId}
        files={p.files}
        faces={p.spaceIcons}
        agents={agents}
        banners={p.banners}
        onSetRules={(input) => p.store.setRules(input)}
        onBack={p.onAgentsList}
        onOpenRoom={(spaceId) =>
          p.onSearchBeside({ kind: "space", key: `space:${spaceId}`, spaceId })
        }
        onOpenAgent={(agentId) =>
          p.onSearchBeside({ kind: "agent", key: `agent:${agentId}`, agentId })
        }
        context={p.store}
        heartbeats={p.store}
        windows={p.store}
        models={p.store}
      />
    );
  }
  const room = spaceById(p.model, opened.spaceId);
  const selected = p.selected;
  if (selected === undefined || selected.id !== (room?.parentSpaceId ?? room?.id)) return undefined;
  return roomView(p, selected, <OpenInSpaces onOpen={() => p.onOpenInSpaces(selected.id)} />);
}

/** A room as the middle pane draws it: on Spaces, and beside Search's results (ADR 0269). */
function roomView(p: MiddlePaneProps, selected: Space, headEnd?: ReactNode) {
  return (
    <SpaceView
      space={selected}
      headEnd={headEnd}
      // A harness waiting here goes by the first name held for its agent (ADR 0150).
      directory={roomDirectory(selected, p.directory)}
      selfId={p.device.participantId}
      connection={p.connection}
      link={p.link}
      busy={p.busy}
      receipts={p.receipts}
      unsentNotes={p.unsentNotes}
      notice={p.notice}
      files={p.files}
      attachmentCaps={p.model.attachmentCaps}
      people={p.model.people}
      model={p.model}
      route={messageRoute(p.model, selected, p.store.sessionPin(selected.id))}
      onPin={(sessionRef) => void p.store.pinSession(selected.id, sessionRef)}
      onExchange={(state) => void p.store.setExchange(selected.id, state)}
      lanes={lanesInSpace(p.model, selected.id)}
      faces={p.spaceIcons}
      onSpace={spaceActions(
        p.store,
        selected,
        p.model,
        p.device.participantId,
        {
          hidden: p.hiddenSpaces?.has(selected.id) === true,
          pinned: p.pinnedSpaces?.includes(selected.id) === true,
        },
        p.workspace,
        p.folders,
      )}
      sheetFor={p.sheetFor}
      onSheetShown={p.onSheetShown}
      onSend={(text, attachments, aim, replyTo) =>
        p.carryOut(parseCommand(text), attachments, aim, replyTo)
      }
      onDecide={p.decide}
      keepsHeldYes={p.keepsHeldYes}
      onRoute={(approval, to, reason) =>
        p.store.routeApproval({
          spaceId: selected.id,
          runId: approval.runId,
          approvalId: approval.approvalId,
          to,
          reason,
        })
      }
      onAnswer={p.answer}
      onFeedback={p.feedback}
      onOpenAgent={p.onOpenAgent}
      onStopLane={(lane) => stopLane(p.store, lane)}
      onStopLetWork={(asker) => p.store.stopLetWork({ spaceId: selected.id, asker })}
      banners={p.banners}
      onOpenPermissions={p.onOpenPermissions}
      onDiscard={(key) => p.store.discard(key)}
      onRead={(seq) => p.store.markRead(selected.id, seq)}
      onLine={p.onLine}
      standing={p.standingIn(selected)}
      jumpTo={p.jumpTo}
    />
  );
}

/**
 * Sign out of this device: withdraw its key at the server, so it is refused from its next
 * request, then forget it here and go back to pairing. The withdrawal failing — the server is
 * away — does not keep the person signed in on a device they meant to leave, and nor does its
 * answer never coming: it is waited for only while the server is reached, and then briefly.
 */
async function signOut(
  store: Store,
  device: Device,
  onSignOut: (() => void) | undefined,
): Promise<void> {
  await withdrawLeaving(store, device.deviceId);
  onSignOut?.();
}

/**
 * A room asked of harnesses from the + (`docs/proposals/new-space.md`, ADR 0084): made on the send,
 * in the phone's order and through the one outbox — the room asked of the first, each of them put
 * in it, then the person's words, which go to them all (ADR 0081: Everyone, before your first
 * message). One harness makes a direct room and several a group. It opens once its event comes
 * back, as a room opened here always has.
 */
/**
 * What a list with no room says (`emptyList`), patient with trouble while none is kept: a launch's
 * blip is the server being reached, and an outage is said once it has lasted (ADR 0166). The space
 * pane and the rail say the same.
 */
/**
 * What the workspace is called now: the server's word at the last hello, else the name this
 * device was paired under, which a rename since has left behind. And what to call it in a
 * sentence, which falls back to where it is when it has no name.
 */
function calledNow(device: Device, snapshot: Snapshot) {
  const workspaceName = snapshot.workspaceName ?? device.workspaceName;
  const workspace = workspaceLabel(
    workspaceName === undefined ? device : { ...device, workspaceName },
  );
  return { workspaceName, workspace };
}

function usePatientEmpty(snapshot: Snapshot): EmptyList {
  const look = emptyList(snapshot);
  const over = hasRooms(snapshot.model) || look === "reading" || look === "none";
  return patientEmpty(look, usePatience(over, troubled(look)));
}

/** Whether there is any room to list: a thread is drawn from its line and a glimpse is not one. */
function hasRooms(model: Snapshot["model"]): boolean {
  return model.spaces.some((space) => space.parentSpaceId === undefined && !space.glimpse);
}

/**
 * A room by the person's name, asked of the harnesses picked, with nothing said in it: each makes
 * its agent on the person's first message there, the first claiming the room and keeping its name
 * (ADRs 0087, 0149), and each agent takes the first name the room holds for it from the start
 * (ADR 0150).
 */
function askForSpace(
  store: Store,
  selfId: string,
  harnessIds: readonly string[],
  title: string,
): string {
  const [first, ...others] = harnessIds;
  if (first === undefined) return store.createSpace({ title });
  const { directory, model } = store.getSnapshot();
  const self = directory[selfId]?.displayName;
  const names = heldNamesFor(harnessIds, directory, model.spaces, self === undefined ? [] : [self]);
  const spaceId = store.createSpace({
    kind: others.length === 0 ? "direct" : "group",
    askedOf: first,
    ...(others.length === 0 ? {} : { alsoAskedOf: others }),
    title,
  });
  for (const harnessId of harnessIds) {
    store.addMember({
      spaceId,
      participantId: harnessId,
      kind: "harness",
      agentName: names[harnessId],
    });
  }
  return spaceId;
}

/**
 * Cancel a lane from its route card (M3.5): the specialist's run is stopped in the lane's home,
 * and Chips tells the lead. Only a lane whose run and home are known can be, which is any lane
 * the specialist's side has reached us for.
 */
function stopLane(store: Store, lane: Lane): void {
  if (lane.runId === undefined || lane.homeSpaceId === undefined) return;
  store.stopRun({
    spaceId: lane.homeSpaceId,
    runId: lane.runId,
    reason: "Cancelled from the route card.",
  });
}

/**
 * What the room sheet may do to a space (M3.3), each an event the store sends but the erase,
 * which is the server's to do (ADR 0067); and what this person may do, as core decides it.
 */
function spaceActions(
  store: Store,
  space: Space,
  model: Snapshot["model"],
  selfId: string,
  { hidden, pinned }: { readonly hidden: boolean; readonly pinned: boolean },
  workspace?: string,
  folders?: Folders,
): SpaceActions {
  const spaceId = space.id;
  return {
    add: (participantId, kind) => store.addMember({ spaceId, participantId, kind }),
    remove: (participantId) => store.removeMember({ spaceId, participantId }),
    leave: () => store.leaveSpace({ spaceId }),
    rename: (title) => store.updateSpace({ spaceId, title }),
    close: () => store.updateSpace({ spaceId, state: "closed" }),
    reopen: () => store.updateSpace({ spaceId, state: "open" }),
    erase: (options) => store.eraseSpace(spaceId, options),
    move: (agentId) => store.moveAgent(agentId, spaceId),
    fork: (agentId) => store.forkAgent(agentId, spaceId),
    ask: (harnessId, name) => store.askAgent(harnessId, spaceId, name),
    takeArrival: () => store.takeArrival(spaceId),
    lead: (agentId) => store.setLead(spaceId, agentId),
    spend: (usd, options) => store.setSpendCeiling(spaceId, usd, options),
    lock: (locked) => store.setLock(spaceId, locked),
    icon: (face) => store.setSpaceIcon(spaceId, face),
    roomSpend: () => store.roomSpend(spaceId),
    refresh: () => store.refreshDirectory(),
    mayArchive: mayArchive(model, space, selfId),
    mayErase: mayErase(model, space, selfId),
    hidden,
    // Core's rule, as the phone's swipe has it: Unhide on a hidden room, Hide on an open one.
    mayHide: hideAct(space, selfId, hidden ? new Set([space.id]) : new Set()) !== undefined,
    hide: (now) => store.setSpaceHidden(spaceId, now),
    pinned,
    // Core's rule, as the phone's swipe has it: Unpin on a pinned room, Pin on an open one, and
    // neither on a room hidden or archived, which keeps its pin for when it is back (ADR 0240).
    mayPin:
      pinAct(space, selfId, pinned ? [spaceId] : [], hidden ? new Set([spaceId]) : new Set()) !==
      undefined,
    pin: (now) => store.setSpacePinned(spaceId, now),
    roomFiles: () => store.roomFiles(spaceId),
    fileVersions: (name) => store.fileVersions(spaceId, name),
    project: projectOf(store, spaceId, folders, selfId),
    invite: (input) => store.createInvite({ ...input, spaceId }),
    withdrawInvite: (inviteId) => store.revokeInvite(inviteId),
    workspace,
  };
}

/**
 * Each room's project as this window reads it, kept: one for each room, so what reads through it
 * reads again when what it reads changes, not whenever the window is drawn again. Made afresh on
 * every draw, the page the Mac opened from the phone read itself again at every change to the
 * store (a presence, a run's state every three seconds), and its frame went back to the top
 * (Arjun, 24 October 2026: "it keeps reloading and going to top").
 */
const projects = new WeakMap<
  Store,
  Map<string, { readonly folders: Folders | undefined; readonly actions: ProjectActions }>
>();

/** A room's project, as the sheet and Universe read it (ADRs 0222, 0227): the same one each time. */
function projectOf(
  store: Store,
  spaceId: string,
  folders: Folders | undefined,
  selfId: string,
): ProjectActions {
  const rooms = projects.get(store) ?? new Map();
  projects.set(store, rooms);
  const kept = rooms.get(spaceId);
  if (kept !== undefined && kept.folders === folders) return kept.actions;
  const actions = projectMade(store, spaceId, folders, selfId);
  rooms.set(spaceId, { folders, actions });
  return actions;
}

function projectMade(
  store: Store,
  spaceId: string,
  folders: Folders | undefined,
  selfId: string,
): ProjectActions {
  return {
    files: (at) => store.projectFiles(spaceId, at),
    file: (path, at) => store.projectFile(spaceId, path, at),
    history: (path) => store.projectHistory(spaceId, path),
    change: (commit) => store.projectChange(spaceId, commit),
    undo: (commit) => store.undoChange(spaceId, commit),
    page: (path, at) => store.projectPage(spaceId, path, at),
    pageUrl: (path, at) => store.projectPageUrl(spaceId, path, at),
    folders,
    universe: () => readUniverse(store, spaceId),
    // Run and Open on the Mac are an owner's, and in the Mac app only for this Mac's server (ADR 0231).
    onTheMac:
      inDesktop() && folders !== undefined
        ? folders.runsHere
        : async () => mayUseMac(store.getSnapshot().model, selfId),
    // What the Run bar names, and who sends from Your folder (SEC-40).
    changedSince: (commit) => {
      const { model, directory } = store.getSnapshot();
      const space = model.spaces.find((each) => each.id === spaceId);
      return changedSince(space?.project, commit, directory, selfId);
    },
    sends: () => {
      const { model } = store.getSnapshot();
      return mayChangeProject(
        model.spaces.find((each) => each.id === spaceId),
        model,
        selfId,
      );
    },
    room: () => {
      const { model, directory } = store.getSnapshot();
      const space = model.spaces.find((each) => each.id === spaceId);
      return { id: spaceId, title: space === undefined ? "" : spaceTitle(space, directory) };
    },
    ownerName: () => {
      const { model, directory } = store.getSnapshot();
      return ownerNameOf(model, directory);
    },
    // An address a page's banner opens (ADR 0227): the Mac's browser, or a tab of this one.
    openLink: inDesktop()
      ? (url) => void desktop().then((shell) => shell?.openLink?.(url))
      : (url) => void window.open(url, "_blank", "noopener,noreferrer"),
    // A browser asks the person's Mac (ADR 0225, ADR 0226); the Mac app opens and runs its own,
    // and opens a page in its browser from the room's folder.
    ...(inDesktop()
      ? folders === undefined
        ? {}
        : { browse: (path: string) => browseOnMac(store, spaceId, folders, path) }
      : {
          openOnMac: () => store.openFolderOnMac(spaceId),
          runs: {
            room: spaceId,
            ask: (ask) => store.runOnMac(spaceId, ask),
            read: () => store.projectRun(spaceId),
            heard: (listen) =>
              store.onRunState((id, run) => {
                if (id === spaceId) listen(run);
              }),
          },
        }),
  };
}

/**
 * A page of the room's project opened in this Mac's browser from the room's folder, brought up to
 * the room's `main` first: why not, or nothing when it opened.
 */
async function browseOnMac(
  store: Store,
  spaceId: string,
  folders: Folders,
  path: string,
): Promise<string | undefined> {
  const { model, directory } = store.getSnapshot();
  const space = model.spaces.find((each) => each.id === spaceId);
  const title = space === undefined ? "This space" : spaceTitle(space, directory);
  await folders.run({ id: spaceId, title }, "view", { file: path });
  return folders.state(spaceId).failed;
}

/** A room's page asked for from another of the person's devices (ADR 0227), and its putting away. */
function usePageAsked(
  folders: Folders,
  store: Store,
  onRoom: (spaceId: string) => void,
): readonly [
  { readonly spaceId: string; readonly title: string; readonly n: number } | undefined,
  () => void,
] {
  const [asked, setAsked] = useState<
    { readonly spaceId: string; readonly title: string; readonly n: number } | undefined
  >(undefined);
  const count = useRef(0);
  const room = useRef(onRoom);
  room.current = onRoom;
  useEffect(
    () =>
      folders.onPage((spaceId) => {
        void desktop().then((shell) => shell?.forward?.());
        const { model, directory } = store.getSnapshot();
        const space = model.spaces.find((each) => each.id === spaceId);
        room.current(spaceId);
        count.current += 1;
        setAsked({
          spaceId,
          title: space === undefined ? "This space" : spaceTitle(space, directory),
          n: count.current,
        });
      }),
    [folders, store],
  );
  return [asked, () => setAsked(undefined)] as const;
}

/** The page asked for from another device, open over the room; nothing while none is. */
function PageAsked(props: {
  readonly asked:
    | { readonly spaceId: string; readonly title: string; readonly n: number }
    | undefined;
  readonly store: Store;
  readonly folders: Folders;
  readonly selfId: string;
  readonly files: FileService;
  readonly onClose: () => void;
}) {
  const { asked } = props;
  if (asked === undefined) return null;
  return (
    <AskedPage
      key={asked.n}
      project={projectOf(props.store, asked.spaceId, props.folders, props.selfId)}
      files={props.files}
      title={asked.title}
      onClose={props.onClose}
    />
  );
}
