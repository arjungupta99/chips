/**
 * The iPad's columns on the web and the Mac (ADR 0284; Arjun, 7 November 2026: "the top left
 * section with the tabs, + and title are fine. Everything else should try to follow iPad, specially
 * the first, second third column designs").
 *
 * Every section stands in three columns. The first is its own list, under the rail's top (the
 * workspace, its +, the four tabs), 340 wide, 300 in a window under 1200: Spaces' rooms, the agents
 * and their harnesses, Search's results, You's rows. The second is what a row opens: a room, an
 * agent's card, a harness's page, a page of You's. The third, 420 wide, is one level deeper, beside
 * the page it came from: a room's details, an agent's model, its history, a harness's runs, a person.
 * Anything a section grew as a dialog stands there (`GrowingDialog` finds the column here), and so
 * does the run panel beside a room.
 *
 * Where the second would be left narrower than 540 beside a third, the list steps aside, as an
 * upright iPad's does: the rail folds to its own top as icons (the shell's `away`), and comes back
 * when the third column goes. The person can put the list away too, from the round button at the
 * top left of a room or a page.
 *
 * Columns move on the iPad's curve and time (520 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, the phone's
 * `PadBarMotion`). Beside a room the words go first, the columns move, and the words come back
 * (ADR 0279's third addendum): a room's lines laid out again at every width on the way read as
 * jumping text. What leaves the third column stays drawn until its column has closed.
 *
 * Under the words' going, the room takes its new width once and every bubble glides to its new
 * place and shape (`room/widthGlide.ts`): the columns tell the room just before they set off
 * (`RoomGlide.note`) and in the frame they do, with the width the room will have (`RoomGlide.start`).
 */

import { Icon } from "@chipschat/ui";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { moving } from "./motion.ts";
import { useNarrow } from "./useNarrow.ts";

/** How long a column takes to move: the iPad's panes' (`PadBarMotion.DURATION`). */
export const PANE_MS = 520;
/** The words' going before a room's columns move (`heldWidth.WORDS_WAIT` + `WORDS_OUT`). */
export const WORDS_LEAD = 200;
/** The third column's width (`Split.THIRD`). */
export const THIRD_W = 420;
/** The narrowest the second column stands beside a third (`Split.DETAIL_LEAST`). */
const DETAIL_LEAST = 540;

/** The list's width in a window this wide (`Split.listWidth`). */
export function listWidth(windowWidth: number): number {
  return windowWidth >= 1200 ? 340 : 300;
}

/** Whether a third column leaves the second too narrow beside the list: the list steps aside. */
export function crowdsTheList(windowWidth: number): boolean {
  return windowWidth - listWidth(windowWidth) - THIRD_W < DETAIL_LEAST;
}

/**
 * What the shell gives the sections' columns: whether the list is away, the person's own word on
 * it, and how a section says its third column is open, so the shell can step the list aside.
 */
export interface ColumnsShell {
  /** The list stepped aside: put away by the person, or crowded out by a third column. */
  readonly away: boolean;
  /** Away because a third column is open in a window too narrow for all three. */
  readonly crowded: boolean;
  /** A room's words away while the list steps aside or comes back. */
  readonly words: boolean;
  /** The round button at the top left: put the list away or bring it back. */
  readonly toggleList: () => void;
  /** A section's third column opened or closed: its own id, and how to close it from here. */
  readonly third: (id: number, open: (() => void) | undefined) => void;
}

const NO_SHELL: ColumnsShell = {
  away: false,
  crowded: false,
  words: false,
  toggleList: () => undefined,
  third: () => undefined,
};

export const ColumnsShellContext = createContext<ColumnsShell>(NO_SHELL);

export function useColumnsShell(): ColumnsShell {
  return useContext(ColumnsShellContext);
}

/** The third column, as what stands in it finds it: where to draw, and how to say it is there. */
export interface ThirdHost {
  readonly slot: HTMLElement | null;
  /** The column has opened: it is inert until then, so nothing in it can take the keyboard. */
  readonly open: boolean;
  /** One more in the column; its way out, should the column be closed from outside it. */
  readonly take: (leave: () => void) => () => void;
  /** Close the column from outside it: everything in it leaves (a room's details button). */
  readonly close: () => void;
}

const ThirdContext = createContext<ThirdHost | undefined>(undefined);

/** The third column of the section this is in, or none outside one (a dialog stays a dialog). */
export function useThird(): ThirdHost | undefined {
  return useContext(ThirdContext);
}

/**
 * A room in the columns, told as they change its width (`room/widthGlide.ts`): `note` just before
 * they set off, with its words already away; `start` in the frame they do, with the width the room
 * stands at once they have stopped. `within` is the columns that changed, or the whole window for
 * the list stepping aside.
 */
export interface RoomGlide {
  readonly note: (within: Element | null) => void;
  readonly start: (within: Element, room: number) => void;
}

const glides = new Set<RoomGlide>();

/** A room that glides to a new width: told while it is drawn. */
export function useRoomGlide(glide: RoomGlide): void {
  const current = useRef(glide);
  current.current = glide;
  useEffect(() => {
    const told: RoomGlide = {
      note: (within) => current.current.note(within),
      start: (within, room) => current.current.start(within, room),
    };
    glides.add(told);
    return () => {
      glides.delete(told);
    };
  }, []);
}

function noteGlides(within: Element | null): void {
  for (const glide of glides) glide.note(within);
}

/**
 * The width a room in these columns stands at once they stop, from the stylesheet's widths. A
 * closed third column still stands its border wide.
 */
function roomWidthOf(columns: HTMLElement, away: boolean, third: boolean): number {
  const style = getComputedStyle(columns);
  const px = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;
  const list = px(away ? "--rail-w" : "--list-w");
  const column = columns.querySelector(":scope > .col-third");
  const closed =
    column === null ? 0 : Number.parseFloat(getComputedStyle(column).borderLeftWidth) || 0;
  return columns.clientWidth - list - (third ? px("--third-w") : closed);
}

let columnsMade = 0;

export function Columns(props: {
  /** Which section's columns, for the styles and the tests. */
  readonly name: string;
  /** The first column: the section's list. */
  readonly list: ReactNode;
  /** The second: what a row opened, or the word that nothing is. */
  readonly detail: ReactNode;
  /** The third: one level deeper. Absent, the column is closed unless a dialog stands in it. */
  readonly third?: ReactNode;
  /** How the third column is closed from outside it (the list's button in a narrow window). */
  readonly onCloseThird?: (() => void) | undefined;
  /** A room stands in the second column: its words go before a move and come back after. */
  readonly room?: boolean | undefined;
  /** The element the columns are: the section's landmark, when it has one. */
  readonly as?: "div" | "main" | "section" | undefined;
  readonly label?: string | undefined;
  readonly className?: string | undefined;
  readonly testId?: string | undefined;
  /** What stands over all three, a section's own (You's ghosts). */
  readonly over?: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [taken, setTaken] = useState(0);
  const leaves = useRef(new Set<() => void>());
  const take = useCallback((leave: () => void) => {
    leaves.current.add(leave);
    setTaken((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      leaves.current.delete(leave);
      setTaken((count) => count - 1);
    };
  }, []);
  const close = useRef<() => void>(() => undefined);
  const wanted = props.third != null || taken > 0;
  const root = useRef<HTMLElement>(null);
  const { shown, words } = useLead(wanted, props.room === true, () => noteGlides(root.current));
  const host = useMemo<ThirdHost>(
    () => ({ slot, open: shown, take, close: () => close.current() }),
    [slot, shown, take],
  );
  const kept = useKeptNode(props.third ?? null, shown);

  // The shell steps the list aside while the third column is open in a narrow window.
  const shell = useColumnsShell();
  const id = useRef(0);
  if (id.current === 0) {
    columnsMade += 1;
    id.current = columnsMade;
  }
  close.current = () => {
    for (const leave of [...leaves.current]) leave();
    props.onCloseThird?.();
  };
  const { third: tell } = shell;
  // Before the frame is drawn, so a list crowded out sets off with the column that crowds it.
  useLayoutEffect(() => {
    tell(id.current, shown ? () => close.current() : undefined);
  }, [tell, shown]);
  useEffect(() => () => tell(id.current, undefined), [tell]);

  // A room's width changes as the third column comes or goes, or the list steps aside: it takes the
  // new width now, as the columns set off, and glides to it.
  const was = useRef<{ shown: boolean; away: boolean } | undefined>(undefined);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = { shown, away: shell.away };
    const element = root.current;
    if (before === undefined || props.room !== true || element === null) return;
    if (before.shown === shown && before.away === shell.away) return;
    const room = roomWidthOf(element, shell.away, shown);
    for (const glide of glides) glide.start(element, room);
  }, [shown, shell.away, props.room]);

  // A phone's width has no third column to stand in: what would, stays a dialog over the page.
  const phone = useNarrow();
  const Tag = props.as ?? "div";
  return (
    <ThirdContext.Provider value={phone ? undefined : host}>
      <Tag
        ref={root as RefObject<HTMLDivElement>}
        className={`columns${props.className === undefined ? "" : ` ${props.className}`}`}
        data-columns={props.name}
        data-third={shown ? "true" : "false"}
        aria-label={props.label}
        data-testid={props.testId}
      >
        <div className="col-list">
          <div className="col-list-in">{props.list}</div>
        </div>
        {/* The words go here alone, so a change of them restyles the room and nothing round it. */}
        <div className="col-detail" data-words={words || shell.words ? "out" : undefined}>
          {props.detail}
        </div>
        <div className="col-third" data-testid="third-column" inert={!shown}>
          <div className="col-third-in">
            {kept}
            <div ref={setSlot} className="col-third-slot" />
          </div>
        </div>
        {props.over}
      </Tag>
    </ThirdContext.Provider>
  );
}

/**
 * When a change of width is drawn: at once for a page, after the words have gone beside a room.
 * `words` is true from the change until the columns have come to rest, while a room's words are away.
 */
export function useLead(
  wanted: boolean,
  room: boolean,
  /** Just before the move, the words away: where the room's bubbles set off from is noted. */
  note?: () => void,
): { shown: boolean; words: boolean } {
  const [shown, setShown] = useState(wanted);
  const [words, setWords] = useState(false);
  const noting = useRef(note);
  noting.current = note;
  useEffect(() => {
    if (wanted === shown) return;
    if (!room || !moving()) {
      setShown(wanted);
      return;
    }
    setWords(true);
    const move = setTimeout(() => {
      noting.current?.();
      setShown(wanted);
    }, WORDS_LEAD);
    return () => clearTimeout(move);
  }, [wanted, shown, room]);
  useEffect(() => {
    if (!words || wanted !== shown) return;
    const back = setTimeout(() => setWords(false), PANE_MS);
    return () => clearTimeout(back);
  }, [words, wanted, shown]);
  return { shown, words };
}

/** What stood in the third column, kept drawn while the column closes over it. */
function useKeptNode(node: ReactNode, open: boolean): ReactNode {
  const last = useRef<ReactNode>(node);
  const [, again] = useState(0);
  if (node !== null) last.current = node;
  useEffect(() => {
    if (open || node !== null || last.current === null) return;
    if (!moving()) {
      last.current = null;
      again((n) => n + 1);
      return;
    }
    const timer = setTimeout(() => {
      last.current = null;
      again((n) => n + 1);
    }, PANE_MS + 40);
    return () => clearTimeout(timer);
  }, [open, node]);
  return node ?? (open ? null : last.current);
}

/**
 * The shell's side of the columns: the person's word on the list, which section's third column is
 * open, and whether the window is too narrow for all three. `room` is whether a room stands in the
 * second column now, whose words go before the list moves.
 */
export function useColumnsShellState(room: boolean): {
  readonly shell: ColumnsShell;
  /** What the rail draws: folded to its icons, or the list beside it. */
  readonly away: boolean;
  /** A room's words away while the list moves. */
  readonly words: boolean;
} {
  const [putAway, setPutAway] = useState(false);
  const [open, setOpen] = useState<ReadonlyMap<number, () => void>>(new Map());
  const narrow = useNarrowForThird();
  const crowded = narrow && open.size > 0;
  const { shown, words } = useLead(putAway, room, () => noteGlides(null));
  const away = shown || crowded;
  const third = useCallback((id: number, close: (() => void) | undefined) => {
    setOpen((now) => {
      if (close === undefined ? !now.has(id) : now.get(id) === close) return now;
      const next = new Map(now);
      if (close === undefined) next.delete(id);
      else next.set(id, close);
      return next;
    });
  }, []);
  const toggleList = useCallback(() => {
    if (crowded) {
      for (const close of open.values()) close();
      setPutAway(false);
      return;
    }
    setPutAway((now) => !now);
  }, [crowded, open]);
  const shell = useMemo<ColumnsShell>(
    () => ({ away, crowded, words, toggleList, third }),
    [away, crowded, words, toggleList, third],
  );
  return { shell, away, words };
}

/**
 * The shell's element with the columns' state round it (ADR 0284): the list away, a third column
 * open, a room's words going. Held here and not in the shell, so a step of a column's move draws
 * this and what reads it, and not the whole app again: each step drew every room and list once
 * more, and the frames it fell in took a quarter of a second at 1440.
 */
export function ColumnsShellFrame(props: {
  /** Whether a room stands in the second column now, whose words go before the list moves. */
  readonly room: boolean;
  /** The phone's menu, open over the page. */
  readonly menu: boolean;
  readonly children: ReactNode;
}) {
  const { shell, away } = useColumnsShellState(props.room);
  return (
    <ColumnsShellContext.Provider value={shell}>
      <div
        className="shell"
        data-menu={props.menu ? "true" : "false"}
        data-away={away ? "true" : "false"}
      >
        {props.children}
      </div>
    </ColumnsShellContext.Provider>
  );
}

/** A window too narrow for the list, a second column of 540 and a third column, all three. */
const TOO_NARROW = `(max-width: ${listWidth(1200) + THIRD_W + DETAIL_LEAST - 1}px)`;

function narrowQuery(): MediaQueryList | undefined {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? undefined
    : window.matchMedia(TOO_NARROW);
}

/** Whether this window is too narrow for a list, a second column and a third column side by side. */
export function useNarrowForThird(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = narrowQuery();
      query?.addEventListener("change", changed);
      return () => query?.removeEventListener("change", changed);
    },
    () => narrowQuery()?.matches === true,
    () => false,
  );
}

/**
 * The round button at the top left of a room or a page beside the list (ADR 0284): it puts the list
 * away, the rail folding to its icons, and brings it back; with a third column crowding it out, it
 * closes the third column. Nothing at a phone's width, where there is no list beside.
 */
export function ListButton() {
  const shell = useColumnsShell();
  const away = shell.away;
  return (
    <button
      type="button"
      className="round-button list-button"
      data-testid="list-toggle"
      aria-label={away ? "Show the list" : "Hide the list"}
      title={away ? "Show the list" : "Hide the list"}
      data-on={away ? "true" : undefined}
      onClick={shell.toggleList}
    >
      <Icon name="sidebar" size={18} />
    </button>
  );
}
