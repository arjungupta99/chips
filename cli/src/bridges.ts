/**
 * A harness's bridge, fetched from npm when a person picks its card (ADR 0218).
 *
 * A card names a package and the major that speaks this Chips's protocol: `@chipschat/hermes@1`.
 * The bridge is the newest release of that major that is neither a prerelease nor deprecated, so
 * a fix reaches people the day it is published and a bad one is withdrawn by deprecating it. Its
 * tarball is checked against the registry's own SHA-512 before anything of it is unpacked, and it
 * is kept in `<data>/bridges/<scope>-<name>/package`, the same folder through every update, so a
 * service keep wrote for it goes on finding it. `bridge.json` beside it says which version is
 * there and which cards keep it running, under which label.
 *
 * Nothing here names a harness: the package, its args and its id all come from the card.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { STEP_MARK } from "@chipschat/harness";
import {
  type BridgeOutcome,
  type BridgeProving,
  BridgeRefusal,
  type BridgeTrying,
  type JournalChange,
} from "@chipschat/server";

/** Where packages come from unless `CHIPS_NPM_REGISTRY` says otherwise. */
export const NPM_REGISTRY = "https://registry.npmjs.org";

/** The most a bridge's tarball may be: each is one bundled file of a megabyte or so. */
export const TARBALL_MAX_BYTES = 64 * 1024 * 1024;

/** Said to the person: a bridge that can't be had, or can't be trusted, with what to do. */
export class BridgeError extends Error {}

export interface PackageSpec {
  readonly name: string;
  readonly major: number;
}

/** A card's `package`, `@chipschat/hermes@1`, as its name and major. */
export function packageSpec(spec: string): PackageSpec | undefined {
  const found = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(\d{1,4})$/.exec(spec);
  if (found?.[1] === undefined || found[2] === undefined) return undefined;
  return { name: found[1], major: Number(found[2]) };
}

interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: boolean;
}

function semver(version: string): Semver | undefined {
  const found = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (found === null) return undefined;
  return {
    major: Number(found[1]),
    minor: Number(found[2]),
    patch: Number(found[3]),
    prerelease: found[4] !== undefined,
  };
}

const later = (a: Semver, b: Semver) =>
  a.minor !== b.minor ? a.minor > b.minor : a.patch > b.patch;

/** A release the registry lists: where its tarball is, and the checksum it must match. */
export interface Listed {
  readonly version: string;
  readonly tarball: string;
  readonly integrity: string;
}

interface Manifest {
  readonly deprecated?: unknown;
  readonly dist?: { readonly tarball?: unknown; readonly integrity?: unknown };
}

/** A version of `major` that may be fetched: a release, not deprecated, with a SHA-512. */
function fetchable(
  version: string,
  manifest: Manifest,
  major: number,
): { readonly listed: Listed; readonly semver: Semver } | undefined {
  const parsed = semver(version);
  if (parsed === undefined || parsed.major !== major || parsed.prerelease) return undefined;
  if (manifest.deprecated !== undefined && manifest.deprecated !== false) return undefined;
  const tarball = manifest.dist?.tarball;
  const integrity = manifest.dist?.integrity;
  if (typeof tarball !== "string" || typeof integrity !== "string") return undefined;
  if (!/(^|\s)sha512-/.test(integrity)) return undefined;
  return { listed: { version, tarball, integrity }, semver: parsed };
}

/**
 * The newest release of `major` the registry lists: no prerelease, nothing deprecated. A release
 * the registry gives no SHA-512 for is not one: nothing could check it.
 */
export function newestInMajor(packument: unknown, major: number): Listed | undefined {
  const versions = (packument as { versions?: Record<string, Manifest> } | null)?.versions ?? {};
  let best: { readonly listed: Listed; readonly semver: Semver } | undefined;
  for (const [version, manifest] of Object.entries(versions)) {
    const each = fetchable(version, manifest, major);
    if (each !== undefined && (best === undefined || later(each.semver, best.semver))) best = each;
  }
  return best?.listed;
}

/** Whether the bytes are what the registry's `dist.integrity` says: its SHA-512. */
export function integrityMatches(bytes: Uint8Array, integrity: string): boolean {
  const digest = createHash("sha512").update(bytes).digest("base64");
  return integrity
    .split(/\s+/)
    .some((each) => each.startsWith("sha512-") && each.slice("sha512-".length) === digest);
}

/** `<bridges>/chipschat-hermes` for `@chipschat/hermes`. */
export function bridgeFolder(bridges: string, name: string): string {
  return join(bridges, name.replace(/^@/, "").replace("/", "-"));
}

/** A card kept running through a bridge: what keep named its service, and what it was run with. */
export interface KeptCard {
  readonly label: string;
  readonly args: readonly string[];
}

/** `bridge.json`: the version unpacked here, and the cards kept running through it. */
export interface BridgeRecord {
  readonly package: string;
  readonly version: string;
  readonly integrity: string;
  readonly kept: Readonly<Record<string, KeptCard>>;
}

const RECORD = "bridge.json";

export function readRecord(folder: string): BridgeRecord | undefined {
  try {
    const read = JSON.parse(readFileSync(join(folder, RECORD), "utf8")) as Partial<BridgeRecord>;
    if (typeof read.package !== "string" || typeof read.version !== "string") return undefined;
    return {
      package: read.package,
      version: read.version,
      integrity: typeof read.integrity === "string" ? read.integrity : "",
      kept: typeof read.kept === "object" && read.kept !== null ? read.kept : {},
    };
  } catch {
    return undefined;
  }
}

/**
 * Written whole beside it, flushed, and renamed into place, so a full disk or a power cut leaves
 * the last good record rather than an empty one: a bridge whose record can't be read drops out of
 * every update, `disconnect` and `uninstall`.
 */
export function writeRecord(folder: string, record: BridgeRecord): void {
  mkdirSync(folder, { recursive: true });
  writeWhole(join(folder, RECORD), `${JSON.stringify(record, null, 2)}\n`);
}

/** A file written beside itself, flushed, and renamed into place: the last good one, or this. */
export function writeWhole(path: string, text: string): void {
  const next = `${path}.next`;
  const file = openSync(next, "w");
  try {
    writeSync(file, text);
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(next, path);
}

/*
 * Each release in a folder of its own, `package-1.0.31`, and `package` a link to the one in use
 * (bridges-keep-current.md, rule 4). The services keep naming `package/…`; Node follows the link
 * when a bridge starts, so a bridge still running goes on loading its own version's files, which
 * stay until nothing needs them: the one in use, the one before it (to put back), and any a kept
 * service still started on.
 */

const LINK = "package";
const VERSIONED = /^package-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** What `updates.json` keeps beside the record: the version in use, the one before, and more. */
export interface BridgeJournal {
  readonly layout: 1;
  readonly current?: string | undefined;
  readonly previous?: string | undefined;
  /** The version each kept service was last started on, by its label. */
  readonly startedOn?: Readonly<Record<string, string>> | undefined;
  /** Releases put back, each skipped until the time it names (rule 3). */
  readonly skips?: Readonly<Record<string, string>> | undefined;
  /** A service switched to a release and not yet seen to come back, for a restart to finish. */
  readonly trying?: BridgeTrying | undefined;
  /** The services in their first day on a release, by label: watched, and put back if need be. */
  readonly proving?: Readonly<Record<string, BridgeProving>> | undefined;
  /** How each service's last update went, by its label. */
  readonly last?: Readonly<Record<string, BridgeOutcome>> | undefined;
  /** The checksum each release staged here was unpacked from, for `bridge.json` once it runs. */
  readonly staged?: Readonly<Record<string, string>> | undefined;
}

const JOURNAL = "updates.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Only the string values of a map read from disk. */
function strings(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function tryingOf(value: unknown): BridgeTrying | undefined {
  if (!isRecord(value)) return undefined;
  const { label, harnessId, from, to, at } = value;
  return typeof label === "string" &&
    typeof harnessId === "string" &&
    typeof from === "string" &&
    typeof to === "string" &&
    typeof at === "string"
    ? { label, harnessId, from, to, at }
    : undefined;
}

function provingOf(value: unknown): Record<string, BridgeProving> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, BridgeProving> = {};
  for (const [label, each] of Object.entries(value)) {
    if (!isRecord(each)) continue;
    const { harnessId, from, to, since } = each;
    if (
      typeof harnessId === "string" &&
      typeof from === "string" &&
      typeof to === "string" &&
      typeof since === "string" &&
      !Number.isNaN(Date.parse(since))
    ) {
      out[label] = { harnessId, from, to, since };
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

const OUTCOMES: ReadonlySet<unknown> = new Set(["updated", "put-back", "refused"]);

function outcomesOf(value: unknown): Record<string, BridgeOutcome> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, BridgeOutcome> = {};
  for (const [label, each] of Object.entries(value)) {
    if (!isRecord(each) || !OUTCOMES.has(each["outcome"])) continue;
    const { from, to, at, reason } = each;
    if (typeof from !== "string" || typeof to !== "string" || typeof at !== "string") continue;
    out[label] = {
      outcome: each["outcome"] as BridgeOutcome["outcome"],
      from,
      to,
      at,
      ...(typeof reason === "string" ? { reason: reason as BridgeOutcome["reason"] } : {}),
    };
  }
  return out;
}

export function readJournal(folder: string): BridgeJournal {
  let read: unknown;
  try {
    read = JSON.parse(readFileSync(join(folder, JOURNAL), "utf8"));
  } catch {
    return { layout: 1 };
  }
  if (!isRecord(read)) return { layout: 1 };
  const fields: Partial<Record<keyof BridgeJournal, unknown>> = {
    current: typeof read["current"] === "string" ? read["current"] : undefined,
    previous: typeof read["previous"] === "string" ? read["previous"] : undefined,
    startedOn: strings(read["startedOn"]),
    skips: strings(read["skips"]),
    trying: tryingOf(read["trying"]),
    proving: provingOf(read["proving"]),
    last: outcomesOf(read["last"]),
    staged: strings(read["staged"]),
  };
  return {
    layout: 1,
    ...Object.fromEntries(Object.entries(fields).filter((entry) => entry[1] !== undefined)),
  } as BridgeJournal;
}

export function writeJournal(folder: string, journal: BridgeJournal): void {
  writeWhole(join(folder, JOURNAL), `${JSON.stringify(journal, null, 2)}\n`);
}

/** The version `package` points at, or none: a folder from before the link, or nothing yet. */
export function versionInUse(folder: string): string | undefined {
  try {
    return VERSIONED.exec(readlinkSync(join(folder, LINK)))?.[1];
  } catch {
    return undefined;
  }
}

/**
 * A `package` folder an older Chips unpacked, made the first versioned one behind the link. The
 * rename and the link follow each other at once, and a bridge already running keeps its files.
 */
export function adoptLayout(folder: string): void {
  const link = join(folder, LINK);
  if (!existsSync(link) || lstatSync(link).isSymbolicLink()) return;
  let version: unknown;
  try {
    version = (
      JSON.parse(readFileSync(join(link, "package.json"), "utf8")) as { version?: unknown }
    ).version;
  } catch {
    version = undefined;
  }
  const named = typeof version === "string" && SAFE_VERSION.test(version) ? version : "0.0.0";
  const target = join(folder, `${LINK}-${named}`);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  renameSync(link, target);
  symlinkSync(`${LINK}-${named}`, link);
}

/** `package` pointed at `version`'s folder in one rename, and the journal told which came before. */
export function pointTo(folder: string, version: string): void {
  if (!SAFE_VERSION.test(version)) throw new BridgeError(`${version} is not a version.`);
  if (!existsSync(join(folder, `${LINK}-${version}`, "package.json"))) {
    throw new BridgeError(`${version} isn't unpacked here.`);
  }
  adoptLayout(folder);
  const before = versionInUse(folder);
  // Every service kept here runs the release the link is leaving until it is started again: that
  // is written down before the link moves, so its files stay and it is read as what it runs.
  const startedOn = startedBefore(folder, readRecord(folder), readJournal(folder));
  const next = join(folder, `${LINK}.next`);
  rmSync(next, { force: true });
  symlinkSync(`${LINK}-${version}`, next);
  renameSync(next, join(folder, LINK));
  const journal = readJournal(folder);
  writeJournal(folder, {
    ...journal,
    current: version,
    ...(Object.keys(startedOn).length === 0 ? {} : { startedOn }),
    ...(before !== undefined && before !== version ? { previous: before } : {}),
  });
}

/** Throws what `pointTo` would, before anything is written. */
function mustBeUnpacked(folder: string, version: string): void {
  if (!SAFE_VERSION.test(version)) throw new BridgeError(`${version} is not a version.`);
  if (!unpackedHere(folder, version)) throw new BridgeError(`${version} isn't unpacked here.`);
}

/** Whether `version` is unpacked here, to point at. */
function unpackedHere(folder: string, version: string): boolean {
  return (
    SAFE_VERSION.test(version) && existsSync(join(folder, `${LINK}-${version}`, "package.json"))
  );
}

/**
 * Every version folder nothing needs any more gone: not the one in use, the one before, one a
 * service started on, either end of a switch still being watched, or the release a service in its
 * first day on a new one would be put back on.
 */
export function prune(folder: string): void {
  const journal = readJournal(folder);
  const keep = new Set(
    [
      versionInUse(folder),
      journal.previous,
      ...Object.values(journal.startedOn ?? {}),
      // A switch being watched: the release to put back, and the one being tried.
      journal.trying?.from,
      journal.trying?.to,
      // A first day: the release to go back to if the new one doesn't hold up.
      ...Object.values(journal.proving ?? {}).flatMap((each) => [each.from, each.to]),
    ].filter((each): each is string => each !== undefined),
  );
  for (const entry of readdirSync(folder)) {
    const version = VERSIONED.exec(entry)?.[1];
    if (version !== undefined && !keep.has(version)) {
      rmSync(join(folder, entry), { recursive: true, force: true });
    }
  }
  const staged = Object.entries(journal.staged ?? {}).filter(([version]) => keep.has(version));
  if (staged.length !== Object.keys(journal.staged ?? {}).length) {
    writeJournal(folder, { ...journal, staged: Object.fromEntries(staged) });
  }
}

/** Every bridge here, with its record. */
export function bridgesHere(
  bridges: string,
): readonly { readonly folder: string; readonly record: BridgeRecord }[] {
  if (!existsSync(bridges)) return [];
  return readdirSync(bridges).flatMap((entry) => {
    const folder = join(bridges, entry);
    const record = readRecord(folder);
    return record === undefined ? [] : [{ folder, record }];
  });
}

/*
 * One at a time (rule 8): `bridge.lock` in the package's folder, made only if it isn't there, with
 * its holder's process id. `chips connect` by hand takes it too. One left by a process that has
 * gone is taken over.
 */

const LOCK = "bridge.lock";
/**
 * How long a lock is believed. Nothing done under it takes this long (the longest is one download,
 * minutes at most), so an older one was left by a process that has gone, even when another process
 * has since been given its number.
 */
export const LOCK_STALE_MS = 30 * 60_000;
/** How long a lock with no holder written in it yet is believed: its holder is between two calls. */
const LOCK_BEING_WRITTEN_MS = 2000;

/** Someone else is changing this bridge right now. */
export class LockHeld extends BridgeError {}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Whether the lock at `path` has a holder still at work; false for one that has gone, or no lock. */
function held(path: string, now: number): boolean {
  let age: number;
  let holder: number;
  try {
    age = now - statSync(path).mtimeMs;
    holder = Number.parseInt(readFileSync(path, "utf8"), 10);
  } catch {
    // Let go between the two looks: there is nothing to wait for.
    return false;
  }
  if (age > LOCK_STALE_MS) return false;
  if (!Number.isInteger(holder)) return age < LOCK_BEING_WRITTEN_MS;
  return holder !== process.pid && alive(holder);
}

/** The lock taken, or `LockHeld` thrown; the function it returns lets it go. */
export function takeLock(folder: string, now: () => number = Date.now): () => void {
  mkdirSync(folder, { recursive: true });
  const path = join(folder, LOCK);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const file = openSync(path, "wx");
      writeSync(file, String(process.pid));
      closeSync(file);
      return () => rmSync(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (held(path, now())) break;
      rmSync(path, { force: true });
    }
  }
  throw new LockHeld("Chips is changing this bridge right now. Try again in a minute.");
}

export async function withLock<T>(folder: string, work: () => Promise<T> | T): Promise<T> {
  const letGo = takeLock(folder);
  try {
    return await work();
  } finally {
    letGo();
  }
}

/** The versions unpacked in a bridge's folder. */
export function stagedHere(folder: string): string[] {
  try {
    return readdirSync(folder).flatMap((entry) => {
      const version = VERSIONED.exec(entry)?.[1];
      return version === undefined ? [] : [version];
    });
  } catch {
    return [];
  }
}

/** One clause of a range, `>=22.19`: whether a Node of `have` meets it. */
function clauseHolds(have: Semver, operator: string, want: string): boolean {
  const [major = 0, minor, patch = 0] = want.split(".").map((part) => Number(part));
  const order = have.major - major || have.minor - (minor ?? 0) || have.patch - patch;
  switch (operator) {
    case ">=":
      return order >= 0;
    case ">":
      return order > 0;
    case "<=":
      return order <= 0;
    case "<":
      return order < 0;
    case "=":
      return order === 0;
    case "~":
      return have.major === major && (minor === undefined || have.minor === minor) && order >= 0;
    default:
      // `^`, and a plain version: the same major, at least that.
      return have.major === major && order >= 0;
  }
}

const CLAUSE = /\s*(>=|<=|>|<|=|\^|~)?\s*v?(\d+(?:\.\d+){0,2})(?:\.[xX*])?(?=\s|$)/y;

/** Whether every clause of one alternative holds; none when a part of it can't be read. */
function alternativeHolds(have: Semver, text: string): boolean | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  let at = 0;
  let holds = true;
  while (at < trimmed.length) {
    CLAUSE.lastIndex = at;
    const found = CLAUSE.exec(trimmed);
    if (found?.[2] === undefined) return undefined;
    holds = clauseHolds(have, found[1] ?? "", found[2]) && holds;
    at = CLAUSE.lastIndex;
  }
  return holds;
}

/**
 * Whether `node` (`22.11.0`) meets an `engines.node` range: clauses of `>=`, `>`, `<=`, `<`, `=`,
 * `^`, `~` or a plain version, spaced or not, all of them together, with `||` between
 * alternatives. A range none of whose alternatives can be read passes: it is the registry's word,
 * and a release is not held back for a way of writing it.
 */
export function nodeMeets(range: string, node: string): boolean {
  const have = semver(node.replace(/^v/, ""));
  if (have === undefined) return true;
  const read = range.split("||").map((each) => alternativeHolds(have, each));
  if (read.every((each) => each === undefined)) return true;
  return read.some((each) => each === true);
}

/** How much a release needs free: three copies, since two stay and one is being unpacked. */
const ROOM_FALLBACK_BYTES = 20 * 1024 * 1024;

/**
 * One exact release of a bridge here, unpacked beside the one running and nothing else changed:
 * the computer's own update (bridges-keep-current.md, A). The release is the one a list signed with
 * Chips's release key names, so its SHA-512 must be the list's and the registry's both. Refused,
 * with a reason the harness page puts in words, when it doesn't fit the machine (rule 8).
 */
export async function stageRelease(input: {
  readonly registry: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly bridges: string;
  /** The Node its services run on. */
  readonly nodeVersion: string;
  readonly fetch?: typeof fetch | undefined;
  /** Free bytes where the folder is; the file system's, unless a test says. */
  readonly free?: ((folder: string) => number) | undefined;
}): Promise<void> {
  const folder = bridgeFolder(input.bridges, input.name);
  if (!SAFE_VERSION.test(input.version)) {
    throw new BridgeRefusal("unlisted", `${input.version} is not a version.`);
  }
  if (readRecord(folder) === undefined) {
    throw new BridgeRefusal("unlisted", `${input.name} isn't connected here.`);
  }
  try {
    accessSync(folder, constants.W_OK);
  } catch {
    throw new BridgeRefusal("permission", `Chips can't write ${folder}.`);
  }
  try {
    await withLock(folder, async () => {
      if (checkedHere(folder, input.version, input.integrity)) return;
      const fetching = input.fetch ?? fetch;
      const manifest = await exactRelease(input.registry, input.name, input.version, fetching);
      const { tarball, signed } = theSignedOne(manifest, input);
      fitsHere(manifest, input, folder);
      const bytes = await downloadSigned(
        { version: input.version, tarball, integrity: signed },
        input.name,
        fetching,
      );
      unpack(folder, bytes, input.version);
      const journal = readJournal(folder);
      writeJournal(folder, { ...journal, staged: { ...journal.staged, [input.version]: signed } });
    });
  } catch (error) {
    if (error instanceof LockHeld) throw new BridgeRefusal("busy", error.message);
    throw error;
  }
}

/** The checksums releases unpacked here were checked against: the journal's, and the record's own. */
export function checksumsHere(folder: string): Record<string, string> {
  const record = readRecord(folder);
  return {
    ...(record === undefined || record.integrity === ""
      ? {}
      : { [record.version]: record.integrity }),
    ...readJournal(folder).staged,
  };
}

/**
 * Whether `version` is unpacked here from bytes whose SHA-512 is the signed one. A folder some
 * other fetch left (a connect by hand checks npm's checksum alone) is fetched and checked again.
 */
function checkedHere(folder: string, version: string, integrity: string): boolean {
  if (!unpackedHere(folder, version)) return false;
  const signed = integrity.split(/\s+/).find((each) => each.startsWith("sha512-"));
  const kept = checksumsHere(folder)[version];
  return signed !== undefined && kept?.split(/\s+/).includes(signed) === true;
}

/** npm's tarball for the release, when its checksum is the one the signed list names. */
function theSignedOne(
  manifest: FullManifest,
  input: { readonly name: string; readonly version: string; readonly integrity: string },
): { readonly tarball: string; readonly signed: string } {
  const listedIntegrity = manifest.dist?.integrity;
  const tarball = manifest.dist?.tarball;
  const signed = input.integrity.split(/\s+/).find((each) => each.startsWith("sha512-"));
  if (
    typeof listedIntegrity === "string" &&
    typeof tarball === "string" &&
    signed !== undefined &&
    listedIntegrity.split(/\s+/).includes(signed)
  ) {
    return { tarball, signed };
  }
  throw new BridgeRefusal(
    "checksum",
    `${input.name} ${input.version} on npm isn't the release Chips signed.`,
  );
}

/** Refused when this computer's Node is too old for the release, or its disk too full. */
function fitsHere(
  manifest: FullManifest,
  input: {
    readonly name: string;
    readonly version: string;
    readonly nodeVersion: string;
    readonly free?: ((folder: string) => number) | undefined;
  },
  folder: string,
): void {
  const node = manifest.engines?.node;
  if (typeof node === "string" && !nodeMeets(node, input.nodeVersion)) {
    throw new BridgeRefusal(
      "node",
      `${input.name} ${input.version} needs Node ${node}; this computer's is ${input.nodeVersion}.`,
    );
  }
  const size = manifest.dist?.unpackedSize;
  const needs = 3 * (typeof size === "number" && size > 0 ? size : ROOM_FALLBACK_BYTES);
  if ((input.free ?? freeBytes)(folder) < needs) {
    throw new BridgeRefusal("room", `The disk is too full for ${input.name} ${input.version}.`);
  }
}

/** The bytes, checked against the signed SHA-512; a refusal with its reason when they can't be had. */
async function downloadSigned(release: Listed, name: string, fetching: typeof fetch) {
  try {
    return await download(release, { name, major: semver(release.version)?.major ?? 0 }, fetching);
  } catch (error) {
    throw error instanceof BridgeError && /checksum/.test(error.message)
      ? new BridgeRefusal("checksum", error.message)
      : new BridgeRefusal("registry", error instanceof Error ? error.message : String(error));
  }
}

function freeBytes(folder: string): number {
  try {
    const stats = statfsSync(folder);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

interface FullManifest extends Manifest {
  readonly engines?: { readonly node?: unknown };
  readonly dist?: {
    readonly tarball?: unknown;
    readonly integrity?: unknown;
    readonly unpackedSize?: unknown;
  };
}

/** The registry's manifest of one release; a `registry` refusal when it can't be had. */
async function exactRelease(
  registry: string,
  name: string,
  version: string,
  fetching: typeof fetch,
): Promise<FullManifest> {
  let answer: Response;
  try {
    answer = await fetching(packumentUrl(registry, name), {
      headers: { accept: "application/vnd.npm.install-v1+json, application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new BridgeRefusal("registry", `Couldn't reach ${registry} (${String(error)}).`);
  }
  if (!answer.ok) {
    throw new BridgeRefusal("registry", `${registry} answered ${answer.status} for ${name}.`);
  }
  const versions = ((await answer.json()) as { versions?: Record<string, FullManifest> } | null)
    ?.versions;
  const manifest = versions?.[version];
  if (manifest === undefined) {
    throw new BridgeRefusal("registry", `${registry} has no ${name} ${version}.`);
  }
  return manifest;
}

/**
 * `package` pointed at a staged release and the one service started again on it. Every other
 * service kept on the package is written down as started on the release the link left, so the
 * files it runs stay until it restarts too. `trying` is in the journal before the link moves, so a
 * computer that stops halfway knows what to finish.
 */
export async function switchService(input: {
  readonly bridges: string;
  readonly name: string;
  readonly label: string;
  readonly version: string;
  readonly trying: BridgeTrying | null;
  readonly restart: (label: string) => Promise<boolean>;
}): Promise<boolean> {
  const folder = bridgeFolder(input.bridges, input.name);
  try {
    return await withLock(folder, async () => {
      adoptLayout(folder);
      // Refused before the journal is told anything is being tried: a `trying` left by a switch
      // that never happened would be "put back" five minutes on, and its release skipped a week.
      mustBeUnpacked(folder, input.version);
      const record = readRecord(folder);
      const journal = readJournal(folder);
      const startedOn = startedBefore(folder, record, journal);
      // The release it leaves keeps its checksum, for `bridge.json` if it is put back.
      const staged =
        record === undefined || record.integrity === ""
          ? journal.staged
          : { [record.version]: record.integrity, ...journal.staged };
      const { trying: _was, ...rest } = journal;
      writeJournal(folder, {
        ...rest,
        startedOn,
        ...(staged === undefined ? {} : { staged }),
        ...(input.trying === null ? {} : { trying: input.trying }),
      });
      pointTo(folder, input.version);
      if (record !== undefined && record.version !== input.version) {
        writeRecord(folder, {
          ...record,
          version: input.version,
          integrity: staged?.[input.version] ?? "",
        });
      }
      const started = await input.restart(input.label);
      const now = readJournal(folder);
      writeJournal(folder, {
        ...now,
        startedOn: { ...now.startedOn, [input.label]: input.version },
      });
      prune(folder);
      return started;
    });
  } catch (error) {
    if (error instanceof LockHeld) throw new BridgeRefusal("busy", error.message);
    throw error;
  }
}

/** Each kept service's release, the one the link points at for those no update started yet. */
function startedBefore(
  folder: string,
  record: BridgeRecord | undefined,
  journal: BridgeJournal,
): Record<string, string> {
  const startedOn: Record<string, string> = { ...journal.startedOn };
  const before = versionInUse(folder) ?? record?.version;
  if (before === undefined) return startedOn;
  for (const kept of Object.values(record?.kept ?? {})) startedOn[kept.label] ??= before;
  return startedOn;
}

/**
 * Services started again by hand (`chips connect`, `--update`) on the release in use, written in
 * the journal so the computer reads what they run: a service no update started is read as the
 * release in use only until the link moves.
 */
export function startedOnNow(folder: string, labels: readonly string[]): void {
  const version = versionInUse(folder);
  if (version === undefined || labels.length === 0) return;
  const journal = readJournal(folder);
  const startedOn = { ...journal.startedOn };
  for (const label of labels) startedOn[label] = version;
  writeJournal(folder, { ...journal, startedOn });
}

/**
 * A service that is no longer kept, off the journal: what it started on (so its files can go), how
 * its last update went, and a switch of it still being watched, which nothing can finish now and
 * which would hold every other service on the package back.
 */
export function forgetService(folder: string, label: string): void {
  const { trying, startedOn, last, proving, ...journal } = readJournal(folder);
  const without = <T>(map: Readonly<Record<string, T>> | undefined) => {
    if (map === undefined) return undefined;
    const { [label]: _gone, ...rest } = map;
    return rest;
  };
  const started = without(startedOn);
  const outcomes = without(last);
  const firstDays = without(proving);
  writeJournal(folder, {
    ...journal,
    ...(started === undefined ? {} : { startedOn: started }),
    ...(outcomes === undefined ? {} : { last: outcomes }),
    ...(firstDays === undefined || Object.keys(firstDays).length === 0
      ? {}
      : { proving: firstDays }),
    ...(trying === undefined || trying.label === label ? {} : { trying }),
  });
}

/** A service's first day begun, or ended: the map with it in, or without it. */
function provingWith(
  proving: Readonly<Record<string, BridgeProving>> | undefined,
  change: JournalChange["proving"],
): Readonly<Record<string, BridgeProving>> | undefined {
  if (change === undefined) return proving;
  const { [change.label]: _was, ...rest } = proving ?? {};
  const next = change.said === null ? rest : { ...rest, [change.label]: change.said };
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * What the journal is told: a skip added, `trying` set or cleared, a service's outcome kept, its
 * first day on a release begun or ended.
 */
export async function noteJournal(
  bridges: string,
  name: string,
  change: JournalChange,
): Promise<void> {
  const folder = bridgeFolder(bridges, name);
  await withLock(folder, () => {
    const { trying, proving, ...journal } = readJournal(folder);
    const keptTrying = change.trying === undefined ? trying : (change.trying ?? undefined);
    const firstDays = provingWith(proving, change.proving);
    writeJournal(folder, {
      ...journal,
      ...(keptTrying === undefined ? {} : { trying: keptTrying }),
      ...(firstDays === undefined ? {} : { proving: firstDays }),
      ...(change.skip === undefined
        ? {}
        : { skips: { ...journal.skips, [change.skip.version]: change.skip.until } }),
      ...(change.outcome === undefined
        ? {}
        : { last: { ...journal.last, [change.outcome.label]: change.outcome.said } }),
    });
  });
}

/** The registry's address for a package's versions: `@chipschat%2fhermes`. */
function packumentUrl(registry: string, name: string): string {
  const path = name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);
  return `${registry.replace(/\/+$/, "")}/${path}`;
}

/** What a registry lists of a package, said plainly when it can't be reached or has none. */
async function listed(registry: string, spec: PackageSpec, fetching: typeof fetch) {
  const where = packumentUrl(registry, spec.name);
  let answer: Response;
  try {
    answer = await fetching(where, {
      headers: { accept: "application/vnd.npm.install-v1+json, application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new BridgeError(
      `Couldn't reach ${registry} for ${spec.name} (${String(error)}). Check this machine's connection, then run the same line again.`,
    );
  }
  if (answer.status === 404) {
    throw new BridgeError(`${registry} has no package ${spec.name}.`);
  }
  if (!answer.ok) {
    throw new BridgeError(
      `${registry} answered ${answer.status} for ${spec.name}. Try again soon.`,
    );
  }
  const release = newestInMajor(await answer.json(), spec.major);
  if (release === undefined) {
    throw new BridgeError(`${registry} has no release ${spec.major}.x of ${spec.name}.`);
  }
  return release;
}

/** How often a download says how far it is, at most. */
const PROGRESS_MS = 100;

/** A download's bytes as they come, `onProgress` told how many so far, of how many when it is said. */
async function received(
  answer: Response,
  onProgress: ((received: number, total: number | undefined) => void) | undefined,
): Promise<Uint8Array> {
  if (onProgress === undefined || answer.body === null) {
    return new Uint8Array(await answer.arrayBuffer());
  }
  const said = Number(answer.headers.get("content-length"));
  const total = Number.isFinite(said) && said > 0 ? said : undefined;
  const reader = answer.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    count += value.length;
    if (count > TARBALL_MAX_BYTES) break;
    if (Date.now() - last >= PROGRESS_MS) {
      last = Date.now();
      onProgress(count, total);
    }
  }
  onProgress(count, total);
  return Buffer.concat(chunks);
}

async function download(
  release: Listed,
  spec: PackageSpec,
  fetching: typeof fetch,
  onProgress?: (received: number, total: number | undefined) => void,
) {
  let answer: Response;
  try {
    answer = await fetching(release.tarball, { signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    throw new BridgeError(`Couldn't download ${spec.name} ${release.version} (${String(error)}).`);
  }
  if (!answer.ok) {
    throw new BridgeError(
      `Couldn't download ${spec.name} ${release.version}: ${answer.status} from ${release.tarball}.`,
    );
  }
  const bytes = await received(answer, onProgress);
  if (bytes.length > TARBALL_MAX_BYTES) {
    throw new BridgeError(`${spec.name} ${release.version} is over ${TARBALL_MAX_BYTES} bytes.`);
  }
  if (!integrityMatches(bytes, release.integrity)) {
    throw new BridgeError(
      `${spec.name} ${release.version} does not match the registry's checksum, so nothing of it was unpacked.`,
    );
  }
  return bytes;
}

/**
 * The tarball unpacked as `<folder>/package-<version>`, beside what is there. Nothing in use is
 * touched: `pointTo` moves the link, and `stage` alone leaves it where it is.
 */
export function unpack(folder: string, bytes: Uint8Array, version: string): void {
  if (!SAFE_VERSION.test(version)) throw new BridgeError(`${version} is not a version.`);
  mkdirSync(folder, { recursive: true });
  adoptLayout(folder);
  const target = join(folder, `${LINK}-${version}`);
  const work = mkdtempSync(join(folder, ".unpacking-"));
  try {
    writeFileSync(join(work, "bridge.tgz"), bytes);
    execFileSync("tar", ["-xzf", join(work, "bridge.tgz"), "-C", work], { stdio: "ignore" });
    if (!existsSync(join(work, "package", "package.json"))) {
      throw new BridgeError("The download holds no package.");
    }
    if (versionInUse(folder) !== version) rmSync(target, { recursive: true, force: true });
    if (!existsSync(target)) renameSync(join(work, "package"), target);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export interface Fetched {
  readonly folder: string;
  readonly version: string;
  /** It was here already, the same version and checksum, and nothing was downloaded. */
  readonly reused: boolean;
}

/**
 * The newest release of the card's major, here: the one already unpacked when it is that one,
 * else downloaded, checked against the registry's SHA-512 and unpacked in its place. `onRelease`
 * hears which version it is before it is downloaded.
 */
export async function fetchBridge(input: {
  readonly registry: string;
  readonly spec: PackageSpec;
  readonly bridges: string;
  readonly fetch?: typeof fetch | undefined;
  readonly onRelease?: ((version: string, reused: boolean) => void) | undefined;
  /** How much of the download is here, as it comes. */
  readonly onProgress?: ((received: number, total: number | undefined) => void) | undefined;
}): Promise<Fetched> {
  const { spec } = input;
  const fetching = input.fetch ?? fetch;
  const folder = bridgeFolder(input.bridges, spec.name);
  const release = await listed(input.registry, spec, fetching);
  const record = readRecord(folder);
  const here =
    record?.version === release.version &&
    record.integrity === release.integrity &&
    existsSync(join(folder, "package", "package.json"));
  input.onRelease?.(release.version, here);
  if (here) return { folder, version: release.version, reused: true };
  const bytes = await download(release, spec, fetching, input.onProgress);
  await withLock(folder, () => {
    unpack(folder, bytes, release.version);
    pointTo(folder, release.version);
    prune(folder);
    writeRecord(folder, {
      package: spec.name,
      version: release.version,
      integrity: release.integrity,
      kept: readRecord(folder)?.kept ?? record?.kept ?? {},
    });
  });
  return { folder, version: release.version, reused: false };
}

/** The file a bridge runs from: its package's one `bin`, a `.js` file inside the package. */
export function bridgeMain(folder: string): string {
  const root = join(folder, "package");
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    bin?: unknown;
  };
  const bins =
    typeof manifest.bin === "string"
      ? [manifest.bin]
      : Object.values((manifest.bin ?? {}) as Record<string, unknown>);
  const [bin] = bins;
  const main = typeof bin === "string" ? resolve(root, bin) : undefined;
  if (
    bins.length !== 1 ||
    main === undefined ||
    !main.endsWith(".js") ||
    relative(root, main).startsWith("..")
  ) {
    throw new BridgeError(
      `${folder} holds no bridge Chips can run: its package has no one .js bin.`,
    );
  }
  return main;
}

/** A step a bridge said, as `chips-step {…}` on its standard output (the SDK's `reportStep`). */
export interface BridgeStep {
  readonly step: string;
  readonly [detail: string]: unknown;
}

export interface BridgeRun {
  /** Its exit code; 1 when it was stopped by a signal. */
  readonly code: number;
  /** What it wrote to standard error: its sentence, when it stops. */
  readonly said: string;
}

/** The step in a line, or nothing for a line of the bridge's own. */
export function stepIn(line: string): BridgeStep | undefined {
  if (!line.startsWith(STEP_MARK)) return undefined;
  try {
    const step = JSON.parse(line.slice(STEP_MARK.length)) as unknown;
    return typeof step === "object" &&
      step !== null &&
      typeof (step as BridgeStep).step === "string"
      ? (step as BridgeStep)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Calls `each` with every whole line, and the rest when the stream ends. */
function lines(stream: NodeJS.ReadableStream, each: (line: string) => void): Promise<void> {
  let held = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    held += chunk;
    const parts = held.split("\n");
    held = parts.pop() ?? "";
    for (const part of parts) each(part);
  });
  return new Promise((done) =>
    stream.once("close", () => {
      if (held !== "") each(held);
      done();
    }),
  );
}

/** How long to go on reading once a bridge has ended: a child it left may hold its output open. */
const LAST_WORDS_MS = 500;

/**
 * The bridge run on `node` with `words`, in `env`, until it ends: each step to `onStep`, each
 * line of its own to `onLine`. Nothing reaches its standard input.
 */
export async function runBridge(input: {
  readonly node: string;
  readonly main: string;
  readonly words: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly onStep: (step: BridgeStep) => void;
  readonly onLine: (stream: "out" | "err", line: string) => void;
}): Promise<BridgeRun> {
  const child = spawn(input.node, [input.main, ...input.words], {
    cwd: dirname(dirname(input.main)),
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let said = "";
  const exited = new Promise<number>((done) => {
    child.once("error", () => done(1));
    child.once("exit", (code) => done(code ?? 1));
  });
  const read = Promise.all([
    lines(child.stdout, (line) => {
      const step = stepIn(line);
      if (step === undefined) input.onLine("out", line);
      else input.onStep(step);
    }),
    lines(child.stderr, (line) => {
      said += `${line}\n`;
      input.onLine("err", line);
    }),
  ]);
  const code = await exited;
  await Promise.race([read, new Promise((done) => setTimeout(done, LAST_WORDS_MS))]);
  return { code, said: said.trim() };
}
