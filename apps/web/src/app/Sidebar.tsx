/**
 * The left rail: the workspace, the places to be — Spaces, Search, Agents, Audit — the recent
 * spaces, and the fleet of harnesses with their status and context ring. It is
 * the blueprint's desktop sidebar, built from `@chipschat/ui` on `@chipschat/core`'s model.
 *
 * Select, beside the +, picks rooms to archive, unarchive or delete together (ADR 0181), as the
 * phone's Spaces list does (`select/rooms.tsx`). The rooms the reader hid stand behind a Hidden
 * heading over Archived (ADR 0205), as on the phone.
 */

import {
  agentsTab,
  askedName,
  cantAnswer,
  type Directory,
  type Doing,
  type EmptyList,
  type FleetHarness,
  fleetDoing,
  guestSpaceWords,
  hintWords,
  isShared,
  keepLeaving,
  lastWords,
  listRuns,
  membersName,
  NO_PINS,
  nameOf,
  pausedIn,
  type ReadState,
  type RowMove,
  rowMove,
  runFolding,
  type Space,
  spaceFace,
  spaceWorking,
  type TroubleWord,
  troubleWord,
  unreadCount,
  type WorkspaceModel,
  workspaceHarnesses,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import {
  Avatar,
  type AvatarSize,
  ChipMark,
  ContextRing,
  Dot,
  Icon,
  Pill,
  type Tone,
} from "@chipschat/ui";
import {
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RailMark } from "./Connection.tsx";
import { DoingWord } from "./Doing.tsx";
import { MainTag } from "./MainTag.tsx";
import { useRailMoves } from "./roomMoves.ts";
import { SharedTag } from "./SharedTag.tsx";
import {
  leavingProps,
  PickBar,
  PickHint,
  PickMark,
  pickProps,
  SelectButton,
} from "./select/PickParts.tsx";
import { type RoomActs, useRoomPicking } from "./select/rooms.tsx";
import type { RowPick } from "./select/usePick.ts";
import { relativeTime } from "./time.ts";

export type Tab = "spaces" | "agents" | "audit" | "you" | "search";

/**
 * What the rail says with no open room in it. "No spaces yet" only once the server has said so:
 * an empty model is also a cache still being read and a socket not yet through (ADR 0131).
 */
export function emptyWords(empty: EmptyList | undefined): string {
  switch (empty) {
    case "reading":
      return "";
    case "fetching":
      // The rail holds places for the rooms instead (`Placeholders`).
      return "";
    case "connecting":
      return "Reaching your server\u2026";
    case "closed":
    case "asleep":
      return "Can't reach your server.";
    case "rejected":
      return "This device isn't paired anymore.";
    case "removed":
      return "You're no longer in this workspace.";
    default:
      return "No spaces yet.";
  }
}

export interface SidebarProps {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly readState: ReadState;
  /** The faces this person chose, by space id; carried from the server, not the log. */
  readonly spaceIcons: ReadonlyMap<string, SpaceIcon>;
  /** The rooms this person hid from their list (ADR 0205); carried from the server too. */
  readonly hiddenSpaces?: ReadonlySet<string> | undefined;
  /** The rooms this person pinned to the top (ADR 0240), newest first; from the server too. */
  readonly pinnedSpaces?: readonly string[] | undefined;
  readonly selectedSpaceId: string | undefined;
  /**
   * What stands in the list while it has no open room: core's `emptyList` (ADR 0131). Absent, the
   * server is taken to have said there are none.
   */
  readonly empty?: EmptyList | undefined;
  /** How many rooms the hello listed that have not come in: how many places to hold. */
  readonly awaiting?: number | undefined;
  /**
   * Whether the directory is the server's word yet, now or kept from its last answer (the
   * snapshot's `directoryFrom`). Until it is, no harness listed is not "No harnesses yet".
   * Absent, it is.
   */
  readonly listed?: boolean | undefined;
  /**
   * The connection, for the mark at the top of the rail to wear (`RailMark`, ADR 0131). Absent,
   * the mark is the product's and says nothing.
   */
  readonly reach?: Parameters<typeof RailMark>[0] | undefined;
  /** Who is reading: "You" in a room named by who is in it (ADR 0082). */
  readonly selfId?: string | undefined;
  readonly tab: Tab;
  readonly personName: string;
  readonly onSelectTab: (tab: Tab) => void;
  readonly onSelectSpace: (spaceId: string) => void;
  /**
   * Open the new-space dialog out of the + (`useNewSpaceDialog`, in the shell). Absent for
   * somebody who may not open a space, and then there is no + (ADR 0196).
   */
  readonly onNewSpace?: ((from: HTMLElement | null) => void) | undefined;
  /** Every workspace this browser is paired with, the one in front marked (M5.3). */
  readonly workspaces?: readonly WorkspaceTab[] | undefined;
  readonly onSwitch?: ((deviceId: string) => void) | undefined;
  readonly onPairAnother?: (() => void) | undefined;
  /** Take the demo out of the switcher (ADR 0213): it is in no storage to forget it from. */
  readonly onRemoveDemo?: (() => void) | undefined;
  /** Play the demo's films again, from the switcher (ADR 0213). */
  readonly onWatchDemo?: (() => void) | undefined;
  /** The setup card (ADR 0170), above the rooms, while it has something to say. */
  readonly setup?: ReactNode;
  /** What picked rooms are archived, unarchived and deleted through (ADR 0181); none, no Select. */
  readonly roomActs?: RoomActs | undefined;
}

/** One paired workspace as the switcher lists it (M5.3). */
export interface WorkspaceTab {
  readonly deviceId: string;
  readonly label: string;
  readonly current: boolean;
  readonly muted: boolean;
  readonly needsYou?: number | undefined;
  /** The made-up workspace of the demo (ADR 0213), which Remove takes out. */
  readonly demo?: boolean | undefined;
}

/** What the demo's workspace wears beside its name, so it is never taken for a real one. */
export function DemoTag() {
  return (
    <span className="demo-tag" data-testid="demo-tag">
      Demo
    </span>
  );
}

/** A run's state as a tone: the fleet's pills here, and the Agents page's shelf (ADR 0185). */
export const STATUS_TONE: Record<string, Tone> = {
  running: "blue",
  waiting: "amber",
  failed: "red",
  cancelled: "red",
  done: "green",
  queued: "neutral",
};

export function Sidebar(props: SidebarProps) {
  const { model, directory } = props;
  // Every harness in the workspace, as the phone's fleet lists them, not only those that have
  // run: OpenClaw, connected and never asked anything, read "No harnesses running". One the
  // directory has not heard of yet still shows while its run does.
  const harnesses = [
    ...new Set([
      ...workspaceHarnesses(directory).map((each) => each.id),
      ...model.fleet
        .filter((each) => directory[each.harnessId] === undefined)
        .map((each) => each.harnessId),
    ]),
  ];
  // The agents a person can reach on the Agents page (ADR 0087): its count, as Spaces has one.
  const listed = agentsTab(model, directory, "");
  const agentCount = listed.leads.length + listed.agents.length;
  const rail = useRailRooms(props);

  return (
    <aside
      className="side"
      aria-label="Workspace"
      data-picking={rail.picking ? "true" : undefined}
      data-wave={rail.wave ? "true" : undefined}
    >
      <div className="side-top">
        {props.reach === undefined ? <ChipMark size={20} /> : <RailMark {...props.reach} />}
        <WorkspaceSwitcher
          workspaces={props.workspaces ?? []}
          onSwitch={props.onSwitch}
          onPairAnother={props.onPairAnother}
          onRemoveDemo={props.onRemoveDemo}
          onWatchDemo={props.onWatchDemo}
        />
        {props.workspaces?.find((each) => each.current)?.demo === true ? <DemoTag /> : null}
      </div>

      <nav className="side-nav" aria-label="Sections">
        <NavItem
          icon="chat"
          label="Spaces"
          active={props.tab === "spaces"}
          onClick={() => props.onSelectTab("spaces")}
        />
        <NavItem
          icon="search"
          label="Search"
          active={props.tab === "search"}
          onClick={() => props.onSelectTab("search")}
        />
        <NavItem
          icon="chip"
          label="Agents"
          active={props.tab === "agents"}
          count={agentCount}
          onClick={() => props.onSelectTab("agents")}
        />
        <NavItem
          icon="doc"
          label="Audit"
          active={props.tab === "audit"}
          onClick={() => props.onSelectTab("audit")}
        />
      </nav>

      {props.setup}
      {rail.rooms}

      <div className="side-h">Harnesses</div>
      <ul className="fleet" data-testid="fleet">
        {harnesses.map((harnessId) => {
          const harness = model.fleet.find((each) => each.harnessId === harnessId);
          return (
            <FleetRow
              key={harnessId}
              harness={harness}
              doing={fleetDoing(model.spaces, harness)}
              name={nameOf(directory, harnessId)}
              trouble={troubleWord(cantAnswer(directory, harnessId))}
              onOpen={() => props.onSelectTab("agents")}
              {...(harness?.workingFor === undefined
                ? {}
                : { workingForName: nameOf(directory, harness.workingFor) })}
            />
          );
        })}
        {harnesses.length === 0 && props.listed !== false && (
          <li className="side-empty">No harnesses yet.</li>
        )}
      </ul>

      <button
        type="button"
        className="side-foot"
        aria-label="You"
        data-testid="you"
        data-active={props.tab === "you" ? "true" : undefined}
        onClick={() => props.onSelectTab("you")}
      >
        <Avatar
          name={props.personName}
          kind="person"
          size="xs"
          icon={props.selfId === undefined ? undefined : directory[props.selfId]?.face}
        />
        <span>{props.personName}</span>
        <Icon name="gear" />
      </button>
      {rail.bar}
    </aside>
  );
}

/**
 * The rail's runs of rooms: open, hidden by the reader (ADR 0205), and archived, which a hidden
 * room may be too. An archived space is off the list — closed, on the wire (ADR 0066): the
 * archived ones sit behind one row that says how many, until somebody asks — and the person's word
 * holds once given. Before it is, the room that is open beside the rail stays in sight, archived
 * or not. A harness archives the room of something it has put away (Jacobian, an archived Space),
 * so there can be forty of these. The hidden ones likewise. The open ones start with the rooms the
 * reader pinned (ADR 0240), the newest pin first.
 */
function useRailRuns(
  rooms: readonly Space[],
  hiddenSpaces: ReadonlySet<string> | undefined,
  pinnedSpaces: readonly string[],
  selectedSpaceId: string | undefined,
) {
  // Kept between draws while the rooms are, for the moves to be worked out against (ADR 0205's
  // addendum, `useRailMoves`).
  const live = useMemo(
    () => listRuns(rooms, hiddenSpaces, pinnedSpaces),
    [rooms, hiddenSpaces, pinnedSpaces],
  );
  const { open, hidden, closed } = live;
  const [askedClosed, setAskedClosed] = useState<boolean | undefined>(undefined);
  const [askedHidden, setAskedHidden] = useState<boolean | undefined>(undefined);
  const showClosed = askedClosed ?? closed.some((space) => space.id === selectedSpaceId);
  const showHidden = askedHidden ?? hidden.some((space) => space.id === selectedSpaceId);
  return {
    live,
    open,
    hidden,
    closed,
    showHidden,
    showClosed,
    toggleHidden: () => setAskedHidden(!showHidden),
    toggleClosed: () => setAskedClosed(!showClosed),
    visible: [...open, ...(showHidden ? hidden : []), ...(showClosed ? closed : [])],
  };
}

/**
 * The rail's rooms: the Recent heading, the open rooms, and the archived ones behind their row;
 * and, while the rail picks rooms to archive, unarchive or delete together (ADR 0181), the line
 * under the heading, the rows as checkboxes, and the bar of acts, which stands at the rail's foot,
 * after everything else.
 */
function useRailRooms(props: SidebarProps): {
  readonly picking: boolean;
  /** Read has just taken the rooms' counts, which go down the rail a beat a row. */
  readonly wave: boolean;
  readonly rooms: ReactNode;
  readonly bar: ReactNode;
} {
  const { model, directory, readState, spaceIcons } = props;
  const pinned = props.pinnedSpaces ?? NO_PINS;
  // A thread is drawn from the line it grew from, not listed as a room of its own (M5.4). A
  // room the reader only glimpses through an ask that named them is not listed either
  // (ADR 0042): they are not in it.
  const rooms = useMemo(
    () => model.spaces.filter((space) => space.parentSpaceId === undefined && !space.glimpse),
    [model.spaces],
  );
  const {
    live,
    open,
    hidden,
    closed,
    showHidden,
    showClosed,
    toggleHidden,
    toggleClosed,
    visible,
  } = useRailRuns(rooms, props.hiddenSpaces, pinned, props.selectedSpaceId);
  const titleOf = (space: Space) => roomTitle(space, directory, props.selfId);
  const picks = useRoomPicking({
    model,
    directory,
    readState,
    selfId: props.selfId,
    rooms,
    visible,
    hidden: props.hiddenSpaces,
    acts: props.roomActs,
    titleOf,
  });
  // Rooms moving from one run to another, or off the rail (ADR 0205's addendum): slid off the edge
  // their act goes towards, folded shut, and landed where they go.
  const moved = useRailMoves({
    workspace: props.workspaces?.find((each) => each.current)?.deviceId,
    live,
    showHidden,
    showClosed,
    skip: (id) => picks.leaving.has(id),
  });
  // Rooms archived, unarchived or deleted with Select, held where they stood until they have
  // folded away; and those moving, where they should be.
  const held = [...picks.leaving.values()];
  const shown = (run: "open" | "hidden" | "closed", rows: readonly Space[]) =>
    moved.drawn(
      run,
      keepLeaving(
        rows,
        held.filter((each) => each.run === run),
      ),
    );
  const shownOpen = shown("open", open);
  const shownHidden = shown("hidden", hidden);
  const shownClosed = shown("closed", closed);
  // Whether the rail has been drawn before: a heading that comes after opens into its place.
  const drawnBefore = useRef(false);
  useEffect(() => {
    drawnBefore.current = true;
  }, []);
  const locked = visible.some((space) => space.locked === true);
  const hint = hintWords(
    locked,
    visible.some((space) => space.home === true && !picks.may(space)),
  );
  const pickOf = (space: Space, run: string) =>
    props.roomActs === undefined ? undefined : picks.rowOf(space, run);
  // A row, drawn in the open rooms, the hidden ones or the archived ones.
  const row = (run: "open" | "hidden" | "closed") => (space: Space, index: number) => (
    <SpaceRow
      key={space.id}
      order={index}
      space={space}
      directory={directory}
      unread={unreadCount(space, readState)}
      selected={space.id === props.selectedSpaceId}
      onSelect={() => props.onSelectSpace(space.id)}
      icon={spaceIcons.get(space.id)}
      hidden={props.hiddenSpaces?.has(space.id) === true}
      pinned={run === "open" && pinned.includes(space.id)}
      selfId={props.selfId}
      pick={pickOf(space, run)}
      move={rowMove(moved.moves, space.id, run)}
      onMoveEnd={(event) => moved.onAnimationEnd(space.id, event)}
    />
  );
  return {
    picking: picks.picking,
    wave: picks.wave,
    rooms: (
      <>
        <Recent
          onNew={props.onNewSpace}
          picking={picks.picking}
          count={picks.chosen.length}
          select={
            picks.any || picks.picking ? (
              <SelectButton
                picking={picks.picking}
                onClick={picks.picking ? picks.stop : picks.start}
                testId="select-spaces"
              />
            ) : null
          }
        />
        {props.roomActs !== undefined && (
          <PickHint
            shown={picks.picking}
            words={hint}
            all={picks.all}
            onAll={picks.onAll}
            testId="pick-hint"
          />
        )}
        <OpenRooms
          open={shownOpen}
          pinned={pinned}
          anyRooms={rooms.length > 0}
          empty={props.empty}
          awaiting={props.awaiting}
          row={row("open")}
        />
        <GuestNote model={model} directory={directory} selfId={props.selfId} />
        {shownHidden.length > 0 && (
          <>
            <PutAwayHeading
              kind="hidden"
              count={shownHidden.length}
              shown={showHidden}
              onToggle={toggleHidden}
              later={drawnBefore.current}
              folding={runFolding("hidden", shownHidden, moved.moves)}
            />
            {showHidden && (
              <ul className="convos" data-testid="hidden-list">
                {shownHidden.map(row("hidden"))}
              </ul>
            )}
          </>
        )}
        {shownClosed.length > 0 && (
          <>
            <PutAwayHeading
              kind="archived"
              count={shownClosed.length}
              shown={showClosed}
              onToggle={toggleClosed}
              later={drawnBefore.current}
              folding={runFolding("closed", shownClosed, moved.moves)}
            />
            {showClosed && (
              <ul className="convos" data-testid="archived-list">
                {shownClosed.map(row("closed"))}
              </ul>
            )}
          </>
        )}
      </>
    ),
    bar:
      props.roomActs === undefined ? null : (
        <>
          <PickBar
            shown={picks.picking}
            read={picks.read}
            left={picks.left}
            erase={picks.erase}
            note={picks.note}
            onNoteGone={picks.clearNote}
            place="rail"
          />
          {picks.dialog}
        </>
      ),
  };
}

/**
 * What a row calls its room: its title, else what it was asked as, else who is in it, the reader
 * as "You" (ADR 0082).
 */
function roomTitle(space: Space, directory: Directory, selfId: string | undefined): string {
  return space.title ?? askedName(space) ?? membersName(space.members, directory, selfId);
}

/**
 * Which workspace is in front, and the others this browser is paired with (M5.3): a name when
 * there is one place to be, a picker when there are several, each with what it needs. The
 * desktop shell can pair with another server from here; a browser tab is served by one.
 */
function WorkspaceSwitcher(props: {
  readonly workspaces: readonly WorkspaceTab[];
  readonly onSwitch: ((deviceId: string) => void) | undefined;
  readonly onPairAnother: (() => void) | undefined;
  readonly onRemoveDemo: (() => void) | undefined;
  readonly onWatchDemo?: (() => void) | undefined;
}) {
  const current = props.workspaces.find((each) => each.current);
  const several = props.workspaces.length > 1 && props.onSwitch !== undefined;
  // The demo is listed with a way out of it: Remove, and with it in front, setting up your own.
  const demo =
    props.onRemoveDemo === undefined ? undefined : props.workspaces.find((each) => each.demo);
  if (!several && props.onPairAnother === undefined && demo === undefined) {
    return <b data-testid="workspace-name">{current?.label ?? "Chips"}</b>;
  }
  return (
    <span className="side-switch" data-testid="workspace-switcher">
      <select
        aria-label="Workspace"
        value={current?.deviceId ?? ""}
        onChange={(event) => {
          const chosen = event.target.value;
          if (chosen === "+") props.onPairAnother?.();
          else if (chosen === REMOVE_DEMO) props.onRemoveDemo?.();
          else if (chosen === WATCH_DEMO) props.onWatchDemo?.();
          else props.onSwitch?.(chosen);
        }}
      >
        {props.workspaces.map((workspace) => (
          <option key={workspace.deviceId} value={workspace.deviceId}>
            {workspace.label}
            {workspace.muted ? " · muted" : ""}
            {workspace.needsYou !== undefined && workspace.needsYou > 0
              ? ` · ${workspace.needsYou} waiting`
              : ""}
          </option>
        ))}
        {props.onPairAnother !== undefined && (
          <option value="+">
            {current?.demo === true ? "Set up my own Chips…" : "Pair another server…"}
          </option>
        )}
        {/* The films, for anyone the switcher is drawn for: a newcomer who looked around has no
            end card to go back to, and somebody set up never saw the welcome that offers them (the
            demo's walk, 21 October 2026). */}
        {props.onWatchDemo !== undefined && <option value={WATCH_DEMO}>Watch Chips work…</option>}
        {demo !== undefined && <option value={REMOVE_DEMO}>Remove {demo.label}</option>}
      </select>
    </span>
  );
}

/** The switcher's options that take the demo out, and play its films again (ADR 0213). */
const REMOVE_DEMO = "-demo";
const WATCH_DEMO = "-watch";

/**
 * The open rooms, or what stands in for them while there are none: places held for rooms on their
 * way, or a word on what is going on (`emptyWords`). The rooms fade in over a stand-in.
 */
function OpenRooms(props: {
  readonly open: readonly Space[];
  /** The rooms pinned (ADR 0240): when they change, the rows glide to their new places. */
  readonly pinned: readonly string[];
  /** Whether there is any room at all, archived ones included. */
  readonly anyRooms: boolean;
  readonly empty: EmptyList | undefined;
  readonly awaiting: number | undefined;
  readonly row: (space: Space, index: number) => ReactNode;
}) {
  const { open, anyRooms, empty } = props;
  const standing = !anyRooms && empty !== undefined && empty !== "reading";
  const arriving = useArrival(standing, anyRooms);
  // With archived rooms only, the rail has none open, which is what it has always said.
  const words = open.length === 0 ? emptyWords(anyRooms ? "none" : empty) : "";
  const list = useRef<HTMLUListElement>(null);
  usePinGlide(list, props.pinned);
  return (
    <ul
      ref={list}
      className="convos"
      data-testid="space-list"
      data-arrive={arriving ? "true" : undefined}
    >
      {open.map(props.row)}
      {!anyRooms && empty === "fetching" && <Placeholders count={props.awaiting ?? 3} />}
      {words === "" ? null : (
        <li className="side-empty" data-testid="side-empty">
          {words}
        </li>
      )}
    </ul>
  );
}

/** How long a row takes to glide to its place when a pin moves it, as the phone's spring does. */
const GLIDE_MS = 460;

/**
 * The open rows gliding to their new places when the reader pins or unpins a room (ADR 0240),
 * rather than jumping there: each row's place in the list is kept at every draw, and at the draw
 * after the pins change each row that moved starts where it stood and glides home, the room the
 * pin is for lifted on a shadow over the rows it passes. Places are read in the list, not the
 * window, so a scroll between draws moves nothing. Nothing else that reorders the rail glides, and
 * with reduced motion nothing does.
 */
function usePinGlide(
  list: { readonly current: HTMLUListElement | null },
  pinned: readonly string[],
) {
  const stood = useRef(new Map<string, number>());
  const pinnedBefore = useRef(pinned);
  useLayoutEffect(() => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("[data-space]") ?? [])];
    const now = new Map(rows.map((row) => [spaceOf(row), row.offsetTop]));
    const was = pinnedBefore.current;
    const before = stood.current;
    pinnedBefore.current = pinned;
    stood.current = now;
    if (was === pinned || stillMotion()) return;
    const moved = pinsChanged(was, pinned);
    for (const row of rows) {
      const id = spaceOf(row);
      const from = (before.get(id) ?? now.get(id) ?? 0) - (now.get(id) ?? 0);
      if (from !== 0) glide(row, from, moved.has(id));
    }
  });
}

/** The room a rail row stands for. */
function spaceOf(row: HTMLElement): string {
  return row.dataset["space"] ?? "";
}

/** Whether the reader asked for less motion. */
function stillMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** The rooms pinned or unpinned between two lists of pins. */
function pinsChanged(was: readonly string[], now: readonly string[]): ReadonlySet<string> {
  return new Set([
    ...was.filter((id) => !now.includes(id)),
    ...now.filter((id) => !was.includes(id)),
  ]);
}

/**
 * A row starting `from` pixels from its place and gliding home, lifted if its room is the one the
 * pin is for. A browser without the Web Animations API (and jsdom) puts it in place at once.
 */
function glide(row: HTMLElement, from: number, lifted: boolean): void {
  const lift = lifted ? LIFTED : {};
  row
    .closest("li")
    ?.animate?.(
      [
        { transform: `translateY(${from}px)`, ...lift },
        { transform: "none", ...lift, offset: 0.85 },
        { transform: "none" },
      ],
      { duration: GLIDE_MS, easing: "cubic-bezier(0.3, 0.85, 0.25, 1)" },
    );
}

/** The room a pin moves, lifted over the rows it passes. */
const LIFTED = {
  position: "relative",
  zIndex: "1",
  boxShadow: "0 10px 24px -12px rgb(0 0 0 / 0.35)",
};

/** Under a guest's one room, why there is one: whose guest they are (ADR 0196). */
function GuestNote(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
}) {
  const { model, directory, selfId } = props;
  const words = selfId === undefined ? undefined : guestSpaceWords(model, directory, selfId);
  if (words === undefined) return null;
  return (
    <p className="side-empty side-note" data-testid="side-guest-note">
      {words}
    </p>
  );
}

/** The most places the rail holds for rooms on their way: about what it shows above the fold. */
const MOST_PLACES = 5;

/** Rows in the rows' own shape, breathing, for rooms the hello listed that have not come in. */
function Placeholders(props: { readonly count: number }) {
  const rows = Math.max(1, Math.min(props.count, MOST_PLACES));
  return (
    <>
      <li className="ui-visually-hidden" aria-live="polite">
        Loading spaces
      </li>
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have nothing else to be told apart by
        <li key={index} className="cv cv-ph" aria-hidden="true" data-testid="side-placeholder">
          <span className="cv-ph-face" />
          <span className="cv-ph-lines">
            <span style={{ width: `${PLACE_WIDTHS[index % PLACE_WIDTHS.length]}%` }} />
            <span />
          </span>
        </li>
      ))}
    </>
  );
}

/** How long each placeholder's name is, so the rows do not read as one stamp. */
const PLACE_WIDTHS = [62, 44, 54, 70, 40] as const;

/**
 * Whether the rooms are arriving over what stood in for them: true for the moment they first come
 * in after a stand-in, so they fade in, and false for rooms that were there from the start and for
 * any that come later, which simply appear. Set before paint, so no row is drawn and then hidden.
 */
function useArrival(standing: boolean, here: boolean): boolean {
  const [arriving, setArriving] = useState(false);
  const stood = useRef(false);
  useLayoutEffect(() => {
    if (standing) {
      stood.current = true;
      return;
    }
    if (!here || !stood.current) return;
    stood.current = false;
    setArriving(true);
    const timer = setTimeout(() => setArriving(false), ARRIVE_MS + 100);
    return () => clearTimeout(timer);
  }, [standing, here]);
  return arriving;
}

/** How long the rooms take to fade in over their places (`styles.css`, `.convos[data-arrive]`). */
const ARRIVE_MS = 260;

/**
 * The Recent heading and its plus, which opens the new-space dialog (`NewSpace.tsx`) out of itself:
 * a room asked of the harnesses picked, or a room of people. The shell holds the dialog, since an
 * empty workspace's Create a space opens it too (ADR 0131). Select stands beside the plus; while
 * the rail picks, the heading says how many are picked and the plus steps aside (ADR 0181).
 */
function Recent(props: {
  readonly onNew: ((from: HTMLElement | null) => void) | undefined;
  readonly picking: boolean;
  readonly count: number;
  readonly select: ReactNode;
}) {
  const plus = useRef<HTMLButtonElement>(null);
  const heading = !props.picking
    ? "Recent"
    : props.count === 0
      ? "Select spaces"
      : `${props.count} selected`;
  return (
    <div className="side-h side-h-row" data-picking={props.picking ? "true" : undefined}>
      <span className="side-h-word" data-testid="recent-heading">
        {heading}
      </span>
      <span className="side-h-acts">
        {props.select}
        {props.onNew === undefined ? null : (
          <button
            ref={plus}
            type="button"
            className="side-new"
            aria-label="Create new space"
            data-testid="new-space"
            aria-haspopup="dialog"
            inert={props.picking}
            onClick={() => props.onNew?.(plus.current)}
          >
            <Icon name="plus" size={16} />
          </button>
        )}
      </span>
    </div>
  );
}

function NavItem(props: {
  readonly icon: "chat" | "chip" | "hash" | "doc" | "search";
  readonly label: string;
  readonly active: boolean;
  readonly count?: number;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="sn"
      data-active={props.active ? "true" : undefined}
      aria-current={props.active ? "page" : undefined}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
      <span>{props.label}</span>
      {props.count !== undefined && props.count > 0 && <b className="sn-count">{props.count}</b>}
    </button>
  );
}

/**
 * The avatar a space row wears: the name it goes by — its harness with a status ring when it is
 * called after the harness, the title's initials when it has one, a hash for a channel. Core's
 * `spaceFace` decides which, so the phone's list and this rail cannot disagree.
 */
export function spaceAvatar(
  space: Space,
  directory: Directory,
  title: string,
  icon: SpaceIcon | undefined,
  /** There is work going in the room: the light runs round its face (ADR 0090). */
  busy = false,
  /** A row's, or the room sheet's head's (ADR 0202). */
  size: AvatarSize = "sm",
) {
  const face = spaceFace(space, directory);
  if (face.kind !== "harness")
    return <Avatar name={title} kind={face.kind} icon={icon} busy={busy} size={size} />;
  return (
    <Avatar
      name={faceName(space, directory, title)}
      kind="harness"
      status={face.status}
      icon={icon}
      busy={busy}
      size={size}
    />
  );
}

/** The name a row's face is drawn from (`spaceAvatar`): its harness's, where it wears the harness. */
function faceName(space: Space, directory: Directory, title: string): string {
  const face = spaceFace(space, directory);
  return face.kind === "harness" ? nameOf(directory, face.harnessId) : title;
}

/**
 * The heading over the hidden rooms or the archived ones: how many, and a chevron that opens them
 * (ADR 0205). It opens into its place when it comes with its first room after the rail was first
 * drawn, folds away with its last (ADR 0205's addendum), and Hidden's shut eye blinks as a room
 * comes under it.
 */
function PutAwayHeading(props: {
  readonly kind: "hidden" | "archived";
  readonly count: number;
  readonly shown: boolean;
  readonly onToggle: () => void;
  /** It comes after the rail was first drawn: it opens into place. */
  readonly later: boolean;
  /** Its last room is folding away, and it goes with it. */
  readonly folding: boolean;
}) {
  const [arriving, setArriving] = useState(props.later);
  const was = useRef(props.count);
  const [blinks, setBlinks] = useState(0);
  useEffect(() => {
    if (props.count > was.current) setBlinks((now) => now + 1);
    was.current = props.count;
  }, [props.count]);
  const name = props.kind === "hidden" ? "Hidden" : "Archived";
  return (
    <div
      className="side-put"
      data-arriving={arriving ? "true" : undefined}
      data-folding={props.folding ? "true" : undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setArriving(false);
      }}
    >
      <button
        type="button"
        className="side-h side-h-row side-closed"
        aria-expanded={props.shown}
        onClick={props.onToggle}
        data-testid={`${props.kind}-toggle`}
      >
        {props.kind === "hidden" ? (
          <span className="side-put-name">
            <span key={blinks} className={blinks > 0 ? "side-blink" : undefined}>
              <Icon name="hide" size={13} />
            </span>
            {`${name} \u00b7 ${props.count}`}
          </span>
        ) : (
          <span>{`${name} \u00b7 ${props.count}`}</span>
        )}
        <Icon name="down" size={14} className="side-turn" />
      </button>
    </div>
  );
}

/** What a row's `li` says of its room's move, for the rail's styles to draw (ADR 0205's addendum). */
function moveProps(move: RowMove | undefined) {
  if (move === undefined) return {};
  if ("landing" in move) return { "data-move": "landing", "data-side": move.landing };
  return { "data-move": move.folding ? "folding" : "sliding", "data-side": move.going };
}

function SpaceRow(props: {
  /** Where it stands in its run of rows, which says how far down a wave its count goes. */
  readonly order: number;
  readonly space: Space;
  readonly directory: Directory;
  readonly unread: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** The face this person chose for the room on any of their devices, where they chose one. */
  readonly icon: SpaceIcon | undefined;
  /** A room the reader hid (ADR 0205): the shut eye before its time, its count quiet. */
  readonly hidden: boolean;
  /** A room the reader pinned (ADR 0240), in the open rooms: a pin before its time, leaning. */
  readonly pinned: boolean;
  readonly selfId: string | undefined;
  /** While the rail picks, the row is a checkbox (ADR 0181); and how it goes, as it goes. */
  readonly pick?: RowPick | undefined;
  /** Its room is moving to another run, or off the rail (ADR 0205's addendum). */
  readonly move?: RowMove | undefined;
  /** One of its animations has ended, which may be a step of its move. */
  readonly onMoveEnd?: ((event: AnimationEvent<HTMLElement>) => void) | undefined;
}) {
  const { space, directory, pick } = props;
  const title = roomTitle(space, directory, props.selfId);
  // Somebody besides the reader reads it (ADR 0234): the row wears the shared tag, as the phone's.
  const shared = props.selfId !== undefined && isShared(space, directory, props.selfId);
  const waiting = space.run?.state === "waiting";
  // The phone's rule, from core: "Needs a yes", or the last line as plain words, not Markdown.
  const snippet = lastWords(space, directory);
  // Work going in the room, whether a run of its own or a turn out of the harness's queue
  // (ADR 0090): the light runs round the face, and the gear stands where the harness's own
  // thought-bubble emoji used to be read out.
  const working = spaceWorking(space);
  // Chips holds the agents' messages to each other here until a person acts (ADR 0097).
  const paused = pausedIn(space);

  return (
    <li
      {...leavingProps(pick)}
      {...moveProps(props.move)}
      onAnimationEnd={(event) => {
        leavingProps(pick).onAnimationEnd?.(event);
        props.onMoveEnd?.(event);
      }}
      style={{ "--i": props.order } as CSSProperties}
    >
      <button
        type="button"
        className="cv"
        data-space={space.id}
        data-active={props.selected ? "true" : undefined}
        data-closed={space.state === "closed" ? "true" : undefined}
        data-hidden={props.hidden ? "true" : undefined}
        {...pickProps(pick)}
        onClick={(event) =>
          pick?.active === true ? pick.onPick(event.shiftKey) : props.onSelect()
        }
      >
        <span className="cv-face">
          <PickMark pick={pick} />
          {spaceAvatar(space, directory, title, props.icon, working)}
        </span>
        <div className="cv-body">
          <div className="cv-t">
            <b>{title}</b>
            <RowMark hidden={props.hidden} pinned={props.pinned} />
            {space.lastActivityAt !== undefined && (
              <span className="cv-time">{relativeTime(space.lastActivityAt)}</span>
            )}
          </div>
          <div className="cv-s">
            {/* A harness's Main room says so, in its face's colour (ADR 0145). */}
            {space.home === true && (
              <MainTag name={faceName(space, directory, title)} icon={props.icon} />
            )}
            {shared && <SharedTag />}
            {waiting && <Dot tone="amber" />}
            {working && <Icon name="cog" size={13} className="cv-gear" />}
            {paused && (
              <Pill tone="red" dot="solid">
                <span data-testid="paused">Paused</span>
              </Pill>
            )}
            <span>{paused ? "Chips paused the agents" : snippet}</span>
          </div>
        </div>
        <Unread count={props.unread} />
      </button>
    </li>
  );
}

/**
 * What a row wears before its time: the shut eye on a room the reader hid (ADR 0205), or a leaning
 * pin on one they pinned (ADR 0240). A hidden room stands under Hidden, so it never wears both.
 */
function RowMark(props: { readonly hidden: boolean; readonly pinned: boolean }) {
  if (props.hidden) return <Icon name="hide" size={12} className="cv-shut" label="Hidden" />;
  if (props.pinned) return <Icon name="pin" size={12} className="cv-shut cv-pin" label="Pinned" />;
  return null;
}

/**
 * A row's unread count. Read, it swells a little and shrinks away rather than blinking out (ADR
 * 0181 addendum, 18 October 2026), down the rail a beat a row when Read took several
 * (`.side[data-wave]`); what it last said stays while it goes, unheard.
 */
function Unread({ count }: { readonly count: number }) {
  const last = useRef(count);
  const [gone, setGone] = useState(count === 0);
  if (count > 0) last.current = count;
  useEffect(() => {
    if (count > 0) setGone(false);
  }, [count]);
  if (count === 0 && gone) return null;
  return count > 0 ? (
    <b className="cv-unread" data-testid="unread">
      {count}
    </b>
  ) : (
    <b
      className="cv-unread"
      data-going="true"
      aria-hidden="true"
      onAnimationEnd={() => setGone(true)}
    >
      {last.current}
    </b>
  );
}

const STATUS_WORD: Record<string, string> = {
  running: "Working",
  waiting: "Waiting on you",
  failed: "Failed",
  cancelled: "Stopped",
  done: "Done",
  queued: "Queued",
};

/**
 * One harness, rolled up across every space it works in (ADR 0024). What it is doing comes from
 * its latest run; how many terminals are open on it comes from its visits, and a harness can
 * have one without the other — a terminal sitting idle has no run, and a run that finished
 * yesterday has no terminal.
 *
 * One that can't answer says so, in the shelf's word and in amber, with a hollow dot (ADR 0083,
 * ADR 0185); not what its last run was doing, which was from before it went. Until 17 October
 * 2026 the row said Working, or nothing, for a harness that was offline.
 */
function FleetRow({
  harness,
  doing,
  name,
  trouble,
  workingForName,
  onOpen,
}: {
  /** Nothing when it has neither run nor opened a session: a harness only added so far. */
  readonly harness: FleetHarness | undefined;
  /** What its latest run is at, while it is at it: said as its bubble says it (`DoingWord`). */
  readonly doing: Doing | undefined;
  readonly name: string;
  /** Why it can't answer now, in a word; absent while it can. */
  readonly trouble?: TroubleWord | undefined;
  /** The lead this harness's latest run answers to, when that run is a lane (M3.2). */
  readonly workingForName?: string | undefined;
  /** Open the Agents page, where its agents and its card are (ADR 0087, Phase 5). */
  readonly onOpen?: (() => void) | undefined;
}) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the Agents nav item above is the keyboard's way there.
    <li onClick={onOpen} className={onOpen === undefined ? undefined : "fleet-open"}>
      <Pill {...rowPill(harness, trouble)}>{name}</Pill>
      {trouble !== undefined ? (
        <span className="fleet-word" data-testid="fleet-word" data-tone="amber">
          {trouble}
        </span>
      ) : (
        <span className="fleet-word" data-testid="fleet-word">
          <FleetWord harness={harness} doing={doing} />
          {workingForName !== undefined && (
            <span className="fleet-for" data-testid="fleet-for">
              {" "}
              for {workingForName}
            </span>
          )}
        </span>
      )}
      {harness !== undefined && harness.liveSessions > 0 && (
        <span
          className="fleet-live"
          data-testid="fleet-live"
          title={`${harness.liveSessions} open ${harness.liveSessions === 1 ? "session" : "sessions"} across ${harness.spaceCount} ${harness.spaceCount === 1 ? "space" : "spaces"}`}
        >
          {harness.liveSessions}&nbsp;live
        </span>
      )}
      {harness?.contextPercent !== undefined && (
        <ContextRing
          percent={harness.contextPercent}
          label={`${name}'s context, ${harness.contextPercent}% full`}
        />
      )}
    </li>
  );
}

/** A row's pill: amber and hollow while it can't answer; else its run's tone, or plain. */
function rowPill(
  harness: FleetHarness | undefined,
  trouble: TroubleWord | undefined,
): { readonly tone: Tone; readonly dot: "solid" | "hollow" | "none" } {
  if (trouble !== undefined) return { tone: "amber", dot: "hollow" };
  if (harness === undefined || !saysStatus(harness)) return { tone: "neutral", dot: "none" };
  return { tone: STATUS_TONE[harness.status ?? ""] ?? "neutral", dot: "solid" };
}

/**
 * What a row says beside its name: while its run is at work, the top line of that run's bubble,
 * held as the bubble holds it (ADR 0147); otherwise one word, or nothing.
 */
export function FleetWord({
  harness,
  doing,
}: {
  readonly harness: FleetHarness | undefined;
  readonly doing: Doing | undefined;
}) {
  if (harness === undefined) return null;
  if (doing !== undefined && saysStatus(harness) && !harness.paused) {
    return <DoingWord doing={doing} />;
  }
  return <>{fleetWord(harness)}</>;
}

/**
 * Whether a row says a status at all (ADR 0050 rule 1, as the phone's fleet has it): a harness
 * with something going on says so, and one that is idle or has finished says nothing. Done was a
 * green dot that stayed for good, and it went on saying so while the harness was stopped.
 */
export function saysStatus(harness: FleetHarness): boolean {
  if (harness.paused) return true;
  return (
    harness.status !== undefined && harness.status !== "done" && harness.status !== "cancelled"
  );
}

/**
 * What a harness is doing, in one word, when it is doing something. One with nothing going on
 * says nothing, unless a terminal is open on it: "Idle" is the honest word for that.
 */
function fleetWord(harness: FleetHarness): string {
  if (harness.paused) return "Paused";
  if (!saysStatus(harness)) return harness.liveSessions > 0 ? "Idle" : "";
  return STATUS_WORD[harness.status ?? ""] ?? harness.status ?? "";
}
