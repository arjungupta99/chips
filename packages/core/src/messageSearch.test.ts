/** When search asks the server for messages, and which answer counts (search-plan §3.3). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hitKey, messageSearch, SEARCH_PAGE, SEARCH_PAUSE_MS } from "./messageSearch.js";
import type { SearchHit, SearchInput, SearchPage } from "./store.js";

/** A server whose answers come when the test says, in whatever order it says. */
function server() {
  const asks: { input: SearchInput; answer: (page: SearchPage) => void; fail: () => void }[] = [];
  const search = (input: SearchInput) =>
    new Promise<SearchPage>((resolve, reject) => {
      asks.push({ input, answer: resolve, fail: () => reject(new Error("offline")) });
    });
  return { asks, search };
}

const hit = (id: string): SearchHit => ({
  kind: "message",
  spaceId: "spc_1",
  at: "2026-10-06T20:00:00.000Z",
  snippet: id,
  lineId: id,
});

const page = (ids: string[], nextCursor: string | null = null): SearchPage => ({
  hits: ids.map(hit),
  nextCursor,
});

/** Lets the answers' `then` run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("asking for messages as someone types", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks nothing under two letters", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    for (const text of ["c", " c ", "@", "–", ""]) messages.type(text);
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS * 2);
    expect(asks).toEqual([]);
    expect(messages.results().status).toBe("idle");
  });

  it("asks once, for the last words, when typing pauses", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    for (const text of ["ch", "chi", "chin"]) {
      messages.type(text);
      await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS - 1);
    }
    expect(asks).toHaveLength(0);
    expect(messages.results().status).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(asks.map((ask) => ask.input)).toEqual([{ text: "chin", limit: SEARCH_PAGE }]);
  });

  it("asks nothing again for the same words, however spaced", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin tour");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    messages.type("  chin   tour ");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    expect(asks).toHaveLength(1);
  });

  it("draws an answer, and has nothing to keep until the first one comes", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    expect(messages.results().answered).toBe(false);
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer(page(["ln_1", "ln_2"]));
    await settle();
    expect(messages.results()).toMatchObject({
      text: "chin",
      status: "done",
      answered: true,
      more: false,
    });
    expect(messages.results().hits.map(hitKey)).toEqual(["line:ln_1", "line:ln_2"]);
  });

  it("keeps the hits on screen while newer words are asked for", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer(page(["ln_1"]));
    await settle();
    messages.type("chinat");
    expect(messages.results()).toMatchObject({ text: "chin", status: "waiting", answered: true });
    expect(messages.results().hits).toHaveLength(1);
  });

  it("drops an older answer that comes after a newer one", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    messages.type("chinat");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[1]?.answer(page(["ln_new"]));
    await settle();
    asks[0]?.answer(page(["ln_old"]));
    await settle();
    expect(messages.results().text).toBe("chinat");
    expect(messages.results().hits.map(hitKey)).toEqual(["line:ln_new"]);
  });

  it("drops an older answer that comes first, and waits for the newer", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    messages.type("chinat");
    asks[0]?.answer(page(["ln_old"]));
    await settle();
    expect(messages.results()).toMatchObject({ status: "waiting", hits: [] });
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[1]?.answer(page(["ln_new"]));
    await settle();
    expect(messages.results().hits.map(hitKey)).toEqual(["line:ln_new"]);
  });

  it("is idle again, with nothing, when the words are taken back under two letters", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer(page(["ln_1"], "c1"));
    await settle();
    messages.type("c");
    expect(messages.results()).toMatchObject({ status: "idle", hits: [], more: false });
  });
});

describe("the next page", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function answered(nextCursor: string | null = "c1") {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer(page(["ln_1", "ln_2"], nextCursor));
    await settle();
    return { asks, messages };
  }

  it("is asked for from where the last left off, and joins the hits, any twice left out", async () => {
    const { asks, messages } = await answered();
    expect(messages.results().more).toBe(true);
    messages.more();
    expect(messages.results().fetchingMore).toBe(true);
    expect(asks[1]?.input).toEqual({ text: "chin", cursor: "c1", limit: SEARCH_PAGE });
    asks[1]?.answer(page(["ln_2", "ln_3"]));
    await settle();
    expect(messages.results().hits.map(hitKey)).toEqual(["line:ln_1", "line:ln_2", "line:ln_3"]);
    expect(messages.results()).toMatchObject({ more: false, fetchingMore: false });
  });

  it("is asked for once at a time, and not at all when there is none", async () => {
    const { asks, messages } = await answered();
    messages.more();
    messages.more();
    expect(asks).toHaveLength(2);
    asks[1]?.answer(page(["ln_3"]));
    await settle();
    messages.more();
    expect(asks).toHaveLength(2);
  });

  it("is dropped when the words change while it comes", async () => {
    const { asks, messages } = await answered();
    messages.more();
    messages.type("chinat");
    asks[1]?.answer(page(["ln_stale"]));
    await settle();
    expect(messages.results().hits.map(hitKey)).toEqual(["line:ln_1", "line:ln_2"]);
    expect(messages.results().fetchingMore).toBe(false);
  });
});

describe("a run's summary that repeats its message", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const said = (id: string, at: string, snippet = "the \u{E000}tour\u{E001} is up"): SearchHit => ({
    kind: "message",
    spaceId: "spc_1",
    authorId: "agt_kit",
    at,
    snippet,
    lineId: id,
  });

  async function found(...pages: SearchHit[][]) {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("tour");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer({ hits: pages[0] ?? [], nextCursor: pages.length > 1 ? "c1" : null });
    await settle();
    for (const [at, hits] of pages.slice(1).entries()) {
      messages.more();
      asks[at + 1]?.answer({ hits, nextCursor: at + 2 < pages.length ? `c${at + 2}` : null });
      await settle();
    }
    return messages.results().hits.map((hit) => hit.lineId);
  }

  it("is one row, the message's, which is the line the room draws", async () => {
    const summary = said("evt_summary", "2026-10-06T07:45:55.856Z");
    const message = said("evt_message", "2026-10-06T07:45:55.429Z");
    const before = said(
      "evt_before",
      "2026-10-06T07:40:00.000Z",
      "a \u{E000}tour\u{E001} of ten stops",
    );
    expect(await found([summary, message, before])).toEqual(["evt_message", "evt_before"]);
  });

  it("is one row when the two fall on either side of a page", async () => {
    const summary = said("evt_summary", "2026-10-06T07:45:55.856Z");
    const message = said("evt_message", "2026-10-06T07:45:55.429Z");
    expect(await found([summary], [message])).toEqual(["evt_message"]);
  });

  it("leaves the same words said again later as their own line", async () => {
    const today = said("evt_today", "2026-10-06T07:45:00.000Z");
    const lastWeek = said("evt_last_week", "2026-09-29T07:45:00.000Z");
    const someoneElse = { ...said("evt_other", "2026-10-06T07:44:59.000Z"), authorId: "usr_arjun" };
    expect(await found([today, someoneElse, lastWeek])).toEqual([
      "evt_today",
      "evt_other",
      "evt_last_week",
    ]);
  });
});

describe("a search that did not go through", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("says so, and is asked again at once on retry", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.fail();
    await settle();
    expect(messages.results().status).toBe("failed");
    messages.retry();
    expect(messages.results().status).toBe("waiting");
    expect(asks[1]?.input).toEqual({ text: "chin", limit: SEARCH_PAGE });
    asks[1]?.answer(page(["ln_1"]));
    await settle();
    expect(messages.results().status).toBe("done");
  });

  it("keeps the hits when a next page fails, and asks for that page again", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer(page(["ln_1"], "c1"));
    await settle();
    messages.more();
    asks[1]?.fail();
    await settle();
    expect(messages.results()).toMatchObject({ status: "failed", fetchingMore: false });
    expect(messages.results().hits).toHaveLength(1);
    messages.retry();
    expect(asks[2]?.input).toEqual({ text: "chin", cursor: "c1", limit: SEARCH_PAGE });
  });

  it("asks nothing on retry when nothing failed", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.retry();
    expect(asks).toEqual([]);
  });
});

describe("watching a search", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hands back the same results until something changes, and tells a listener when it does", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    const told = vi.fn();
    const stop = messages.subscribe(told);
    const before = messages.results();
    expect(messages.results()).toBe(before);
    messages.type("chin");
    expect(told).toHaveBeenCalledTimes(1);
    expect(messages.results()).not.toBe(before);
    stop();
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    asks[0]?.answer(page(["ln_1"]));
    await settle();
    expect(told).toHaveBeenCalledTimes(1);
  });

  it("asks nothing and draws nothing more once closed", async () => {
    const { asks, search } = server();
    const messages = messageSearch(search);
    messages.type("chin");
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    messages.type("chinat");
    messages.close();
    await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS);
    expect(asks).toHaveLength(1);
    asks[0]?.answer(page(["ln_1"]));
    await settle();
    expect(messages.results().hits).toEqual([]);
  });

  it("keys a receipt by its run and step", () => {
    expect(hitKey({ ...hit("x"), kind: "receipt", runId: "run_1", stepId: "stp_2" })).toBe(
      "step:run_1/stp_2",
    );
  });
});
