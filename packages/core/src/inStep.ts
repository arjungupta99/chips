/**
 * Everything in step, what people see (ADR 0297): the owner's Needs update list in About, the
 * night switch under an install-line computer's row, the bridge's line and switch on its harness
 * page, and what lights the gold update dot for the owner beside a release. In core so the phone,
 * the iPad, the Mac and the web read `GET /v1/software` and `self_update` the same way and say the
 * same words. Nothing here reads the network or the clock: the caller passes `now`.
 */

import { olderThan } from "./about.js";
import {
  asSentence,
  computerFollowsLine,
  computerUpdateLine,
  isReleaseVersion,
  knownReleases,
  type UpdateFeed,
  type UpdatesWaiting,
  type UpdateWaiting,
} from "./updates.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * `12 October`, with the year when it is not this one, in local time. Its own, as `asking.ts`'s
 * is: the store reads this module, and that one reads the store.
 */
function dayMonth(iso: string, now: number): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${at.getFullYear()}`;
}

/* ---------- GET /v1/software, read ---------- */

export type BridgePhase = "current" | "waiting" | "watching" | "refused" | "off";

export type BridgeRefusalReason =
  | "node"
  | "room"
  | "permission"
  | "busy"
  | "registry"
  | "checksum"
  | "unlisted"
  | "harness";

/** How the computer is keeping a bridge in its own data folder current. */
export interface BridgeUpdate {
  readonly package: string;
  readonly running: string;
  readonly phase: BridgePhase;
  readonly since: string;
  readonly target?: string | undefined;
  readonly reason?: BridgeRefusalReason | undefined;
  /** Refused for its harness: the oldest release of the harness the bridge release works with. */
  readonly needs?: string | undefined;
  readonly last?:
    | {
        readonly outcome: "updated" | "put-back" | "refused";
        readonly from: string;
        readonly to: string;
        readonly at: string;
        readonly reason?: string | undefined;
      }
    | undefined;
}

export interface HarnessSoftware {
  readonly harnessId: string;
  /** What its hello said, as `chips-hermes`. */
  readonly name: string;
  readonly version: string;
  readonly seenAt: string;
  /** The owner's switch "Keep this bridge up to date"; on from a server older than it. */
  readonly keepCurrent: boolean;
  /** For a bridge in this computer's own data folder. */
  readonly bridgeUpdate?: BridgeUpdate | undefined;
  /** For a bridge kept elsewhere: the release out for it. */
  readonly releaseOut?: string | undefined;
}

export interface DeviceSoftware {
  readonly deviceId: string;
  readonly personId: string;
  /** What its hello said: `chips-iphone`, `chips-ipad`, `chips-mac` or `chips-web`. */
  readonly name: string;
  readonly version: string;
  readonly seenAt: string;
}

export interface Software {
  readonly harnesses: readonly HarnessSoftware[];
  readonly devices: readonly DeviceSoftware[];
}

const PHASES: readonly string[] = ["current", "waiting", "watching", "refused", "off"];
const REASONS: readonly string[] = [
  "node",
  "room",
  "permission",
  "busy",
  "registry",
  "checksum",
  "unlisted",
  "harness",
];
const OUTCOMES: readonly string[] = ["updated", "put-back", "refused"];

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw | undefined =>
  typeof value === "object" && value !== null ? (value as Raw) : undefined;
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

function readLast(raw: unknown): BridgeUpdate["last"] {
  const last = record(raw);
  const outcome = text(last?.["outcome"]);
  const from = text(last?.["from"]);
  const to = text(last?.["to"]);
  const at = text(last?.["at"]);
  if (outcome === undefined || !OUTCOMES.includes(outcome) || !from || !to || !at) return undefined;
  const reason = text(last?.["reason"]);
  return {
    outcome: outcome as "updated" | "put-back" | "refused",
    from,
    to,
    at,
    ...(reason === undefined ? {} : { reason }),
  };
}

function readBridgeUpdate(raw: unknown): BridgeUpdate | undefined {
  const update = record(raw);
  const pkg = text(update?.["package"]);
  const running = text(update?.["running"]);
  const phase = text(update?.["phase"]);
  const since = text(update?.["since"]);
  if (!pkg || !running || !since || phase === undefined || !PHASES.includes(phase)) {
    return undefined;
  }
  const target = text(update?.["target"]);
  const reason = text(update?.["reason"]);
  const needs = text(update?.["needs"]);
  const last = readLast(update?.["last"]);
  return {
    package: pkg,
    running,
    phase: phase as BridgePhase,
    since,
    ...(target === undefined ? {} : { target }),
    ...(reason !== undefined && REASONS.includes(reason)
      ? { reason: reason as BridgeRefusalReason }
      : {}),
    ...(needs === undefined ? {} : { needs }),
    ...(last === undefined ? {} : { last }),
  };
}

function readHarness(raw: unknown): HarnessSoftware | undefined {
  const each = record(raw);
  const harnessId = text(each?.["harness_id"]);
  const name = text(each?.["name"]);
  const version = text(each?.["version"]);
  const seenAt = text(each?.["seen_at"]);
  if (!harnessId || !name || !version || !seenAt) return undefined;
  const bridgeUpdate = readBridgeUpdate(each?.["bridge_update"]);
  const releaseOut = text(each?.["release_out"]);
  return {
    harnessId,
    name,
    version,
    seenAt,
    keepCurrent: each?.["keep_current"] !== false,
    ...(bridgeUpdate === undefined ? {} : { bridgeUpdate }),
    ...(releaseOut === undefined ? {} : { releaseOut }),
  };
}

function readDevice(raw: unknown): DeviceSoftware | undefined {
  const each = record(raw);
  const deviceId = text(each?.["device_id"]);
  const personId = text(each?.["person_id"]);
  const name = text(each?.["name"]);
  const version = text(each?.["version"]);
  const seenAt = text(each?.["seen_at"]);
  if (!deviceId || !personId || !name || !version || !seenAt) return undefined;
  return { deviceId, personId, name, version, seenAt };
}

/** `GET /v1/software`, each entry checked; what can't be read is left out. */
export function readSoftware(raw: unknown): Software {
  const body = record(raw);
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    harnesses: list(body?.["harnesses"]).flatMap((each) => readHarness(each) ?? []),
    devices: list(body?.["devices"]).flatMap((each) => readDevice(each) ?? []),
  };
}

/* ---------- a bridge's line on its harness page ---------- */

/** `fine`: nothing to do. `working`: it fixes itself. `needs`: the owner has something to do. */
export type BridgeTone = "fine" | "working" | "needs";

export interface BridgeLine {
  readonly tone: BridgeTone;
  /** The line's first words, as `Bridge 1.0.31` or `Couldn't update to 1.0.32`. */
  readonly label: string;
  readonly sub: string;
  /** What About's Needs update list says under the bridge's name. */
  readonly short: string;
  /** A line to run on the computer the bridge runs on. */
  readonly command?: string | undefined;
}

export const BRIDGE_HEADING = "Bridge";
export const KEEP_BRIDGE_SWITCH = "Keep this bridge up to date";
export const KEEP_BRIDGE_FOOT =
  "It takes a release only after it has been out two days, and only one Chips signed. It waits until nothing is going on, and goes back to the one before if the new one doesn't come back.";
export const BRIDGE_UPDATE_COMMAND = "chips connect --update";

/** How long a put-back stays on the page: the week its release is skipped. */
export const PUT_BACK_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Why a release couldn't be taken, in words. Busy and the registry pass: Chips tries again. The
 * harness behind it being too old has words of its own, which name it (`harnessTooOld`).
 */
const REFUSED: Readonly<
  Record<
    Exclude<BridgeRefusalReason, "harness">,
    { readonly why: string; readonly passes: boolean }
  >
> = {
  node: { why: "This computer's Node is older than it needs.", passes: false },
  room: { why: "This computer's disk is full.", passes: false },
  permission: { why: "Chips can't write to the bridge's folder.", passes: false },
  busy: { why: "Something else was changing the bridge.", passes: true },
  registry: { why: "npm couldn't be reached.", passes: true },
  checksum: { why: "The download didn't match the signed list.", passes: false },
  unlisted: { why: "Chips didn't sign that release.", passes: false },
};

/** A bridge's line from what the computer says of it. None for a harness that isn't a bridge. */
export function bridgeLine(
  harness: HarnessSoftware,
  options: { readonly name: string; readonly now: number },
): BridgeLine | undefined {
  const update = harness.bridgeUpdate;
  if (update === undefined) return elsewhereLine(harness);
  if (update.phase === "off" || (!harness.keepCurrent && update.phase !== "watching")) {
    return offLine(update);
  }
  return movingLine(update, options.name) ?? currentLine(update, options.now);
}

/** Its owner turned updates off: what is out, or only that. */
function offLine(update: BridgeUpdate): BridgeLine {
  const { running, target } = update;
  if (target === undefined || update.phase === "refused") {
    return fine(`Bridge ${running}`, "Updates are off.");
  }
  return {
    tone: "needs",
    label: "Updates are off",
    sub: `Bridge ${running} · ${target} is out.`,
    short: `${running} · ${target} is out. Updates are off.`,
  };
}

/** On its way to a release: waiting for a quiet moment, starting, or refused it. */
function movingLine(update: BridgeUpdate, name: string): BridgeLine | undefined {
  const { running, target } = update;
  if (target === undefined) return undefined;
  if (update.phase === "waiting") {
    return {
      tone: "working",
      label: `${target} is ready`,
      sub: `Waiting for a quiet moment, when nothing is going on for ${name}.`,
      short: `${target} is ready, for a quiet moment.`,
    };
  }
  if (update.phase === "watching") {
    return {
      tone: "working",
      label: `Starting ${target}`,
      sub: `Back in a moment. If it doesn't come back, ${running} goes back on.`,
      short: `Starting ${target}.`,
    };
  }
  if (update.phase !== "refused") return undefined;
  const refused =
    update.reason === undefined
      ? undefined
      : update.reason === "harness"
        ? harnessTooOld(name, update.needs)
        : REFUSED[update.reason];
  // A reason this app doesn't know, as from a newer computer: said without one, and with no
  // promise that it passes on its own.
  if (refused === undefined) {
    return {
      tone: "needs",
      label: `Couldn't update to ${target}`,
      sub: `Still on ${running}.`,
      short: `Couldn't update to ${target}. Still on ${running}.`,
    };
  }
  return {
    tone: refused.passes ? "working" : "needs",
    label: `Couldn't update to ${target}`,
    sub: `${refused.why} Still on ${running}.${refused.passes ? " It tries again tomorrow." : ""}`,
    short: `Couldn't update to ${target}: ${lower(refused.why)} Still on ${running}.`,
  };
}

/**
 * The harness behind the bridge is older than the release works with: the owner's to update, so
 * it doesn't pass on its own. Chips takes the release once the harness is new enough.
 */
function harnessTooOld(name: string, needs: string | undefined) {
  return {
    why: needs === undefined ? `It needs a newer ${name}.` : `It needs ${name} ${needs} or newer.`,
    passes: false,
  };
}

/**
 * What a release put back did, by the computer's word for it: it kept stopping in its first day,
 * its first turns all failed, or (any other word, as from a newer computer) it didn't come back.
 */
function putBackFor(reason: string | undefined): string {
  if (reason === "exits") return "It kept stopping";
  if (reason === "turns") return "Its first turns failed";
  return "It didn't come back";
}

function currentLine(update: BridgeUpdate, now: number): BridgeLine {
  const last = update.last;
  if (
    last?.outcome === "put-back" &&
    now - Date.parse(last.at) < PUT_BACK_SHOWN_MS &&
    last.from === update.running
  ) {
    const did = putBackFor(last.reason);
    return {
      tone: "needs",
      label: `Couldn't update to ${last.to}`,
      sub: `${did}, so ${last.from} is back on. Chips tries again when the next release is out.`,
      short: `Couldn't update to ${last.to}: ${lower(did)}. Still on ${last.from}.`,
    };
  }
  if (last?.outcome === "updated" && last.to === update.running) {
    return fine(
      `Bridge ${update.running}`,
      `Updated ${dayMonth(last.at, now)}, at a quiet moment.`,
    );
  }
  return fine(`Bridge ${update.running}`, "Kept up to date by this computer.");
}

/** A bridge this computer doesn't keep: the line to run where it runs, when a release is out. */
function elsewhereLine(harness: HarnessSoftware): BridgeLine | undefined {
  if (!harness.name.startsWith("chips-") || harness.name === "chips-harness") return undefined;
  if (!isReleaseVersion(harness.version)) return undefined;
  if (harness.releaseOut === undefined) return fine(`Bridge ${harness.version}`, "");
  return {
    tone: "needs",
    label: `Bridge ${harness.version} · ${harness.releaseOut} is out`,
    sub: "On the computer this bridge runs on:",
    short: `${harness.version} · ${harness.releaseOut} is out. It needs a line run where it runs.`,
    command: BRIDGE_UPDATE_COMMAND,
  };
}

const fine = (label: string, sub: string): BridgeLine => ({ tone: "fine", label, sub, short: sub });
const lower = (words: string) => words.charAt(0).toLowerCase() + words.slice(1);

/** Whether the harness page shows the switch: for the owner, for a bridge this computer keeps. */
export function showsBridgeSwitch(harness: HarnessSoftware | undefined, owner: boolean): boolean {
  return owner && harness?.bridgeUpdate !== undefined;
}

/* ---------- About's Needs update list, for the owner ---------- */

export const NEEDS_UPDATE_HEADING = "Needs update";
export const NEEDS_UPDATE_FOOT =
  "Only what needs someone. Bridges on this computer update themselves, at a quiet moment, and show here only when one couldn't.";
export const NEEDS_UPDATE_DOT = "Needs update";

/** How long a device unseen still counts: one put away longer is left out. */
export const DEVICE_SEEN_MS = 30 * 24 * 60 * 60 * 1000;

export interface NeedsUpdateRow {
  /** Unique in the list, and what the dot keys on. */
  readonly key: string;
  readonly kind: "bridge" | "device";
  readonly label: string;
  readonly sub: string;
  /** For a bridge: its harness, whose page the row opens. */
  readonly harnessId?: string | undefined;
  /** For a device: whose it is, and which app. */
  readonly personId?: string | undefined;
  readonly app?: "iphone" | "ipad" | "mac" | undefined;
}

const APPS: Readonly<
  Record<string, { readonly app: "iphone" | "ipad" | "mac"; readonly noun: string }>
> = {
  "chips-iphone": { app: "iphone", noun: "iPhone" },
  "chips-ipad": { app: "ipad", noun: "iPad" },
  "chips-mac": { app: "mac", noun: "Mac" },
};

/**
 * Everything that needs someone, for the owner: bridges that couldn't update, are held back, or
 * need a line where they run; and the iPhones, iPads and Macs whose Chips is older than what is
 * out, by whose they are. Not this device, which About's Updates group shows, and not a device put
 * away for a month. Bridges first, then devices, each by name.
 */
export function needsUpdate(input: {
  readonly software: Software | undefined;
  readonly feed: UpdateFeed | undefined;
  readonly now: number;
  readonly me: string;
  readonly thisDevice?: string | undefined;
  /** A harness's name, as `Hermes`; none for one gone. */
  readonly harnessName: (harnessId: string) => string | undefined;
  /** A person's first name; none for one gone. */
  readonly personName: (personId: string) => string | undefined;
}): readonly NeedsUpdateRow[] {
  const { software, now } = input;
  if (software === undefined) return [];
  const bridges = software.harnesses.flatMap((harness): NeedsUpdateRow[] => {
    const name = input.harnessName(harness.harnessId);
    if (name === undefined) return [];
    const line = bridgeLine(harness, { name, now });
    if (line?.tone !== "needs") return [];
    return [
      {
        key: `bridge:${harness.harnessId}:${line.label}`,
        kind: "bridge",
        label: `${name} bridge`,
        sub: line.short,
        harnessId: harness.harnessId,
      },
    ];
  });
  const offered = {
    mac: knownReleases(input.feed)[0]?.version,
    store: input.feed?.appStore,
  };
  const devices = software.devices.flatMap(
    (device) => deviceRow(device, { ...input, offered }) ?? [],
  );
  const byLabel = (a: NeedsUpdateRow, b: NeedsUpdateRow) => a.label.localeCompare(b.label);
  return [...bridges.sort(byLabel), ...devices.sort(byLabel)];
}

/** A device whose Chips is older than what is out for it, as its row; none otherwise. */
function deviceRow(
  device: DeviceSoftware,
  input: {
    readonly now: number;
    readonly me: string;
    readonly thisDevice?: string | undefined;
    readonly personName: (personId: string) => string | undefined;
    readonly offered: { readonly mac: string | undefined; readonly store: string | undefined };
  },
): NeedsUpdateRow | undefined {
  const app = APPS[device.name];
  if (app === undefined || device.deviceId === input.thisDevice) return undefined;
  if (input.now - Date.parse(device.seenAt) > DEVICE_SEEN_MS) return undefined;
  const out = app.app === "mac" ? input.offered.mac : input.offered.store;
  if (!isReleaseVersion(device.version) || !isReleaseVersion(out)) return undefined;
  if (!olderThan(device.version, out)) return undefined;
  const who =
    device.personId === input.me ? "Your" : `${input.personName(device.personId) ?? "Someone"}'s`;
  const where = app.app === "mac" ? `${out} is out` : `${out} is on the App Store`;
  return {
    key: `device:${device.deviceId}:${out}`,
    kind: "device",
    label: `${who} ${app.noun}`,
    sub: `Chips ${device.version} · ${where}`,
    personId: device.personId,
    app: app.app,
  };
}

/* ---------- the night switch, for a computer from the install line ---------- */

export interface SelfUpdateFacts {
  /** Whether this computer can update itself: one from the install line. */
  readonly available: boolean;
  readonly automatic: boolean;
  readonly last?:
    | {
        readonly state: "updating" | "updated" | "current" | "failed";
        readonly from: string;
        readonly at: string;
        readonly to?: string | undefined;
        readonly why?: string | undefined;
      }
    | undefined;
  /**
   * A computer in Chips for Mac, once the app has updated itself: the release it starts again on
   * when nothing is going on (ADR 0298).
   */
  readonly restartsOnto?: string | undefined;
  /**
   * Whether this computer is one Chips for Mac carries: the app updates itself, then the computer
   * starts again by itself (ADR 0298). Absent otherwise, and from a server older than the field.
   */
  readonly withApp?: true | undefined;
}

const SELF_STATES: readonly string[] = ["updating", "updated", "current", "failed"];

function readSelfLast(raw: unknown): SelfUpdateFacts["last"] {
  const last = record(raw);
  const state = text(last?.["state"]);
  const from = text(last?.["from"]);
  const at = text(last?.["at"]);
  if (state === undefined || !SELF_STATES.includes(state) || !from || !at) return undefined;
  const to = text(last?.["to"]);
  const why = text(last?.["why"]);
  return {
    state: state as "updating" | "updated" | "current" | "failed",
    from,
    at,
    ...(to === undefined ? {} : { to }),
    ...(why === undefined ? {} : { why }),
  };
}

/** `self_update` from an owner's `GET /v1/server`; undefined from a server older than it. */
export function readSelfUpdate(raw: unknown): SelfUpdateFacts | undefined {
  const self = record(raw);
  if (self === undefined || typeof self["available"] !== "boolean") return undefined;
  const last = readSelfLast(self["last"]);
  const onto = self["restarts_onto"];
  return {
    available: self["available"],
    automatic: self["automatic"] === true,
    ...(last === undefined ? {} : { last }),
    ...(typeof onto === "string" && /^\d+\.\d+\.\d+$/.test(onto) ? { restartsOnto: onto } : {}),
    ...(self["with_app"] === true ? { withApp: true as const } : {}),
  };
}

/** The computer's row while it waits to start again on the release Chips for Mac now holds. */
export function restartsOntoLine(version: string): string {
  return `Starts again on ${version} when nothing is going on`;
}

/**
 * Whether the computer comes along with Chips for Mac and so asks nothing of anyone (ADR 0298):
 * one the app carries, or one already waiting to start again on the release the app now holds.
 * Its update lights no dot and its row offers no Update.
 */
export function computerFollowsApp(self: SelfUpdateFacts | undefined): boolean {
  return self?.withApp === true || self?.restartsOnto !== undefined;
}

/**
 * The line under the computer's row in About: that it starts again on its own, that a release
 * comes with Chips for Mac, or, for a computer its owner updates, that one is out. None when
 * nothing waits for it.
 */
export function computerLine(
  waiting: UpdateWaiting | undefined,
  self: SelfUpdateFacts | undefined,
): string | undefined {
  if (self?.restartsOnto !== undefined) return restartsOntoLine(self.restartsOnto);
  if (waiting === undefined) return undefined;
  return computerFollowsApp(self) ? computerFollowsLine(waiting) : computerUpdateLine(waiting);
}

export const NIGHT_SWITCH = "Update it at night";
export const UPDATE_NOW_HEADING = "To update it now";
export const SELF_UPDATE_COMMAND = "chips update";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days before today a time fell, by the reader's own clock: 0 today, 1 yesterday. */
function daysBefore(then: Date, now: number): number {
  const day = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  // Rounded, since a day the clocks change on is an hour longer or shorter.
  return Math.round((day(new Date(now)) - day(then)) / DAY_MS);
}

/**
 * When an update ran, by the reader's own clock: "last night" before six this morning or from six
 * yesterday evening, "today" or "yesterday" for one run by hand in the day, "on 12 November"
 * before that. Nothing for a time that can't be read, so the sentence goes without it.
 */
function nightWhen(at: string, now: number): string {
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return "";
  const days = daysBefore(then, now);
  if (days <= 0) return then.getHours() < 6 ? "last night" : "today";
  if (days === 1) return then.getHours() >= 18 ? "last night" : "yesterday";
  return `on ${dayMonth(at, now)}`;
}

/** A sentence's words joined, the empty ones left out. */
const words = (...parts: readonly string[]) => parts.filter((part) => part !== "").join(" ");

/** How the last update went, where it says anything: couldn't, updated, or under way. */
function lastNight(self: SelfUpdateFacts, now: number): string | undefined {
  const last = self.last;
  if (last?.state === "failed") {
    return words(
      `${words("Couldn't update", nightWhen(last.at, now))}.`,
      asSentence(last.why ?? ""),
      `Still on ${last.from}.`,
      self.automatic ? "It tries again tonight." : "",
    );
  }
  if (last?.state === "updated" && last.to !== undefined) {
    return `${words(`Updated to ${last.to}`, nightWhen(last.at, now))}.`;
  }
  if (last?.state === "updating") return "Updating now.";
  return undefined;
}

/** The line under the night switch: what it does, or how the last night went. */
export function nightFoot(self: SelfUpdateFacts, machine: string, now: number): string {
  const went = lastNight(self, now);
  if (went !== undefined) return went;
  return self.automatic
    ? `${machine} updates itself between 2 and 5 in the morning when a newer release is out and nothing is going on.`
    : `With this on, ${machine} updates itself between 2 and 5 in the morning when nothing is going on. The bridges on it update on their own either way.`;
}

/** The note under `chips update`: where to run it, and what happens. */
export function updateNowNote(machine: string, version: string): string {
  return `On ${machine}. Chips stops for a few seconds while it starts again on ${version}, and your devices reconnect by themselves.`;
}

/* ---------- the dot, for the owner ---------- */

/** What joins the keys of everything that needs the owner into the one string a device keeps. */
const KEY_JOIN = "|";

/**
 * What lights the gold dot for the owner beside a release: a bridge that needs them, and a night
 * that couldn't update. Never someone else's phone. A key for each, joined, so About opened puts
 * the dot out for all of them (`ownerDotLit`); none when nothing needs them.
 */
export function ownerDotKey(
  rows: readonly NeedsUpdateRow[],
  self: SelfUpdateFacts | undefined,
): string | undefined {
  const keys = rows.filter((row) => row.kind === "bridge").map((row) => row.key);
  if (self?.automatic === true && self.last?.state === "failed") keys.push(`night:${self.last.at}`);
  return keys.length === 0 ? undefined : keys.sort().join(KEY_JOIN);
}

/**
 * Whether the owner's dot is lit: something needs them now that wasn't there when About last put
 * the dot out (`seen`, the key kept then). What was seen is a set, so one of two things fixed
 * leaves the dot out for the other; only something new lights it again.
 */
export function ownerDotLit(key: string | undefined, seen: string | undefined): boolean {
  if (key === undefined) return false;
  const had = new Set(seen === undefined ? [] : seen.split(KEY_JOIN));
  return key.split(KEY_JOIN).some((each) => !had.has(each));
}

/**
 * Whether the About Chips row in You wears its small still dot (ADR 0296): an update waits that
 * asks something of somebody, or a bridge needs the owner. The same on every device.
 */
export function aboutRowLit(asking: UpdatesWaiting, needs: readonly NeedsUpdateRow[]): boolean {
  return (
    asking.app !== undefined ||
    asking.computer !== undefined ||
    needs.some((row) => row.kind === "bridge")
  );
}

/** Whether two Needs update lists say the same, so a screen keeps the one it has drawn. */
export function sameNeeds(a: readonly NeedsUpdateRow[], b: readonly NeedsUpdateRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, at) => {
    const other = b[at];
    return row.key === other?.key && row.label === other.label && row.sub === other.sub;
  });
}
