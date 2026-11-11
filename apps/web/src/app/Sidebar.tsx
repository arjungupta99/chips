/**
 * The left rail: the workspace and the + beside its name, the places to be — Spaces, Agents, Search
 * and You, the phone's tabs in its order — and the recent spaces, as the iPad's sidebar has them
 * (ADR 0264's second addendum). The harnesses are on Agents, as on the phone and the iPad: the rail
 * listed them under the rooms until 3 November 2026 (ADR 0261's addendum).
 * It is the blueprint's desktop sidebar, built from `@chipschat/ui` on `@chipschat/core`'s model.
 *
 * Select, over the rooms, picks rooms to archive, unarchive or delete together (ADR 0181), as the
 * phone's Spaces list does (`select/rooms.tsx`). The rooms the reader hid stand behind a Hidden
 * heading over Archived (ADR 0205), as on the phone.
 */

import {
  agentsTab,
  type Directory,
  type Doing,
  type EmptyList,
  type FleetHarness,
  guestSpaceWords,
  hintWords,
  isShared,
  keepLeaving,
  lastWords,
  listRuns,
  NO_PINS,
  nameOf,
  pausedIn,
  type ReadState,
  type RowMove,
  rowMove,
  runFolding,
  type Space,
  spaceFace,
  spaceRowActs,
  spaceTitle,
  spaceWorking,
  unreadCount,
  type WorkspaceModel,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, type AvatarSize, ChipMark, Dot, Icon, Pill, type Tone } from "@chipschat/ui";
import {
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useColumnsShell } from "./Columns.tsx";
import { RailMark } from "./Connection.tsx";
import { DoingWord } from "./Doing.tsx";
import { MainTag } from "./MainTag.tsx";
import { menuPoint, type RowActs, type RowMenuAsk, useLeaving, useRowMenu } from "./RowMenu.tsx";
import { moving, useRailMoves } from "./roomMoves.ts";
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
import { WorkspaceMenu, type WorkspaceTab } from "./WorkspaceMenu.tsx";

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
   * The connection, for the mark at the top of the rail to wear (`RailMark`, ADR 0131). Absent,
   * the mark is the product's and says nothing.
   */
  readonly reach?: Parameters<typeof RailMark>[0] | undefined;
  /** Who is reading: "You" in a room named by who is in it (ADR 0082). */
  readonly selfId?: string | undefined;
  readonly tab: Tab;
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
  /** Name the workspace in front again, from the switcher: its owner's (ADR 0194). */
  readonly onRenameWorkspace?: ((name: string) => Promise<void>) | undefined;
  /** In the Mac app, not a browser: what the switcher says the demo goes from. */
  readonly desktop?: boolean | undefined;
  /** The setup card (ADR 0170), above the rooms, while it has something to say. */
  readonly setup?: ReactNode;
  /** What picked rooms are archived, unarchived and deleted through (ADR 0181); none, no Select. */
  readonly roomActs?: RoomActs | undefined;
  /** What a row's right-click menu pins, hides, archives and deletes through; none, no menu. */
  readonly rowActs?: RowActs | undefined;
}

export type { WorkspaceTab } from "./WorkspaceMenu.tsx";

/** What the demo's workspace wears beside its name, so it is never taken for a real one. */
export function DemoTag() {
  return (
    <span className="demo-tag" data-testid="demo-tag">
      Demo
    </span>
  );
}

/** A run's state as a tone: the Agents page's shelf, cards and harness page (ADR 0185). */
export const STATUS_TONE: Record<string, Tone> = {
  running: "blue",
  waiting: "amber",
  paused: "amber",
  failed: "red",
  cancelled: "red",
  done: "green",
  queued: "neutral",
};

export function Sidebar(props: SidebarProps & { readonly rooms?: boolean | undefined }) {
  const { model, directory } = props;
  // The agents a person can reach on the Agents page (ADR 0087): its count, as Spaces has one.
  const listed = agentsTab(model, directory, "");
  const agentCount = listed.leads.length + listed.agents.length;
  const top = useKeptHeight();
  // Folded to its icons beside a room (ADR 0284), the + stands under the tabs, not beside the mark.
  const folded = useColumnsShell().away && props.rooms !== true;

  return (
    <>
      <aside ref={top} className="side" aria-label="Workspace">
        <div className="side-top">
          {props.reach === undefined ? <ChipMark size={20} /> : <RailMark {...props.reach} />}
          <WorkspaceMenu
            workspaces={props.workspaces ?? []}
            onSwitch={props.onSwitch}
            onPairAnother={props.onPairAnother}
            onRemoveDemo={props.onRemoveDemo}
            onWatchDemo={props.onWatchDemo}
            onRename={props.onRenameWorkspace}
            desktop={props.desktop}
          />
          {props.workspaces?.find((each) => each.current)?.demo === true ? <DemoTag /> : null}
          {props.onNewSpace === undefined ? null : (
            <NewSpaceButton onNew={props.onNewSpace} away={folded} />
          )}
        </div>

        {/* The phone's four tabs, in its order, as the iPad's sidebar lists them (ADR 0256). You stood
          at the rail's foot as a face and a name until 3 November 2026, and was not found there. */}
        <nav className="side-nav" aria-label="Sections">
          <NavItem
            icon="chat"
            label="Spaces"
            active={props.tab === "spaces"}
            onClick={() => props.onSelectTab("spaces")}
          />
          <NavItem
            icon="chip"
            label="Agents"
            active={props.tab === "agents"}
            count={agentCount}
            onClick={() => props.onSelectTab("agents")}
          />
          <NavItem
            icon="search"
            label="Search"
            active={props.tab === "search"}
            onClick={() => props.onSelectTab("search")}
          />
          <NavItem
            icon="user"
            label="You"
            // The workspace's log opens from You (ADR 0261), so You stays lit over it.
            active={props.tab === "you" || props.tab === "audit"}
            testId="you"
            onClick={() => props.onSelectTab("you")}
          />
        </nav>

        {props.setup}
        {/* A phone's width has no columns: the rooms are in the menu the rail is there. */}
        {props.rooms === true && <SpacesList {...props} />}
      </aside>
      {props.onNewSpace === undefined ? null : (
        <FoldedNewSpace folded={folded} onNew={props.onNewSpace} />
      )}
    </>
  );
}

/**
 * Spaces' list (ADR 0284): the first column under the rail's top, as the iPad's Spaces list stands
 * under its own; in the rail's menu at a phone's width. It was the rail's own until 7 November 2026,
 * and stood under every tab.
 */
export function SpacesList(props: SidebarProps) {
  const rail = useRailRooms(props);
  return (
    <section
      className="side-list"
      aria-label="Spaces"
      data-testid="spaces-list"
      data-picking={rail.picking ? "true" : undefined}
      data-wave={rail.wave ? "true" : undefined}
    >
      {rail.rooms}
      {rail.bar}
    </section>
  );
}

/**
 * The height of the rail's top, for the first column to start under it (ADR 0284): it grows with the
 * setup card and a connection's word, so it is measured, and put on the shell as `--kept-h`.
 */
function useKeptHeight() {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((aside: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const shell = aside?.parentElement;
    if (aside == null || shell == null || typeof ResizeObserver === "undefined") return;
    const put = () => shell.style.setProperty("--kept-h", `${aside.offsetHeight}px`);
    put();
    observer.current = new ResizeObserver(put);
    // Its border too: on the Mac the lights' bar is a top border, which ⌘+ and ⌘− resize.
    observer.current.observe(aside, { box: "border-box" });
  }, []);
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
  const titleOf = (space: Space) => spaceTitle(space, directory, props.selfId);
  const rowMenu = useRowMenu({
    acts: props.rowActs,
    directory,
    selfId: props.selfId,
    onOpenRoom: props.onSelectSpace,
  });
  // A row's menu, on a right-click or the keyboard's menu key: what core offers this reader there.
  const menuOf = (space: Space) => {
    const selfId = props.selfId;
    if (props.rowActs === undefined || selfId === undefined) return undefined;
    const acts = spaceRowActs(model, space, selfId, pinned, props.hiddenSpaces ?? NO_HIDDEN);
    // Change icon is anybody's, so a row with no other act still has it (ADR 0264's addendum).
    if (acts.length === 0 && props.rowActs.icon === undefined) return undefined;
    return (at: Omit<RowMenuAsk, "space" | "title" | "acts">) =>
      rowMenu.open({ space, title: titleOf(space), acts, ...at });
  };
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
  // A row, drawn in the open rooms, the hidden ones or the archived ones; `fresh`, it has just come.
  const row =
    (run: "open" | "hidden" | "closed") =>
    (space: Space, index: number, fresh = false) => (
      <SpaceRow
        key={space.id}
        order={index}
        fresh={fresh}
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
        onMenu={menuOf(space)}
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
        <RowNote note={rowMenu.note} />
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
            <Fold shown={showHidden}>
              <ul className="convos" data-testid="hidden-list">
                {shownHidden.map((space, index) => row("hidden")(space, index))}
              </ul>
            </Fold>
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
            <Fold shown={showClosed}>
              <ul className="convos" data-testid="archived-list">
                {shownClosed.map((space, index) => row("closed")(space, index))}
              </ul>
            </Fold>
          </>
        )}
      </>
    ),
    bar: (
      <>
        {rowMenu.menu}
        {rowMenu.dialog}
        {props.roomActs === undefined ? null : (
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
        )}
      </>
    ),
  };
}

/**
 * The open rooms, or what stands in for them while there are none: places held for rooms on their
 * way, or a word on what is going on (`emptyWords`). The rooms fade in over a stand-in, and rise
 * into their places after the cache has been read, as the phone's rooms do when a workspace takes
 * the front (`RiseIn`); a room that comes after that opens into its place (`useFreshRows`).
 */
function OpenRooms(props: {
  readonly open: readonly Space[];
  /** The rooms pinned (ADR 0240): when they change, the rows glide to their new places. */
  readonly pinned: readonly string[];
  /** Whether there is any room at all, archived ones included. */
  readonly anyRooms: boolean;
  readonly empty: EmptyList | undefined;
  readonly awaiting: number | undefined;
  readonly row: (space: Space, index: number, fresh: boolean) => ReactNode;
}) {
  const { open, anyRooms, empty } = props;
  const arriving = useArrival(empty, anyRooms);
  const fresh = useFreshRows(open);
  // With rooms only under Hidden or Archived, their headings are what there is to see, as on the
  // phone: "No spaces yet." over "Archived · 3" was not so.
  const words = open.length === 0 && !anyRooms ? emptyWords(empty) : "";
  const list = useRef<HTMLUListElement>(null);
  usePinGlide(list, props.pinned);
  return (
    <ul ref={list} className="convos" data-testid="space-list" data-arrive={arriving}>
      {open.map((space, index) => props.row(space, index, fresh.has(space.id)))}
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
 * pin is for: over the rows it passes, on a shadow that fades as it settles (`li[data-lifted]`,
 * the shadow's opacity, not the shadow, so the glide is all transform and opacity). A browser
 * without the Web Animations API (and jsdom) puts it in place at once.
 */
function glide(row: HTMLElement, from: number, lifted: boolean): void {
  const item = row.closest("li");
  const moving = item?.animate?.([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
    duration: GLIDE_MS,
    easing: "cubic-bezier(0.3, 0.85, 0.25, 1)",
  });
  if (item === null || moving === undefined || !lifted) return;
  item.dataset["lifted"] = "true";
  moving.onfinish = moving.oncancel = () => delete item.dataset["lifted"];
}

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

/** No room hidden. */
const NO_HIDDEN: ReadonlySet<string> = new Set();

/** The most places the rail holds for rooms on their way: about what it shows above the fold. */
const MOST_PLACES = 5;

/** Rows in the rows' own shape, breathing, for rooms the hello listed that have not come in. */
function Placeholders(props: { readonly count: number }) {
  const rows = Math.max(1, Math.min(props.count, MOST_PLACES));
  return (
    <>
      <li className="ui-visually-hidden" aria-live="polite">
        Loading your spaces
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
 * How the rooms are arriving, for the moment they first come in: "fade" over places held for them
 * or a word on the connection, "rise" after the cache was read with nothing yet to show (a cold
 * start, or a workspace switched to, which draws the rail afresh); nothing for rooms there from
 * the start. Set before paint, so no row is drawn and then hidden.
 */
function useArrival(empty: EmptyList | undefined, here: boolean): "fade" | "rise" | undefined {
  const [arriving, setArriving] = useState<"fade" | "rise" | undefined>(undefined);
  const stood = useRef<"fade" | "rise" | undefined>(undefined);
  const standing = !here && empty !== undefined;
  useLayoutEffect(() => {
    if (standing) {
      stood.current = empty === "reading" ? "rise" : "fade";
      return;
    }
    if (!here || stood.current === undefined) return;
    const how = stood.current;
    stood.current = undefined;
    setArriving(how);
    const timer = setTimeout(() => setArriving(undefined), ARRIVE_MS + 100);
    return () => clearTimeout(timer);
  }, [standing, empty, here]);
  return arriving;
}

/**
 * Longer than the rooms take to come in over their places (`styles.css`, `.convos[data-arrive]`):
 * the fade's 260 ms, or the last of eight rows rising 32 ms after the one above it, over 200 ms.
 */
const ARRIVE_MS = 460;

/**
 * The open rooms that have come since the rail was last drawn with rooms in it: a room made here or
 * anywhere, or one the server has let the reader into. They open into their places on the fold's
 * numbers, as a heading coming with its first room does (the phone's `Land` from "open"), where they
 * stood in a frame and pushed the rows under them down in it. Not the rooms of a first draw, which
 * arrive as a whole (`useArrival`), and not a room moving between runs, which lands from its edge
 * (`useRailMoves`; the row's styles let a move win).
 */
function useFreshRows(open: readonly Space[]): ReadonlySet<string> {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(NO_ROOMS);
  const seen = useRef<ReadonlySet<string>>(NO_ROOMS);
  const ids = open.map((space) => space.id).join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ids` says when the rooms changed
  useLayoutEffect(() => {
    const now = new Set(open.map((space) => space.id));
    const before = seen.current;
    seen.current = now;
    if (before.size === 0 || !moving()) return;
    const came = [...now].filter((id) => !before.has(id));
    if (came.length === 0) return;
    setFresh((was) => new Set([...was, ...came]));
    const timer = setTimeout(
      () => setFresh((was) => new Set([...was].filter((id) => !came.includes(id)))),
      FRESH_MS,
    );
    return () => clearTimeout(timer);
  }, [ids]);
  return fresh;
}

/** No rooms. */
const NO_ROOMS: ReadonlySet<string> = new Set();

/** Longer than a fresh room takes to open into its place (`--fold-ms`). */
const FRESH_MS = 420;

/**
 * Hidden's and Archived's rooms, opening under their heading and folding shut into it as its
 * chevron turns (ADR 0205), on the fold's numbers. They were drawn in a frame and gone in one.
 */
function Fold(props: {
  readonly shown: boolean;
  /** Open into place when first drawn, as a note does; a list there from the start simply is. */
  readonly opens?: boolean | undefined;
  readonly children: ReactNode;
}) {
  const [drawn, setDrawn] = useState(props.shown);
  const [phase, setPhase] = useState<"opening" | "folding" | undefined>(() =>
    props.shown && props.opens === true && moving() ? "opening" : undefined,
  );
  const was = useRef(props.shown);
  useLayoutEffect(() => {
    if (was.current === props.shown) return;
    was.current = props.shown;
    const motion = moving();
    setDrawn(props.shown || motion);
    setPhase(motion ? (props.shown ? "opening" : "folding") : undefined);
  }, [props.shown]);
  const end = () => {
    if (phase === "folding") setDrawn(false);
    setPhase(undefined);
  };
  // A fold whose end never comes, in a tab in the background, still lets go.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the phase's own timer
  useEffect(() => {
    if (phase === undefined) return;
    const timer = setTimeout(end, FRESH_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  if (!drawn && !props.shown) return null;
  return (
    <div
      className="side-run"
      data-phase={phase}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) end();
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * A refusal under Recent ("Not hidden: …"), opening into its place and folding away when its time
 * is up, rather than pushing the rows down in a frame and pulling them back up in another.
 */
function RowNote(props: {
  readonly note: { readonly key: number; readonly words: string } | undefined;
}) {
  const last = useRef(props.note);
  if (props.note !== undefined) last.current = props.note;
  const said = last.current;
  if (said === undefined) return null;
  return (
    <Fold key={said.key} shown={props.note !== undefined} opens>
      <p className="side-empty side-note" role="status" data-testid="row-note">
        {said.words}
      </p>
    </Fold>
  );
}

/**
 * The gold + beside the workspace's name, where the iPad's sidebar stands it, so it is in the same
 * place whichever page is open (ADR 0264's second addendum). It opens the new-space dialog
 * (`NewSpace.tsx`) out of itself: a room asked of the harnesses picked, or a room of people. The
 * shell holds the dialog, since an empty workspace's Create a space and the Mac's ⌘N open it too.
 * It stood at the end of the Recent heading until 3 November 2026. `away`: folded out of sight with
 * the workspace's name, the rail at its icons, or fading out of its place under the tabs.
 */
function NewSpaceButton(props: {
  readonly onNew: (from: HTMLElement | null) => void;
  readonly away?: boolean | undefined;
  readonly className?: string | undefined;
  readonly onAnimationEnd?: ((event: AnimationEvent<HTMLElement>) => void) | undefined;
}) {
  const plus = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={plus}
      type="button"
      className={props.className ?? "side-new"}
      aria-label="Create new space"
      // The one in sight is the one ⌘N's dialog grows out of (`menuCommands.ts`).
      data-testid={props.away === true ? undefined : "new-space"}
      data-away={props.away === true ? "true" : undefined}
      aria-haspopup="dialog"
      inert={props.away === true}
      onClick={() => props.onNew(plus.current)}
      onAnimationEnd={props.onAnimationEnd}
    >
      <Icon name="plus" size={16} />
    </button>
  );
}

/**
 * The + under the tabs while the rail is folded to its icons (Arjun, 7 November 2026: beside the
 * mark it looked off): the top row keeps the mark alone, and the + stands under You on the icons'
 * line. It comes in once the list has gone and fades out as the list comes back, drawn until it has.
 * It stands beside the rail in the shell, not in it: hung out of the rail's box, the Mac's WebKit cut
 * it in half at the rail's foot however the rail's overflow was set (Arjun's screenshot, that night).
 */
function FoldedNewSpace(props: {
  readonly folded: boolean;
  readonly onNew: (from: HTMLElement | null) => void;
}) {
  const [drawn, setDrawn] = useState(props.folded);
  if (props.folded && !drawn) setDrawn(true);
  const leaving = drawn && !props.folded;
  if (leaving && !moving()) setDrawn(false);
  const gone = useLeaving(leaving, () => setDrawn(false));
  if (!drawn) return null;
  return (
    <NewSpaceButton
      onNew={props.onNew}
      away={leaving}
      className="side-new side-new-folded"
      onAnimationEnd={gone}
    />
  );
}

/**
 * The Recent heading and Select at its end. While the rail picks, the heading says how many are
 * picked (ADR 0181).
 */
function Recent(props: {
  readonly picking: boolean;
  readonly count: number;
  readonly select: ReactNode;
}) {
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
      <span className="side-h-acts">{props.select}</span>
    </div>
  );
}

function NavItem(props: {
  readonly icon: "chat" | "chip" | "search" | "user";
  readonly label: string;
  readonly active: boolean;
  readonly count?: number;
  readonly testId?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="sn"
      data-testid={props.testId}
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
  /** There is work going in the room: its face wears the pins (ADR 0285). */
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
  /** Its room has just come into the open rooms: it opens into its place (`useFreshRows`). */
  readonly fresh?: boolean | undefined;
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
  /** Its menu of the phone's swipes, at a point; none where nothing is offered (`RowMenu.tsx`). */
  readonly onMenu?:
    | ((at: { readonly x: number; readonly y: number; readonly from: HTMLElement | null }) => void)
    | undefined;
  /** Its room is moving to another run, or off the rail (ADR 0205's addendum). */
  readonly move?: RowMove | undefined;
  /** One of its animations has ended, which may be a step of its move. */
  readonly onMoveEnd?: ((event: AnimationEvent<HTMLElement>) => void) | undefined;
}) {
  const { space, directory, pick } = props;
  // Core's, as the phone's list and the room's head call it: a room a harness runs in, with no title,
  // is the harness's name, not "You, Quill" (the room's walk, 3 November 2026).
  const title = spaceTitle(space, directory, props.selfId);
  // Somebody besides the reader reads it (ADR 0234): the row wears the shared tag, as the phone's.
  const shared = props.selfId !== undefined && isShared(space, directory, props.selfId);
  const waiting = space.run?.state === "waiting";
  // The phone's rule, from core: "Needs a yes", or the last line as plain words, not Markdown.
  const snippet = lastWords(space, directory);
  // Work going in the room, whether a run of its own or a turn out of the harness's queue
  // (ADR 0090, ADR 0285): the face wears the pins, and the gear stands where the harness's own
  // thought-bubble emoji used to be read out.
  const working = spaceWorking(space);
  // Chips holds the agents' messages to each other here until a person acts (ADR 0097).
  const paused = pausedIn(space);

  return (
    <li
      {...leavingProps(pick)}
      {...moveProps(props.move)}
      data-new={props.fresh === true ? "true" : undefined}
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
        onContextMenu={(event) => {
          if (pick?.active === true || props.onMenu === undefined) return;
          event.preventDefault();
          props.onMenu({ ...menuPoint(event), from: event.currentTarget });
        }}
      >
        <span className="cv-face">
          <PickMark pick={pick} />
          {spaceAvatar(space, directory, title, props.icon, working, "md")}
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
 * A row's unread count. One that comes, or goes up, pops in; read, it swells a little and shrinks
 * away rather than blinking out (ADR 0181 addendum, 18 October 2026), down the rail a beat a row
 * when Read took several (`.side[data-wave]`); what it last said stays while it goes, unheard. With
 * Reduce Motion no animation runs to end, so it goes at once.
 */
function Unread({ count }: { readonly count: number }) {
  const last = useRef(count);
  const [gone, setGone] = useState(count === 0);
  // How many times it has come or gone up since the row was drawn: each a pop of its own.
  const [pops, setPops] = useState(0);
  const was = useRef(count);
  if (count > 0) last.current = count;
  useEffect(() => {
    if (count > 0) setGone(false);
    if (count > was.current) setPops((now) => now + 1);
    was.current = count;
  }, [count]);
  if (count === 0 && (gone || !moving())) return null;
  return count > 0 ? (
    <b
      key={pops}
      className="cv-unread"
      data-testid="unread"
      data-new={pops > 0 ? "true" : undefined}
    >
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
  paused: "Paused",
  failed: "Failed",
  cancelled: "Stopped",
  done: "Done",
  queued: "Queued",
};

/**
 * What a harness's tile, card and page say it is doing (ADR 0185, ADR 0254): while its run is at
 * work, the top line of that run's bubble, held as the bubble holds it (ADR 0147); otherwise one
 * word, or nothing. The rail's list of harnesses said it too, until 3 November 2026.
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
 * Whether a harness says a status at all (ADR 0050 rule 1, as the phone's fleet has it): one
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
