/**
 * Search (ADR 0132, and its addendum for the Mac and the web): one field that finds spaces,
 * agents and messages, each opening where you'd expect — a space its room, an agent its page, a
 * message its room at that message, with the words searched for marked there for a moment.
 *
 * - **Spaces and agents are found here**, by name, from core's index of every name folded once
 *   (`searchIndex`): a key is a prefix test on folded words, and a change to the workspace folds
 *   again only the rooms it touched. So they come on the first letter, and with no connection.
 * - **Messages are the server's** — SQLite's FTS5, voice notes' words too — asked for by core's
 *   `messageSearch`: from two letters, after a pause, the newest answer winning, the hits kept
 *   between keys, the next page asked for as the list nears its end.
 * - **What is listed, and what each row says, are core's** (`searchItems`, `spaceFoundLine`,
 *   `hitAuthor`, `hitPlace`), the phone's tab's own, so the two find and say the same things.
 * - **The search outlives the page.** What was typed, the chip and the messages found are kept by
 *   the shell (`SearchSession`), so a room opened from a result and the way back find them as
 *   they were.
 * - **A search is remembered** on this computer (`recentSearches.ts`) when Enter is pressed in it
 *   or one of its results is opened.
 * - **Nothing found is swapped in a frame** (ADR 0189): the rows a change brings arrive down the
 *   page on a wave, the rows it keeps glide to their new places and the rows it drops fade where
 *   they stood (`searchMotion.ts`); the chips come in under the field, the ghost rows breathe, and
 *   the backdrop fades away as the results come.
 * - **It is worked from the keys** (ADR 0263): the field keeps them while ↓ and ↑ light a result
 *   (a recent search too), Enter opens the one lit, and Esc empties the field. The chips are one
 *   stop for Tab, ← and → between them.
 * - **On a wide window the results stay, and a result opens beside them** (ADR 0269, the iPad's
 *   Search, ADR 0256): the results keep a column and what a result finds is drawn in the pane
 *   beside it by the shell, a room at its line or an agent's page. ↓ and ↑ open each result there
 *   as they light it; Enter, a double click or the room's Open in Spaces takes it to its own page.
 *   Before anything is opened, the faces drift in that pane instead of under the field.
 * - **Nothing changes in a frame** (3 November 2026, "everything should have smooth transitions"):
 *   the chips come and go under the field, the page beside the results arrives as You's pages do,
 *   a row lightens under the pointer and the arrows on the design system's `--motion-fast`, and the
 *   arrows scroll to the row they light. Only what changes within Search moves: opened, it is
 *   simply there, as the shell's change of section brings it (ADR 0274).
 */

import {
  type AgentFound,
  type Directory,
  findAgents,
  findSpaces,
  hitArchived,
  hitAuthor,
  hitPlace,
  type MessageResults,
  type MessageSearch,
  markedParts,
  messageSearch,
  plainWords,
  SEARCH_ARRIVAL,
  SEARCH_HINT,
  SEARCH_NOTHING_OPEN,
  SEARCH_SCOPES,
  type SearchHit,
  type SearchIndex,
  type SearchItem,
  type SearchScope,
  type Store,
  searchIndex,
  searchItems,
  searchTerms,
  snippetParts,
  spaceFoundLine,
  type WorkspaceModel,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, Icon } from "@chipschat/ui";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Columns } from "./Columns.tsx";
import { MainTag } from "./MainTag.tsx";
import { Marked } from "./Marked.tsx";
import { type RecentSearches, useRecentSearches } from "./recentSearches.ts";
import { SearchBackdrop } from "./SearchBackdrop.tsx";
import { spaceAvatar } from "./Sidebar.tsx";
import { useResultsMotion } from "./searchMotion.ts";
import { relativeTime } from "./time.ts";
import { ease, reduceMotion } from "./viewer/open.ts";

/**
 * A search as the shell keeps it while the page is away: what was typed, the chip, the messages
 * asked for, and the last index, for the next one to fold only what changed.
 */
export interface SearchSession {
  text: string;
  scope: SearchScope;
  index: SearchIndex | undefined;
  readonly messages: MessageSearch;
}

/** One search for the life of the store, its asking stopped when the store goes. */
export function useSearchSession(store: Store): SearchSession {
  const session = useMemo<SearchSession>(
    () => ({
      text: "",
      scope: "all",
      index: undefined,
      messages: messageSearch((input) => store.search(input)),
    }),
    [store],
  );
  useEffect(() => () => session.messages.close(), [session]);
  return session;
}

export interface SearchProps {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  /** Who is reading: "You" for their own words, and a room named by who is in it (ADR 0082). */
  readonly selfId: string;
  readonly session: SearchSession;
  /** Whether the server can be reached: spaces and agents are found here either way. */
  readonly online: boolean;
  /** The faces the person chose for rooms, which a space found wears as the rail does. */
  readonly spaceIcons: ReadonlyMap<string, SpaceIcon>;
  readonly onOpenSpace: (spaceId: string) => void;
  readonly onOpenAgent: (agentId: string) => void;
  /** A hit's room, at its line or its run, with what was searched for to mark there. */
  readonly onOpenHit: (hit: SearchHit, searched: string) => void;
  /** The server, reached for again. */
  readonly onWake: () => void;
  /** What a result opens beside the results, on a window wide enough for both (ADR 0269). */
  readonly beside?: BesideProps | undefined;
}

/**
 * What a result opened beside the results (ADR 0269): its room, at the line a message was found
 * at with what was searched for, or an agent's page. `key` is its row's, which is drawn as open.
 */
export type Beside =
  | {
      readonly kind: "space";
      readonly key: string;
      readonly spaceId: string;
      readonly hit?: SearchHit | undefined;
      readonly searched?: string | undefined;
    }
  | { readonly kind: "agent"; readonly key: string; readonly agentId: string };

export interface BesideProps {
  readonly opened: Beside | undefined;
  readonly onOpen: (opened: Beside) => void;
  /**
   * What is open, as the shell draws it: the room with Open in Spaces at its head, or an agent's
   * page. Nothing while nothing is open, or when what was open has gone.
   */
  readonly pane: ReactNode;
}

export function Search(props: SearchProps) {
  const { session, model, directory, selfId, online } = props;
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(session.text);
  const [scope, setScope] = useState<SearchScope>(session.scope);
  // The result the arrows have lit, by its key: none until ↓ is pressed, and none again once the
  // words or the chip change.
  const [lit, setLit] = useState<string | undefined>(undefined);
  const messages = useSyncExternalStore(
    session.messages.subscribe,
    session.messages.results,
    session.messages.results,
  );
  const recent = useRecentSearches();
  // What is listed follows the field a beat behind under load, so a key is never held up by the
  // rows it changes.
  const shown = useDeferredValue(text);
  const terms = useMemo(() => searchTerms(shown), [shown]);
  const index = useMemo(
    () => searchIndex(model, directory, selfId, session.index),
    [model, directory, selfId, session],
  );
  useEffect(() => {
    session.index = index;
  }, [session, index]);
  const spaces = useMemo(() => findSpaces(index, terms), [index, terms]);
  const agents = useMemo(() => findAgents(index, terms), [index, terms]);
  useAskedAgainOnline(session.messages, online);
  useEffect(() => field.current?.focus(), []);

  const choose = (next: SearchScope) => {
    setScope(next);
    setLit(undefined);
    session.scope = next;
  };
  const type = (value: string) => {
    setText(value);
    setLit(undefined);
    session.text = value;
    session.messages.type(value);
    // Nothing typed is the recent searches, under no chip; the next search starts at All.
    if (searchTerms(value).length === 0) choose("all");
  };
  const typed = terms.length > 0;
  const items = searchItems({
    text: shown,
    typed,
    scope,
    spaces,
    agents,
    messages,
    online,
    model,
    recent: recent.list,
  });
  useResultsMotion(list, ghosts, items);
  // A row the messages arriving took away is lit no more.
  const stops = items.filter(isStop).map((item) => item.key);
  const shownLit = lit !== undefined && stops.includes(lit) ? lit : undefined;
  const split = useSplit() ? props.beside : undefined;
  const go = openings({ props, split, items, text, remember: recent.remember, setLit });
  const keys: FieldKeys = {
    stops,
    lit: shownLit,
    text,
    light: go.light,
    remember: () => recent.remember(text),
    empty: () => type(""),
    press: go.press,
  };
  const backdrop = useLeaving(!typed, BACKDROP_OUT_MS);
  // What comes with the first letter moves in only when typed here, not when Search opens typed;
  // the backdrop is drawn from the first time the field is empty here, and kept.
  const emptied = useBeenEmpty(typed);
  const context: RowContext = {
    ...props,
    recent,
    open: split?.opened?.key,
    onOpen: go.open,
    onFull: go.full,
    onRecent: (words) => {
      type(words);
      recent.remember(words);
    },
    onSeeAll: choose,
    onRetry: session.messages.retry,
  };
  const paging = scope === "all" || scope === "messages";
  // Beside a room, the results are a region of the page, and the room is its main part.
  const Column = split === undefined ? "main" : "section";
  const drift = emptied && (
    <SearchBackdrop
      model={model}
      directory={directory}
      selfId={selfId}
      spaceIcons={props.spaceIcons}
      leaving={backdrop === "leaving"}
      resting={backdrop === "gone"}
    />
  );

  const results = (
    <Column className="conv search" aria-label="Search">
      <h1 className="ui-visually-hidden">Search</h1>
      <div className="search-head">
        <Field field={field} text={text} onType={type} keys={keys} />
        <Chips typed={typed} words={text} scope={scope} onChange={choose} arriving={emptied} />
      </div>
      <div className="search-scroll">
        {/* Beside the results, the faces drift in the pane instead. */}
        {split === undefined && drift}
        {/* Where a row that has gone fades, under the list (`searchMotion.ts`). */}
        <div ref={ghosts} className="search-ghosts" aria-hidden="true" />
        <ul
          ref={list}
          id={LIST_ID}
          className="search-list"
          data-typed={typed ? "" : undefined}
          data-testid="search-results"
          // The pointer takes over from the arrows: one row lit at a time, the one under it.
          onMouseMove={shownLit === undefined ? undefined : () => setLit(undefined)}
        >
          {items.map((item) => (
            <Item
              key={item.key}
              item={item}
              lit={item.key === shownLit}
              settling={settling(messages)}
              context={context}
            />
          ))}
        </ul>
        {paging && <NearEnd messages={messages} search={session.messages} />}
      </div>
    </Column>
  );
  if (split === undefined) return results;
  // The results are the first column, under the rail's top, and what they open the second (ADR 0284).
  return (
    <Columns
      name="search"
      className="search-split"
      testId="search-split"
      list={results}
      detail={<Pane split={split} typed={typed} arriving={emptied} drift={drift} />}
      room={split.opened?.kind === "space"}
    />
  );
}

/**
 * Beside the results (ADR 0269): what a result opened, as the shell draws it; before anything is
 * opened the faces drift there, and once something is typed, a word on where to look.
 */
function Pane(props: {
  readonly split: BesideProps;
  readonly typed: boolean;
  readonly arriving: boolean;
  readonly drift: ReactNode;
}) {
  const { opened, pane } = props.split;
  const showing = opened === undefined ? undefined : (pane ?? undefined);
  const box = useRef<HTMLDivElement>(null);
  usePageArrives(box, showing === undefined ? undefined : pageOf(opened));
  return (
    <div ref={box} className="search-pane" data-testid="search-pane">
      {showing ?? (
        <div className="search-pane-drift">
          {props.drift}
          {props.typed && (
            <div
              className="search-pane-none"
              data-testid="search-nothing-open"
              data-arriving={props.arriving ? "" : undefined}
            >
              <Icon name="search" size={24} />
              <p className="search-nothing-t">{SEARCH_NOTHING_OPEN.title}</p>
              <p>{SEARCH_NOTHING_OPEN.words}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Which page stands beside the results: a room, whichever line of it, or an agent's. */
function pageOf(opened: Beside | undefined): string | undefined {
  if (opened === undefined) return undefined;
  return opened.kind === "agent" ? `agent:${opened.agentId}` : `space:${opened.spaceId}`;
}

/**
 * The page beside the results, arriving as You's pages do beside their list: up from nothing, a
 * few points in from the right, on the design system's `--motion-base` and `--ease`. Another line
 * of the same room is not another page: the room goes to it and rings it. Nothing moves as Search
 * opens on a page already open, and with less motion asked for the page only fades up.
 */
function usePageArrives(box: RefObject<HTMLElement | null>, page: string | undefined): void {
  const was = useRef(page);
  useLayoutEffect(() => {
    const element = box.current;
    const before = was.current;
    was.current = page;
    if (element === null || before === page || typeof element.animate !== "function") return;
    const travel = reduceMotion() ? [] : [`translateX(${PAGE_IN}px)`, "none"];
    element.animate(
      {
        opacity: [0, 1],
        ...(travel.length === 0 ? {} : { transform: travel }),
      },
      { duration: motionMs("--motion-base", 200), easing: ease() },
    );
  }, [box, page]);
}

/** How far in from the right a page beside the results starts: You's (`you-page-in`). */
const PAGE_IN = 8;

/** One of the design system's durations, read from the page so the token stays the one definition. */
function motionMs(token: string, otherwise: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const ms = value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
  return Number.isFinite(ms) ? ms : otherwise;
}

/**
 * Whether the field has been empty since Search opened: from then on what comes with the first
 * letter (the chips, "Nothing open") moves in as it comes, and the backdrop is drawn. Search opened
 * on words typed before shows them as they were.
 */
function useBeenEmpty(typed: boolean): boolean {
  const [empty, setEmpty] = useState(!typed);
  if (!typed && !empty) setEmpty(true);
  return empty;
}

/**
 * Where a result goes (ADR 0269): pressed, beside the results on a wide window, else to its own
 * page, a room in Spaces or an agent's on Agents; a double click and Enter take it to its own page
 * either way. What the arrows light opens beside the results.
 */
function openings(on: {
  readonly props: SearchProps;
  readonly split: BesideProps | undefined;
  readonly items: readonly SearchItem[];
  readonly text: string;
  readonly remember: (text: string) => void;
  readonly setLit: (key: string | undefined) => void;
}) {
  const { props, split, items, text, remember } = on;
  const opener = (key: string | undefined) => {
    const item = items.find((each) => each.key === key);
    return item !== undefined && isOpener(item) ? item : undefined;
  };
  const full = (item: Opener) => () => {
    remember(text);
    if (item.kind === "space") props.onOpenSpace(item.found.space.id);
    else if (item.kind === "agent") props.onOpenAgent(item.found.row.id);
    else props.onOpenHit(item.hit, text);
  };
  const beside = (item: Opener) => () => {
    remember(text);
    split?.onOpen(besideOf(item, text));
  };
  return {
    full,
    open: split === undefined ? full : beside,
    light: (key: string | undefined) => {
      on.setLit(key);
      const item = opener(key);
      if (split !== undefined && item !== undefined) split.onOpen(besideOf(item, text));
    },
    press: (key: string) => {
      const item = opener(key);
      if (split !== undefined && item !== undefined) full(item)();
      else stopOf(key)?.click();
    },
  };
}

/**
 * Whether the window is wide enough for the results and what they open side by side: any desk's,
 * where the results are the first column (ADR 0284); a phone's has one column.
 */
const SPLIT = "(min-width: 641px)";

function useSplit(): boolean {
  return useSyncExternalStore(splitChanges, splitNow, () => false);
}

function splitNow(): boolean {
  return typeof matchMedia === "function" && matchMedia(SPLIT).matches;
}

function splitChanges(changed: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(SPLIT);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/** A row that opens something: a space, an agent, a message. */
type Opener = Extract<SearchItem, { kind: "space" | "agent" | "message" }>;

function isOpener(item: SearchItem): item is Opener {
  return item.kind === "space" || item.kind === "agent" || item.kind === "message";
}

/** What a result opens beside the results: a message, its room at the line, the words with it. */
function besideOf(item: Opener, searched: string): Beside {
  if (item.kind === "agent") return { kind: "agent", key: item.key, agentId: item.found.row.id };
  if (item.kind === "space") return { kind: "space", key: item.key, spaceId: item.found.space.id };
  return { kind: "space", key: item.key, spaceId: item.hit.spaceId, hit: item.hit, searched };
}

/** Last at the head of a room beside the results: the room in Spaces, as the iPad's pane has it. */
export function OpenInSpaces({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <button type="button" className="search-open-in" onClick={onOpen} data-testid="open-in-spaces">
      Open in Spaces
    </button>
  );
}

/** How long the backdrop takes to fade away as something is typed: the phone's too (`--motion-base`). */
const BACKDROP_OUT_MS = 200;

/** How long the chips take to fade where they stood as the field empties (`--motion-fast`). */
const CHIPS_OUT_MS = 120;

/** The list the field's arrows move through, which the field says it controls. */
const LIST_ID = "search-results";

/** The rows the arrows stop on: what opens something, or runs a search again. */
const STOPS: ReadonlySet<SearchItem["kind"]> = new Set([
  "recent",
  "space",
  "agent",
  "seeAll",
  "message",
]);

function isStop(item: SearchItem): boolean {
  return STOPS.has(item.kind);
}

/** The id of the button a row's arrow stop is: what the field names as lit, and what Enter presses. */
function stopId(key: string): string {
  return `search-stop-${key.replace(/[^\w-]/g, "_")}`;
}

function stopOf(key: string): HTMLElement | null {
  return document.getElementById(stopId(key));
}

/** The field: what is typed, and the keys that work the results from it (ADR 0263). */
function Field(props: {
  readonly field: RefObject<HTMLInputElement | null>;
  readonly text: string;
  readonly onType: (text: string) => void;
  readonly keys: FieldKeys;
}) {
  const { keys } = props;
  return (
    <div className="search-box">
      <Icon name="search" />
      <input
        ref={props.field}
        type="search"
        aria-label="Search spaces, agents and messages"
        placeholder="Spaces, agents, messages"
        value={props.text}
        onChange={(event) => props.onType(event.target.value)}
        onKeyDown={(event) => onFieldKey(event, keys)}
        aria-controls={LIST_ID}
        aria-activedescendant={keys.lit === undefined ? undefined : stopId(keys.lit)}
      />
    </div>
  );
}

/** What the field's keys work on: the rows to light, the one lit, and what the field holds. */
interface FieldKeys {
  readonly stops: readonly string[];
  readonly lit: string | undefined;
  readonly text: string;
  readonly light: (key: string | undefined) => void;
  /** Enter with nothing lit: the search is kept among the recent ones, as it always was. */
  readonly remember: () => void;
  readonly empty: () => void;
  /** Enter on the row lit. */
  readonly press: (key: string) => void;
}

/** A key in the field (ADR 0263): ↓ and ↑ light the rows, Enter opens the one lit, Esc empties. */
function onFieldKey(event: KeyboardEvent<HTMLInputElement>, keys: FieldKeys): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") arrow(event, keys);
  else if (event.key === "Enter") enter(event, keys);
  else if (event.key === "Escape") esc(event, keys);
}

/** Up from the first gives the keys back to the words; down stops at the last. */
function arrow(event: KeyboardEvent<HTMLInputElement>, keys: FieldKeys): void {
  const down = event.key === "ArrowDown";
  if (keys.stops.length === 0 || (!down && keys.lit === undefined)) return;
  event.preventDefault();
  const at = keys.lit === undefined ? -1 : keys.stops.indexOf(keys.lit);
  const next = at + (down ? 1 : -1);
  const key = next < 0 ? undefined : keys.stops[Math.min(next, keys.stops.length - 1)];
  keys.light(key);
  // Scrolled to, not jumped to, unless less motion is asked for.
  const behavior = reduceMotion() ? "auto" : "smooth";
  if (key !== undefined) stopOf(key)?.scrollIntoView?.({ block: "nearest", behavior });
}

function enter(event: KeyboardEvent<HTMLInputElement>, keys: FieldKeys): void {
  if (keys.lit === undefined) {
    keys.remember();
    return;
  }
  event.preventDefault();
  keys.press(keys.lit);
}

/** As a Mac's own search field: the words go, and the keys stay in it. Nothing to empty, it passes. */
function esc(event: KeyboardEvent<HTMLInputElement>, keys: FieldKeys): void {
  if (keys.text === "" && keys.lit === undefined) return;
  event.preventDefault();
  if (keys.text === "") keys.light(undefined);
  else keys.empty();
}

/**
 * Whether something that goes is still drawn while it fades: `shown`, `leaving` for `ms` after it
 * stops being shown, then `gone`. Decided in the render it changes in, so what fades is the same
 * thing, never a new one drawn for the fade.
 */
function useLeaving(shown: boolean, ms: number): "shown" | "leaving" | "gone" {
  const [was, setWas] = useState(shown);
  const [leaving, setLeaving] = useState(false);
  if (was !== shown) {
    setWas(shown);
    setLeaving(!shown);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), ms);
    return () => clearTimeout(timer);
  }, [leaving, ms]);
  return shown ? "shown" : leaving ? "leaving" : "gone";
}

/**
 * A search that failed for want of the server is asked again when it can be reached, so a
 * computer back on its network finds what was typed without a press. Only as the connection comes
 * back: a server that answers and refuses is asked again on Try again, not in a loop.
 */
function useAskedAgainOnline(search: MessageSearch, online: boolean): void {
  const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) search.retry();
    was.current = online;
  }, [online, search]);
}

/**
 * The foot of the list: as it nears the window's, the next page of messages is asked for. Watched
 * again each time a page lands, so a page too short to scroll asks for the next at once.
 */
function NearEnd({
  messages,
  search,
}: {
  readonly messages: MessageResults;
  readonly search: MessageSearch;
}) {
  const foot = useRef<HTMLDivElement>(null);
  const wanted = messages.more && messages.status === "done";
  const count = messages.hits.length;
  useEffect(() => {
    const element = foot.current;
    // Watched afresh for each page's rows, which the count says have come.
    if (!wanted || count === 0 || element === null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) search.more();
      },
      { rootMargin: "0px 0px 480px 0px" },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [wanted, count, search]);
  return <div ref={foot} className="search-foot" data-testid="search-foot" />;
}

/**
 * The chips with something typed, and for a moment after the field empties: then a copy of them,
 * the one that was chosen still chosen, fades where they stood, out of reach and of the reading
 * order, while the room under the field has already closed.
 */
function Chips(props: {
  /** What is listed has words to it: the chips are wanted. */
  readonly typed: boolean;
  /** What the field holds now, a beat ahead of what is listed. */
  readonly words: string;
  readonly scope: SearchScope;
  readonly onChange: (scope: SearchScope) => void;
  readonly arriving: boolean;
}) {
  const shown = useLeaving(props.typed, CHIPS_OUT_MS);
  // The chip chosen while the field had words: emptied, it goes back to All at once.
  const chosen = useRef(props.scope);
  if (searchTerms(props.words).length > 0) chosen.current = props.scope;
  if (shown === "gone") return null;
  if (shown === "shown") {
    return <ScopeChips scope={props.scope} onChange={props.onChange} arriving={props.arriving} />;
  }
  return (
    <div className="search-chips" data-leaving="" aria-hidden="true" inert>
      {SEARCH_SCOPES.map((each) => (
        <span
          key={each.scope}
          className="search-chip"
          data-chosen={each.scope === chosen.current ? "" : undefined}
        >
          {each.title}
        </span>
      ))}
    </div>
  );
}

/** Whether a search is still to be asked for the messages: what is found may yet change. */
function settling(messages: MessageResults): boolean {
  return messages.status === "idle" || messages.status === "waiting";
}

/**
 * The chips under the field: one chosen, flat, ink on the page's colour. One stop for Tab, the
 * chosen one; ← and → choose the one beside it, as tabs do.
 */
function ScopeChips({
  scope,
  onChange,
  arriving,
}: {
  readonly scope: SearchScope;
  readonly onChange: (scope: SearchScope) => void;
  /** Coming in under the field as the first letter is typed. */
  readonly arriving: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (by === 0) return;
    event.preventDefault();
    const at = SEARCH_SCOPES.findIndex((each) => each.scope === scope);
    const next = SEARCH_SCOPES[(at + by + SEARCH_SCOPES.length) % SEARCH_SCOPES.length];
    if (next === undefined) return;
    onChange(next.scope);
    row.current?.querySelector<HTMLElement>(`[data-testid="scope-${next.scope}"]`)?.focus();
  };
  return (
    <div
      ref={row}
      className="search-chips"
      role="tablist"
      aria-label="Find"
      data-arriving={arriving ? "" : undefined}
      data-testid="scope-chips"
      onKeyDown={step}
    >
      {SEARCH_SCOPES.map((each) => (
        <button
          key={each.scope}
          type="button"
          role="tab"
          className="search-chip"
          aria-selected={each.scope === scope}
          tabIndex={each.scope === scope ? 0 : -1}
          data-testid={`scope-${each.scope}`}
          onClick={() => onChange(each.scope)}
        >
          {each.title}
        </button>
      ))}
    </div>
  );
}

/** What a row needs beyond itself: the workspace, and where each press goes. */
interface RowContext extends SearchProps {
  readonly recent: RecentSearches;
  /** The key of the row open beside the results. */
  readonly open: string | undefined;
  /** A press: beside the results on a wide window, else its own page. */
  readonly onOpen: (item: Opener) => () => void;
  /** A double click: its own page, wherever the results are. */
  readonly onFull: (item: Opener) => () => void;
  readonly onRecent: (text: string) => void;
  readonly onSeeAll: (scope: "spaces" | "agents") => void;
  /** A failed ask, asked again. */
  readonly onRetry: () => void;
}

type RowOf<K extends SearchItem["kind"]> = (props: {
  readonly item: Extract<SearchItem, { kind: K }>;
  readonly context: RowContext;
}) => ReactElement;

const ROWS: { readonly [K in SearchItem["kind"]]: RowOf<K> } = {
  heading: ({ item }) => <h2 className="search-h">{item.title}</h2>,
  recents: ({ context }) => (
    <div className="search-h search-h-row">
      <h2>Recent</h2>
      <button
        type="button"
        className="search-clear"
        aria-label="Clear recent searches"
        onClick={context.recent.clear}
      >
        Clear
      </button>
    </div>
  ),
  recent: ({ item, context }) => <RecentRow item={item} context={context} />,
  hint: () => <Hint />,
  space: ({ item, context }) => <SpaceRow item={item} context={context} />,
  agent: ({ item, context }) => <AgentRow item={item} context={context} />,
  seeAll: ({ item, context }) => (
    <button
      type="button"
      id={stopId(item.key)}
      className="search-see-all"
      data-testid={`see-all-${item.scope}`}
      aria-label={`See all ${item.count} ${item.scope}`}
      onClick={() => context.onSeeAll(item.scope)}
    >
      {`See all ${item.count}`}
    </button>
  ),
  message: ({ item, context }) => <MessageRow item={item} context={context} />,
  placeholder: ({ item }) => <Placeholder first={item.first} />,
  offline: ({ context }) => (
    <Notice
      tone="amber"
      mark="offline"
      title="Can't reach your server."
      words="Messages are searched there."
      onRetry={context.onWake}
      testId="search-offline"
    />
  ),
  failed: ({ context }) => (
    <Notice
      tone="plain"
      mark="alert"
      title="The search didn't go through."
      onRetry={context.onRetry}
      testId="search-failed"
    />
  ),
  fewLetters: () => <p className="search-quiet">Messages are found from two letters on.</p>,
  fetching: () => (
    <p className="search-quiet" aria-live="polite">
      Finding more…
    </p>
  ),
  nothing: ({ item }) => (
    <div className="search-nothing" data-testid="search-empty">
      <Icon name="search" size={24} />
      <p className="search-nothing-t">{`Nothing for “${item.text.trim()}”`}</p>
      <p>{item.looksAt}</p>
    </div>
  ),
};

/** A row of the list, keyed for the motion, lit by the arrows or open beside the results. */
function Item(props: {
  readonly item: SearchItem;
  readonly lit: boolean;
  /** The messages are still to be asked for: nothing found arrives once typing has paused. */
  readonly settling: boolean;
  readonly context: RowContext;
}) {
  const { item, context } = props;
  const hold = props.settling && item.kind === "nothing";
  return (
    <li
      className="search-item"
      data-kind={item.kind}
      data-key={item.key}
      data-hold={hold ? "" : undefined}
      data-lit={props.lit ? "" : undefined}
      data-open={item.key === context.open ? "" : undefined}
    >
      <ResultRow item={item} context={context} />
    </li>
  );
}

/** One row of the results, whichever kind it is. */
function ResultRow({ item, context }: { readonly item: SearchItem; readonly context: RowContext }) {
  const Row = ROWS[item.kind] as RowOf<typeof item.kind>;
  return <Row item={item as never} context={context} />;
}

function RecentRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "recent" }>;
  readonly context: RowContext;
}) {
  const { text } = item;
  return (
    <div className="search-recent">
      <button
        type="button"
        id={stopId(item.key)}
        className="search-recent-go"
        aria-label={`Search for ${text}`}
        data-testid={`recent-${text}`}
        onClick={() => context.onRecent(text)}
      >
        <Mark name="clock" />
        <span>{text}</span>
      </button>
      <button
        type="button"
        className="search-forget"
        aria-label={`Forget ${text}`}
        onClick={() => context.recent.forget(text)}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** A row a result is drawn in: pressed, it opens; pressed twice, it opens on its own page. */
function ResultButton(props: {
  /** The row, whose key names the button for the arrows. */
  readonly item: Opener;
  readonly context: RowContext;
  readonly label: string;
  readonly testId: string;
  readonly face: ReactNode;
  readonly children: ReactNode;
  readonly chevron?: boolean;
}) {
  const { item, context } = props;
  return (
    <button
      type="button"
      id={stopId(item.key)}
      className="search-row"
      aria-label={props.label}
      aria-current={item.key === context.open ? "true" : undefined}
      data-testid={props.testId}
      onClick={context.onOpen(item)}
      onDoubleClick={context.onFull(item)}
    >
      <span className="search-face">{props.face}</span>
      <span className="search-body">{props.children}</span>
      {props.chevron !== false && (
        <span className="search-chevron" aria-hidden="true">
          ›
        </span>
      )}
    </button>
  );
}

function SpaceRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "space" }>;
  readonly context: RowContext;
}) {
  const { found } = item;
  const { space } = found;
  const when = space.lastActivityAt === undefined ? "" : relativeTime(space.lastActivityAt);
  const line = spaceFoundLine(found, context.directory, context.selfId, when);
  return (
    <ResultButton
      item={item}
      context={context}
      label={found.title}
      testId={`result-space-${space.id}`}
      face={spaceAvatar(space, context.directory, found.title, context.spaceIcons.get(space.id))}
    >
      <span className="search-top">
        <span className="search-name">
          <Marked parts={markedParts(found.title, found.marks)} />
        </span>
        {found.closed && <span className="search-aside">Archived</span>}
      </span>
      {line.length > 0 && (
        <span className="search-sub">
          <Marked parts={line} />
        </span>
      )}
    </ResultButton>
  );
}

function AgentRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "agent" }>;
  readonly context: RowContext;
}) {
  const { row, marks, lineMarks } = item.found satisfies AgentFound;
  return (
    <ResultButton
      item={item}
      context={context}
      label={`${row.name}${row.lead ? ", Main agent" : ""}, ${row.line}`}
      testId={`result-agent-${row.id}`}
      face={<Avatar name={row.name} kind="agent" size="sm" icon={row.face} />}
    >
      <span className="search-top">
        <span className="search-name">
          <Marked parts={markedParts(row.name, marks)} />
        </span>
        {/* As on the Agents tab (ADR 0145). */}
        {row.lead && <MainTag name={row.name} icon={row.face} />}
        {row.archived && <span className="search-aside">Archived</span>}
      </span>
      <span className={row.free ? "search-sub agent-free" : "search-sub"}>
        <Marked parts={markedParts(row.line, lineMarks)} />
      </span>
    </ResultButton>
  );
}

function MessageRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "message" }>;
  readonly context: RowContext;
}) {
  const { hit, space } = item;
  const who = hitAuthor(hit, space, context.directory, context.selfId);
  const where = hitPlace(space, context.model, context.directory, context.selfId);
  const step = hit.kind === "receipt";
  const voice = hit.snippetFrom === "transcript";
  // Said in an archived space: found and opened all the same, to read, and the row says so.
  const archived = hitArchived(space, context.model);
  const when = relativeTime(hit.at);
  return (
    <ResultButton
      item={item}
      context={context}
      label={`${who.name} in ${where}${archived ? ", archived" : ""}`}
      testId="search-hit"
      face={<Avatar name={who.face} kind={who.kind} icon={who.icon} size="sm" />}
      chevron={false}
    >
      <span className="search-top">
        <span className="search-said">
          <b>{who.name}</b>
          {step ? " step in " : " in "}
          {where}
        </span>
        <span className="search-aside">{archived ? `Archived · ${when}` : when}</span>
      </span>
      <span className="search-snippet" data-kind={hit.kind}>
        {voice && (
          <span className="search-voice">
            <Icon name="mic" size={12} /> voice note{" "}
          </span>
        )}
        {step && <span className="search-voice">{">_ "}</span>}
        <Marked parts={snippetParts(plainWords(hit.snippet))} />
      </span>
    </ResultButton>
  );
}

/**
 * What Search finds, with nothing typed and nothing searched for yet (ADR 0137): "Find" and a word
 * that rolls over from spaces to agents to anything said, the sentence under it. A screen reader
 * reads the sentence; the roll is the stylesheet's, still with less motion asked for.
 */
function Hint() {
  const { lead, words, sentence } = SEARCH_HINT;
  return (
    <div className="search-hint">
      <p className="search-hint-line" aria-hidden="true">
        {lead}
        <span className="search-roll">
          <span>
            {/* The first word again at the foot, which the round ends on. */}
            {[...words, words[0]].map((word, at) => (
              <span key={at === words.length ? "again" : word}>{word}</span>
            ))}
          </span>
        </span>
      </p>
      <p className="search-quiet">{sentence}</p>
    </div>
  );
}

/** How a ghost row breathes (ADR 0189), the second a beat after the first: core's pace. */
const BREATHING = {
  "--breath-ms": `${SEARCH_ARRIVAL.breathMs}ms`,
  "--breath-low": SEARCH_ARRIVAL.breathLow,
} as CSSProperties;

/**
 * A message on its way, the first time: the shape of a row, with nothing in it yet, breathing until
 * the messages come and take its place.
 */
function Placeholder({ first }: { readonly first: boolean }) {
  const breath = {
    ...BREATHING,
    "--breath-lag": `${first ? 0 : SEARCH_ARRIVAL.breathLagMs}ms`,
  } as CSSProperties;
  return (
    <div
      className="search-row search-ghost"
      aria-label="Searching messages"
      role="status"
      style={breath}
    >
      <span className="search-ghost-face" />
      <span className="search-body">
        <span className="search-ghost-line search-ghost-short" />
        <span className="search-ghost-line" />
      </span>
    </div>
  );
}

function Notice(props: {
  readonly tone: "amber" | "plain";
  readonly mark: "offline" | "alert";
  readonly title: string;
  readonly words?: string | undefined;
  readonly onRetry: () => void;
  readonly testId: string;
}) {
  return (
    <div className="search-notice" data-tone={props.tone} data-testid={props.testId} role="alert">
      <Mark name={props.mark} size={18} />
      <p>
        <b>{props.title}</b>
        {props.words === undefined ? "" : ` ${props.words}`}
      </p>
      <button type="button" onClick={props.onRetry}>
        Try again
      </button>
    </div>
  );
}

/**
 * Search's own marks, the phone's paths (`apps/mobile/src/ui/icons.ts`), drawn as the design
 * system's `Icon` draws its own: the clock beside a recent search, the cloud struck through when the
 * server can't be reached, and the alert on a search that didn't go through. They stay here, not
 * in `@chipschat/ui`, until the phone's `icons.ts` moves them among the marks it checks against
 * the design system's: its test fails while the design system holds a mark the phone keeps as
 * its own.
 */
const MARKS = {
  clock: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", "M12 7v5l3.2 2"],
  offline: [
    "M7 18.5h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.7 4.4 4.4 0 0 0 7 18.5z",
    "M3.5 3.5l17 17",
  ],
  alert: ["M12 3.4L21.6 20H2.4z", "M12 9.6v5", "M12 16.3a.9.9 0 1 0 0 1.8a.9.9 0 1 0 0-1.8z"],
} as const;

function Mark({ name, size = 16 }: { readonly name: keyof typeof MARKS; readonly size?: number }) {
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      data-icon={name}
    >
      {MARKS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
