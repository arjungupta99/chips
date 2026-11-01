/**
 * Asking the server for messages as someone types (docs/proposals/search-plan.md §3.3). The
 * server does the finding — FTS5, newest first, paged by cursor — and this decides when to ask
 * and which answer counts:
 *
 * - **from two letters**, once typing pauses for 200 ms, so a word typed is one request and not
 *   one per key;
 * - **the newest wins**: an answer for words since changed is dropped, the first page and every
 *   later one alike, so a slow answer never lands over a newer one;
 * - **the hits stay** until the next answer replaces them, so the list never blanks between keys;
 * - **pages of twenty**, the next asked for as the list nears its end, one at a time.
 *
 * In core, with no framework, so the phone and the desktop ask alike and a test drives it with a
 * fake clock. `subscribe` and `results` are the shape React's `useSyncExternalStore` takes.
 */

import { searchTerms } from "./search.js";
import type { SearchHit, SearchInput, SearchPage } from "./store.js";

/** How long typing pauses before the words are sent. */
export const SEARCH_PAUSE_MS = 200;

/** How many hits a page holds. */
export const SEARCH_PAGE = 20;

/** Fewer letters than this find too much to be worth asking for. */
const LEAST_LETTERS = 2;

export interface MessageResults {
  /** The words the hits were found by: behind what is typed while a newer search is under way. */
  readonly text: string;
  readonly hits: readonly SearchHit[];
  /**
   * - `idle`: nothing to ask, with fewer than two letters typed;
   * - `waiting`: what is typed now is being asked for, or is about to be;
   * - `done`: the hits are for what is typed;
   * - `failed`: the last ask did not go through, and `retry` asks again.
   */
  readonly status: "idle" | "waiting" | "done" | "failed";
  /** Whether an answer has come since typing began: until one has, there is nothing to keep. */
  readonly answered: boolean;
  /** Whether the server has more pages, and whether the next is on its way. */
  readonly more: boolean;
  readonly fetchingMore: boolean;
}

export interface MessageSearch {
  /** What to draw now: the same object until something changes. */
  readonly results: () => MessageResults;
  readonly subscribe: (listener: () => void) => () => void;
  /** What is typed now. The same words again, however spaced, change nothing. */
  readonly type: (text: string) => void;
  /** The next page. Nothing while one is on its way, after a failure, or when there is none. */
  readonly more: () => void;
  /** After a failure, the same ask again at once: the first page, or the next. */
  readonly retry: () => void;
  /** No timer left, no listener, and any answer still coming dropped. */
  readonly close: () => void;
}

export interface MessageSearchOptions {
  readonly pauseMs?: number | undefined;
  readonly pageSize?: number | undefined;
}

const IDLE: MessageResults = {
  text: "",
  hits: [],
  status: "idle",
  answered: false,
  more: false,
  fetchingMore: false,
};

/** A hit's key, unique within a search: its line, or its run's step. A list's key too. */
export function hitKey(hit: SearchHit): string {
  return hit.kind === "message" ? `line:${hit.lineId}` : `step:${hit.runId}/${hit.stepId}`;
}

/**
 * How far apart the same words by the same author in the same room are one line: a run's summary
 * comes within moments of the message it repeats.
 */
const REPEAT_WITHIN_MS = 10 * 60_000;

/** What a message hit says, and where and by whom: two hits alike in this may be one line. */
function wordsOf(hit: SearchHit): string | undefined {
  return hit.kind === "message"
    ? `${hit.spaceId}\u0000${hit.authorId}\u0000${hit.snippet}`
    : undefined;
}

/**
 * A page's hits after the ones before, any already there left out.
 *
 * And a run's summary that repeats its own message word for word left out too. The room draws
 * the two as one line, the message's, with the summary folded into it (core's `closeOnLastSaid`),
 * but the server indexes both: two rows of the same words, one of which lands nowhere. Hits come
 * newest first, so the one after is the older, which is the room's line: it takes the newer one's
 * place.
 */
function joined(had: readonly SearchHit[], page: readonly SearchHit[]): readonly SearchHit[] {
  const out = [...had];
  const seen = new Set(had.map(hitKey));
  const said = new Map<string, number>();
  out.forEach((hit, at) => {
    const words = wordsOf(hit);
    if (words !== undefined) said.set(words, at);
  });
  for (const hit of page) {
    if (seen.has(hitKey(hit))) continue;
    seen.add(hitKey(hit));
    const words = wordsOf(hit);
    const at = words === undefined ? undefined : said.get(words);
    const newer = at === undefined ? undefined : out[at];
    if (newer !== undefined && Date.parse(newer.at) - Date.parse(hit.at) <= REPEAT_WITHIN_MS) {
      out[at as number] = hit;
      continue;
    }
    if (words !== undefined) said.set(words, out.length);
    out.push(hit);
  }
  return out;
}

/** Words as they are asked for: trimmed, single spaced. */
function said(text: string): string {
  return text.trim().replace(/\s+/gu, " ");
}

function worthAsking(text: string): boolean {
  return searchTerms(text).join("").length >= LEAST_LETTERS;
}

export function messageSearch(
  search: (input: SearchInput) => Promise<SearchPage>,
  options: MessageSearchOptions = {},
): MessageSearch {
  const pauseMs = options.pauseMs ?? SEARCH_PAUSE_MS;
  const limit = options.pageSize ?? SEARCH_PAGE;
  const listeners = new Set<() => void>();
  let results = IDLE;
  let typed = "";
  /** Counts what was typed: an answer asked for under an older count is dropped. */
  let asked = 0;
  let cursor: string | null = null;
  let failedOn: "first" | "more" = "first";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: Partial<MessageResults>) => {
    results = { ...results, ...next };
    for (const listener of listeners) listener();
  };

  const first = () => {
    const mine = asked;
    const text = typed;
    search({ text, limit }).then(
      (page) => {
        if (mine !== asked) return;
        cursor = page.nextCursor;
        set({
          text,
          hits: joined([], page.hits),
          status: "done",
          answered: true,
          more: cursor !== null,
        });
      },
      () => {
        if (mine !== asked) return;
        failedOn = "first";
        set({ status: "failed" });
      },
    );
  };

  const more = () => {
    if (results.status !== "done" || cursor === null || results.fetchingMore) return;
    const mine = asked;
    set({ fetchingMore: true });
    search({ text: results.text, cursor, limit }).then(
      (page) => {
        if (mine !== asked) return;
        cursor = page.nextCursor;
        set({ hits: joined(results.hits, page.hits), more: cursor !== null, fetchingMore: false });
      },
      () => {
        if (mine !== asked) return;
        failedOn = "more";
        set({ status: "failed", fetchingMore: false });
      },
    );
  };

  const type = (text: string) => {
    const words = said(text);
    if (words === typed) return;
    typed = words;
    asked += 1;
    clearTimeout(timer);
    if (!worthAsking(words)) {
      cursor = null;
      set(IDLE);
      return;
    }
    set({ status: "waiting", fetchingMore: false });
    timer = setTimeout(first, pauseMs);
  };

  const retry = () => {
    if (results.status !== "failed") return;
    if (failedOn === "more") {
      set({ status: "done" });
      more();
      return;
    }
    asked += 1;
    set({ status: "waiting" });
    first();
  };

  return {
    results: () => results,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    type,
    more,
    retry,
    close: () => {
      asked += 1;
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
