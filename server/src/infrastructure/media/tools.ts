/**
 * How the server runs a media tool on a file somebody sent: ffmpeg and ffprobe for video
 * (ADR 0053), whisper for what was said in a voice note (ADR 0054). Decoding such a file is the
 * riskiest thing the server does, so no tool runs in this process. Each run is a child spawned
 * with no shell, no stdin and an environment of `PATH` alone, at a lower priority than the server.
 * It reads and writes only a private directory made for that run and deleted after it, and is
 * killed outright when its time is up. Memory is not bounded: macOS has no per-process limit that
 * holds.
 */

import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { setPriority, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

/** Where Homebrew puts a tool, since a launch agent's `PATH` does not reach there. */
const FALLBACK_DIRECTORIES = ["/opt/homebrew/bin", "/usr/local/bin"];

/** A run's standard output is ffprobe's JSON, which is small; a megabyte is plenty. */
const STDOUT_CAP = 1024 * 1024;

/** What a run printed on stderr, kept to its end, for the note and the log. */
const STDERR_TAIL = 2048;

/** Below the server's own priority, so a transcode never starves a request. */
const NICENESS = 10;

export class MediaError extends Error {
  override readonly name = "MediaError";
}

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * A tool, where it was named, else on `PATH`, else where Homebrew puts it. Nothing when it cannot
 * be found, or when the one named cannot be run. Always an absolute path: a run starts in its own
 * private directory, where a path relative to the server's names nothing.
 */
export function findTool(
  name: string,
  options: { readonly named?: string | undefined; readonly path?: string | undefined },
): string | undefined {
  if (options.named !== undefined) {
    return isExecutable(options.named) ? resolve(options.named) : undefined;
  }
  const directories = [...(options.path ?? "").split(delimiter), ...FALLBACK_DIRECTORIES].filter(
    (directory) => directory !== "",
  );
  return directories.map((directory) => resolve(directory, name)).find(isExecutable);
}

export interface Ran {
  readonly code: number | null;
  readonly stdout: Buffer;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** What a child is given to find anything by, when the server's own `PATH` is not passed. */
const PLAIN_PATH = "/usr/bin:/bin";

/** One run of a tool under the limits above. */
export function runTool(
  tool: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs: number; readonly path?: string | undefined },
): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
      cwd: options.cwd,
      // Its whole environment: nothing of the server's, where a token or a secret could be.
      env: { PATH: options.path ?? PLAIN_PATH },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    try {
      if (child.pid !== undefined) setPriority(child.pid, NICENESS);
    } catch {
      // Lowering a child's priority can be refused; the timeout still holds.
    }
    const out: Buffer[] = [];
    let outBytes = 0;
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (outBytes >= STDOUT_CAP) return;
      out.push(chunk);
      outBytes += chunk.byteLength;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err = (err + chunk.toString("utf8")).slice(-STDERR_TAIL);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err.trim(), timedOut });
    });
  });
}

/** The bytes in a private directory for one piece of work, and the directory gone after it. */
export async function inScratch<T>(
  bytes: Uint8Array,
  work: (directory: string, input: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "chips-media-"));
  try {
    const input = join(directory, "input");
    await writeFile(input, bytes, { mode: 0o600 });
    return await work(directory, input);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * An ffmpeg run's options up to its input: nothing but a file, nothing asked of a terminal, and
 * whatever else must come before `-i`.
 */
export const readOnlyFile = (input: string, before: readonly string[] = []) => [
  "-hide_banner",
  "-v",
  "error",
  "-nostdin",
  "-protocol_whitelist",
  "file",
  ...before,
  "-i",
  input,
];

/** Whether a run came to an end on its own and said it succeeded. */
export const succeeded = (ran: Ran | undefined): ran is Ran =>
  ran !== undefined && !ran.timedOut && ran.code === 0;
