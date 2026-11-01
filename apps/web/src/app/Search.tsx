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
 */

import {
  type AgentFound,
  type Directory,
  findAgents,
  findSpaces,
  hitAuthor,
  hitPlace,
  type MessageResults,
  type MessageSearch,
  markedParts,
  messageSearch,
  plainWords,
  SEARCH_ARRIVAL,
  SEARCH_HINT,
  SEARCH_LOOKS_AT,
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
  type ReactElement,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MainTag } from "./MainTag.tsx";
import { Marked } from "./Marked.tsx";
import { type RecentSearches, useRecentSearches } from "./recentSearches.ts";
import { SearchBackdrop } from "./SearchBackdrop.tsx";
import { spaceAvatar } from "./Sidebar.tsx";
import { useResultsMotion } from "./searchMotion.ts";
import { relativeTime } from "./time.ts";

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
}

export function Search(props: SearchProps) {
  const { session, model, directory, selfId, online } = props;
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(session.text);
  const [scope, setScope] = useState<SearchScope>(session.scope);
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
    session.scope = next;
  };
  const type = (value: string) => {
    setText(value);
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
  const backdrop = useLeaving(!typed, BACKDROP_OUT_MS);
  const opened = (go: () => void) => () => {
    recent.remember(text);
    go();
  };
  const context: RowContext = {
    ...props,
    recent,
    onSpace: (id) => opened(() => props.onOpenSpace(id)),
    onAgent: (id) => opened(() => props.onOpenAgent(id)),
    onHit: (hit) => opened(() => props.onOpenHit(hit, text)),
    onRecent: (words) => {
      type(words);
      recent.remember(words);
    },
    onSeeAll: choose,
    onRetry: session.messages.retry,
  };
  const paging = scope === "all" || scope === "messages";

  return (
    <main className="conv search" aria-label="Search">
      <h1 className="ui-visually-hidden">Search</h1>
      <div className="search-head">
        <div className="search-box">
          <Icon name="search" />
          <input
            ref={field}
            type="search"
            aria-label="Search spaces, agents and messages"
            placeholder="Spaces, agents, messages"
            value={text}
            onChange={(event) => type(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") recent.remember(text);
            }}
          />
        </div>
        {typed && <ScopeChips scope={scope} onChange={choose} />}
      </div>
      <div className="search-scroll">
        {backdrop !== "gone" && (
          <SearchBackdrop
            model={model}
            directory={directory}
            selfId={selfId}
            spaceIcons={props.spaceIcons}
            leaving={backdrop === "leaving"}
          />
        )}
        {/* Where a row that has gone fades, under the list (`searchMotion.ts`). */}
        <div ref={ghosts} className="search-ghosts" aria-hidden="true" />
        <ul
          ref={list}
          className="search-list"
          data-typed={typed ? "" : undefined}
          data-testid="search-results"
        >
          {items.map((item) => (
            <li key={item.key} className="search-item" data-kind={item.kind} data-key={item.key}>
              <ResultRow item={item} context={context} />
            </li>
          ))}
        </ul>
        {paging && <NearEnd messages={messages} search={session.messages} />}
      </div>
    </main>
  );
}

/** How long the backdrop takes to fade away as something is typed: the phone's too. */
const BACKDROP_OUT_MS = 200;

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

/** The chips under the field: one chosen, flat, ink on the page's colour. */
function ScopeChips({
  scope,
  onChange,
}: {
  readonly scope: SearchScope;
  readonly onChange: (scope: SearchScope) => void;
}) {
  return (
    <div className="search-chips" role="tablist" aria-label="Find" data-testid="scope-chips">
      {SEARCH_SCOPES.map((each) => (
        <button
          key={each.scope}
          type="button"
          role="tab"
          className="search-chip"
          aria-selected={each.scope === scope}
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
  readonly onSpace: (spaceId: string) => () => void;
  readonly onAgent: (agentId: string) => () => void;
  readonly onHit: (hit: SearchHit) => () => void;
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
  recent: ({ item, context }) => <RecentRow text={item.text} context={context} />,
  hint: () => <Hint />,
  space: ({ item, context }) => <SpaceRow item={item} context={context} />,
  agent: ({ item, context }) => <AgentRow found={item.found} context={context} />,
  seeAll: ({ item, context }) => (
    <button
      type="button"
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
      title="Can't reach your server."
      words="Messages are searched there."
      onRetry={context.onWake}
      testId="search-offline"
    />
  ),
  failed: ({ context }) => (
    <Notice
      tone="plain"
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
      <p>{SEARCH_LOOKS_AT[item.scope]}</p>
    </div>
  ),
};

/** One row of the results, whichever kind it is. */
function ResultRow({ item, context }: { readonly item: SearchItem; readonly context: RowContext }) {
  const Row = ROWS[item.kind] as RowOf<typeof item.kind>;
  return <Row item={item as never} context={context} />;
}

function RecentRow({ text, context }: { readonly text: string; readonly context: RowContext }) {
  return (
    <div className="search-recent">
      <button
        type="button"
        className="search-recent-go"
        aria-label={`Search for ${text}`}
        data-testid={`recent-${text}`}
        onClick={() => context.onRecent(text)}
      >
        <Icon name="search" />
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

/** A row a result is drawn in: pressed, it opens. */
function ResultButton(props: {
  readonly label: string;
  readonly testId: string;
  readonly onClick: () => void;
  readonly face: ReactNode;
  readonly children: ReactNode;
  readonly chevron?: boolean;
}) {
  return (
    <button
      type="button"
      className="search-row"
      aria-label={props.label}
      data-testid={props.testId}
      onClick={props.onClick}
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
      label={found.title}
      testId={`result-space-${space.id}`}
      onClick={context.onSpace(space.id)}
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
  found,
  context,
}: {
  readonly found: AgentFound;
  readonly context: RowContext;
}) {
  const { row, marks, lineMarks } = found;
  return (
    <ResultButton
      label={`${row.name}${row.lead ? ", Main agent" : ""}, ${row.line}`}
      testId={`result-agent-${row.id}`}
      onClick={context.onAgent(row.id)}
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
  return (
    <ResultButton
      label={`${who.name} in ${where}`}
      testId="search-hit"
      onClick={context.onHit(hit)}
      face={<Avatar name={who.face} kind={who.kind} icon={who.icon} size="sm" />}
      chevron={false}
    >
      <span className="search-top">
        <span className="search-said">
          <b>{who.name}</b>
          {step ? " step in " : " in "}
          {where}
        </span>
        <span className="search-aside">{relativeTime(hit.at)}</span>
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
  readonly title: string;
  readonly words?: string | undefined;
  readonly onRetry: () => void;
  readonly testId: string;
}) {
  return (
    <div className="search-notice" data-tone={props.tone} data-testid={props.testId} role="alert">
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
