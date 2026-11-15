/**
 * Which releases of Chips are out, for the update dot (ADR 0296): the site's `releases.json`, and
 * the version the App Store has for the iPhone and iPad app, from Apple's public lookup.
 *
 * Read once a day, the first time a minute after the server starts, riding the sweep; a failed
 * read is tried again after ten minutes, then twice as long after each failure that follows, up to a
 * day, keeping what it had. So a feed that isn't there yet (a 404 before the site has it) costs a
 * handful of tries and lines in the log on the first day, then one a day. The apps get the result in
 * `GET /v1/server` and never call either address themselves. Nothing is sent but the two GETs: no
 * id, no count, nothing about the workspace. Where the server was told nowhere (`CHIPS_UPDATES`
 * absent or `off`, as a checkout starts), nothing is read and nothing is known.
 */

import type { Clock, Logger } from "@chipschat/platform";

/** One release, as `releases.json` says it and `GET /v1/server` hands it on. */
export interface FeedRelease {
  readonly version: string;
  readonly date: string;
  readonly line: string;
  readonly dot?: true;
}

export interface ServerUpdates {
  /** Newest first. */
  readonly releases: readonly FeedRelease[];
  /** The App Store's version of the iPhone and iPad app; null where it couldn't be read. */
  readonly app_store: string | null;
  /** When they were read. */
  readonly checked_at: string;
}

export interface ReleaseFeed {
  /** What was last read, if anything has been. Never waits on the network. */
  readonly read: () => ServerUpdates | undefined;
  /** Reads again when it is due; the sweep calls it. */
  readonly tick: () => void;
}

/** Where a release reads which releases are out. */
export const RELEASES_URL = "https://chipschat.ai/releases.json";
/** Apple's public lookup for Chips on the App Store (`ABOUT_LINKS.appStore`'s id). */
export const APP_STORE_LOOKUP = "https://itunes.apple.com/lookup?id=6824148802";
/** How long after the server starts the first read waits, so a start isn't slowed by it. */
export const UPDATES_FIRST_MS = 60 * 1000;
/** How long what was read is kept before it is read again. */
export const UPDATES_KEPT_MS = 24 * 60 * 60 * 1000;
/** How long after a first failed read it is tried again; each failure after it doubles the wait. */
export const UPDATES_RETRY_MS = 10 * 60 * 1000;

/** The wait after `failures` failed reads in a row: ten minutes, doubling, never over a day. */
export function retryAfterMs(failures: number): number {
  return Math.min(UPDATES_RETRY_MS * 2 ** Math.max(0, failures - 1), UPDATES_KEPT_MS);
}
/** The most of either answer read: `releases.json` is a few kilobytes, the lookup about four. */
export const UPDATES_MAX_BYTES = 256 * 1024;
/** The most releases handed on: enough to cover any app a person still runs. */
export const UPDATES_KEEP = 40;

export interface ReleaseFeedDeps {
  /** `CHIPS_UPDATES`: the URL of `releases.json`. Absent or `off`, nothing is read. */
  readonly source: string | undefined;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly fetch?: typeof fetch;
  /** Apple's lookup; tests point it elsewhere. */
  readonly appStore?: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The releases in a `releases.json`, each checked; one that isn't a release is left out. */
export function readReleases(body: unknown): FeedRelease[] {
  const list = (body as { releases?: unknown } | null)?.releases;
  if (!Array.isArray(list)) throw new Error("no releases in it");
  const out: FeedRelease[] = [];
  for (const each of list) {
    const release = readRelease(each);
    if (release !== undefined) out.push(release);
    if (out.length === UPDATES_KEEP) break;
  }
  return out;
}

/** One entry of the feed, or nothing when it doesn't name a version and a day. */
function readRelease(each: unknown): FeedRelease | undefined {
  const r = each as Partial<Record<keyof FeedRelease, unknown>> | null;
  if (typeof r?.version !== "string" || !VERSION.test(r.version)) return undefined;
  if (typeof r.date !== "string" || !DATE.test(r.date)) return undefined;
  const line = typeof r.line === "string" ? r.line.slice(0, 400) : "";
  return { version: r.version, date: r.date, line, ...(r.dot === true ? { dot: true } : {}) };
}

/** The App Store's version in Apple's lookup answer, if it names one. */
export function readAppStore(body: unknown): string | null {
  const results = (body as { results?: unknown } | null)?.results;
  const version = Array.isArray(results)
    ? (results[0] as { version?: unknown } | undefined)?.version
    : undefined;
  return typeof version === "string" && VERSION.test(version) ? version : null;
}

async function fetched(url: string, fetching: typeof fetch): Promise<unknown> {
  const answer = await fetching(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(5000),
  });
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
  const text = await answer.text();
  if (text.length > UPDATES_MAX_BYTES) throw new Error(`${url} is over ${UPDATES_MAX_BYTES} bytes`);
  return JSON.parse(text);
}

export function releaseFeed(deps: ReleaseFeedDeps): ReleaseFeed {
  const { clock, logger } = deps;
  const source = deps.source?.trim();
  if (source === undefined || source === "" || source === "off" || !/^https?:\/\//i.test(source)) {
    return { read: () => undefined, tick: () => {} };
  }
  const fetching = deps.fetch ?? fetch;
  const appStore = deps.appStore ?? APP_STORE_LOOKUP;
  const startedMs = clock.nowMs();
  let kept: { updates: ServerUpdates; atMs: number } | undefined;
  let failedAtMs: number | undefined;
  let failures = 0;
  let reading = false;

  const refresh = async () => {
    try {
      const releases = readReleases(await fetched(source, fetching));
      // The App Store's version is a help, not a need: a failed lookup leaves it unknown.
      const app_store = await fetched(appStore, fetching).then(readAppStore, (error: unknown) => {
        logger.warn({ source: appStore, error: String(error) }, "app store version not read");
        return null;
      });
      kept = { updates: { releases, app_store, checked_at: clock.nowIso() }, atMs: clock.nowMs() };
      failedAtMs = undefined;
      failures = 0;
    } catch (error) {
      failedAtMs = clock.nowMs();
      failures += 1;
      logger.warn(
        { source, error: String(error), retryInMs: retryAfterMs(failures) },
        "releases not read",
      );
    }
  };

  return {
    read: () => kept?.updates,
    tick: () => {
      const now = clock.nowMs();
      if (reading || now - startedMs < UPDATES_FIRST_MS) return;
      if (failedAtMs !== undefined && now - failedAtMs < retryAfterMs(failures)) return;
      if (kept !== undefined && now - kept.atMs < UPDATES_KEPT_MS) return;
      reading = true;
      void refresh().finally(() => {
        reading = false;
      });
    },
  };
}
