/**
 * The computer keeps the bridges in its own data folder current (bridges-keep-current.md, A).
 *
 * Riding the sweep, it compares what each kept service runs with the signed list of releases that
 * may arrive on their own, and for one that is behind:
 * 1. stages the release beside the one running (the CLI's hands: fetched, checked against the
 *    list's SHA-512 and npm's, unpacked; nothing that runs changes);
 * 2. waits for a quiet moment for that harness: connected for ten minutes, no run of it going, no
 *    ask or question waiting on it, and no message in a room it is in for two minutes;
 * 3. closes the harness's sockets, points `package` at the release and starts that one service
 *    again, with where it got to in the package's journal first;
 * 4. watches it come back: done once the harness says hello as the new release, says how the
 *    harness behind it is (its first probe: every bridge checks and says at its start), and stays
 *    connected, with no new trouble and no second hello, for a minute; put back on the release
 *    before, and that release skipped for a week, if it hasn't within five minutes. One that
 *    says hello again and again (a service that keeps dying) never has its minute. A put-back
 *    waits, as the switch did, while something is going on for the harness;
 * 5. watches it for its first day: put back the same way when its service has stopped and been
 *    started again more than three times, or its first three turns all failed where the turn
 *    before the switch hadn't.
 *
 * Nobody is asked and nothing is said in a room. The harness page reads `states()`. The server is
 * the one watching, on the same machine, so a release is never blamed for a server that was down:
 * a watch the server's own restart interrupted starts over when it is back, and the time a Mac
 * slept through isn't counted. The journal is what says a switch is being watched: one whose
 * service was disconnected, or whose link someone moved by hand, is let go, with nothing put back.
 *
 * What a service runs is what its bridge said in its last hello; before one, what the journal
 * says it was started on.
 */

import { createHash } from "node:crypto";
import type { Clock, Logger } from "@chipschat/platform";
import type { AgentState } from "@chipschat/protocol";
import {
  type BridgeHands,
  type BridgeOutcome,
  type BridgeProving,
  BridgeRefusal,
  type BridgeRefusalReason,
  type BridgeTrying,
  type BridgeUpdateState,
  type KeptBridge,
  type LocalBridge,
} from "../../application/ports/bridges.js";
import type { Busy } from "../store/harness-quiet.js";
import type { TurnsSince } from "../store/harness-turns.js";
import type { BridgeList, ListedPackage, ListedRelease } from "./bridge-list.js";

const DAY_MS = 24 * 60 * 60_000;
/** How long a release has been out before a computer takes it on its own. */
export const RELEASE_WAIT_MS = 2 * DAY_MS;
/** The most each computer waits past that, picked from its own id, so a bad release reaches few. */
export const RELEASE_SPREAD_MS = 3 * DAY_MS;
/** How long a harness must have been connected before its bridge is started again. */
export const CONNECTED_FOR_MS = 10 * 60_000;
/** How long the rooms it is in must have been still. */
export const STILL_FOR_MS = 2 * 60_000;
/** How long a started service has to say hello as the new release. Hermes may start a gateway first. */
export const RETURN_MS = 5 * 60_000;
/** How long it must then stay connected, with no new trouble. */
export const SETTLED_MS = 60_000;
/** How long a release put back is skipped, unless a newer one comes first. */
export const SKIP_MS = 7 * DAY_MS;
/** How long after a refusal (the disk, Node, npm) staging is tried again. */
export const REFUSED_RETRY_MS = DAY_MS;
/** How often the bridges here are listed again with nothing going on. */
export const REVIEW_MS = 10 * 60_000;
/** How often a waiting harness is looked at for a quiet moment. */
export const QUIET_CHECK_MS = 30_000;
/** How long between two looks at a switched service is the machine asleep, not the next look. */
export const SLEPT_MS = 2 * 60_000;
/** How many times a put-back that can't be done is tried before the release is left where it is. */
export const PUT_BACK_TRIES = 3;
/** How long a service that came back on a release is still watched: its first day. */
export const PROVING_MS = DAY_MS;
/** How many times its service may stop and be started again in that day. */
export const EXITS_MOST = 3;
/** How many turns, every one failed, say a release fails every turn. */
export const TURNS_FAILED = 3;
/** How long what a harness's own command said of its release is kept before it is asked again. */
export const HARNESS_ASKED_MS = 60 * 60_000;

export interface BridgeUpdater {
  /** The sweep calls it; it never waits on the work it starts. */
  readonly tick: () => void;
  /** A harness said hello with its bridge's name and version. */
  readonly heard: (harnessId: string, version: string) => void;
  /** A harness said how it is: its bridge's own check of what is behind it, fine or not. */
  readonly said: (harnessId: string) => void;
  /** By harness. */
  readonly states: () => ReadonlyMap<string, BridgeUpdateState>;
  /** Resolves once the work a tick started is done; for tests. */
  readonly settled: () => Promise<void>;
}

export interface BridgeUpdaterDeps {
  readonly hands: BridgeHands;
  readonly list: () => BridgeList | undefined;
  /** This computer's version; a checkout's 0.0.0 updates nothing. */
  readonly computer: string;
  readonly wait: "spread" | "now";
  /** Something only this computer has, for its spread. */
  readonly seed: () => Promise<string>;
  readonly workspaceOf: (harnessId: string) => Promise<string | undefined>;
  readonly stateOf: (workspaceId: string, harnessId: string) => AgentState;
  readonly busy: (
    workspaceId: string,
    harnessId: string,
    sinceIso: string,
  ) => Promise<Busy | undefined>;
  /** The harness's turns begun since a time that are over, for a release's first day. */
  readonly turns: (workspaceId: string, harnessId: string, sinceIso: string) => Promise<TurnsSince>;
  readonly closeHarness: (workspaceId: string, harnessId: string) => number;
  /** The harnesses whose owner turned "Keep this bridge up to date" off; none when not given. */
  readonly switchedOff?: (() => Promise<ReadonlySet<string>>) | undefined;
  readonly clock: Clock;
  readonly logger: Logger;
}

interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function versionOf(text: string): Version | undefined {
  const found = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (found === null) return undefined;
  return { major: Number(found[1]), minor: Number(found[2]), patch: Number(found[3]) };
}

/** Whether the text is a release's number, `1.2.3`. */
export const isRelease = (text: string): boolean => versionOf(text) !== undefined;

/** Whether `a` is a later release than `b`; false when either isn't one. */
export function laterThan(a: string, b: string): boolean {
  const x = versionOf(a);
  const y = versionOf(b);
  if (x === undefined || y === undefined) return false;
  if (x.major !== y.major) return x.major > y.major;
  if (x.minor !== y.minor) return x.minor > y.minor;
  return x.patch > y.patch;
}

/** This computer's extra wait, zero to three days, the same every time for the same seed. */
export function spreadOf(seed: string): number {
  const digest = createHash("sha256").update(seed).digest();
  return Math.floor((digest.readUInt32BE(0) / 2 ** 32) * RELEASE_SPREAD_MS);
}

/**
 * The release a service running `running` should be on, or none: the newest of its major the list
 * allows, that this computer and the harness behind the service are new enough for, out long
 * enough (unless urgent, or the computer takes them at once), and not put back lately. A service on a withdrawn release goes to the
 * newest allowed, even an older one, at once (rule 9).
 */
export function chooseRelease(input: {
  readonly listed: ListedPackage | undefined;
  readonly major: number | undefined;
  readonly running: string;
  readonly computer: string;
  /** Now, by the site's clock. */
  readonly siteNow: number;
  /** Now, by this machine's: skips were written by it. */
  readonly now: number;
  readonly waitMs: number;
  readonly skips: Readonly<Record<string, string>>;
  /** Whether the harness behind the service is new enough for a release (rule 13); none, it is. */
  readonly fits?: ((release: ListedRelease) => boolean) | undefined;
}): { readonly version: string; readonly integrity: string } | undefined {
  const { listed, major } = input;
  if (listed === undefined || major === undefined) return undefined;
  const allowed = listed.releases
    .filter(
      (each) =>
        versionOf(each.version)?.major === major &&
        !listed.withdrawn.includes(each.version) &&
        (each.computer === undefined || !laterThan(each.computer, input.computer)) &&
        (input.fits?.(each) ?? true),
    )
    .sort((a, b) =>
      laterThan(a.version, b.version) ? -1 : laterThan(b.version, a.version) ? 1 : 0,
    );
  const skipped = (version: string) => {
    const until = input.skips[version];
    return until !== undefined && Date.parse(until) > input.now;
  };
  if (listed.withdrawn.includes(input.running)) {
    const back = allowed.find((each) => each.version !== input.running && !skipped(each.version));
    return back === undefined ? undefined : { version: back.version, integrity: back.integrity };
  }
  const due = allowed.find(
    (each) =>
      laterThan(each.version, input.running) &&
      !skipped(each.version) &&
      (each.urgent === true || input.siteNow - Date.parse(each.published) >= input.waitMs),
  );
  return due === undefined ? undefined : { version: due.version, integrity: due.integrity };
}

/**
 * The release out for a bridge this computer doesn't keep, as on another machine, by the name it
 * says in its hello: `chips-<name>` is `@chipschat/<name>` on the signed list. Out two days, in the
 * major it runs, as a kept one would take it; none when it runs that or later.
 */
export function releaseOutFor(input: {
  readonly list: BridgeList | undefined;
  readonly hello: string;
  readonly running: string;
  readonly computer: string;
  readonly now: number;
}): string | undefined {
  const { list, hello, running, now } = input;
  if (list === undefined || !hello.startsWith("chips-")) return undefined;
  return chooseRelease({
    listed: list.packages[`@chipschat/${hello.slice("chips-".length)}`],
    major: versionOf(running)?.major,
    running,
    computer: input.computer,
    siteNow: Date.parse(list.at) + (now - list.heardAt),
    now,
    waitMs: RELEASE_WAIT_MS,
    skips: {},
  })?.version;
}

interface Chosen {
  readonly version: string;
  readonly integrity: string;
}

/** A release out that the harness behind a service is too old for, and the oldest it works with. */
interface Held {
  readonly version: string;
  readonly needs: string;
}

/** The oldest release of its harness a bridge release names, for the card a service is kept for. */
const floorFor = (release: ListedRelease, kept: KeptBridge) => release.needs?.[kept.id];

/** Whether a harness on `have` is new enough for a release: no floor, not told, or met. */
function harnessFits(release: ListedRelease, kept: KeptBridge, have: string | undefined): boolean {
  const floor = floorFor(release, kept);
  return floor === undefined || have === undefined || !laterThan(floor, have);
}

/** The release of that version as one held back for the harness, when it names a floor for it. */
function heldOf(
  listed: ListedPackage | undefined,
  kept: KeptBridge,
  version: string | undefined,
): Held | undefined {
  const beyond = listed?.releases.find((each) => each.version === version);
  const needs = beyond === undefined ? undefined : floorFor(beyond, kept);
  return beyond === undefined || needs === undefined
    ? undefined
    : { version: beyond.version, needs };
}

/** A service with nothing to take now, said with the release its harness is too old for, if any. */
function nothingToTake(current: BridgeUpdateState, held: Held | undefined): BridgeUpdateState {
  if (held === undefined) return current;
  return {
    ...current,
    phase: "refused",
    target: held.version,
    reason: "harness",
    needs: held.needs,
  };
}

/** A kept service, by its package and label. */
const keyFor = (pkg: string, label: string) => `${pkg}\0${label}`;
const keyOf = (bridge: LocalBridge, kept: KeptBridge) => keyFor(bridge.package, kept.label);

interface Watch {
  readonly from: string;
  readonly to: string;
  /** When it was switched: a hello counts from here. */
  readonly switchedAt: number;
  /** When its five minutes began; moved on by what the machine slept through. */
  countedFrom: number;
  /** The trouble it had before the switch. */
  readonly troubleBefore: string | undefined;
  /**
   * False for a watch rebuilt from the journal, by a server that started after the switch: nobody
   * saw what trouble it had before, or whether it has already said how its harness is.
   */
  readonly sawItStart: boolean;
  /** Since when it has been back and well without a break, and no earlier than its newest hello. */
  settledSince: number | undefined;
  lookedAt: number | undefined;
  /** Put-backs that couldn't be done. */
  failedBack: number;
}

export function bridgeUpdater(deps: BridgeUpdaterDeps): BridgeUpdater {
  const off = versionOf(deps.computer) === undefined || deps.computer === "0.0.0";
  const startedAt = deps.clock.nowMs();
  const states = new Map<string, BridgeUpdateState>();
  const hellos = new Map<string, { readonly version: string; readonly at: number }>();
  /** The first word each bridge had on how its harness is, as the release its hello named. */
  const words = new Map<string, { readonly version: string; readonly at: number }>();
  /** What the service manager had counted of a service's starts when its first day began here. */
  const counted = new Map<string, number>();
  /** First-day put-backs that couldn't be made, by service. */
  const notBack = new Map<string, number>();
  /** Services to be put back from their first day once it is quiet: looked at as a wait is. */
  const owing = new Set<string>();
  /** What each harness's own command last said it runs, and when it was asked. */
  const asked = new Map<string, { readonly version: string | undefined; readonly at: number }>();
  const waiting = new Map<string, number>();
  const watches = new Map<string, Watch>();
  /** A switch that couldn't be made: not tried again before the time it names. */
  const heldBack = new Map<string, number>();
  const refused = new Map<
    string,
    { readonly version: string; readonly until: number; readonly reason: BridgeRefusalReason }
  >();
  let working: Promise<void> = Promise.resolve();
  let busy = false;
  let reviewedAt = Number.NEGATIVE_INFINITY;
  let quietAt = Number.NEGATIVE_INFINITY;
  let spread: number | undefined;
  let hadList = false;
  /** How many switches this server has begun: one begun in a pass ends the pass for its package. */
  let switchesBegun = 0;
  // Read again at each review, so a switch turned off holds the next quiet moment back.
  let switchedOff: ReadonlySet<string> = new Set();

  const iso = (ms: number) => new Date(ms).toISOString();

  const say = (harnessId: string, state: BridgeUpdateState) => {
    const was = states.get(harnessId);
    states.set(
      harnessId,
      was?.phase === state.phase && was.target === state.target
        ? { ...state, since: was.since }
        : state,
    );
  };

  /**
   * What a service runs: what its bridge said in its last hello, which is its own word for it,
   * else the release the journal says it was started on, or the link's.
   */
  const runningOf = (bridge: LocalBridge, kept: KeptBridge): string => {
    const said = kept.harnessId === undefined ? undefined : hellos.get(kept.harnessId)?.version;
    return said !== undefined && isRelease(said)
      ? said
      : (kept.startedOn ?? bridge.inUse ?? bridge.recorded);
  };

  /** The harness's sockets closed before its service is started again; what it said is over. */
  async function closeSockets(harnessId: string): Promise<void> {
    hellos.delete(harnessId);
    words.delete(harnessId);
    const workspaceId = await deps.workspaceOf(harnessId);
    if (workspaceId !== undefined) deps.closeHarness(workspaceId, harnessId);
  }

  /**
   * A switch nothing can finish, or one someone took over by hand: the journal lets go of it, and
   * nothing is started again, put back or skipped.
   */
  async function letGo(bridge: LocalBridge, label: string, why: string): Promise<void> {
    await deps.hands.note(bridge.package, { trying: null });
    watches.delete(keyFor(bridge.package, label));
    deps.logger.warn({ package: bridge.package, label, why }, "bridge switch no longer watched");
  }

  /** The put-back that couldn't be done: tried again at the next look, a few times, then left. */
  async function notPutBack(
    bridge: LocalBridge,
    kept: KeptBridge,
    watch: Watch,
    error: unknown,
    now: number,
  ): Promise<void> {
    // Someone else holding the bridge for a moment is not a try.
    if (!(error instanceof BridgeRefusal && error.reason === "busy")) watch.failedBack += 1;
    deps.logger.error(
      { err: error, package: bridge.package, tries: watch.failedBack },
      "bridge not put back",
    );
    if (watch.failedBack < PUT_BACK_TRIES) return;
    // It can't be put back: it stays on the release it was switched to, and that is what is said.
    await deps.hands.note(bridge.package, {
      trying: null,
      skip: { version: watch.to, until: iso(now + SKIP_MS) },
    });
    watches.delete(keyOf(bridge, kept));
    if (kept.harnessId !== undefined) {
      say(kept.harnessId, {
        package: bridge.package,
        running: watch.to,
        phase: "current",
        since: iso(now),
        last: bridge.last[kept.label],
      });
    }
  }

  async function putBack(bridge: LocalBridge, kept: KeptBridge, watch: Watch, now: number) {
    if (kept.harnessId !== undefined) await closeSockets(kept.harnessId);
    try {
      await deps.hands.switchTo(bridge.package, kept.label, watch.from, null);
    } catch (error) {
      await notPutBack(bridge, kept, watch, error, now);
      return;
    }
    const said: BridgeOutcome = {
      outcome: "put-back",
      from: watch.from,
      to: watch.to,
      at: iso(now),
      reason: "no-return",
    };
    await deps.hands.note(bridge.package, {
      trying: null,
      skip: { version: watch.to, until: iso(now + SKIP_MS) },
      outcome: { label: kept.label, said },
    });
    watches.delete(keyOf(bridge, kept));
    deps.logger.warn(
      { package: bridge.package, from: watch.from, to: watch.to },
      "bridge put back",
    );
    if (kept.harnessId !== undefined) {
      say(kept.harnessId, {
        package: bridge.package,
        running: watch.from,
        phase: "current",
        since: iso(now),
        last: said,
      });
    }
  }

  /** The watch on a switched service: this server's own, or one rebuilt from the journal. */
  function watchOf(bridge: LocalBridge, kept: KeptBridge, trying: BridgeTrying): Watch {
    const key = keyOf(bridge, kept);
    const known = watches.get(key);
    if (known !== undefined) return known;
    // From the journal: a server that stopped halfway gives it its full time again, and holds no
    // trouble against it, since nobody saw what trouble it had before the switch.
    const since = Math.max(Date.parse(trying.at), startedAt);
    const rebuilt: Watch = {
      from: trying.from,
      to: trying.to,
      switchedAt: since,
      countedFrom: since,
      troubleBefore: undefined,
      sawItStart: false,
      settledSince: undefined,
      lookedAt: undefined,
      failedBack: 0,
    };
    watches.set(key, rebuilt);
    return rebuilt;
  }

  /** Its newest hello, when that names the new release and came since the switch. */
  const helloAs = (harnessId: string, watch: Watch) => {
    const hello = hellos.get(harnessId);
    const itIs = hello !== undefined && hello.version === watch.to && hello.at >= watch.switchedAt;
    return itIs ? hello : undefined;
  };

  /**
   * Whether it is connected and has no trouble it didn't have before. A watch nobody saw start
   * holds no trouble against it.
   */
  async function connectedAndWell(harnessId: string, watch: Watch): Promise<boolean> {
    const workspaceId = await deps.workspaceOf(harnessId);
    if (workspaceId === undefined) return false;
    const state = deps.stateOf(workspaceId, harnessId);
    if (!state.connected) return false;
    const trouble = state.trouble?.reason;
    return !watch.sawItStart || trouble === undefined || trouble === watch.troubleBefore;
  }

  /**
   * When it came back, if it is back and well: its newest hello since the switch says the new
   * release, it is connected, it has said how its harness is, and it has no trouble it didn't
   * have before.
   */
  async function backSince(harnessId: string, watch: Watch): Promise<number | undefined> {
    const hello = helloAs(harnessId, watch);
    if (hello === undefined || !(await connectedAndWell(harnessId, watch))) return undefined;
    if (!watch.sawItStart) return hello.at;
    // Its first probe (rule 3): the bridge's own word on how the harness behind it is, said as the
    // new release. One that connects and never gets as far as checking isn't back.
    const word = words.get(harnessId);
    return word?.version === watch.to ? Math.max(hello.at, word.at) : undefined;
  }

  /** Whether its service may be started again now: never under something going on for it. */
  async function idle(harnessId: string, now: number): Promise<boolean> {
    const workspaceId = await deps.workspaceOf(harnessId);
    if (workspaceId === undefined || !deps.stateOf(workspaceId, harnessId).connected) return true;
    return (await deps.busy(workspaceId, harnessId, iso(now - STILL_FOR_MS))) === undefined;
  }

  async function done(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    watch: Watch,
    now: number,
  ) {
    const said: BridgeOutcome = {
      outcome: "updated",
      from: watch.from,
      to: watch.to,
      at: iso(now),
    };
    const first: BridgeProving = {
      harnessId,
      from: watch.from,
      to: watch.to,
      since: iso(watch.switchedAt),
    };
    await deps.hands.note(bridge.package, {
      trying: null,
      outcome: { label: kept.label, said },
      proving: { label: kept.label, said: first },
    });
    const key = keyOf(bridge, kept);
    watches.delete(key);
    notBack.delete(key);
    // Its first day is counted from here: what stopped it before now was the watch's to judge.
    const starts = await startsOf(kept.label);
    if (starts === undefined) counted.delete(key);
    else counted.set(key, starts);
    deps.logger.info({ package: bridge.package, from: watch.from, to: watch.to }, "bridge updated");
    say(harnessId, {
      package: bridge.package,
      running: watch.to,
      phase: "current",
      since: iso(now),
      last: said,
    });
  }

  /** How many times the service manager has started a service; none where it doesn't say. */
  async function startsOf(label: string): Promise<number | undefined> {
    try {
      return await deps.hands.starts(label);
    } catch {
      return undefined;
    }
  }

  /**
   * Whether a service has stopped and been started again more than three times since this server
   * first counted. Stops from before this server started aren't counted: a bridge that gave up on
   * a server that was down is not the release's fault.
   */
  async function stopsTooOften(label: string, key: string): Promise<boolean> {
    const starts = await startsOf(label);
    if (starts === undefined) return false;
    const from = counted.get(key);
    // First seen by this server, or the count began again (a new login, a start by hand).
    if (from === undefined || starts < from) {
      counted.set(key, starts);
      return false;
    }
    return starts - from > EXITS_MOST;
  }

  /** Whether its first turns since the switch all failed, where the turn before it hadn't. */
  async function turnsAllFailed(harnessId: string, proving: BridgeProving): Promise<boolean> {
    const workspaceId = await deps.workspaceOf(harnessId);
    if (workspaceId === undefined) return false;
    const turns = await deps.turns(workspaceId, harnessId, proving.since);
    const everyOne = turns.ended >= TURNS_FAILED && turns.failed === turns.ended;
    return everyOne && !turns.failedBefore;
  }

  /** What says a release in its first day doesn't hold up, or nothing. */
  async function failing(
    kept: KeptBridge,
    key: string,
    harnessId: string,
    proving: BridgeProving,
  ): Promise<"exits" | "turns" | undefined> {
    if (await stopsTooOften(kept.label, key)) return "exits";
    return (await turnsAllFailed(harnessId, proving)) ? "turns" : undefined;
  }

  /** A service's first day on a release over: nothing more is held against it. */
  async function firstDayOver(bridge: LocalBridge, kept: KeptBridge): Promise<void> {
    await deps.hands.note(bridge.package, { proving: { label: kept.label, said: null } });
    const key = keyOf(bridge, kept);
    counted.delete(key);
    notBack.delete(key);
    owing.delete(key);
  }

  /** A release that didn't hold up in its first day, put back on the one before and skipped. */
  async function backFromFirstDay(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    proving: BridgeProving,
    why: "exits" | "turns",
    now: number,
  ): Promise<void> {
    const key = keyOf(bridge, kept);
    switchesBegun += 1;
    await closeSockets(harnessId);
    try {
      await deps.hands.switchTo(bridge.package, kept.label, proving.from, null);
    } catch (error) {
      // Someone else holding the bridge for a moment is not a try.
      const tries =
        (notBack.get(key) ?? 0) +
        (error instanceof BridgeRefusal && error.reason === "busy" ? 0 : 1);
      notBack.set(key, tries);
      deps.logger.error({ err: error, package: bridge.package, tries }, "bridge not put back");
      // It can't be put back (the release before is gone): it stays, and its first day is over.
      if (tries >= PUT_BACK_TRIES) await firstDayOver(bridge, kept);
      return;
    }
    const said: BridgeOutcome = {
      outcome: "put-back",
      from: proving.from,
      to: proving.to,
      at: iso(now),
      reason: why,
    };
    await deps.hands.note(bridge.package, {
      proving: { label: kept.label, said: null },
      skip: { version: proving.to, until: iso(now + SKIP_MS) },
      outcome: { label: kept.label, said },
    });
    counted.delete(key);
    notBack.delete(key);
    owing.delete(key);
    deps.logger.warn(
      { package: bridge.package, from: proving.from, to: proving.to, why },
      "bridge put back in its first day",
    );
    say(harnessId, {
      package: bridge.package,
      running: proving.from,
      phase: "current",
      since: iso(now),
      last: said,
    });
  }

  /**
   * A service in its first day on a release (rule 3). Whether it is being put back, so that
   * nothing else is decided for it in this look.
   */
  async function firstDay(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    proving: BridgeProving,
    now: number,
  ): Promise<boolean> {
    const key = keyOf(bridge, kept);
    // A day on, or no longer on that release (started by hand on another): nothing to watch.
    const over = now - Date.parse(proving.since) >= PROVING_MS;
    if (over || runningOf(bridge, kept) !== proving.to) {
      await firstDayOver(bridge, kept);
      return false;
    }
    const why = await failing(kept, key, harnessId, proving);
    if (why === undefined) return false;
    owing.add(key);
    // As a switch does, it waits for a quiet moment, and for any other switch on the package.
    if (bridge.trying === undefined && (await idle(harnessId, now))) {
      await backFromFirstDay(bridge, kept, harnessId, proving, why, now);
    } else {
      say(harnessId, asItIs(bridge, kept, now));
    }
    return true;
  }

  /** Whether a service in its first day on a release is being put back from it. */
  async function puttingBack(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    now: number,
  ): Promise<boolean> {
    const proving = bridge.proving[kept.label];
    return proving !== undefined && (await firstDay(bridge, kept, harnessId, proving, now));
  }

  /** Whether its time is up: five minutes not back, or back and still without its minute well past them. */
  const overdue = (watch: Watch, now: number): boolean => {
    const waited = now - watch.countedFrom;
    return watch.settledSince === undefined
      ? waited >= RETURN_MS
      : waited >= RETURN_MS + 2 * SETTLED_MS;
  };

  /** The watch brought up to now: its time less what was slept through, and whether it is back. */
  async function lookedAt(harnessId: string, watch: Watch, now: number): Promise<void> {
    // What the machine slept through, or the server stood still for, is not the bridge's time.
    const gap = watch.lookedAt === undefined ? 0 : now - watch.lookedAt;
    if (gap > SLEPT_MS) watch.countedFrom += gap;
    watch.lookedAt = now;
    const back = await backSince(harnessId, watch);
    // Its minute starts no earlier than its newest hello: a service that dies and says hello again
    // every ten seconds is never a minute past one.
    watch.settledSince = back === undefined ? undefined : Math.max(watch.settledSince ?? now, back);
  }

  /** A service switched and not yet seen to come back. */
  async function watching(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    trying: BridgeTrying,
    now: number,
  ) {
    const watch = watchOf(bridge, kept, trying);
    if (bridge.inUse !== undefined && bridge.inUse !== watch.to) {
      // The link isn't on the release being tried: it never got there, or someone moved it by hand.
      await letGo(bridge, kept.label, "the link is on another release");
      say(harnessId, asItIs(bridge, kept, now));
      return;
    }
    await lookedAt(harnessId, watch, now);
    if (watch.settledSince !== undefined && now - watch.settledSince >= SETTLED_MS) {
      await done(bridge, kept, harnessId, watch, now);
    } else if (overdue(watch, now) && (await idle(harnessId, now))) {
      await putBack(bridge, kept, watch, now);
    } else {
      say(harnessId, {
        package: bridge.package,
        running: watch.from,
        phase: "watching",
        target: watch.to,
        since: iso(watch.switchedAt),
        last: bridge.last[kept.label],
      });
    }
  }

  /** A quiet moment for the harness: connected long enough, nothing going on for it. */
  async function quiet(workspaceId: string, harnessId: string, now: number) {
    const state = deps.stateOf(workspaceId, harnessId);
    if (!state.connected || now - Date.parse(state.since) < CONNECTED_FOR_MS) return undefined;
    if ((await deps.busy(workspaceId, harnessId, iso(now - STILL_FOR_MS))) !== undefined) {
      return undefined;
    }
    return state;
  }

  /** What the harness behind a service says it runs, by its own command, asked once an hour. */
  async function harnessOf(bridge: LocalBridge, kept: KeptBridge, now: number) {
    const key = keyOf(bridge, kept);
    const known = asked.get(key);
    if (known !== undefined && now - known.at < HARNESS_ASKED_MS) return known.version;
    let version: string | undefined;
    try {
      version = await deps.hands.harnessVersion(bridge.package, kept.label);
    } catch {
      version = undefined;
    }
    asked.set(key, { version, at: now });
    return version;
  }

  /** What the harness says it runs, asked only when a release names the oldest it works with. */
  async function harnessIfNamed(
    bridge: LocalBridge,
    kept: KeptBridge,
    listed: ListedPackage | undefined,
    now: number,
  ): Promise<string | undefined> {
    const named = listed?.releases.some((each) => floorFor(each, kept) !== undefined) === true;
    return named ? await harnessOf(bridge, kept, now) : undefined;
  }

  /**
   * The release a service running `running` should be on, when that's another and a list is read;
   * and `held`, a later one it would take were the harness behind it newer (rule 13). A harness
   * that can't be told is taken as new enough: the bridge checks again itself when it starts.
   */
  async function targetOf(
    bridge: LocalBridge,
    kept: KeptBridge,
    running: string,
    list: BridgeList | undefined,
    now: number,
  ): Promise<{ readonly target?: Chosen | undefined; readonly held?: Held | undefined }> {
    if (list === undefined) return {};
    spread ??= deps.wait === "now" ? 0 : spreadOf(await deps.seed());
    const listed = list.packages[bridge.package];
    const have = await harnessIfNamed(bridge, kept, listed, now);
    const input = {
      listed,
      major: bridge.major,
      running,
      computer: deps.computer,
      siteNow: Date.parse(list.at) + (now - list.heardAt),
      now,
      waitMs: deps.wait === "now" ? 0 : RELEASE_WAIT_MS + spread,
      skips: bridge.skips,
    };
    const target = chooseRelease({ ...input, fits: (each) => harnessFits(each, kept, have) });
    const any = have === undefined ? target : chooseRelease(input);
    return {
      target: target?.version === running ? undefined : target,
      held: heldOf(listed, kept, any?.version === target?.version ? undefined : any?.version),
    };
  }

  /** A release that couldn't be staged: said, kept in the journal, and tried again later. */
  async function refusedWith(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    current: BridgeUpdateState,
    version: string,
    error: unknown,
    now: number,
  ) {
    const reason = error instanceof BridgeRefusal ? error.reason : "registry";
    const busyNow = reason === "busy";
    refused.set(bridge.package, {
      version,
      until: now + (busyNow ? QUIET_CHECK_MS : REFUSED_RETRY_MS),
      reason,
    });
    deps.logger.warn({ err: error, package: bridge.package, version }, "bridge release not staged");
    if (!busyNow) {
      const said: BridgeOutcome = {
        outcome: "refused",
        from: current.running,
        to: version,
        at: iso(now),
        reason,
      };
      await deps.hands.note(bridge.package, { outcome: { label: kept.label, said } });
    }
    say(harnessId, { ...current, phase: "refused", target: version, reason });
  }

  /**
   * Whether the release is here to switch to: unpacked from bytes checked against the signed
   * checksum, now or before, or refused and said why. A folder some other fetch left counts for
   * nothing until it is fetched and checked again.
   */
  async function stagedHere(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    current: BridgeUpdateState,
    target: { readonly version: string; readonly integrity: string },
    here: Map<string, string>,
    now: number,
  ): Promise<boolean> {
    if (here.get(target.version)?.split(/\s+/).includes(target.integrity) === true) return true;
    const held = refused.get(bridge.package);
    if (held !== undefined && held.version === target.version && held.until > now) {
      say(harnessId, { ...current, phase: "refused", target: target.version, reason: held.reason });
      return false;
    }
    try {
      await deps.hands.stage(bridge.package, target.version, target.integrity);
    } catch (error) {
      await refusedWith(bridge, kept, harnessId, current, target.version, error, now);
      return false;
    }
    here.set(target.version, target.integrity);
    refused.delete(bridge.package);
    return true;
  }

  /** The one service switched; whether it started, or none when it couldn't be switched. */
  async function switched(bridge: LocalBridge, kept: KeptBridge, trying: BridgeTrying) {
    try {
      const started = await deps.hands.switchTo(bridge.package, kept.label, trying.to, trying);
      deps.logger.info(
        { package: bridge.package, from: trying.from, to: trying.to, started },
        "bridge started on a new release",
      );
      return started;
    } catch (error) {
      deps.logger.error({ err: error, package: bridge.package }, "bridge not switched");
      return undefined;
    }
  }

  /** At a quiet moment: the harness's sockets closed, the one service switched, the watch begun. */
  async function switchWhenQuiet(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    current: BridgeUpdateState,
    version: string,
  ) {
    const workspaceId = await deps.workspaceOf(harnessId);
    if (workspaceId === undefined) return;
    // Read now, after any download: the time staging took is not the bridge's.
    const now = deps.clock.nowMs();
    const key = keyOf(bridge, kept);
    if ((heldBack.get(key) ?? Number.NEGATIVE_INFINITY) > now) return;
    const state = await quiet(workspaceId, harnessId, now);
    if (state === undefined) return;
    const from = current.running;
    const watch: Watch = {
      from,
      to: version,
      switchedAt: now,
      countedFrom: now,
      troubleBefore: state.trouble?.reason,
      sawItStart: true,
      settledSince: undefined,
      lookedAt: undefined,
      failedBack: 0,
    };
    watches.set(key, watch);
    waiting.delete(key);
    switchesBegun += 1;
    await closeSockets(harnessId);
    const started = await switched(bridge, kept, {
      label: kept.label,
      harnessId,
      from,
      to: version,
      at: iso(now),
    });
    if (started === undefined) {
      // Its sockets were closed for nothing: not again until it has been connected a while.
      watches.delete(key);
      heldBack.set(key, now + CONNECTED_FOR_MS);
    } else if (!started) {
      await putBack(bridge, kept, watch, now);
    } else {
      say(harnessId, { ...current, phase: "watching", target: version, since: iso(now) });
    }
  }

  /** A service on the release it runs, with nothing to take. */
  const asItIs = (bridge: LocalBridge, kept: KeptBridge, now: number): BridgeUpdateState => ({
    package: bridge.package,
    running: runningOf(bridge, kept),
    phase: "current",
    since: iso(now),
    last: bridge.last[kept.label],
  });

  async function one(
    bridge: LocalBridge,
    kept: KeptBridge,
    list: BridgeList | undefined,
    here: Map<string, string>,
    checkQuiet: boolean,
  ) {
    const harnessId = kept.harnessId;
    if (harnessId === undefined) return;
    const now = deps.clock.nowMs();
    const trying = bridge.trying;
    if (trying?.label === kept.label) {
      await watching(bridge, kept, harnessId, trying, now);
      return;
    }
    const key = keyOf(bridge, kept);
    // The journal is what says a service is being tried: a watch it no longer names is over.
    watches.delete(key);
    if (await puttingBack(bridge, kept, harnessId, now)) return;
    const current = asItIs(bridge, kept, now);
    // Before the list is read it is said as it is, so the page knows this computer keeps it.
    const { target, held } = await targetOf(bridge, kept, current.running, list, now);
    if (target === undefined) {
      waiting.delete(key);
      say(harnessId, nothingToTake(current, held));
      return;
    }
    if (switchedOff.has(harnessId)) {
      waiting.delete(key);
      say(harnessId, { ...current, phase: "off", target: target.version });
      return;
    }
    if (await stagedHere(bridge, kept, harnessId, current, target, here, now)) {
      await waitThenSwitch(bridge, kept, harnessId, current, target.version, checkQuiet, now);
    }
  }

  /** Staged and waiting: said so, and switched when it's quiet and nothing else on its package is. */
  async function waitThenSwitch(
    bridge: LocalBridge,
    kept: KeptBridge,
    harnessId: string,
    current: BridgeUpdateState,
    version: string,
    checkQuiet: boolean,
    now: number,
  ) {
    const key = keyOf(bridge, kept);
    const since = waiting.get(key) ?? now;
    waiting.set(key, since);
    say(harnessId, { ...current, phase: "waiting", target: version, since: iso(since) });
    // One switch at a time on a package: its journal holds one `trying`.
    if (checkQuiet && bridge.trying === undefined) {
      await switchWhenQuiet(bridge, kept, harnessId, current, version);
    }
  }

  async function oneSafely(
    bridge: LocalBridge,
    kept: KeptBridge,
    list: BridgeList | undefined,
    here: Map<string, string>,
    checkQuiet: boolean,
  ) {
    try {
      await one(bridge, kept, list, here, checkQuiet);
    } catch (error) {
      deps.logger.error({ err: error, package: bridge.package }, "bridge update failed");
    }
  }

  /** The entries of a map whose key isn't among `kept`, gone. */
  const only = <T>(map: Map<string, T>, kept: ReadonlySet<string | undefined>) => {
    for (const key of map.keys()) {
      if (!kept.has(key)) map.delete(key);
    }
  };

  /** What was said of, or kept for, a service that is no longer kept here is said no more. */
  function forget(bridges: readonly LocalBridge[]) {
    only(states, new Set(bridges.flatMap((bridge) => bridge.kept.map((kept) => kept.harnessId))));
    const services = new Set(
      bridges.flatMap((bridge) => bridge.kept.map((kept) => keyOf(bridge, kept))),
    );
    only(waiting, services);
    only(watches, services);
    only(heldBack, services);
    only(counted, services);
    only(notBack, services);
    only(asked, services);
    for (const key of owing) if (!services.has(key)) owing.delete(key);
  }

  /**
   * A switch the journal says is being watched, whose service nothing can watch any more: it was
   * disconnected, or its key can't be read. Left there, it would hold every other service on the
   * package back for good.
   */
  async function unwatchable(bridge: LocalBridge): Promise<void> {
    const trying = bridge.trying;
    if (trying === undefined) return;
    const service = bridge.kept.find((kept) => kept.label === trying.label);
    if (service?.harnessId !== undefined) return;
    try {
      await letGo(bridge, trying.label, "its service can't be watched");
    } catch (error) {
      deps.logger.error({ err: error, package: bridge.package }, "bridge update failed");
    }
  }

  /** Every service kept on one package, each in its turn. */
  async function reviewOne(bridge: LocalBridge, list: BridgeList | undefined, checkQuiet: boolean) {
    await unwatchable(bridge);
    const here = new Map(Object.entries(bridge.verified));
    for (const kept of bridge.kept) {
      const before = switchesBegun;
      await oneSafely(bridge, kept, list, here, checkQuiet);
      // A switch begun now moved this package's journal: the services after it read it again
      // next time. One begun earlier is in what was read, and every service is looked at, the
      // one being watched wherever it comes in the list.
      if (switchesBegun !== before) break;
    }
  }

  /**
   * With no list read yet, a switch the journal says is under way is still watched to its end,
   * and each bridge here is said as it is; nothing new is taken.
   */
  async function review(checkQuiet: boolean) {
    const list = deps.list();
    hadList = hadList || list !== undefined;
    switchedOff = (await deps.switchedOff?.()) ?? new Set();
    const bridges = await deps.hands.list();
    forget(bridges);
    for (const bridge of bridges) await reviewOne(bridge, list, checkQuiet);
  }

  return {
    tick: () => {
      if (off || busy) return;
      const now = deps.clock.nowMs();
      const active = waiting.size > 0 || watches.size > 0 || owing.size > 0;
      const checkQuiet = now - quietAt >= QUIET_CHECK_MS;
      // The list read for the first time since this server started is looked at now, not at the
      // next review ten minutes on.
      const listCame = !hadList && deps.list() !== undefined;
      if (!listCame && !(active && checkQuiet) && now - reviewedAt < REVIEW_MS) return;
      busy = true;
      reviewedAt = now;
      if (checkQuiet) quietAt = now;
      working = review(checkQuiet)
        .catch((error: unknown) => deps.logger.error({ err: error }, "bridge review failed"))
        .finally(() => {
          busy = false;
        });
    },
    heard: (harnessId, version) => {
      hellos.set(harnessId, { version, at: deps.clock.nowMs() });
    },
    said: (harnessId) => {
      // Its word counts for the release its last hello named, once: said again every half minute,
      // it would otherwise keep moving the minute it has to stay well for.
      const hello = hellos.get(harnessId);
      if (hello === undefined || words.get(harnessId)?.version === hello.version) return;
      words.set(harnessId, { version: hello.version, at: deps.clock.nowMs() });
    },
    states: () => states,
    settled: async () => await working,
  };
}
