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
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { STEP_MARK } from "@chipschat/harness";

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

export function writeRecord(folder: string, record: BridgeRecord): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, RECORD), `${JSON.stringify(record, null, 2)}\n`);
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

/** The tarball unpacked as `<folder>/package`, in place of what was there, in one rename. */
function unpack(folder: string, bytes: Uint8Array): void {
  mkdirSync(folder, { recursive: true });
  const work = mkdtempSync(join(folder, ".unpacking-"));
  try {
    writeFileSync(join(work, "bridge.tgz"), bytes);
    execFileSync("tar", ["-xzf", join(work, "bridge.tgz"), "-C", work], { stdio: "ignore" });
    if (!existsSync(join(work, "package", "package.json"))) {
      throw new BridgeError("The download holds no package.");
    }
    const old = join(work, "old");
    if (existsSync(join(folder, "package"))) renameSync(join(folder, "package"), old);
    renameSync(join(work, "package"), join(folder, "package"));
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
  unpack(folder, await download(release, spec, fetching, input.onProgress));
  writeRecord(folder, {
    package: spec.name,
    version: release.version,
    integrity: release.integrity,
    kept: record?.kept ?? {},
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
