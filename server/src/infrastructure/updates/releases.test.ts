import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import {
  readAppStore,
  readReleases,
  releaseFeed,
  retryAfterMs,
  UPDATES_FIRST_MS,
  UPDATES_KEEP,
  UPDATES_KEPT_MS,
  UPDATES_MAX_BYTES,
  UPDATES_RETRY_MS,
} from "./releases.js";

const logger = createLogger({ level: "silent" });
const FEED = "https://chipschat.ai/releases.json";
const STORE = "https://itunes.example/lookup";
const RELEASES = {
  releases: [
    { version: "1.2.5", date: "2026-11-20", line: "Fixes." },
    { version: "1.2.4", date: "2026-11-11", line: "Pause and Stop.", dot: true },
  ],
};

/** A fetch that answers each address from its own list, in turn: a body, or a status. */
function answering(answers: Record<string, Array<unknown | number>>) {
  const asked: string[] = [];
  const fetching = (async (url: string) => {
    asked.push(url);
    const next = answers[url]?.shift();
    if (next === undefined || typeof next === "number") {
      return new Response("no", { status: typeof next === "number" ? next : 503 });
    }
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetching, asked };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("readReleases", () => {
  it("keeps each release with its version, day, line and dot, and leaves out what isn't one", () => {
    expect(
      readReleases({
        releases: [
          { version: "1.2.4", date: "2026-11-11", line: "Pause and Stop.", dot: true, extra: 1 },
          { version: "next", date: "2026-11-11", line: "?" },
          { version: "1.2.3", date: "11 Nov", line: "?" },
          { version: "1.2.2", date: "2026-11-09" },
        ],
      }),
    ).toEqual([
      { version: "1.2.4", date: "2026-11-11", line: "Pause and Stop.", dot: true },
      { version: "1.2.2", date: "2026-11-09", line: "" },
    ]);
    expect(() => readReleases({ nothing: [] })).toThrow();
  });

  it("reads the App Store's version from Apple's lookup", () => {
    expect(
      readAppStore({ resultCount: 1, results: [{ version: "1.2.0", bundleId: "chat.chips.app" }] }),
    ).toBe("1.2.0");
    expect(readAppStore({ resultCount: 0, results: [] })).toBeNull();
    // Not a release's number, or not an answer at all.
    for (const not of [{ results: [{ version: "1.2" }] }, { results: "none" }, null, "x", {}]) {
      expect(readAppStore(not)).toBeNull();
    }
  });

  it("hands on forty releases at most, and a line of four hundred letters at most", () => {
    const many = Array.from({ length: UPDATES_KEEP + 1 }, (_, at) => ({
      version: `1.0.${at}`,
      date: "2026-11-11",
      line: "x".repeat(401),
    }));
    const read = readReleases({ releases: many });
    expect(read).toHaveLength(UPDATES_KEEP);
    expect(read.at(-1)?.version).toBe(`1.0.${UPDATES_KEEP - 1}`);
    expect(read[0]?.line).toHaveLength(400);
    // What isn't a release takes none of the forty places.
    const mixed = [{ version: "soon" }, null, 7, ...many];
    expect(readReleases({ releases: mixed })).toHaveLength(UPDATES_KEEP);
    for (const not of [null, "x", [], { releases: "none" }]) {
      expect(() => readReleases(not)).toThrow("no releases in it");
    }
  });
});

describe("releaseFeed", () => {
  it("reads nothing where it was told nowhere, or off", () => {
    const clock = manualClock(Date.parse("2026-11-12T08:00:00Z"));
    const { fetching, asked } = answering({});
    for (const source of [
      undefined,
      "",
      "off",
      " off ",
      "ftp://chipschat.ai/r.json",
      "/tmp/r.json",
    ]) {
      const feed = releaseFeed({ source, clock, logger, fetch: fetching });
      clock.advance(UPDATES_FIRST_MS);
      feed.tick();
      expect(feed.read()).toBeUndefined();
    }
    expect(asked).toEqual([]);
  });

  it("waits a minute after the start, then reads both once a day", async () => {
    const clock = manualClock(Date.parse("2026-11-12T08:00:00Z"));
    const { fetching, asked } = answering({
      [FEED]: [RELEASES, RELEASES],
      [STORE]: [{ results: [{ version: "1.2.4" }] }, { results: [{ version: "1.2.5" }] }],
    });
    const feed = releaseFeed({ source: FEED, clock, logger, fetch: fetching, appStore: STORE });
    feed.tick();
    await settle();
    expect(asked).toEqual([]);
    clock.advance(UPDATES_FIRST_MS);
    feed.tick();
    await settle();
    await settle();
    expect(feed.read()).toEqual({
      releases: RELEASES.releases,
      app_store: "1.2.4",
      checked_at: "2026-11-12T08:01:00.000Z",
    });
    feed.tick();
    await settle();
    expect(asked).toEqual([FEED, STORE]);
    clock.advance(UPDATES_KEPT_MS);
    feed.tick();
    await settle();
    await settle();
    expect(feed.read()?.app_store).toBe("1.2.5");
  });

  it("keeps what it had when a read fails, and tries again after ten minutes", async () => {
    const clock = manualClock(Date.parse("2026-11-12T08:00:00Z"));
    const { fetching, asked } = answering({ [FEED]: [503, RELEASES], [STORE]: [500] });
    const feed = releaseFeed({ source: FEED, clock, logger, fetch: fetching, appStore: STORE });
    clock.advance(UPDATES_FIRST_MS);
    feed.tick();
    await settle();
    expect(feed.read()).toBeUndefined();
    feed.tick();
    await settle();
    expect(asked).toEqual([FEED]);
    clock.advance(UPDATES_RETRY_MS);
    feed.tick();
    await settle();
    await settle();
    // The App Store couldn't be read: the releases are still known.
    expect(feed.read()).toMatchObject({ releases: RELEASES.releases, app_store: null });
  });

  it("waits twice as long after each failure in a row, up to a day, for a feed that isn't there yet", async () => {
    const clock = manualClock(Date.parse("2026-11-12T08:00:00Z"));
    const { fetching, asked } = answering({ [FEED]: [404, 404, 404, RELEASES], [STORE]: ["x"] });
    const feed = releaseFeed({ source: FEED, clock, logger, fetch: fetching, appStore: STORE });
    const tryAt = async (ms: number) => {
      clock.advance(ms);
      feed.tick();
      await settle();
      await settle();
    };
    await tryAt(UPDATES_FIRST_MS);
    await tryAt(UPDATES_RETRY_MS - 1);
    await tryAt(1);
    await tryAt(2 * UPDATES_RETRY_MS - 1);
    expect(asked).toEqual([FEED, FEED]);
    await tryAt(1);
    await tryAt(4 * UPDATES_RETRY_MS);
    expect(asked.filter((each) => each === FEED)).toHaveLength(4);
    expect(feed.read()?.releases).toEqual(RELEASES.releases);
    expect([1, 2, 3, 8, 9, 20].map(retryAfterMs)).toEqual([
      UPDATES_RETRY_MS,
      2 * UPDATES_RETRY_MS,
      4 * UPDATES_RETRY_MS,
      128 * UPDATES_RETRY_MS,
      UPDATES_KEPT_MS,
      UPDATES_KEPT_MS,
    ]);
  });

  it("keeps what it had when the feed is too big, isn't JSON, or can't be reached", async () => {
    const clock = manualClock(Date.parse("2026-11-12T08:00:00Z"));
    const asked: string[] = [];
    const answers: Array<() => Response> = [
      () => new Response(JSON.stringify(RELEASES)),
      () => new Response(`{"releases":[],"pad":"${"x".repeat(UPDATES_MAX_BYTES)}"}`),
      () => new Response("<!doctype html><title>Not found</title>"),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response(JSON.stringify({ releases: "soon" })),
    ];
    const fetching = (async (url: string) => {
      asked.push(url);
      if (url === STORE) return new Response(JSON.stringify({ results: [{ version: "1.2.4" }] }));
      const next = answers.shift();
      if (next === undefined) throw new Error("asked once too often");
      return next();
    }) as unknown as typeof fetch;
    const feed = releaseFeed({ source: FEED, clock, logger, fetch: fetching, appStore: STORE });
    const tryAt = async (ms: number) => {
      clock.advance(ms);
      feed.tick();
      await settle();
      await settle();
    };
    await tryAt(UPDATES_FIRST_MS);
    const first = feed.read();
    expect(first?.releases).toEqual(RELEASES.releases);
    // A day on, four reads fail each in its own way: what was read first is still what is known.
    await tryAt(UPDATES_KEPT_MS);
    await tryAt(retryAfterMs(1));
    await tryAt(retryAfterMs(2));
    await tryAt(retryAfterMs(3));
    expect(asked.filter((each) => each === FEED)).toHaveLength(5);
    // The App Store is asked only once the releases were read.
    expect(asked.filter((each) => each === STORE)).toHaveLength(1);
    expect(feed.read()).toEqual(first);
  });

  it("reads once at a time, however often the sweep comes by", async () => {
    const clock = manualClock(Date.parse("2026-11-12T08:00:00Z"));
    const asked: string[] = [];
    let answer: (response: Response) => void = () => undefined;
    const fetching = (async (url: string) => {
      asked.push(url);
      if (url === STORE) return new Response(JSON.stringify({ results: [] }));
      return new Promise<Response>((resolve) => {
        answer = resolve;
      });
    }) as unknown as typeof fetch;
    const feed = releaseFeed({ source: FEED, clock, logger, fetch: fetching, appStore: STORE });
    clock.advance(UPDATES_FIRST_MS);
    feed.tick();
    feed.tick();
    clock.advance(UPDATES_KEPT_MS);
    feed.tick();
    await settle();
    expect(asked).toEqual([FEED]);
    answer(new Response(JSON.stringify(RELEASES)));
    await settle();
    await settle();
    expect(feed.read()).toMatchObject({ releases: RELEASES.releases, app_store: null });
    // Read a day after the start: kept for a day from then, not from when it was asked.
    feed.tick();
    await settle();
    expect(asked).toEqual([FEED, STORE]);
  });
});
