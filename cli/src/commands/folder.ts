/**
 * `chips project folder <look|open|send|editor|file|view|run|stop|status> --json`: Your folder
 * (ADR 0224), and the project run from it (ADR 0226), as the Mac app runs it. `view` opens one
 * file of the folder as Finder would: a page in the browser (ADR 0227's Open in browser). The room's project is a folder at `~/Chips/Projects/<room name>`, made the first
 * time Open folder is pressed, brought up to the room's `main` while nothing in it is the person's
 * own, and what they changed in it sent when they say Send. The git is the SDK's `Project`, in its
 * person mode, so a clash is marked and held as an agent's is.
 *
 * The app hands everything over in the environment, never among the words: the room and its name,
 * the server, the person, and a project token its page asked for, good for a few minutes. Nothing
 * of the token is written into the folder. One line of JSON comes back.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { checkGit, type FolderLook, Project, type Pushed } from "@chipschat/harness";
import {
  commandOf,
  opensAProgram,
  PROJECT_GIT_VERSION,
  PROJECT_TOKEN_PREFIX,
  type ProjectRun,
} from "@chipschat/protocol";
import { type RunDeps, readRecipe, realIn, runStatus, startRun, stopRun } from "./run.js";

export const FOLDER_OPS = [
  "look",
  "open",
  "send",
  "editor",
  "file",
  "view",
  "run",
  "stop",
  "status",
] as const;
export type FolderOp = (typeof FOLDER_OPS)[number];

/** What the app asks with: the room, the server, the person, a project token, and Send's words. */
export interface FolderAsked {
  readonly spaceId: string;
  readonly title: string;
  readonly server: string;
  readonly personId: string;
  readonly name: string;
  readonly token: string;
  /** What you changed, for Send. */
  readonly words?: string | undefined;
  /** A file in the folder to open: a clashed one, or a page to view in the browser. */
  readonly file?: string | undefined;
  /** For Run, the command the person was shown: nothing else runs. */
  readonly command?: string | undefined;
}

/** The line that comes back. */
export type FolderAnswer =
  | {
      readonly ok: true;
      /** Where the folder is, or would be made. */
      readonly folder: string;
      /** The same, as a person reads it: `~/Chips/Projects/Sudoku mini`. */
      readonly shown: string;
      /** The editor Open in editor opens, by its name; none when the Mac has none of them. */
      readonly editor?: string | undefined;
      readonly made: false;
      readonly run?: ProjectRun | undefined;
    }
  | ({
      readonly ok: true;
      readonly folder: string;
      readonly shown: string;
      readonly editor?: string | undefined;
      readonly made: true;
      /** What Send sent, and whose changes it went on top of. */
      readonly sent?: { readonly files: readonly string[]; readonly over: readonly string[] };
      /** Files Send held back, because they look like they hold a key. */
      readonly keys?: readonly { readonly path: string; readonly what: string }[];
      /** How the room's run on this Mac stands (ADR 0226), after `run`, `stop` and `status`. */
      readonly run?: ProjectRun | undefined;
    } & Partial<FolderLook>)
  | { readonly ok: false; readonly why: string };

const SPACE = /^spc_[0-9A-Za-z]{26}$/;
const PERSON = /^usr_[0-9A-Za-z]{8,64}$/;

/** What the app said, from the environment, or why it can't be acted on. */
export function folderAsked(
  env: Readonly<Record<string, string | undefined>>,
): FolderAsked | { readonly why: string } {
  const spaceId = env["CHIPS_FOLDER_SPACE"] ?? "";
  const server = env["CHIPS_FOLDER_SERVER"] ?? "";
  const token = env["CHIPS_FOLDER_TOKEN"] ?? "";
  const personId = env["CHIPS_FOLDER_PERSON"] ?? "";
  if (!SPACE.test(spaceId)) return { why: "That isn't a space Chips made." };
  if (!/^https?:\/\/[^\s'"]+$/.test(server)) return { why: "That isn't a server's address." };
  if (!token.startsWith(PROJECT_TOKEN_PREFIX)) return { why: "That isn't a project token." };
  if (!PERSON.test(personId)) return { why: "That isn't a person Chips knows." };
  return {
    spaceId,
    title: env["CHIPS_FOLDER_TITLE"] ?? "",
    server,
    personId,
    name: env["CHIPS_FOLDER_NAME"] || "You",
    token,
    words: env["CHIPS_FOLDER_WORDS"],
    file: env["CHIPS_FOLDER_FILE"],
    command: env["CHIPS_FOLDER_COMMAND"],
  };
}

/** Where every room's folder goes. */
export function projectsHome(home: string): string {
  return join(home, "Chips", "Projects");
}

/** A folder's name made from a room's: `/` and `:` as `-`, no leading dot, never empty. */
export function folderName(title: string): string {
  const name = title
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a control character is no name's.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/:]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
  return name === "" ? "Space project" : name;
}

/** The folder a room's project is already in: the one whose remote is that room's project. */
export async function folderOf(home: string, spaceId: string): Promise<string | undefined> {
  const under = projectsHome(home);
  let names: string[];
  try {
    names = await readdir(under);
  } catch {
    return undefined;
  }
  for (const name of names.sort()) {
    try {
      const config = await readFile(join(under, name, ".git", "config"), "utf8");
      if (config.includes(`/v1/spaces/${spaceId}/project.git`)) return join(under, name);
    } catch {
      // Not a folder Chips made.
    }
  }
  return undefined;
}

/** A new folder for a room: its name, or its name with ` 2`, ` 3` after it when that is taken. */
export function newFolder(home: string, title: string): string {
  const name = folderName(title);
  for (let count = 1; ; count += 1) {
    const at = join(projectsHome(home), count === 1 ? name : `${name} ${count}`);
    if (!existsSync(at)) return at;
  }
}

/** The editors Open in editor looks for, first found first. */
const EDITORS = ["Cursor", "Visual Studio Code", "Zed", "Sublime Text", "Nova", "BBEdit"];

/** The first editor this Mac has, in `/Applications` or the person's own. */
export function editorOf(
  home: string,
  has: (path: string) => boolean = existsSync,
): { readonly name: string; readonly path: string } | undefined {
  for (const name of EDITORS) {
    for (const folder of ["/Applications", join(home, "Applications")]) {
      const path = join(folder, `${name}.app`);
      if (has(path)) return { name, path };
    }
  }
  return undefined;
}

/** `~/Chips/Projects/Sudoku mini` for a folder under home. */
function shownOf(home: string, folder: string): string {
  return folder.startsWith(`${home}${sep}`) ? `~${folder.slice(home.length)}` : folder;
}

/** What Send did, as the answer says it; a clash is the look's to say. */
function pushedFields(pushed: Pushed): Partial<FolderAnswer & { ok: true; made: true }> {
  switch (pushed.state) {
    case "sent":
      return { sent: { files: pushed.files, over: pushed.over } };
    case "nothing":
      return { sent: { files: [], over: [] } };
    case "keys":
      return { keys: pushed.keys };
    case "clash":
      return {};
    case "refused":
    case "failed":
      return { trouble: pushed.why };
  }
}

export interface FolderDeps {
  readonly home: string;
  /** `/usr/bin/open` with these words: Finder, an editor, the Mac's text editor. */
  readonly open: (args: readonly string[]) => Promise<void>;
  /** The `PATH` git is found on. */
  readonly path?: string | undefined;
  /** Whether a path is there, for the editors. */
  readonly has?: ((path: string) => boolean) | undefined;
  /** The environment a run starts with, less what the app handed over for the folder. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** What a run is started with, for a test's own shell and clock. */
  readonly run?: Partial<Pick<RunDeps, "shell" | "now" | "answers" | "readyMs">> | undefined;
}

/** What every answer of the card's says first: where the folder is, and the editor it opens in. */
interface Where {
  readonly ok: true;
  readonly folder: string;
  readonly shown: string;
  readonly editor?: string;
}

/** One of the card's asks, done. */
export async function runFolder(
  op: FolderOp,
  asked: FolderAsked,
  deps: FolderDeps,
): Promise<FolderAnswer> {
  const found = await folderOf(deps.home, asked.spaceId);
  const folder = found ?? newFolder(deps.home, asked.title);
  const editor = editorOf(deps.home, deps.has);
  const base = {
    ok: true as const,
    folder,
    shown: shownOf(deps.home, folder),
    ...(editor === undefined ? {} : { editor: editor.name }),
  };
  const runs = runDepsOf(asked, deps);
  if (op === "status" || op === "stop") {
    const run = op === "stop" ? await stopRun(runs) : await runStatus(runs);
    return { ...base, made: found !== undefined, run };
  }
  if (found === undefined && op !== "open" && op !== "view" && op !== "run") {
    return { ...base, made: false, run: await runStatus(runs) };
  }
  if (op === "editor" || op === "file") {
    const opened = await openIn(op, folder, editor?.path, asked.file, deps.open);
    return opened ?? { ...base, made: true };
  }
  return await withProject(op, asked, deps, base, runs);
}

/** What the room's run is started, stopped and looked at with. */
function runDepsOf(asked: FolderAsked, deps: FolderDeps): RunDeps {
  return {
    home: deps.home,
    spaceId: asked.spaceId,
    open: deps.open,
    path: deps.path ?? gitPath(undefined),
    env: deps.env ?? {},
    ...deps.run,
  };
}

/** The asks that need git: a look, Open folder, Send, and Run, which brings the folder up first. */
async function withProject(
  op: FolderOp,
  asked: FolderAsked,
  deps: FolderDeps,
  base: Where,
  runs: RunDeps,
): Promise<FolderAnswer> {
  const { folder } = base;
  const git = await checkGit("git", deps.path);
  if (!git.ok) {
    return {
      ok: false,
      why: `Your folder needs git ${PROJECT_GIT_VERSION} or newer, and ${git.why}. Run xcode-select --install in Terminal for Apple's.`,
    };
  }
  await mkdir(projectsHome(deps.home), { recursive: true });
  const project = new Project({
    url: asked.server,
    token: asked.token,
    spaceId: asked.spaceId,
    agentId: asked.personId,
    name: asked.name,
    folder,
    person: true,
    path: deps.path,
  });
  if (op === "send") {
    const pushed = await project.push({ words: asked.words ?? "" });
    const look = await project.look();
    return { ...base, made: true, ...look, ...pushedFields(pushed), run: await runStatus(runs) };
  }
  const look = await project.look();
  if (op === "open") await deps.open([folder]);
  if (op === "view") {
    const viewed = await viewIn(folder, asked.file, deps.open);
    if (viewed !== undefined) return viewed;
  }
  if (op === "run") {
    const ran = await runIn(folder, asked.command, runs);
    return "refused" in ran
      ? { ok: false, why: ran.refused }
      : { ...base, made: true, ...look, run: ran };
  }
  // Every look says how the room's run stands too, so a run from before the app opened shows.
  return { ...base, made: true, ...look, run: await runStatus(runs) };
}

/**
 * The project run from its folder (ADR 0226), as the folder's run file says, and only when
 * that is what the person was shown: a recipe that changed since is theirs to see first.
 */
async function runIn(
  folder: string,
  shown: string | undefined,
  runs: RunDeps,
): Promise<ProjectRun | { readonly refused: string }> {
  const recipe = await readRecipe(folder);
  if (recipe === undefined) {
    return { refused: "The project has no run file yet, so there's nothing to run." };
  }
  if ("why" in recipe) return { refused: recipe.why };
  if (shown !== commandOf(recipe)) {
    return {
      refused:
        "The run file in your folder says to run something else now. Look at what it runs, then press Run again.",
    };
  }
  return await startRun(folder, recipe, runs);
}

/**
 * The folder in the editor, or one file of it in the editor or the Mac's text editor: nothing
 * when it opened, or why not. A file outside the folder, after links, is never opened.
 */
async function openIn(
  op: "editor" | "file",
  folder: string,
  editor: string | undefined,
  file: string | undefined,
  open: FolderDeps["open"],
): Promise<FolderAnswer | undefined> {
  if (op === "editor") {
    await open(editor === undefined ? [folder] : ["-a", editor, folder]);
    return undefined;
  }
  if ((await realIn(folder, file ?? "")) === undefined) {
    return { ok: false, why: "That file isn't in your folder." };
  }
  const at = resolve(folder, file ?? "");
  await open(editor === undefined ? ["-t", at] : ["-a", editor, at]);
  return undefined;
}

/**
 * One file of the folder, brought up to the room's `main` first, opened as Finder opens it: a page
 * in the browser, where it reloads and its links to the project's other files work as files
 * (Arjun, 24 October 2026: "add a button to open page in browser"). Nothing outside the folder,
 * after links, and no program: Finder would run a page that is a link to one (SEC-55).
 */
async function viewIn(
  folder: string,
  file: string | undefined,
  open: FolderDeps["open"],
): Promise<FolderAnswer | undefined> {
  const real = await realIn(folder, file ?? "");
  if (real === undefined) return { ok: false, why: "That file isn't in your folder." };
  if (opensAProgram(real)) {
    return { ok: false, why: "That file would run as a program, so Chips didn't open it." };
  }
  await open([resolve(folder, file ?? "")]);
  return undefined;
}

/** `/usr/bin/open`, as the Mac has it. */
export const openOnMac = (args: readonly string[]): Promise<void> =>
  new Promise((done, failed) => {
    execFile("/usr/bin/open", [...args], (error, _stdout, stderr) => {
      if (error === null) done();
      else failed(new Error(stderr.trim() || error.message));
    });
  });

/** Where git is found when the Mac app runs this, whose own `PATH` is the system's alone. */
export function gitPath(path: string | undefined): string {
  const places = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  return [...new Set([...(path ?? "").split(":").filter((at) => at !== ""), ...places])].join(":");
}
