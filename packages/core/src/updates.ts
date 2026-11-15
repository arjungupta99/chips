/**
 * The update dot (ADR 0296): a gold dot at the top of the phone's tabs, and at the right end of the
 * web's and the Mac's top bar, that says an update is waiting and opens About. In core so the
 * phone, the iPad, the Mac and the web light it by the same rules and say the same words.
 *
 * What is known comes from two places. The app knows its own version and the releases it was built
 * with (`RELEASES`). The computer reads chipschat.ai/releases.json and the App Store's version once
 * a day and hands both out in `GET /v1/server` as `updates`, so a release newer than the app is
 * known too. Nothing here reads the network or the clock: the caller passes `now`.
 */

import { olderThan, RELEASES } from "./about.js";

/** A release as the feed says it: the fields of `Release` the dot reads. */
export interface FeedRelease {
  readonly version: string;
  /** The day it came out, in California, as `YYYY-MM-DD`. */
  readonly date: string;
  readonly line: string;
  readonly dot?: boolean | undefined;
}

/** What the computer hands out in `GET /v1/server` as `updates`. */
export interface UpdateFeed {
  /** The releases chipschat.ai lists, newest first. */
  readonly releases: readonly FeedRelease[];
  /** The version the App Store has for iPhone and iPad, where the computer could read it. */
  readonly appStore?: string | undefined;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `updates` from `GET /v1/server`, each release checked, the App Store's version where it is one.
 * Undefined for anything else, as from a server older than the field.
 */
export function readUpdateFeed(raw: unknown): UpdateFeed | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { releases, app_store: appStore } = raw as { releases?: unknown; app_store?: unknown };
  if (!Array.isArray(releases)) return undefined;
  return {
    releases: releases.flatMap((each: unknown) => readFeedRelease(each) ?? []),
    ...(typeof appStore === "string" && VERSION.test(appStore) ? { appStore } : {}),
  };
}

function readFeedRelease(each: unknown): FeedRelease | undefined {
  const r = each as { version?: unknown; date?: unknown; line?: unknown; dot?: unknown } | null;
  if (typeof r?.version !== "string" || !VERSION.test(r.version)) return undefined;
  if (typeof r.date !== "string" || !DATE.test(r.date)) return undefined;
  return {
    version: r.version,
    date: r.date,
    line: typeof r.line === "string" ? r.line : "",
    ...(r.dot === true ? { dot: true } : {}),
  };
}

/** Which app this is: the iPhone or iPad app, Chips for Mac, or the web app in a browser. */
export type UpdateDevice = "phone" | "mac" | "browser";

/** When About was last opened while an update waited: the version it showed and when. */
export interface DotSeen {
  readonly version: string;
  /** Milliseconds since the epoch. */
  readonly at: number;
}

export interface UpdateFacts {
  readonly device: UpdateDevice;
  /** This app's version. In a browser it is the computer's own, since the computer serves it. */
  readonly app: string;
  /** The computer's version from `GET /v1/server`, where it was read. */
  readonly computer?: string | undefined;
  /** Whether this person owns the workspace, and so can update its computer. */
  readonly owner: boolean;
  readonly feed?: UpdateFeed | undefined;
  /**
   * Whether this app gets its own updates, as Chips for Mac does from 1.2.5 (ADR 0298): its update
   * is shown in About but lights no dot, since nobody has to do anything.
   */
  readonly appUpdatesItself?: boolean | undefined;
  /**
   * Whether the computer is one Chips for Mac carries (`self_update.with_app`, ADR 0298): the app
   * updates itself and the computer starts again by itself, so its update is shown in About but
   * lights no dot and offers no Update.
   */
  readonly computerFollowsApp?: boolean | undefined;
}

/** An update that waits: for this app or for the computer, from which version to which. */
export interface UpdateWaiting {
  readonly version: string;
  readonly from: string;
}

export interface UpdatesWaiting {
  readonly app?: UpdateWaiting | undefined;
  readonly computer?: UpdateWaiting | undefined;
}

/** How long a release is out before it lights the dot, so fixes that follow it roll into it. */
export const DOT_SETTLE_MS = 2 * 24 * 60 * 60 * 1000;
/** How long after About was opened the dot waits before it lights for a newer release. */
export const DOT_GAP_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * A version a release has: numbers, and not the 0.0.0 a computer run from its source says, which
 * is newer or older than nothing.
 */
export function isReleaseVersion(version: string | undefined): version is string {
  return version !== undefined && /^\d+\.\d+\.\d+$/.test(version) && version !== "0.0.0";
}

/**
 * The releases the app was built with, up to its own version, and those the feed adds, by version,
 * newest first.
 */
export function knownReleases(feed: UpdateFeed | undefined, app?: string): readonly FeedRelease[] {
  const byVersion = new Map<string, FeedRelease>();
  for (const release of RELEASES) {
    if (!isReleaseVersion(app) || !olderThan(app, release.version))
      byVersion.set(release.version, release);
  }
  for (const release of feed?.releases ?? []) {
    if (isReleaseVersion(release.version)) byVersion.set(release.version, release);
  }
  return [...byVersion.values()].sort((a, b) =>
    olderThan(a.version, b.version) ? 1 : olderThan(b.version, a.version) ? -1 : 0,
  );
}

const newer = (a: string | undefined, b: string | undefined): string | undefined =>
  a === undefined ? b : b === undefined ? a : olderThan(a, b) ? b : a;

/**
 * What waits, whatever the dot says: this app, where its store or the releases have a newer
 * version than it, and the computer, for its owner, where a release or this app is newer than it.
 * About's Updates group shows these, and the About Chips row in You keeps a small dot for them.
 */
export function updatesWaiting(facts: UpdateFacts): UpdatesWaiting {
  const newest = knownReleases(facts.feed, facts.app)[0]?.version;
  return { app: appWaiting(facts, newest), computer: computerWaiting(facts, newest) };
}

/** The version this app is offered: the App Store's on a phone, the newest release on a Mac. */
function appWaiting(facts: UpdateFacts, newest: string | undefined): UpdateWaiting | undefined {
  const offered =
    facts.device === "phone" ? facts.feed?.appStore : facts.device === "mac" ? newest : undefined;
  if (!isReleaseVersion(facts.app) || !isReleaseVersion(offered)) return undefined;
  return olderThan(facts.app, offered) ? { version: offered, from: facts.app } : undefined;
}

/** The version the computer is behind, for its owner: the newest release, or this app's. */
function computerWaiting(
  facts: UpdateFacts,
  newest: string | undefined,
): UpdateWaiting | undefined {
  if (!facts.owner || !isReleaseVersion(facts.computer)) return undefined;
  const app = facts.device === "browser" || !isReleaseVersion(facts.app) ? undefined : facts.app;
  const target = newer(newest, app);
  if (target === undefined || !olderThan(facts.computer, target)) return undefined;
  return { version: target, from: facts.computer };
}

/**
 * What waits that asks something of somebody: this app, unless it gets its update itself, and the
 * computer, unless it comes along with Chips for Mac (ADR 0298). The dot lights only for these,
 * and the About Chips row in You keeps its small dot for them.
 */
export function updatesAsking(facts: UpdateFacts): UpdatesWaiting {
  const waiting = updatesWaiting(facts);
  return {
    app: facts.appUpdatesItself === true ? undefined : waiting.app,
    computer: facts.computerFollowsApp === true ? undefined : waiting.computer,
  };
}

/** The day a release came out, as milliseconds: midnight in California (08:00 UTC). */
export function releaseTime(date: string): number | undefined {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const at = Date.UTC(year, month - 1, day, 8);
  return Number.isNaN(at) ? undefined : at;
}

/**
 * Whether an update lights the dot: some release after the version it starts from, up to the one it
 * goes to, asks for the dot and has been out two days.
 */
function lights(waiting: UpdateWaiting, releases: readonly FeedRelease[], now: number): boolean {
  return releases.some((release) => {
    if (release.dot !== true) return false;
    if (!olderThan(waiting.from, release.version) || olderThan(waiting.version, release.version)) {
      return false;
    }
    const out = releaseTime(release.date);
    return out !== undefined && now - out >= DOT_SETTLE_MS;
  });
}

/**
 * Whether the dot is lit, and the version it names. It lights for an update that waits and asks
 * something of somebody (`updatesAsking`) when a release in it asks for the dot and has been out
 * two days. Opening About puts it out: it stays out for that version, and for a newer one until two
 * weeks have passed. Updating puts it out too, as nothing waits. Off when the person has turned the
 * dot off on this device.
 */
export function updateDot(
  facts: UpdateFacts,
  options: { readonly now: number; readonly enabled: boolean; readonly seen?: DotSeen | undefined },
): { readonly version: string } | undefined {
  if (!options.enabled) return undefined;
  const asking = updatesAsking(facts);
  const releases = knownReleases(facts.feed, facts.app);
  const lit = [asking.app, asking.computer].filter(
    (each): each is UpdateWaiting => each !== undefined && lights(each, releases, options.now),
  );
  const version = lit.map((each) => each.version).reduce<string | undefined>(newer, undefined);
  if (version === undefined) return undefined;
  const seen = options.seen;
  if (seen !== undefined) {
    if (!olderThan(seen.version, version)) return undefined;
    if (options.now - seen.at < DOT_GAP_MS) return undefined;
  }
  return { version };
}

/** What About's Updates group and the dot say. */
export const UPDATES_HEADING = "Updates";
export const UPDATE_BUTTON = "Update";
export const INSTALL_BUTTON = "Install";
export const DOT_SWITCH = "Update dot";
export const DOT_LABEL = "Update available. Opens About.";

/** The foot under the switch, with the dot on or off. `where` is "the top of the screen". */
export function dotFoot(enabled: boolean, where: string): string {
  return enabled
    ? `A gold dot shows at ${where} when a release adds something new. Opening About puts it out. Updates always show here.`
    : "No update dot on this device. Updates still show here, with a small dot on About Chips in You.";
}

/** The line under this app's row: "1.2.0 · 1.2.4 is on the App Store", "1.2.3 · 1.2.4 is ready". */
export function appUpdateLine(device: UpdateDevice, waiting: UpdateWaiting): string {
  return device === "phone"
    ? `${waiting.from} · ${waiting.version} is on the App Store`
    : `${waiting.from} · ${waiting.version} is ready`;
}

/** The line under the computer's row when it is behind: "1.2.3 · 1.2.4 is out". */
export function computerUpdateLine(waiting: UpdateWaiting): string {
  return `${waiting.from} · ${waiting.version} is out`;
}

/**
 * The line under the row of a computer Chips for Mac carries, when a release is out for it:
 * "1.2.5 · 1.2.6 comes with Chips for Mac". Nobody updates it; it follows the app (ADR 0298).
 */
export function computerFollowsLine(waiting: UpdateWaiting): string {
  return `${waiting.from} · ${waiting.version} comes with Chips for Mac`;
}

/**
 * Words the computer or the Mac said, closed as a sentence: given a full stop when they end
 * without one, so the sentence after them doesn't run on.
 */
export function asSentence(words: string): string {
  const said = words.trim();
  return said === "" || /[.!?]$/.test(said) ? said : `${said}.`;
}

/** Where Chips for Mac's new version is downloaded until it can install itself. */
export const MAC_DOWNLOAD = "https://chipschat.ai/download/";

/**
 * How Chips for Mac's own update stands, as the app says it (ADR 0298). A release that is `ready`
 * with `asks` waits on a Mac whose person can't replace the app without an administrator's
 * password: nothing goes in on its own, and Restart now asks for the password.
 */
export type MacUpdate =
  | { readonly state: "off" | "current" }
  | { readonly state: "getting"; readonly version: string }
  | { readonly state: "ready"; readonly version: string; readonly asks?: true | undefined }
  | { readonly state: "failed"; readonly version: string; readonly why: string };

/**
 * What the app says, checked; undefined for anything else, as from an app older than the call. A
 * failure that gives no reason is still a failure, said without one.
 */
export function readMacUpdate(raw: unknown): MacUpdate | undefined {
  const said = raw as { state?: unknown; version?: unknown; why?: unknown; asks?: unknown } | null;
  const state = said?.state;
  if (state === "off" || state === "current") return { state };
  if (typeof said?.version !== "string" || !VERSION.test(said.version)) return undefined;
  const version = said.version;
  if (state === "getting") return { state, version };
  if (state === "ready") return { state, version, ...(said.asks === true ? { asks: true } : {}) };
  if (state === "failed")
    return { state, version, why: typeof said.why === "string" ? said.why : "" };
  return undefined;
}

/**
 * Whether Chips for Mac gets its updates itself now, with nobody doing anything: it does unless
 * it is off, failed, or holds a release it can only put in with an administrator's password.
 */
export function macUpdatesItself(update: MacUpdate | undefined): boolean {
  if (update === undefined || update.state === "off" || update.state === "failed") return false;
  return !(update.state === "ready" && update.asks === true);
}

export const RESTART_NOW = "Restart now";

/**
 * The line under Chips for Mac's row: how its own update stands, or, from an app that doesn't
 * update itself, what is out. Undefined when nothing waits and nothing is under way.
 */
export function macUpdateLine(
  update: MacUpdate | undefined,
  waiting: UpdateWaiting | undefined,
  app: string,
): string | undefined {
  switch (update?.state) {
    case "getting":
      return `${app} · Getting ${update.version}`;
    case "ready":
      return update.asks === true
        ? `Chips ${update.version} is ready. Restart now to install it: this Mac asks for an administrator's password.`
        : `Chips ${update.version} is ready. It installs when you quit, or tonight.`;
    case "failed":
      return [`Couldn't update to ${update.version}.`, asSentence(update.why), `Still on ${app}.`]
        .filter((part) => part !== "")
        .join(" ");
    case "current":
      return waiting === undefined
        ? undefined
        : `${waiting.from} · ${waiting.version} is out, and comes on its own`;
    default:
      return waiting === undefined ? undefined : appUpdateLine("mac", waiting);
  }
}
