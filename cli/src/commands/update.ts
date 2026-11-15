/**
 * `chips update`: this computer brought to the newest release, as the install line would, and its
 * server started again on it (everything in step, phase 6). It runs the install line this release
 * carries, `<release>/install.sh`, so the download is checked with the key this computer was
 * installed with, never a script fetched now. The bridges are left to the computer, which moves
 * them only to releases Chips signed (`--no-bridges`), and nothing is downloaded when the newest is
 * the one here (`--if-newer`). Then the new release's `chips up` starts the server again, which it
 * does for a service of its own running another version.
 *
 * What happened is written to `<data>/update.json` before the server goes, for the next server to
 * say: About's computer row reads it. The owner's night switch runs this; so can anyone, by hand.
 * Only for the install line: Chips for Mac updates itself, and a checkout is updated with git.
 */

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { RestartOnto, SelfUpdate, SelfUpdateOutcome } from "@chipschat/server";
import { writeWhole } from "../bridges.js";
import type { Console } from "../output.js";
import type { Release } from "../release.js";

export const UPDATE_FILE = "update.json";

/** Where a release from the install line lives: `<prefix>/lib/chips/<version>`, else none. */
export function prefixOf(root: string): string | undefined {
  const chips = dirname(root);
  const lib = dirname(chips);
  return basename(chips) === "chips" && basename(lib) === "lib" ? dirname(lib) : undefined;
}

/** A release Chips for Mac carries inside the app. */
export function inMacApp(root: string): boolean {
  return /\.app\/Contents\/Resources\/chips\/?$/.test(root);
}

const STATES: ReadonlySet<unknown> = new Set(["updating", "updated", "current", "failed"]);

export function readUpdate(dataDir: string): SelfUpdateOutcome | undefined {
  try {
    const read = JSON.parse(readFileSync(join(dataDir, UPDATE_FILE), "utf8")) as Record<
      string,
      unknown
    >;
    if (!STATES.has(read["state"]) || typeof read["from"] !== "string") return undefined;
    if (typeof read["at"] !== "string") return undefined;
    return {
      state: read["state"] as SelfUpdateOutcome["state"],
      from: read["from"],
      at: read["at"],
      ...(typeof read["to"] === "string" ? { to: read["to"] } : {}),
      ...(typeof read["why"] === "string" ? { why: read["why"] } : {}),
    };
  } catch {
    return undefined;
  }
}

/** How long `chips update` may say it is going before it is read as one that stopped halfway. */
export const UPDATING_FOR_MS = 60 * 60_000;
export const STOPPED_HALFWAY = "The update stopped before it finished.";
/** How long a server may go on running the release before, once the new one is installed. */
export const RESTART_FOR_MS = 10 * 60_000;
export const notStartedAgain = (to: string) =>
  `Chips ${to} is installed, but this computer hasn't started again on it. Run chips up.`;

/**
 * What `update.json` says, as it stands for the release running now.
 * - An update that couldn't, or was going, from a release this computer has since left (the install
 *   line run by hand) is about nothing here any more.
 * - One still "updating" after an hour was cut off (the power, a kill): it is said as failed, so
 *   the next night tries again instead of waiting on it for good.
 * - One that says "updated" while this computer still runs the release before, ten minutes on, did
 *   install and never started again: a server `chips up` doesn't keep (run by hand, in a container)
 *   or one that wouldn't start. That is a failure, with what to do.
 */
export function outcomeHere(
  outcome: SelfUpdateOutcome | undefined,
  version: string,
  now: number,
): SelfUpdateOutcome | undefined {
  if (outcome === undefined) return undefined;
  const age = now - Date.parse(outcome.at);
  if (outcome.state === "updated") return updatedHere(outcome, version, age);
  const unsettled = outcome.state === "failed" || outcome.state === "updating";
  if (unsettled && outcome.from !== version) return undefined;
  if (outcome.state === "updating" && age >= UPDATING_FOR_MS) {
    return { state: "failed", from: outcome.from, at: outcome.at, why: STOPPED_HALFWAY };
  }
  return outcome;
}

/** An "updated" outcome: true of the release it went to, a failure on the one it left, else stale. */
function updatedHere(
  outcome: SelfUpdateOutcome,
  version: string,
  age: number,
): SelfUpdateOutcome | undefined {
  if (outcome.to === undefined || outcome.to === version) return outcome;
  if (outcome.from !== version) return undefined;
  if (age < RESTART_FOR_MS) return outcome;
  return {
    state: "failed",
    from: outcome.from,
    to: outcome.to,
    at: outcome.at,
    why: notStartedAgain(outcome.to),
  };
}

function writeUpdate(dataDir: string, outcome: SelfUpdateOutcome): void {
  // By hand on a computer that never served, the folder may not be there yet.
  mkdirSync(dataDir, { recursive: true });
  writeWhole(join(dataDir, UPDATE_FILE), `${JSON.stringify(outcome, null, 2)}\n`);
}

export interface Ran {
  readonly code: number;
  /** Its last line said, for why it failed. */
  readonly last: string;
}

/** A command run to its end, its lines passed on as they come. */
export function runPassing(
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  onLine: (line: string) => void,
): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(command, [...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let last = "";
    const lines = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim() === "") continue;
        last = line.trim();
        onLine(line);
      }
    };
    child.stdout.on("data", lines);
    child.stderr.on("data", lines);
    child.on("error", (error) => done({ code: 1, last: error.message }));
    child.on("close", (code) => done({ code: code ?? 1, last }));
  });
}

export interface UpdateDeps {
  readonly release: Release | undefined;
  readonly dataDir: string;
  readonly console: Console;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly now?: (() => string) | undefined;
  readonly run?: typeof runPassing | undefined;
}

export async function updateComputer(deps: UpdateDeps): Promise<number> {
  const out = deps.console;
  const now = deps.now ?? (() => new Date().toISOString());
  const run = deps.run ?? runPassing;
  const release = deps.release;
  if (release === undefined) {
    out.err("This chips runs from a checkout: update it with git, then run chips up.");
    return 1;
  }
  if (inMacApp(release.root)) {
    out.err("This chips is Chips for Mac's own, which updates with the app.");
    return 1;
  }
  const prefix = prefixOf(release.root);
  const script = join(release.root, "install.sh");
  const from = release.version;
  if (prefix === undefined || !existsSync(script)) {
    const why =
      "This release carries no install line to update with. Run the line from chipschat.ai/download once.";
    writeUpdate(deps.dataDir, { state: "failed", from, at: now(), why });
    out.err(why);
    return 1;
  }
  writeUpdate(deps.dataDir, { state: "updating", from, at: now() });
  const installed = await run(
    "/bin/sh",
    [script, "--no-path", "--no-bridges", "--if-newer"],
    { ...deps.env, CHIPS_PREFIX: prefix },
    (line) => out.out(line),
  );
  if (installed.code !== 0) {
    writeUpdate(deps.dataDir, { state: "failed", from, at: now(), why: installed.last });
    return installed.code;
  }
  let to: string;
  try {
    to = basename(readlinkSync(join(prefix, "lib", "chips", "current")));
  } catch {
    to = from;
  }
  if (to === from) {
    writeUpdate(deps.dataDir, { state: "current", from, at: now() });
    out.out(`  chips ${from} is the newest.`);
    return 0;
  }
  // Written before the server goes: the one that starts next reads it.
  writeUpdate(deps.dataDir, { state: "updated", from, to, at: now() });
  const up = await run(
    join(prefix, "lib", "chips", "current", "bin", "chips"),
    ["up", "--no-open", "--json"],
    deps.env,
    (line) => out.out(line),
  );
  if (up.code !== 0) {
    // Installed, and the server didn't start again on it: said as it is, with why.
    const why = up.last === "" ? notStartedAgain(to) : up.last;
    writeUpdate(deps.dataDir, { state: "failed", from, to, at: now(), why });
  }
  return up.code;
}

/**
 * The hands a server from the install line gets on its own update: `chips update` started apart
 * from it, so it lives through the server it stops. On Linux in a unit of its own, since stopping a
 * user service ends every process it started; elsewhere in a session of its own. Its lines go to
 * the server's log, or to the journal from a unit of its own.
 */
export function selfUpdateHere(input: {
  readonly release: Release;
  readonly dataDir: string;
  readonly logFile: string;
  readonly platform: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly hasSystemdRun: () => boolean;
}): SelfUpdate | undefined {
  if (inMacApp(input.release.root) || prefixOf(input.release.root) === undefined) return undefined;
  const chips = resolve(input.release.root, "bin", "chips");
  return {
    last: () => outcomeHere(readUpdate(input.dataDir), input.release.version, Date.now()),
    start: () => {
      const log = openSync(input.logFile, "a");
      try {
        const [command, args] =
          input.platform === "linux" && input.hasSystemdRun()
            ? ["systemd-run", unitArgs(chips, input.dataDir, input.env)]
            : [chips, ["update"]];
        const child = spawn(command, args, {
          env: { ...input.env, CHIPS_DATA_DIR: input.dataDir },
          detached: true,
          stdio: ["ignore", log, log],
        });
        // A command that isn't there says so as an event: unheard, it would end the server.
        child.on("error", () => undefined);
        child.unref();
      } finally {
        closeSync(log);
      }
    },
  };
}

/**
 * `systemd-run`'s arguments for `chips update` in a unit of its own. The unit starts with the user
 * manager's environment, not this server's, so the server's own settings are handed over by name:
 * its data folder, where the outcome is written for it to read, and every `CHIPS_` setting.
 */
export function unitArgs(
  chips: string,
  dataDir: string,
  env: Readonly<Record<string, string | undefined>>,
  unit = `chips-update-${Date.now()}`,
): string[] {
  const settings = Object.entries({ ...env, CHIPS_DATA_DIR: dataDir })
    .filter((entry): entry is [string, string] => {
      const [key, value] = entry;
      return key.startsWith("CHIPS_") && value !== undefined && !value.includes("\n");
    })
    .map(([key, value]) => `--setenv=${key}=${value}`);
  return ["--user", "--collect", "--quiet", `--unit=${unit}`, ...settings, chips, "update"];
}

/** A release's version as its `VERSION` says it, or nothing where it says none. */
export function versionIn(root: string): string | undefined {
  try {
    const said = readFileSync(join(root, "VERSION"), "utf8").trim();
    return /^\d+\.\d+\.\d+$/.test(said) ? said : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The hands a computer Chips for Mac carries gets on starting again (ADR 0298): the version of the
 * release the app holds now, read from its `VERSION`, and its login service started again with
 * `launchctl kickstart -k`, which ends this process and starts the new release's. `launchctl` runs
 * in a process group of its own, so it outlives the process it ends. None for any other release.
 */
export function restartOntoHere(input: {
  readonly release: Release;
  readonly restart: readonly string[];
}): RestartOnto | undefined {
  if (!inMacApp(input.release.root)) return undefined;
  const [command, ...args] = input.restart;
  if (command === undefined) return undefined;
  return {
    onDisk: () => versionIn(input.release.root),
    restart: () => {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      // A command that isn't there says so as an event: unheard, it would end the server.
      child.on("error", () => undefined);
      child.unref();
    },
  };
}
