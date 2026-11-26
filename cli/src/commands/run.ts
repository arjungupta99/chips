/**
 * Run (ADRs 0226, 0227, 0230): the room's project run on the Mac from Your folder, as its agents
 * said to in its run file, `.chips/run.json` (or `chips.json` at the top, where it was kept before).
 * `run` is one shell command, started in the folder with the person's own login shell and left
 * running, detached, until Stop; `setup`, when it changed, runs first and is waited for. What the
 * program prints that it listens on is opened once it answers, else `opens`; a run file with no
 * `opens` opens only what its program prints, as the agents are told. What a run prints goes
 * to a log beside the person's runs, never into the folder, so it never reads as a change of
 * theirs, and a run that went wrong says what in plain words (`run-trouble.ts`).
 *
 * A run is everything its shell started, not the shell alone (ADR 0230's addendum of 25 November
 * 2026): a run file that starts two servers, `a & b &`, has a shell that ends at once while both
 * go on, and the run still runs, with Stop, until they end.
 *
 * A run file can list programs (ADR 0303): each is run here as one run of its own, in its own
 * folder of the project and its own runs folder, by `programs.ts`, which starts what each needs.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
  printedAddresses,
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
/**
 * How long Run waits for an address on the run file's port, where the program printed another
 * first: two servers started together print within moments of each other, and the one to open
 * isn't always first (ADR 0230's addendum of 25 November 2026).
 */
const OWN_PORT_MS = 3000;
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

/**
 * Where one program of a run file that lists them keeps its run (ADR 0303), by its name: names
 * differ ignoring case, so its folder is the name in small letters, a space spelled out.
 */
export function programRunsOf(home: string, spaceId: string, program: string): string {
  return join(runsOf(home, spaceId), "programs", encodeURIComponent(program.toLowerCase()));
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
  /**
   * The program of a run file that lists them (ADR 0303), whose run this is; none for the one
   * program of a run file that says `run` itself.
   */
  readonly program?: string | undefined;
}

const files = (deps: RunDeps) => {
  const at =
    deps.program === undefined
      ? runsOf(deps.home, deps.spaceId)
      : programRunsOf(deps.home, deps.spaceId, deps.program);
  return {
    at,
    /** The program's name as the run file says it (ADR 0303). */
    name: join(at, "name"),
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
    /** Where it listens once it answers there, whether or not Run opened it (ADR 0303). */
    listens: join(at, "listens"),
    /** The programs it runs for, a line each, when Run started it because they need it (ADR 0303). */
    runsFor: join(at, "for"),
    /** Why Run didn't start it, where something it needs didn't start (ADR 0303). */
    unstarted: join(at, "unstarted"),
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

/**
 * A run's shell: its process id, which is also the id of the process group it leads; when that
 * process started, which an id taken over doesn't share; and the Mac's start-up it started in,
 * which is how what it left running is known as the run's after the shell ended. A run from
 * before 25 November 2026 says no start-up.
 */
interface Shell {
  readonly pid: number;
  readonly began: string;
  readonly boot?: string | undefined;
}

let bootSeen: string | undefined;

/**
 * This start-up of the machine, as an id the next one doesn't share: macOS's
 * `kern.bootsessionuuid`, Linux's `boot_id`. Nothing when neither says.
 */
function bootOf(): string | undefined {
  if (bootSeen !== undefined) return bootSeen;
  const said = spawnSync("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], { encoding: "utf8" });
  let boot = said.status === 0 ? said.stdout.trim() : "";
  if (boot === "") {
    try {
      boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    } catch {
      // Neither: what a run leaves after its shell ends can't be told from somebody else's.
    }
  }
  bootSeen = boot === "" ? undefined : boot;
  return bootSeen;
}

/** When a process started, as `ps` tells it, or nothing when there is no such process. */
function beganOf(pid: number): string | undefined {
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  const said = spawnSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
  const began = said.status === 0 ? said.stdout.trim() : "";
  return began === "" ? undefined : began;
}

async function shellOf(at: string): Promise<Shell | undefined> {
  const [pid, began, boot] = ((await read(at)) ?? "").split("\n");
  if (began === undefined) return undefined;
  return { pid: Number(pid), began, ...(boot === undefined || boot === "" ? {} : { boot }) };
}

/**
 * Whether the run's shell is still going: the same process, started when it was, so one that took
 * its id over after a restart is never stopped.
 */
function alive(shell: Shell | undefined): shell is Shell {
  return shell !== undefined && beganOf(shell.pid) === shell.began;
}

/**
 * Whether the run's shell ended and left what it started running: its process group still has
 * processes, in the start-up the run began in, and no process has the shell's id. While a group
 * has processes, macOS (and Linux) give no new process its id, so a group with that id and no
 * process of it is the one the shell led. After a restart the id is free again, and a group
 * called by it is somebody else's.
 */
function leftBehind(shell: Shell | undefined): shell is Shell {
  if (shell === undefined || shell.boot === undefined || shell.boot !== bootOf()) return false;
  return beganOf(shell.pid) === undefined && grouped(shell.pid);
}

/** Whether anything of the run still goes: its shell, or what the shell left running. */
function going(shell: Shell | undefined): shell is Shell {
  return alive(shell) || leftBehind(shell);
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
  const listens = await read(at.listens);
  const base = {
    command,
    ...(commit === undefined ? {} : { commit }),
    ...(since === undefined ? {} : { since }),
    ...(opened === undefined ? {} : { opened }),
    ...(listens === undefined ? {} : { listens }),
  };
  const trouble = await read(at.trouble);
  const said = trouble === undefined ? {} : { trouble };
  if (going(shell)) {
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
  // Something it needs didn't start, so it never did (ADR 0303).
  const unstarted = await read(at.unstarted);
  if (unstarted !== undefined) return { state: "failed", trouble: unstarted };
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

/** The programs a run, started because they need it, runs for (ADR 0303); none for the person's own. */
export async function runsForOf(deps: RunDeps): Promise<string[]> {
  return ((await read(files(deps).runsFor)) ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The programs a run runs for, said again: none makes it the person's, kept when its last one stops. */
export async function setRunsFor(deps: RunDeps, names: readonly string[]): Promise<void> {
  const at = files(deps).runsFor;
  if (names.length === 0) await rm(at, { force: true });
  else await writeFile(at, names.join("\n"));
}

/**
 * A program not run because something it needs didn't start (ADR 0303): written down as a run
 * that failed before it began, in `words`, with what it would have run, so its row says why.
 */
export async function markUnstarted(deps: RunDeps, command: string, words: string): Promise<void> {
  const at = files(deps);
  await stopRun(deps);
  await mkdir(at.at, { recursive: true });
  for (const path of [at.pid, at.opened, at.listens, at.runsFor, at.stopped, at.trouble, at.only]) {
    await rm(path, { force: true });
  }
  if (deps.program !== undefined) await writeFile(at.name, deps.program);
  await writeFile(at.command, command);
  // It never began, so it has no since: its row says it never ran rather than that it stopped.
  await rm(at.since, { force: true });
  await writeFile(at.log, "");
  await writeFile(at.exit, "1");
  await writeFile(at.unstarted, words);
}

/** The room's run stopped, the whole of it: its shell and whatever that started. */
export async function stopRun(deps: RunDeps): Promise<ProjectRun> {
  const at = files(deps);
  const shell = await shellOf(at.pid);
  // What the shell left running when it ended is the run's too: `a & b &`, or `a & b` once b ended.
  const leader = alive(shell);
  if (leader || leftBehind(shell)) {
    await writeFile(at.stopped, new Date((deps.now ?? Date.now)()).toISOString());
    signal(shell.pid, "SIGTERM", leader);
    for (let waited = 0; waited < 3000 && grouped(shell.pid); waited += 100) await pause(100);
    // What it started and that didn't stop is stopped all the same.
    if (grouped(shell.pid)) signal(shell.pid, "SIGKILL", leader);
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

/**
 * The run's group signalled, else its shell alone where the shell still goes (`leader`). With the
 * shell gone, its id may be anybody's once the group has ended, so nothing but the group is.
 */
function signal(pid: number, name: NodeJS.Signals, leader: boolean): void {
  try {
    process.kill(-pid, name);
  } catch {
    if (!leader) return;
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

/**
 * What setup was run for: its words, and the manifests at the folder's top and in each folder one
 * down, where a project of two apps keeps each (`web/package.json`, `api/requirements.txt`; ADR
 * 0230's addendum of 25 November 2026). A project with manifests only at its top keeps the key it
 * had, so its setup doesn't run again for this.
 */
async function setupKey(folder: string, setup: string): Promise<string> {
  const hash = createHash("sha256").update(setup);
  for (const place of ["", ...(await foldersIn(folder))]) {
    for (const name of MANIFESTS) {
      const path = place === "" ? name : `${place}/${name}`;
      const text = await read(join(folder, path));
      if (text !== undefined) hash.update(`\0${path}\0${text}`);
    }
  }
  return hash.digest("hex");
}

/**
 * The folders at a folder's top, by name: none hidden (`.git`, `.chips`), no `node_modules`, and
 * no link, which may point anywhere on the Mac (SEC-55).
 */
async function foldersIn(folder: string): Promise<string[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .filter((name) => name !== "node_modules")
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
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

/** How a program of a run file that lists them is run (ADR 0303). */
export interface StartAs {
  /**
   * Whether a run file with no `opens` opens the address the program prints: yes for the one
   * program, and for a program nobody needs; no for one others need, an API, whose page is theirs.
   */
  readonly opensPrinted?: boolean | undefined;
  /** The programs it is started for, which need it; none when the person ran it. */
  readonly runsFor?: readonly string[] | undefined;
  /** What the run file says, as `commandOf` says it, written down to compare with later. */
  readonly command?: string | undefined;
}

/**
 * Run the project: whatever ran before stopped, setup when it changed, the run started and left
 * running, and the address the program prints, else `opens`, opened once it answers. The answer is
 * how the run stands then. `folder` is where it runs: a program of a list runs in its own.
 */
export async function startRun(
  folder: string,
  recipe: RunRecipe,
  deps: RunDeps,
  as: StartAs = {},
): Promise<ProjectRun> {
  const at = await afresh(folder, recipe, deps, as);
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
  const shell: Shell = { pid: child.pid, began, boot: bootOf() };
  await writeFile(at.pid, `${shell.pid}\n${shell.began}\n${shell.boot ?? ""}`);
  // A run file with no `opens` is one whose program prints its address, as the agents are told
  // ("opens" is for a program that prints none); Run used to open nothing for it. A program others
  // need only says where it listens (ADR 0303).
  if (recipe.opens === undefined) {
    const opens = as.opensPrinted !== false;
    await openWhenAnswering({ heldBefore: false, ...(opens ? {} : { looks: true }) }, shell, deps);
  } else await openWhenReady(folder, { opens: recipe.opens, heldBefore }, shell, deps);
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
  as: StartAs = {},
): Promise<ReturnType<typeof files>> {
  const at = files(deps);
  await stopRun(deps);
  await mkdir(at.at, { recursive: true });
  for (const path of [
    at.listens,
    at.runsFor,
    at.unstarted,
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
  if (deps.program !== undefined) await writeFile(at.name, deps.program);
  if ((as.runsFor?.length ?? 0) > 0) await writeFile(at.runsFor, (as.runsFor ?? []).join("\n"));
  await writeFile(at.log, "");
  await writeFile(at.since, new Date((deps.now ?? Date.now)()).toISOString());
  await writeFile(at.command, as.command ?? commandOf(recipe));
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
  if (/^https?:\/\//i.test(target)) await writeFile(at.listens, target);
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
      // Setup is still going here, so its own process may be signalled where its group is gone.
      signal(child.pid ?? 0, "SIGTERM", true);
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
  for (let waited = 0; waited <= (deps.readyMs ?? READY_MS) && going(shell); waited += 400) {
    if (existsSync(target)) {
      const file = await openable(folder, expected.opens);
      if ("why" in file) return void (await appendFile(files(deps).log, `${file.why}\n`));
      return void (await opening(file.at, expected.opens, deps));
    }
    await pause(400);
  }
}

/**
 * The address the program listens on, opened once it answers, or why nothing was. Where the run
 * file opens nothing, only what the program prints can open, and a program that has printed no
 * address and gone quiet for a few seconds serves none (a bot, a window, a script): it is left to
 * run, with nothing said, rather than read as starting for half a minute.
 */
async function openWhenAnswering(expected: Expected, shell: Shell, deps: RunDeps) {
  const at = files(deps);
  const most = deps.readyMs ?? READY_MS;
  const answers = deps.answers ?? answersAt;
  const quietFor = quietness();
  let address: string | undefined;
  for (let waited = 0; waited <= most && going(shell); waited += 400) {
    const log = (await read(at.log)) ?? "";
    const quiet = quietFor(log);
    address = addressOf(log, expected, waited);
    if (address !== undefined && (await answers(address))) {
      return void (await reached(address, expected, deps));
    }
    if (givesUp(address, expected, waited, quiet)) break;
    await pause(400);
  }
  const said = unopenedWords(address, expected, most);
  if (said !== undefined && going(shell)) await writeFile(at.trouble, said);
}

/**
 * Where the program listens, once it answers there: opened, or, for a program others need, only
 * written down (ADR 0303), since the page it serves is theirs.
 */
async function reached(address: string, expected: Expected, deps: RunDeps): Promise<void> {
  if (expected.looks === true) await writeFile(files(deps).listens, address);
  else await opening(address, address, deps);
}

/** How long a log, read every 400 ms, has said nothing new. */
function quietness(): (log: string) => number {
  let heard = 0;
  let quiet = 0;
  return (log) => {
    quiet = log.length === heard ? quiet + 400 : 0;
    heard = log.length;
    return quiet;
  };
}

/**
 * Whether Run stops looking for an address the program hasn't printed: where only a printed one
 * could open, once a server would have printed it; where the run file opens nothing, once the
 * program has gone quiet.
 */
function givesUp(
  address: string | undefined,
  expected: Expected,
  waited: number,
  quiet: number,
): boolean {
  if (address !== undefined) return false;
  if (expected.heldBefore) return waited >= PRINTS_MS;
  return expected.opens === undefined && quiet >= PRINTS_MS;
}

/**
 * What a run still going says where nothing opened: the address that never answered, or the run
 * file's, which another program held; nothing where it opens only what it prints and printed none.
 */
function unopenedWords(
  address: string | undefined,
  expected: Expected,
  most: number,
): string | undefined {
  if (address !== undefined) return unansweredWords(address, most);
  return expected.opens === undefined ? undefined : heldElsewhereWords(expected.opens);
}

/**
 * What Run is to open: the run file's address, or nothing where it opens only what the program
 * prints; and whether that address answered before Run started anything (ADR 0230).
 */
interface Expected {
  readonly opens?: string | undefined;
  readonly heldBefore: boolean;
  /** Where it listens is only written down, never opened: a program others need (ADR 0303). */
  readonly looks?: boolean | undefined;
}

/**
 * Where the program listens, `waited` into the run, from what it printed so far: the address it
 * printed on the run file's port; else, for the first few seconds, the run file's own where that was
 * free, since a run that starts two servers often prints the other's first (an API before its
 * page); then the first address it printed; else the run file's where that is free. With no run
 * file's address, the first it printed, at once.
 */
function addressOf(log: string, expected: Expected, waited: number): string | undefined {
  const printed = printedAddresses(log);
  const port = expected.opens === undefined ? undefined : portOf(expected.opens);
  const own = port === undefined ? undefined : printed.find((address) => portOf(address) === port);
  if (own !== undefined) return own;
  const [first] = printed;
  if (first !== undefined && (port === undefined || waited >= OWN_PORT_MS)) return first;
  return expected.heldBefore ? undefined : expected.opens;
}

/** The port an address names, or the one its scheme uses; nothing for what isn't an address. */
function portOf(address: string): string | undefined {
  try {
    const url = new URL(address);
    if (url.port !== "") return url.port;
    return url.protocol === "https:" ? "443" : "80";
  } catch {
    return undefined;
  }
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
