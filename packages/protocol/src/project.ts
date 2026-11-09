/**
 * A room's project (ADR 0220): one git repository per room, which Chips holds and serves over
 * git's own smart HTTP. Every agent in the room works in a clone of its own, and its bridge does
 * the git (ADR 0221); a person's device clones it with a token that holds for ten minutes.
 *
 * - **One branch.** `main`, which a push may move forward and never rewrite or delete.
 * - **Who.** A harness, for one of its agents in the room, named in `chips-actor`; or a person in
 *   the room, with a project token from `POST /v1/spaces/:id/project/token`.
 * - **What it won't keep.** A secrets file (`.env`, `.env.local`), anything that looks like a
 *   key, and a file over the workspace's cap for files.
 *
 * The server, the conformance fake and the SDK name the same paths and the same header, and look
 * for secrets the same way, so those live here.
 */

import { z } from "zod";
import { isoTimestamp } from "./primitives.js";

/** The one branch a room's project has. */
export const PROJECT_BRANCH = "main";

/** Where a room's project is served: what a clone's remote URL ends in. */
export function projectPath(spaceId: string): string {
  return `/v1/spaces/${spaceId}/project.git`;
}

/**
 * The room a request to its project names, and what follows `project.git`; nothing when the path
 * is not a project's.
 */
export function projectRequest(path: string): { spaceId: string; rest: string } | undefined {
  const match = /^\/v1\/spaces\/(spc_[0-7][0-9A-HJKMNP-TV-Z]{25})\/project\.git(\/.*)?$/.exec(path);
  if (match === null) return undefined;
  return { spaceId: match[1] ?? "", rest: match[2] ?? "/" };
}

/** The header a harness names the agent it fetches or pushes for with (ADR 0087). */
export const PROJECT_ACTOR_HEADER = "chips-actor";

/** The oldest git that takes a token through its environment (`GIT_CONFIG_COUNT`). */
export const PROJECT_GIT_VERSION = "2.31.0";

/** How long a person's project token holds. */
export const PROJECT_TOKEN_TTL_SECONDS = 600;

/** The prefix a project token wears, as a harness token wears `chips_at_`. */
export const PROJECT_TOKEN_PREFIX = "chips_pt_";

/** `POST /v1/spaces/:id/project/token`'s answer. */
export const projectToken = z.object({
  token: z
    .string()
    .startsWith(PROJECT_TOKEN_PREFIX)
    .describe(
      "Good for this room's project only, until `expires_at`: as a bearer token, or as the password of git's credential helper.",
    ),
  expires_at: isoTimestamp,
  path: z
    .string()
    .describe(
      "The project's path on this server, which the device puts its own address in front of.",
    ),
});
export type ProjectToken = z.infer<typeof projectToken>;

/**
 * `POST /v1/spaces/:id/project/folder/open`'s answer (ADR 0225): how many of the person's own
 * Macs were sent `folder.open`. Nought means Chips for Mac isn't open anywhere.
 */
export const projectFolderOpenAnswer = z.object({
  macs: z.int().nonnegative().describe("How many of the person's Macs were asked."),
  opened_app: z
    .literal(true)
    .optional()
    .describe(
      "No Chips for Mac of theirs was open, so the server opened the one on its own machine and waited for it (ADR 0227).",
    ),
});
export type ProjectFolderOpenAnswer = z.infer<typeof projectFolderOpenAnswer>;

/**
 * The agents' and Chips's own folder at the project's top (ADR 0227): the start page and the run
 * file. Files leaves it out, and Finder hides it as it hides `.git`.
 */
export const CHIPS_FOLDER = ".chips";

/** The file that says how the project runs on the person's Mac (ADRs 0226, 0227). */
export const RUN_FILE = ".chips/run.json";

/** Where the run file was kept before ADR 0227, read when there is no `RUN_FILE`. */
export const RUN_FILE_BEFORE = "chips.json";

/** The page that links to the documents worth seeing, which Universe opens (ADR 0227). */
export const START_PAGE = ".chips/index.html";

/**
 * What a link to a file of the project becomes when chipsd builds a page (ADR 0227): this, then the
 * path, encoded as a URI component. The phone's page view opens the file over the page; in a frame,
 * the builder's script hands the path to the window as `{chipsFile: path}`.
 */
export const FILE_LINK = "chips-file:";

/** How a project runs, as its agents wrote it in its run file. */
export interface RunRecipe {
  /**
   * One shell command, run in the project's folder: a server that stays up, or a script that ends.
   * None for pages that need no starting: Run only opens `opens`, a file of the project.
   */
  readonly run?: string | undefined;
  /** An address on the Mac, or a file of the project, opened once the run answers. */
  readonly opens?: string | undefined;
  /** Run first, and waited for, whenever it or the project's package files changed. */
  readonly setup?: string | undefined;
}

/** The longest command Run runs. */
const RECIPE_MOST = 500;
/** The longest a press names: setup, run and what it opens, as `folder.run` carries it. */
const COMMAND_MOST = 1100;

/**
 * The run file's recipe, or why it isn't one: the Mac reads it before it runs anything, and the
 * phone and the web read it to show what Run does. `opens` is never somewhere on the internet.
 * `file` is the run file it was read from, which its words name.
 */
export function runRecipe(
  text: string,
  file: string = RUN_FILE,
): RunRecipe | { readonly why: string } {
  let said: unknown;
  try {
    said = JSON.parse(text);
  } catch {
    return { why: `${file} isn't JSON.` };
  }
  const fields = (typeof said === "object" && said !== null ? said : {}) as Record<string, unknown>;
  const field = (key: string) => {
    const value = fields[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const run = field("run");
  const opens = field("opens");
  const setup = field("setup");
  const why = whyNot(file, run, opens, setup);
  if (why !== undefined) return { why };
  if (saysTooMuch({ run, opens, setup })) return { why: `${file} says more than Chips runs.` };
  if (opens !== undefined && !opensOnTheMac(opens)) {
    return {
      why: `${file} opens ${opens}, and Run opens only the Mac's own addresses and the project's files.`,
    };
  }
  if (opens !== undefined && opensAProgram(opens)) {
    return {
      why: `${file} opens ${opens}, which the Mac would run as a program. Say how to start it as "run", where you see what it does.`,
    };
  }
  return {
    ...(run === undefined ? {} : { run }),
    ...(opens === undefined ? {} : { opens }),
    ...(setup === undefined ? {} : { setup }),
  };
}

/** Whether a recipe is longer than Run runs, a part of it or the whole of what a press names. */
function saysTooMuch(recipe: RunRecipe): boolean {
  const { run, opens, setup } = recipe;
  if ([run, opens, setup].some((each) => (each?.length ?? 0) > RECIPE_MOST)) return true;
  return commandOf(recipe).length > COMMAND_MOST;
}

/** Why a recipe can't be one before its lengths and its address are looked at: nothing to start, or elsewhere. */
function whyNot(
  file: string,
  run: string | undefined,
  opens: string | undefined,
  setup: string | undefined,
): string | undefined {
  return startless(file, run, opens, setup) ?? leavesFolder(file, run, setup);
}

/**
 * Why a recipe that runs something outside the project's folder can't be one: a `cd` or `pushd`
 * anywhere but into it, or a path in a home folder on this Mac. What it runs belongs in the
 * project, so it runs on any Mac that has the project and is what the project holds (the game of
 * life sim, 24 October 2026: its run file went into its agent's own workspace, and the project
 * held nothing but the run file).
 */
function leavesFolder(
  file: string,
  run: string | undefined,
  setup: string | undefined,
): string | undefined {
  const away = [setup, run].map((each) => (each === undefined ? undefined : outsideOf(each)));
  const at = away.find((each) => each !== undefined);
  if (at === undefined) return undefined;
  return `${file} uses ${at}, outside the project's folder. Ask the agents to put what it runs in the project.`;
}

/** A place a command reaches outside the folder it runs in, or nothing. */
function outsideOf(command: string): string | undefined {
  for (const [, to = ""] of command.matchAll(CD)) {
    const at = to.replace(/^(["'])(.*)\1$/, "$2");
    if (/^(?:\/|~|\$|\.\.(?:\/|$))/.test(at)) return at;
  }
  return HOME_PATH.exec(command)?.[1];
}

/** `cd` or `pushd` and where to, quoted or not. */
const CD = /(?:^|[\s;&|(])(?:cd|pushd)\s+("[^"]*"|'[^']*'|[^\s;&|)]+)/g;
/** A path in a home folder: `~/…`, `$HOME/…`, `/Users/<name>/…`, `/home/<name>/…`. */
const HOME_PATH =
  /(?:^|[\s"'=:(])((?:~|\$HOME|\$\{HOME\}|\/Users\/[^/\s"';&|)]+|\/home\/[^/\s"';&|)]+)(?:\/[^\s"';&|)]*)?)/;

/** Why a recipe with nothing to run can't be one: only a file of the project is opened on its own. */
function startless(
  file: string,
  run: string | undefined,
  opens: string | undefined,
  setup: string | undefined,
): string | undefined {
  if (run !== undefined) return undefined;
  if (opens === undefined) return `${file} doesn't say what to run or open.`;
  if (/^https?:\/\//i.test(opens)) return `${file} opens ${opens} but doesn't say what to run.`;
  if (setup !== undefined) return `${file} has a setup but nothing to run.`;
  return undefined;
}

/**
 * What a press runs, as the Mac compares it with its folder's run file: setup, then run, then
 * `open` and what it opens. What it opens is part of it, so a run file that changed only where it
 * opens is shown again before it runs (SEC-46).
 */
export function commandOf(recipe: RunRecipe): string {
  const opens = recipe.opens === undefined ? undefined : `open ${recipe.opens}`;
  return [recipe.setup, recipe.run, opens].filter((line) => line !== undefined).join("\n");
}

/**
 * Files the Mac runs when it opens them: an app, a script Terminal or a launcher runs, an installer,
 * a link elsewhere. A document, a picture or a page opens in its app; these start only as `run`.
 */
const PROGRAM =
  /\.(?:app|command|tool|sh|zsh|bash|csh|ksh|py|rb|pl|jar|pkg|mpkg|dmg|terminal|workflow|action|applescript|scpt|scptd|webloc|inetloc|fileloc)$/i;

/**
 * Whether opening a path runs a program, by its last part once `.`, `..` and slashes are settled
 * as the Mac settles them: `play.command/.` is `play.command` (SEC-46). The Mac asks again of the
 * file it opens, after links.
 */
export function opensAProgram(path: string): boolean {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  }
  return PROGRAM.test(parts.at(-1) ?? "");
}

/** An address on the Mac itself, or a file in the project. */
function opensOnTheMac(opens: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(opens)) {
    if (!/^https?:\/\//i.test(opens)) return false;
    try {
      const { hostname } = new URL(opens);
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    } catch {
      return false;
    }
  }
  return !opens.startsWith("/") && !opens.split(/[\\/]/).includes("..");
}

/**
 * What Run shows of `opens`: `localhost:8000`, or the file's name. An address of this Mac's own,
 * `127.0.0.1` or `[::1]`, which Run opens to reach exactly where a program listens (ADR 0230),
 * reads as `localhost`.
 */
export function opensShown(opens: string): string {
  return opens
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:127\.0\.0\.1|\[::1\])(?=[:/]|$)/, "localhost")
    .replace(/\/$/, "");
}

/** A run of the room's project on the person's Mac (ADR 0226), as that Mac tells it. */
export const projectRun = z.object({
  state: z
    .enum(["never", "starting", "running", "ended", "failed", "stopped", "opened"])
    .describe(
      "Never run on that Mac; starting (setup, or waiting for it to answer); running; ended by itself; failed; stopped by the person; or opened, for pages that need no starting.",
    ),
  command: z
    .string()
    .max(COMMAND_MOST)
    .optional()
    .describe(
      "What ran: `setup`, `run` and `open` with what it opens, a line each; the bar compares it with the recipe's.",
    ),
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/)
    .optional()
    .describe(
      "The room's `main` the folder had when it started, so the bar can name who changed the files since (SEC-40).",
    ),
  since: isoTimestamp.optional(),
  ended: isoTimestamp.optional(),
  code: z.int().optional().describe("How it ended, as its shell said."),
  opened: z.string().max(600).optional().describe("What it opened, once it answered."),
  lines: z
    .array(z.string().max(400))
    .max(20)
    .optional()
    .describe("Its last lines, when it ended, or while it runs and something went wrong."),
  why: z
    .string()
    .max(400)
    .optional()
    .describe(
      "Why the Mac didn't run it when it was last asked, in its words: no run file, or a different one.",
    ),
  trouble: z
    .string()
    .max(400)
    .optional()
    .describe(
      "What went wrong with the run itself, in plain words (ADR 0230): a port in use, a program the Mac doesn't have, nothing answering, the browser refusing its address.",
    ),
});
export type ProjectRun = z.infer<typeof projectRun>;

/** A run as the server holds it for the person's other devices: which Mac said it, and when. */
export const heldRun = projectRun.extend({
  mac: z.string().min(1).max(120).describe("The name of the Mac it runs on."),
  said_at: isoTimestamp,
});
export type HeldRun = z.infer<typeof heldRun>;

/**
 * `GET /v1/spaces/:id/project/run`'s answer: how the person's last run of the room stands, as
 * their Mac last said, and how many of their Macs are open now to run or stop it.
 */
export const projectRunAnswer = z.object({
  run: heldRun.optional(),
  macs: z.int().nonnegative(),
});
export type ProjectRunAnswer = z.infer<typeof projectRunAnswer>;

/** A git object id: SHA-1, or SHA-256 for a repository made with it. */
export const commitId = z
  .string()
  .regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/)
  .describe("A commit, by its full git object id.");

/** The most files `project.changed` names; the rest are counted. */
export const PROJECT_CHANGED_FILES = 200;

export const projectChangedFile = z.object({
  path: z.string().min(1).max(1024).describe("Its path in the project, with `/` between folders."),
  added: z.int().nonnegative().nullable().describe("Lines added; `null` for a binary file."),
  removed: z.int().nonnegative().nullable().describe("Lines removed; `null` for a binary file."),
});

export const projectChangedPayload = z.object({
  by: z
    .string()
    .min(1)
    .max(120)
    .describe("Who pushed: the agent a harness named, or the person. Recorded by Chips."),
  before: commitId.nullable().describe("Where `main` was, or `null` for the project's first push."),
  after: commitId.describe("Where `main` is now."),
  commits: z.int().positive().describe("How many commits the push added to `main`."),
  message: z.string().max(300).describe("The first line of the newest commit's message."),
  files: z
    .array(projectChangedFile)
    .max(PROJECT_CHANGED_FILES)
    .describe("What changed between `before` and `after`, in path order."),
  more_files: z.int().positive().optional().describe("How many more files changed than are named."),
  file_count: z
    .int()
    .nonnegative()
    .optional()
    .describe("How many files `main` has now, for the room sheet's Project tile (ADR 0222)."),
  undoes: commitId
    .optional()
    .describe(
      "The change this one takes back, when it is a person's Undo, or Put it back's Undo of an Undo (ADR 0222).",
    ),
});

/**
 * A name that says a file holds secrets, `.env`, `.env.local` and the like, and the names of the
 * examples people commit, `.env.example`, `.env.sample` and `.env.template`, which don't. Sources,
 * as `SECRET_SHAPES` are.
 */
export const SECRETS_FILE = {
  source: "^\\.env(?:\\..+)?$",
  unless: "^\\.env\\.(?:example|sample|template)$",
} as const;

const SECRETS_NAME = new RegExp(SECRETS_FILE.source);
const EXAMPLE_NAME = new RegExp(SECRETS_FILE.unless);

/** Whether a file's name says it holds secrets, wherever it is in the project. */
export function isSecretsFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return SECRETS_NAME.test(name) && !EXAMPLE_NAME.test(name);
}

/**
 * What a key looks like, by whose it is: the shapes a push is refused for. Sources, not
 * expressions, since the server's check runs in git's hook, a process of its own.
 */
export const SECRET_SHAPES: readonly { readonly what: string; readonly source: string }[] = [
  { what: "a Chips token", source: "chips_(?:at|inv|j|pt)_[A-Za-z0-9_-]{20,}" },
  // `sk-` begins a word, so a link's words ("…/elon-musk-terafab-project-…") are never a key.
  { what: "an Anthropic key", source: "\\bsk-ant-[A-Za-z0-9_-]{20,}" },
  { what: "an OpenAI key", source: "\\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{40,}" },
  { what: "an AWS access key", source: "\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b" },
  {
    what: "a GitHub token",
    source: "\\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})",
  },
  { what: "a private key", source: "-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----" },
];

const SHAPES = SECRET_SHAPES.map((shape) => ({
  what: shape.what,
  pattern: new RegExp(shape.source),
}));

/** Whose key a file's words hold, by the first shape they match, or nothing. */
export function secretIn(text: string): string | undefined {
  return SHAPES.find((shape) => shape.pattern.test(text))?.what;
}

/**
 * What an agent's copy never commits, written into the copy's own `info/exclude` (ADR 0221): what
 * a build or a package manager makes, what macOS leaves, and secrets files, but not their examples.
 */
export const PROJECT_LEAVE_OUT: readonly string[] = [
  "node_modules/",
  ".venv/",
  "__pycache__/",
  "dist/",
  "build/",
  ".DS_Store",
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.sample",
  "!.env.template",
];

/** What an agent's turn is told of its copy of the room's project, before the turn (ADR 0221). */
export interface ProjectFacts {
  /** The copy, by its path on the agent's machine. */
  readonly folder: string;
  /** How many files the project has. */
  readonly files: number;
  /** What others changed since the agent's last turn, by path. */
  readonly changed: readonly string[];
  /** Who changed them, by name. */
  readonly by: readonly string[];
  /** Files left with both sides of a clash in them, for the agent to settle. */
  readonly clashes: readonly string[];
  /** Whose change they clashed with, by name. */
  readonly clashedWith: readonly string[];
  /** Files left out of the agent's last change, and why: a key, by whose it looks like. */
  readonly keys: readonly { readonly path: string; readonly what: string }[];
  /** Why the copy couldn't be brought up to date, when it couldn't. */
  readonly trouble?: string | undefined;
  /** Whether the project has Markdown files. */
  readonly markdown: boolean;
  /** Whether the project has an HTML page, which Chips builds into one document to open (ADR 0223). */
  readonly pages?: boolean | undefined;
}

/** `a, b and c`, or the first six and how many more. */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 6) return `${names.slice(0, 6).join(", ")} and ${names.length - 6} more`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The note an agent's turn opens its project with: where its copy is and that the bridge does the
 * git, what others changed, a clash to settle or a key to take out, and, in a room with other
 * agents, how to share the work. Its facts, then its asks (ADR 0250).
 */
export function renderProjectNote(
  facts: ProjectFacts,
  options: { readonly othersInRoom: boolean },
): string {
  return `${renderProjectFacts(facts)}\n${renderProjectAsks(facts, options)}`;
}

/**
 * What a turn is told of its copy of the project (ADR 0221): where it is, what others changed, and
 * a clash to settle or a key to take out. Said with every turn.
 */
export function renderProjectFacts(facts: ProjectFacts): string {
  const files = `${facts.files} file${facts.files === 1 ? "" : "s"}`;
  const lines = [
    `The space's project is a git repository. Your copy is ${facts.folder} (${files}), ${
      facts.trouble === undefined ? "brought up to date just now" : "not brought up to date"
    }.`,
  ];
  if (facts.changed.length > 0) {
    const by = facts.by.length > 0 ? `, by ${namesInWords(facts.by)}` : "";
    lines.push(`Changed since your last turn: ${namesInWords(facts.changed)}${by}.`);
  }
  if (facts.trouble !== undefined) lines.push(`It couldn't be: ${facts.trouble}`);
  if (facts.clashes.length > 0) {
    const whose =
      facts.clashedWith.length > 0 ? `${namesInWords(facts.clashedWith)}'s` : "another change";
    lines.push(
      `Your last change to ${namesInWords(facts.clashes)} clashed with ${whose}, which reached the space first. Both sides are in those files now: yours between "<<<<<<< yours" and "=======", theirs from there to the ">>>>>>>" line that names them. Settle each, keeping what both meant, and take the marks out. Nothing of yours is sent until they're gone.`,
    );
  }
  for (const key of facts.keys) {
    lines.push(
      `${key.path} holds what looks like ${key.what}, so your last change wasn't sent: take it out and read it from outside the project.`,
    );
  }
  return lines.join("\n");
}

/**
 * What the note asks of every turn: where to work, and how, for the room and the files it has. The
 * same from turn to turn while the project and the room keep their shape, so a session that keeps
 * its earlier turns may be told them once (ADR 0250).
 */
export function renderProjectAsks(
  facts: Pick<ProjectFacts, "markdown" | "pages">,
  options: { readonly othersInRoom: boolean },
): string {
  const lines = [
    "Work on the project in that folder and leave git to Chips: when your turn ends, what you changed is committed under your name and sent to everyone here. Keep scratch work outside it.",
    // Sent with the answer too, a project's file became a room file of its own, with versions of
    // its own, and the agents of a room argued over which copy was current (Phase 8, Run D).
    "Everyone here sees the project's files, so don't send them with your answer as well.",
  ];
  if (options.othersInRoom) {
    lines.push(
      "Split the work by file where you can. Changes to different parts of a file are merged, and a clash goes back to whoever sent second.",
      // Agents whose files must agree each renamed theirs to match the other's at once, so the
      // names crossed back and forth (Phase 8, AP-7): the project's history says who keeps theirs.
      "When your file and another's use different names for the same thing, the one that reached the project first keeps its names, and the other changes its names to match.",
    );
  }
  // Universe opens what the space made (ADR 0227): its documents in Chips, its program on the Mac.
  lines.push(
    "When what you make is to be read (pages, PDFs, pictures), keep a start page at .chips/index.html that links to the documents worth seeing (its links start ../), with the documents themselves at the top or in folders of their own, and bring it up to date whenever you add, rename or replace one. Chips opens it in the app, where links to the project's files open too and web links open in the browser. One document needs no start page.",
    'When what you make has to run on the person\'s Mac (a server, a script, an app), keep .chips/run.json so Run in Chips can start it from the project\'s folder: {"run": "the one shell command that starts it", "opens": "http://localhost:<port>, to open once it answers", "setup": "a command run first when it changes, like npm install"}. Have it print the address it listens on, like http://localhost:4173, which is what Run opens; "opens" is for a program that prints none. Everything it runs belongs in the project: Run refuses a command that goes anywhere outside the project\'s folder (a cd elsewhere, a path in a home folder). Start an app by its own program rather than with open, so Stop can close it, and leave starting it to Run rather than starting it yourself. Leave out what it doesn\'t need, and check it works in your copy before you say it does.',
  );
  if (facts.markdown) lines.push("In Markdown, put each sentence on a line of its own.");
  if (facts.pages === true) {
    lines.push(
      "A page opens in Chips as one document: name every file it needs in its tags and imports (<link>, <script src>, <img src>, import), since it can't fetch files while it runs.",
    );
  }
  return lines.join("\n");
}

/** What a file of the project is, by its name's extension (ADR 0222): how a client opens it. */
const PROJECT_FILE_TYPES: Readonly<Record<string, string>> = {
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/** Code and other words that open as plain text. */
const PROJECT_TEXT = new Set([
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "sh",
  "yml",
  "yaml",
  "toml",
  "ini",
  "xml",
  "sql",
  "gitignore",
  "env",
]);

/** A project file's media type, by its name: `text/plain` for code, `application/octet-stream` for the rest. */
export function projectFileType(path: string): string {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  return (
    PROJECT_FILE_TYPES[extension] ??
    (PROJECT_TEXT.has(extension) ? "text/plain" : "application/octet-stream")
  );
}

/** Whose a commit is, from the email Chips signs it with: an agent's or a person's id, or nothing. */
export function committerId(email: string): string | undefined {
  return /^((?:agt|usr|hrn)_[0-9A-Za-z]+)@(?:agents|people)\.chips\.invalid$/.exec(email)?.[1];
}

/** `GET /v1/spaces/:id/project/files`: the project's files at `main` (ADR 0222). */
export interface ProjectFilesAnswer {
  /** The commit they are at, or `null` before the project's first change. */
  readonly at: string | null;
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly type: string;
  }[];
}

/** `GET /v1/spaces/:id/project/changes/:commit`: one change and its diff (ADR 0222). */
export interface ProjectChangeAnswer {
  readonly commit: string;
  readonly parent: string | null;
  /** Who made it: their name as it was signed, and their id when Chips signed it. */
  readonly by: { readonly name: string; readonly id?: string | undefined };
  readonly at: string;
  readonly message: string;
  readonly files: readonly {
    readonly path: string;
    readonly added: number | null;
    readonly removed: number | null;
    /** The file's unified diff, or `null` for a binary file. */
    readonly patch: string | null;
    /** Whether the diff was cut short, the change being long. */
    readonly cut: boolean;
  }[];
  readonly more_files?: number | undefined;
}

/** `GET /v1/spaces/:id/project/history?path=`: one file's changes, newest first (ADR 0222). */
export interface ProjectHistoryAnswer {
  readonly path: string;
  readonly versions: readonly {
    readonly commit: string;
    readonly by: { readonly name: string; readonly id?: string | undefined };
    readonly at: string;
    readonly message: string;
  }[];
}

/** `POST /v1/spaces/:id/project/undo`: the change Undo made (ADR 0222). */
export interface ProjectUndoAnswer {
  readonly after: string;
}
