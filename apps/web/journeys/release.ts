/**
 * The release a journey walks, and a home to install it into. Shared by the journeys; nothing
 * here knows what a journey checks.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

export const REPO = join(import.meta.dirname, "..", "..", "..");
const TARGET = `${process.platform}-${process.arch}`;

/** `CHIPS_JOURNEY_TARBALL`, or the newest release built here for this platform. */
export function tarball(): string {
  // biome-ignore lint/style/noProcessEnv: the journeys are told which release to walk.
  const given = process.env["CHIPS_JOURNEY_TARBALL"];
  if (given !== undefined && given !== "") return given;
  const dir = join(REPO, "dist", "release");
  const built = existsSync(dir)
    ? readdirSync(dir).filter((file) => file.endsWith(`-${TARGET}.tar.gz`))
    : [];
  const newest = built
    .map((file) => join(dir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (newest === undefined) {
    throw new Error(
      `No release for ${TARGET} in dist/release: run \`node tools/release/build.mjs\`.`,
    );
  }
  return newest;
}

/** A home with nothing in it, as a machine that has never had Chips. */
export function freshHome(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "chips-journey-")));
}

/**
 * Only the system's own tools: no Node, no pnpm, nothing a checkout would bring. A key a harness is
 * handed goes to a file under the home, never into this Mac's keychain.
 */
export function bareEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    LANG: "en_US.UTF-8",
    CHIPS_NO_KEYCHAIN: "true",
  };
}

export interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * A line a person copies out of Chips, run as they would run it: in `sh`, with the installed
 * `chips` on the `PATH` and whatever they exported first.
 */
export function shell(home: string, script: string, exported: Record<string, string> = {}): Ran {
  const bare = bareEnvironment(home);
  const ran = spawnSync("sh", ["-c", script], {
    cwd: home,
    env: { ...bare, ...exported, PATH: `${join(home, ".local", "bin")}:${bare["PATH"]}` },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

/**
 * `shell`, but without holding this process while it runs: for a line that calls back into a server
 * the journey itself runs (a stand-in npm registry, a host for `install.sh`).
 */
export function shellAsync(
  home: string,
  script: string,
  exported: Record<string, string> = {},
): Promise<Ran> {
  const bare = bareEnvironment(home);
  const child = spawn("sh", ["-c", script], {
    cwd: home,
    env: { ...bare, ...exported, PATH: `${join(home, ".local", "bin")}:${bare["PATH"]}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 60_000);
  return new Promise((resolve) => {
    child.once("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

export interface Asking {
  /** The code it printed for a person to compare. */
  readonly code: Promise<string>;
  /** How it ended, once a person decided. */
  readonly done: Promise<Ran>;
}

/** `chips join <address>`, asking in the background while a person decides in the browser. */
export function asking(home: string, ...args: string[]): Asking {
  const child = spawn(join(home, ".local", "bin", "chips"), ["join", ...args], {
    cwd: home,
    env: bareEnvironment(home),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  const done = new Promise<Ran>((resolve) => {
    child.once("exit", (status) => resolve({ status, stdout, stderr }));
  });
  const code = new Promise<string>((resolve, reject) => {
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const shown = /Its code is ([A-Z2-9]{3}-[A-Z2-9]{3})/.exec(stderr);
      if (shown?.[1] !== undefined) resolve(shown[1]);
    });
    void done.then((ended) =>
      reject(new Error(`chips join ended before it showed a code:\n${ended.stderr}`)),
    );
  });
  return { code, done };
}

export function install(home: string, from: string): { status: number | null; output: string } {
  const ran = spawnSync(
    "sh",
    [join(REPO, "packaging", "install.sh"), "--from", from, "--no-path"],
    {
      env: bareEnvironment(home),
      encoding: "utf8",
    },
  );
  return { status: ran.status, output: `${ran.stdout}${ran.stderr}` };
}

export function chips(home: string, ...args: string[]): { status: number | null; output: string } {
  const ran = spawnSync(join(home, ".local", "bin", "chips"), args, {
    cwd: home,
    env: bareEnvironment(home),
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: ran.status, output: `${ran.stdout}${ran.stderr}` };
}

export interface Upped {
  readonly process: ChildProcess;
  readonly said: Record<string, unknown>;
}

/** `chips up … --json` in the background, once it has said where it is. */
export function up(home: string, ...args: string[]): Promise<Upped> {
  const child = spawn(
    join(home, ".local", "bin", "chips"),
    ["up", "--json", "--no-open", ...args],
    {
      cwd: home,
      env: bareEnvironment(home),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(
      () => reject(new Error(`chips up said nothing in 60 s:\n${out}${err}`)),
      60_000,
    );
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const line = out.split("\n").find((each) => each.startsWith("{"));
      if (line === undefined) return;
      clearTimeout(timer);
      resolve({ process: child, said: JSON.parse(line) as Record<string, unknown> });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!out.includes("{")) reject(new Error(`chips up exited ${code}:\n${out}${err}`));
    });
  });
}

export async function stop(upped: Upped | undefined): Promise<void> {
  const child = upped?.process;
  if (child === undefined || child.exitCode !== null) return;
  const gone = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await gone;
}

/** Every file under a home, relative to it: what a journey left behind. */
export function filesUnder(home: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(home, path));
    }
  };
  walk(home);
  return found.sort();
}
