/**
 * Run (ADRs 0226, 0227, 0230): the room's project run on the Mac from Your folder, as its agents
 * said to in its run file, `.chips/run.json` (or `chips.json` at the top, where it was kept before).
 * `run` is one shell command, started in the folder with the person's own login shell and left
 * running, detached, until Stop; `setup`, when it changed, runs first and is waited for. What the
 * program prints that it listens on is opened once it answers, else `opens`. What a run prints goes
 * to a log beside the person's runs, never into the folder, so it never reads as a change of
 * theirs, and a run that went wrong says what in plain words (`run-trouble.ts`).
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync } from "node:fs";
import { appendFile, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  commandOf,
  opensAProgram,
  opensShown,
  type ProjectRun,
  RUN_FILE,
  RUN_FILE_BEFORE,
  type RunRecipe,
  runRecipe,
} from "@chipschat/protocol";
import {
  type Holder,
  heldElsewhereWords,
  holderOf,
  plainOf,
  printedAddress,
  troubleOf,
  unansweredWords,
} from "./run-trouble.js";

/** How long a run is given to answer at `opens` before it is left to itself. */
const READY_MS = 30_000;
/**
 * How long a program is given to print its address where what the run file opens was somebody
 * else's before it started, so only a printed address can be opened: a server prints its address
 * as it starts listening, and Sudoku's row said only "Starting" for the 30 seconds (ADR 0230).
 */
const PRINTS_MS = 5000;
/** How long setup may take: an install. */
const SETUP_MS = 10 * 60_000;
const LINES = 20;
/** The longest line of a run's that goes to the person's other devices. */
const LINE_MOST = 400;

/**
 * The run file in the folder: its recipe, nothing when there is none, or what is wrong with it.
 * `.chips/run.json`, or, with none, `chips.json` at the top.
 */
export async function readRecipe(
  folder: string,
): Promise<RunRecipe | { readonly why: string } | undefined> {
  for (const file of [RUN_FILE, RUN_FILE_BEFORE]) {
    try {
      return runRecipe(await readFile(join(folder, file), "utf8"), file);
    } catch {
      // Not there: the one it was kept in before, or nothing.
    }
  }
  return undefined;
}

/** Where a room's runs keep their log and what they were: beside the person's other caches. */
export function runsOf(home: string, spaceId: string): string {
  return join(home, "Library", "Caches", "chat.chips", "runs", spaceId);
}

export interface RunDeps {
  readonly home: string;
  readonly spaceId: string;
  /** `/usr/bin/open` with these words. */
  readonly open: (args: readonly string[]) => Promise<void>;
  /** The `PATH` a run starts with, before its login shell adds the person's own. */
  readonly path: string;
  /** The environment it starts with; what the app handed over for the folder is left out. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The shell a run starts in. */
  readonly shell?: string | undefined;
  readonly now?: (() => number) | undefined;
  /** Whether something answers at an address yet. */
  readonly answers?: ((url: string) => Promise<boolean>) | undefined;
  readonly readyMs?: number | undefined;
  /** The program holding a port, for a run that found its port taken. */
  readonly holder?: Holder | undefined;
}

const files = (deps: RunDeps) => {
  const at = runsOf(deps.home, deps.spaceId);
  return {
    at,
    pid: join(at, "pid"),
    exit: join(at, "exit"),
    since: join(at, "since"),
    stopped: join(at, "stopped"),
    command: join(at, "command"),
    /** The room's `main` the folder had when it started (SEC-40). */
    commit: join(at, "commit"),
    opened: join(at, "opened"),
    /** There when Run only opened a file: pages that need no starting. */
    only: join(at, "only"),
    /** There when, before ADR 0230, what it opens already answered and Run started nothing. */
    already: join(at, "already"),
    /** There when a run going on went wrong (nothing answered, the browser refused): in its words. */
    trouble: join(at, "trouble"),
    /** What the run file opens, for the port a run that found it taken was after. */
    expects: join(at, "expects"),
    setup: join(at, "setup"),
    log: join(at, "log"),
  };
};

async function read(path: string): Promise<string | undefined> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return undefined;
  }
}

/** Where the shell writes how the run's command ended. */
const EXIT = "CHIPS_RUN_EXIT";

/** A run's shell: its process id, and when that process started, which an id taken over doesn't share. */
interface Shell {
  readonly pid: number;
  readonly began: string;
}

/** When a process started, as `ps` tells it, or nothing when there is no such process. */
function beganOf(pid: number): string | undefined {
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  const said = spawnSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
  const began = said.status === 0 ? said.stdout.trim() : "";
  return began === "" ? undefined : began;
}

async function shellOf(at: string): Promise<Shell | undefined> {
  const [pid, began] = ((await read(at)) ?? "").split("\n");
  return began === undefined ? undefined : { pid: Number(pid), began };
}

/**
 * Whether the run's shell is still going: the same process, started when it was, so one that took
 * its id over after a restart is never stopped.
 */
function alive(shell: Shell | undefined): shell is Shell {
  return shell !== undefined && beganOf(shell.pid) === shell.began;
}

/** The last lines of a run's log, without the colours a terminal would draw. */
async function lastLines(log: string): Promise<string[]> {
  return plainOf((await read(log)) ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-LINES)
    .map((line) => (line.length > LINE_MOST ? `${line.slice(0, LINE_MOST - 1)}…` : line));
}

/** How the room's last run on this Mac stands. */
export async function runStatus(deps: RunDeps): Promise<ProjectRun> {
  const at = files(deps);
  const command = await read(at.command);
  if (command === undefined) return { state: "never" };
  const shell = await shellOf(at.pid);
  const since = await read(at.since);
  const opened = await read(at.opened);
  const commit = await read(at.commit);
  const base = {
    command,
    ...(commit === undefined ? {} : { commit }),
    ...(since === undefined ? {} : { since }),
    ...(opened === undefined ? {} : { opened }),
  };
  const trouble = await read(at.trouble);
  const said = trouble === undefined ? {} : { trouble };
  if (alive(shell)) {
    if (trouble === undefined) return { state: "running", ...base };
    return { state: "running", ...base, ...said, lines: await lastLines(at.log) };
  }
  // Run opened what already answered and started nothing, as it did before ADR 0230.
  const already = await read(at.already);
  if (already !== undefined) return { state: "opened", ...base, why: already };
  if (existsSync(at.only)) return { state: "opened", ...base, ...said };
  return { ...base, ...(await endedOf(at, deps)) };
}

/** A run that is over: stopped by the person, ended by itself, or failed, and its last lines. */
async function endedOf(at: ReturnType<typeof files>, deps: RunDeps): Promise<ProjectRun> {
  const lines = await lastLines(at.log);
  const ended = await endedAt(at);
  if (existsSync(at.stopped)) return { state: "stopped", ended, lines };
  const exit = Number(await read(at.exit));
  const code = Number.isInteger(exit) ? exit : undefined;
  if (code === 0) return { state: "ended", ended, code, lines };
  return { ...(await failedOf(at, code, deps)), ended, lines };
}

/** A run that ended badly: how, and what went wrong where its output says (ADR 0230). */
async function failedOf(
  at: ReturnType<typeof files>,
  code: number | undefined,
  deps: RunDeps,
): Promise<Pick<ProjectRun, "state" | "code" | "trouble">> {
  const said = await troubleOf(
    (await read(at.log)) ?? "",
    code,
    await read(at.expects),
    deps.holder ?? holderOf,
  );
  return {
    state: "failed",
    ...(code === undefined ? {} : { code }),
    ...(said === undefined ? {} : { trouble: said }),
  };
}

async function endedAt(at: ReturnType<typeof files>): Promise<string | undefined> {
  for (const path of [at.stopped, at.exit]) {
    try {
      return (await stat(path)).mtime.toISOString();
    } catch {
      // Not this one.
    }
  }
  return undefined;
}

/** The room's run stopped, the whole of it: its shell and whatever that started. */
export async function stopRun(deps: RunDeps): Promise<ProjectRun> {
  const at = files(deps);
  const shell = await shellOf(at.pid);
  if (alive(shell)) {
    await writeFile(at.stopped, new Date((deps.now ?? Date.now)()).toISOString());
    signal(shell.pid, "SIGTERM");
    for (let waited = 0; waited < 3000 && grouped(shell.pid); waited += 100) await pause(100);
    // What it started and that didn't stop is stopped all the same.
    if (grouped(shell.pid)) signal(shell.pid, "SIGKILL");
  }
  return runStatus(deps);
}

/** Whether anything the run started is still going: its shell's process group. */
function grouped(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signal(pid: number, name: NodeJS.Signals): void {
  try {
    process.kill(-pid, name);
  } catch {
    try {
      process.kill(pid, name);
    } catch {
      // Gone already.
    }
  }
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The files that say what a project's setup installs: when they change, it runs again. */
const MANIFESTS = ["package.json", "package-lock.json", "requirements.txt", "pyproject.toml"];

async function setupKey(folder: string, setup: string): Promise<string> {
  const hash = createHash("sha256").update(setup);
  for (const name of MANIFESTS) {
    const text = await read(join(folder, name));
    if (text !== undefined) hash.update(`\0${name}\0${text}`);
  }
  return hash.digest("hex");
}

/** A command in the folder with the person's login shell, its output to the run's log. */
function started(
  command: string,
  folder: string,
  deps: RunDeps,
  log: string,
  extra: Record<string, string> = {},
): ChildProcess {
  // The project token and the rest of the app's ask stay with Chips: the run never sees them.
  const env = Object.fromEntries(
    Object.entries(deps.env).filter(([name]) => !name.startsWith("CHIPS_FOLDER_")),
  );
  const out = openSync(log, "a");
  try {
    return spawn(deps.shell ?? "/bin/zsh", ["-lc", command], {
      cwd: folder,
      detached: true,
      stdio: ["ignore", out, out],
      // Python holds what it prints back while it goes to a file, the address it listens on too,
      // and Run opens what a program prints (ADR 0230): it prints as it goes here.
      env: { PYTHONUNBUFFERED: "1", ...env, PATH: deps.path, ...extra },
    });
  } finally {
    closeSync(out);
  }
}

/** Setup run and waited for when it changed: nothing when it ran or needn't, or how it failed. */
async function setUp(
  folder: string,
  setup: string,
  deps: RunDeps,
  at: ReturnType<typeof files>,
): Promise<number | undefined> {
  const key = await setupKey(folder, setup);
  if ((await read(at.setup)) === key) return undefined;
  const code = await waited(started(setup, folder, deps, at.log), SETUP_MS);
  if (code !== 0) return code ?? 1;
  await writeFile(at.setup, key);
  return undefined;
}

/**
 * Run the project: whatever ran before stopped, setup when it changed, the run started and left
 * running, and `opens` opened once it answers. The answer is how the run stands then.
 */
export async function startRun(
  folder: string,
  recipe: RunRecipe,
  deps: RunDeps,
): Promise<ProjectRun> {
  const at = await afresh(folder, recipe, deps);
  if (recipe.run === undefined) return await openOnly(folder, recipe.opens ?? "", deps);
  const heldBefore = await answersAlready(recipe.opens, deps);
  const failed =
    recipe.setup === undefined ? undefined : await setUp(folder, recipe.setup, deps, at);
  if (failed !== undefined) {
    await writeFile(at.exit, String(failed));
    return runStatus(deps);
  }
  // The shell writes how it ended as it ends, so a run that ends by itself, `exit` and all, says how.
  const child = started(
    `trap 'printf "%s" "$?" > "$${EXIT}"' EXIT\n${recipe.run}`,
    folder,
    deps,
    at.log,
    { [EXIT]: at.exit },
  );
  child.unref();
  const began = beganOf(child.pid ?? 0);
  if (child.pid === undefined || began === undefined) {
    await writeFile(at.exit, "127");
    return runStatus(deps);
  }
  const shell = { pid: child.pid, began };
  await writeFile(at.pid, `${shell.pid}\n${shell.began}`);
  if (recipe.opens !== undefined) {
    await openWhenReady(folder, { opens: recipe.opens, heldBefore }, shell, deps);
  }
  return runStatus(deps);
}

/**
 * The room's `main` as the folder last fetched it, which is what Run brought it up to: the bar
 * names who changed the files after it (SEC-40). Nothing when git can't say.
 */
function roomMainOf(folder: string, deps: RunDeps): string | undefined {
  const said = spawnSync(
    "git",
    ["-C", folder, "rev-parse", "--quiet", "--verify", "refs/remotes/origin/main^{commit}"],
    { encoding: "utf8", env: { ...deps.env, PATH: deps.path } },
  );
  const commit = said.status === 0 ? said.stdout.trim() : "";
  return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(commit) ? commit : undefined;
}

/** Whatever ran before stopped, and what this run is written down: what, at which commit, since when. */
async function afresh(
  folder: string,
  recipe: RunRecipe,
  deps: RunDeps,
): Promise<ReturnType<typeof files>> {
  const at = files(deps);
  await stopRun(deps);
  await mkdir(at.at, { recursive: true });
  for (const path of [
    at.commit,
    at.exit,
    at.stopped,
    at.opened,
    at.pid,
    at.only,
    at.already,
    at.trouble,
    at.expects,
  ]) {
    await rm(path, { force: true });
  }
  if (recipe.opens !== undefined) await writeFile(at.expects, recipe.opens);
  await writeFile(at.log, "");
  await writeFile(at.since, new Date((deps.now ?? Date.now)()).toISOString());
  await writeFile(at.command, commandOf(recipe));
  const commit = roomMainOf(folder, deps);
  if (commit !== undefined) await writeFile(at.commit, commit);
  return at;
}

/**
 * Whether what a run opens answers before Run has started anything: its own last run is stopped
 * by now, so somebody else's program holds the address, and Run won't open it as the room's
 * (ADR 0230). It used to open it and start nothing, for a game its agent had started itself, and
 * would have opened another of Arjun's programs as Sudoku.
 */
async function answersAlready(opens: string | undefined, deps: RunDeps): Promise<boolean> {
  if (opens === undefined || !/^https?:\/\//i.test(opens)) return false;
  return await (deps.answers ?? answersAt)(opens);
}

/**
 * What a run opens, opened as Finder would, and written down; or, where the Mac won't open it, why
 * kept in the log and what to do kept for the bar. Opening is the last thing a press does, after the
 * run started: the program runs whether or not the browser takes its address. Safari on Arjun's Mac
 * once refused every address it was handed, from Terminal too ("-1712", 25 October 2026), and Run
 * reported a run that wasn't, while the program went on with no Stop.
 */
async function opening(target: string, opens: string, deps: RunDeps): Promise<boolean> {
  const at = files(deps);
  try {
    await deps.open([target]);
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    await appendFile(at.log, `Chips couldn't open ${target}: ${said}\n`);
    await writeFile(
      at.trouble,
      /^https?:\/\//i.test(opens)
        ? `Your browser didn't open ${opensShown(opens)}. Open that address in your browser.`
        : `Your Mac didn't open ${opens}. Open it from your folder.`,
    );
    return false;
  }
  await writeFile(at.opened, opens);
  return true;
}

/** Pages that need no starting: the file opened, which `runRecipe` has kept inside the project. */
async function openOnly(folder: string, opens: string, deps: RunDeps): Promise<ProjectRun> {
  const at = files(deps);
  const target = await openable(folder, opens);
  if ("why" in target) {
    await writeFile(at.log, `${target.why}\n`);
    await writeFile(at.exit, "1");
    return runStatus(deps);
  }
  await opening(target.at, opens, deps);
  await writeFile(at.only, "");
  return runStatus(deps);
}

/**
 * The file of the folder a run opens, or why Chips won't open it: not in the folder once links are
 * followed, or a program the Mac would run. `runRecipe` asked that of the run file's words; the Mac
 * asks again of the file itself, so a link called `index.html` to `play.command` isn't run (SEC-46).
 */
async function openable(
  folder: string,
  opens: string,
): Promise<{ readonly at: string } | { readonly why: string }> {
  const real = await realIn(folder, opens);
  if (real === undefined) return { why: `${opens} isn't in your folder.` };
  if (opensAProgram(real))
    return { why: `${opens} would run as a program, so Chips didn't open it.` };
  return { at: resolve(folder, opens) };
}

/**
 * Where a file of the folder really is, once links are followed: nothing when it isn't there, or is
 * outside the folder. A link the agents committed may point anywhere on the Mac (SEC-55).
 */
export async function realIn(folder: string, file: string): Promise<string | undefined> {
  try {
    const [top, real] = await Promise.all([realpath(folder), realpath(resolve(folder, file))]);
    return real.startsWith(`${top}${sep}`) ? real : undefined;
  } catch {
    return undefined;
  }
}

function waited(child: ChildProcess, most: number): Promise<number | null> {
  return new Promise((done) => {
    const timer = setTimeout(() => {
      signal(child.pid ?? 0, "SIGTERM");
      done(124);
    }, most);
    child.once("exit", (code) => {
      clearTimeout(timer);
      done(code);
    });
    child.once("error", () => {
      clearTimeout(timer);
      done(127);
    });
  });
}

/**
 * What the program listens on, opened once it answers, while the run is still going: the address
 * it printed, else the run file's, unless that answered before anything started (ADR 0230). A file
 * in the folder opens once it is there. A run still going that never answered says so.
 */
async function openWhenReady(
  folder: string,
  expected: { readonly opens: string; readonly heldBefore: boolean },
  shell: Shell,
  deps: RunDeps,
) {
  if (/^https?:\/\//i.test(expected.opens)) return await openWhenAnswering(expected, shell, deps);
  const target = resolve(folder, expected.opens);
  if (!target.startsWith(`${folder}${sep}`)) return;
  for (let waited = 0; waited <= (deps.readyMs ?? READY_MS) && alive(shell); waited += 400) {
    if (existsSync(target)) {
      const file = await openable(folder, expected.opens);
      if ("why" in file) return void (await appendFile(files(deps).log, `${file.why}\n`));
      return void (await opening(file.at, expected.opens, deps));
    }
    await pause(400);
  }
}

/** The address the program listens on, opened once it answers, or why nothing was. */
async function openWhenAnswering(
  expected: { readonly opens: string; readonly heldBefore: boolean },
  shell: Shell,
  deps: RunDeps,
) {
  const at = files(deps);
  const most = deps.readyMs ?? READY_MS;
  let address: string | undefined;
  for (let waited = 0; waited <= most && alive(shell); waited += 400) {
    address = await addressOf(at.log, expected);
    if (address !== undefined && (await (deps.answers ?? answersAt)(address))) {
      return void (await opening(address, address, deps));
    }
    if (address === undefined && expected.heldBefore && waited >= PRINTS_MS) break;
    await pause(400);
  }
  if (!alive(shell)) return;
  await writeFile(
    at.trouble,
    address === undefined ? heldElsewhereWords(expected.opens) : unansweredWords(address, most),
  );
}

/** Where the program listens: the address it printed, else the run file's where that is free. */
async function addressOf(
  log: string,
  expected: { readonly opens: string; readonly heldBefore: boolean },
): Promise<string | undefined> {
  const printed = printedAddress((await read(log)) ?? "");
  if (printed !== undefined) return printed;
  return expected.heldBefore ? undefined : expected.opens;
}

async function answersAt(url: string): Promise<boolean> {
  try {
    const answer = await fetch(url, { signal: AbortSignal.timeout(1000) });
    await answer.body?.cancel();
    return true;
  } catch {
    return false;
  }
}
