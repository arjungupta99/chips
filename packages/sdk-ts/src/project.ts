/**
 * A room's project, for one agent (ADR 0221): the agent works in a copy of its own, `<its
 * folder>/room`, and the bridge does the git, never the agent.
 *
 * - **Before a turn, `pull`.** The copy is made on first use, its leave-out list written into its
 *   own `info/exclude`, and brought up to date with the room's `main`. What a turn left unsent goes
 *   in first, so nothing of it is lost. What others changed since the agent's last turn, and who, is
 *   what the turn is told, with a clash still to settle or a key to take out (`renderProjectNote`).
 * - **After a turn, `push`.** Everything the agent changed is committed under its name, with the
 *   first line of its words for the subject, and sent. When somebody sent first, the agent's commits
 *   are replayed on top of theirs and sent again. When the two changes overlap, the replay stops and
 *   the two are merged instead, so that both sides are marked in the agent's copy, labelled `yours`
 *   and with whose they clashed with; nothing is sent until the agent has settled them.
 * - **What is never committed.** The leave-out list, and a file whose words look like a key: then
 *   nothing of the change is committed, and the next turn is told which file and why. The server
 *   refuses the same (ADR 0220), as the backstop.
 *
 * The token never reaches git's command line or a file: it goes through `GIT_CONFIG_*` in git's
 * environment, beside the agent in `chips-actor`, so an agent's own `git push` carries neither.
 * That keeps the token out of the copy, not out of the agent's reach: the agent can write the
 * copy's `.git/config`, which git reads on every run. So the bridge fetches and sends by the
 * project's URL, never what `origin` names, turns `core.fsmonitor` off, and leaves an agent's copy
 * alone while its config holds anything git and the bridge didn't put there, such as a rewritten
 * URL, a proxy or a program for git to run (SEC-52). git reads none of the machine's config and
 * runs none of its hooks, so a person's own git setup (a signing key, a hook, `pull.rebase`) changes
 * nothing here.
 *
 * **A person's folder** is the same copy with `person` set (ADR 0224), as the Mac app's Your folder
 * keeps it: the folder itself is the copy, the token a project token and the commits theirs. It is
 * never committed to behind their back: `look` brings it up to `main` only while nothing in it is
 * theirs, and `push` sends what they changed when they say Send.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isSecretsFile,
  namesInWords,
  PROJECT_ACTOR_HEADER,
  PROJECT_BRANCH,
  PROJECT_GIT_VERSION,
  PROJECT_LEAVE_OUT,
  type ProjectFacts,
  projectPath,
  secretIn,
} from "@chipschat/protocol";

export interface ProjectOptions {
  /** Where chipsd is: `http://127.0.0.1:4431`. */
  readonly url: string;
  /** The harness's token. */
  readonly token: string;
  readonly spaceId: string;
  /** The agent the turns are for: what `chips-actor` names, and the commits' author. */
  readonly agentId: string;
  /** The agent's name, as its commits are signed. */
  readonly name: string;
  /** The agent's own folder; its copy of the project is `room` in it. */
  readonly folder: string;
  /** The git to run. `git` on the `PATH` unless said. */
  readonly git?: string | undefined;
  /** The `PATH` git is run with. This process's unless said. */
  readonly path?: string | undefined;
  /** Told what went wrong, for the bridge's log. */
  readonly log?: ((line: string) => void) | undefined;
  /**
   * A person's own folder rather than an agent's copy (ADR 0224): `token` is a project token, sent
   * with no `chips-actor`; `agentId` is the person's id, their commits `<id>@people.chips.invalid`;
   * and the copy is `folder` itself.
   */
  readonly person?: boolean | undefined;
}

/** A file a person changed in their folder and hasn't sent, with the lines it adds and takes out. */
export interface FolderChange {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}

/** A person's folder as it stands (ADR 0224), for Your folder's card. */
export interface FolderLook {
  /** What they changed and haven't sent: none while it is the room's `main`. */
  readonly changed: readonly FolderChange[];
  /** Files with both sides of a clash marked in them, and whose change they clashed with. */
  readonly clashes: readonly string[];
  readonly clashedWith: readonly string[];
  /** The first marked lines of the first of them, with a line before and after. */
  readonly marked?: string | undefined;
  /** What others changed that isn't in the folder yet, because the person has changes of their own. */
  readonly since: readonly string[];
  readonly by: readonly string[];
  /** What came in from the room this time, and whose it was. */
  readonly came: readonly string[];
  readonly cameBy: readonly string[];
  /** Why the room's project couldn't be reached, in git's or the server's words. */
  readonly trouble?: string | undefined;
}

/** What `push` did with the turn's work. */
export type Pushed =
  | {
      readonly state: "sent";
      /** Where the room's `main` is now: this push's commit. */
      readonly commit: string;
      readonly files: readonly string[];
      /** Whose changes it was replayed on top of, by name; none when it went straight on. */
      readonly over: readonly string[];
    }
  /** Nothing changed in the copy. */
  | { readonly state: "nothing" }
  /** It clashed with somebody's change, and both sides are marked in the copy for the next turn. */
  | {
      readonly state: "clash";
      readonly files: readonly string[];
      readonly with: readonly string[];
    }
  /** A file in it looks like it holds a key, so nothing was committed. */
  | { readonly state: "keys"; readonly keys: readonly { path: string; what: string }[] }
  /** The room's project turned it back, in the server's words. */
  | { readonly state: "refused"; readonly why: string }
  /** It couldn't be sent: the server unreachable, or others sending first again and again. */
  | { readonly state: "failed"; readonly why: string };

interface Ran {
  readonly ok: boolean;
  readonly out: string;
  readonly err: string;
}

/** A file over this is not read for keys: keys live in config files and scripts. */
const READ_UP_TO = 4 * 1024 * 1024;
/** The most of a clash the card shows; the editor has the rest. */
const MARKED_LINES = 14;
/** How many times a push is replayed on top of others' before it gives up. */
const TRIES = 4;
const MARKS = /^(<<<<<<<|>>>>>>>) /m;
const REJECTED = /\[rejected\]|fetch first|non-fast-forward/;
/**
 * What `git init` and the bridge write in a copy's config (SEC-52), and what an agent's own git
 * may harmlessly add: a branch's upstream (`git push -u`) and a name for its commits, which mean
 * nothing to a bridge that fetches and sends by URL. git lists names lowercased.
 */
const OWN_CONFIG =
  /^(core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks)|remote\.origin\.(url|fetch)|branch\..+\.(remote|merge)|user\.(name|email))$/;

const lines = (said: string) => said.split("\n").filter((line) => line !== "");
const unique = (names: readonly string[]) => [...new Set(names)];

/** A commit's subject: the first line of the agent's words, as it said it. */
export function subjectOf(words: string): string {
  const first =
    words
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? "";
  if (first === "") return "A change to the project";
  return first.length <= 72 ? first : `${first.slice(0, 71)}…`;
}

/** What the server said, from git's `remote:` lines; git's own first line when it said none. */
function remoteWords(err: string): string {
  const said = lines(err)
    .filter((line) => line.startsWith("remote: "))
    .map((line) => line.slice("remote: ".length).trim())
    .filter((line) => line !== "" && !/^error: hook declined/.test(line));
  return said.length > 0 ? said.join(" ") : (lines(err)[0] ?? "git said nothing");
}

/** `[2, 50]` from `git version 2.50.1`; nothing from words that aren't one. */
function versionIn(said: string): readonly [number, number] | undefined {
  const found = /(\d+)\.(\d+)/.exec(said);
  return found === null ? undefined : [Number(found[1]), Number(found[2])];
}

/** What `push` did, in a few words for the bridge's log. */
export function pushedInWords(pushed: Pushed): string {
  switch (pushed.state) {
    case "sent": {
      const files = `${pushed.files.length} file${pushed.files.length === 1 ? "" : "s"}`;
      const over = pushed.over.length > 0 ? `, over ${namesInWords(pushed.over)}'s` : "";
      return `sent ${pushed.commit.slice(0, 7)} (${files}${over})`;
    }
    case "nothing":
      return "nothing to send";
    case "clash":
      return `held: ${namesInWords(pushed.files)} clashed with ${namesInWords(pushed.with) || "another change"}`;
    case "keys":
      return `held: ${namesInWords(pushed.keys.map((key) => `${key.path} (${key.what})`))}`;
    case "refused":
      return `refused: ${pushed.why}`;
    case "failed":
      return `not sent: ${pushed.why}`;
  }
}

/** A sentence's last words with one full stop after them, however they came. */
const stopped = (words: string) => `${words.trim().replace(/[.\s]+$/, "")}.`;

/**
 * What a reply says after its words when its change didn't reach the room's project (AP-6, ADR
 * 0222's addendum): a line in brackets, as a file that didn't attach has (`sendAnswer`), so that
 * "it's in the project" is never the last word on a change that isn't. Nothing when it was sent,
 * or when nothing changed.
 */
export function heldNote(pushed: Pushed, name: string): string | undefined {
  switch (pushed.state) {
    case "sent":
    case "nothing":
      return undefined;
    case "clash": {
      const whose =
        pushed.with.length === 0 ? "another change" : `${namesInWords(pushed.with)}'s change`;
      return `(Not in the space's project yet: ${namesInWords(pushed.files)} clashed with ${whose}. ${name} is asked to settle it next turn.)`;
    }
    case "keys": {
      const [first] = pushed.keys;
      const held =
        pushed.keys.length === 1 && first !== undefined
          ? `${first.path} looks like it holds ${first.what.replace(/, by its name$/, "")}`
          : `${namesInWords(pushed.keys.map((key) => key.path))} look like they hold keys`;
      return `(Not in the space's project: ${held}, so nothing was sent.)`;
    }
    case "refused":
      return `(Not in the space's project: it was turned back: ${stopped(pushed.why)})`;
    case "failed":
      return `(Not in the space's project: it couldn't be sent: ${stopped(pushed.why)})`;
  }
}

/** Whether this machine has a git new enough for a room's project, or why not. */
export async function checkGit(
  git = "git",
  // biome-ignore lint/style/noProcessEnv: git is found where the harness finds its tools.
  path = process.env["PATH"] ?? "/usr/bin:/bin",
): Promise<{ ok: true; version: string } | { ok: false; why: string }> {
  const [major, minor] = versionIn(PROJECT_GIT_VERSION) ?? [0, 0];
  return new Promise((resolve) => {
    execFile(git, ["--version"], { env: { PATH: path } }, (error, stdout) => {
      if (error !== null) return resolve({ ok: false, why: "git was not found on this machine" });
      const mine = versionIn(stdout);
      const enough =
        mine !== undefined && (mine[0] > major || (mine[0] === major && mine[1] >= minor));
      resolve(
        enough
          ? { ok: true, version: mine.join(".") }
          : { ok: false, why: `${stdout.trim()} is older than ${PROJECT_GIT_VERSION}` },
      );
    });
  });
}

export class Project {
  /** The agent's copy of the project. */
  readonly copy: string;
  private readonly remote: string;

  constructor(private readonly options: ProjectOptions) {
    this.copy = options.person === true ? options.folder : join(options.folder, "room");
    this.remote = `${options.url.replace(/\/$/, "").replace(/^ws/, "http")}${projectPath(options.spaceId)}`;
  }

  /** Before a turn: the copy made or brought up to date, and what the turn is to be told of it. */
  async pull(): Promise<ProjectFacts> {
    const made = await this.ready();
    const foreign = await this.foreignConfig();
    if (foreign !== undefined) return this.facts({ trouble: foreign });
    const known = await this.head("refs/remotes/origin/main");
    const marked = await this.marked();
    if (marked.length > 0) {
      // A clash not yet settled: nothing moves until it is, and the turn is told again.
      return this.facts({ clashes: marked, clashedWith: await this.mergingWith() });
    }
    const keys = await this.commit("Work left from a turn that didn't finish");
    if (keys.length > 0) {
      return this.facts({ keys, trouble: "a file in it looks like it holds a key." });
    }
    const fetched = await this.fetch();
    if (!fetched.ok) {
      const why = remoteWords(fetched.err);
      this.options.log?.(`project: ${this.options.name} couldn't fetch ${this.remote}: ${why}`);
      return this.facts({ trouble: why });
    }
    const remote = await this.head("refs/remotes/origin/main");
    if (remote === "") return this.facts({});
    const brought = await this.bringUp(remote);
    // What others changed since the agent last looked: since where the room's `main` was then, or
    // all of it when the agent's last turn found the project empty. Nothing for a copy made now.
    const since = known !== "" ? known : made ? undefined : await this.emptyTree();
    if (since === undefined || since === remote) return this.facts(brought);
    const changed = lines((await this.git(["diff", "--name-only", since, remote])).out);
    const by = await this.authors(known !== "" ? `${known}..${remote}` : remote);
    return this.facts({ changed, by, ...brought });
  }

  /** After a turn: what the agent changed, committed under its name and sent to the room. */
  async push(input: { readonly words: string }): Promise<Pushed> {
    if (!existsSync(join(this.copy, ".git"))) return { state: "nothing" };
    const foreign = await this.foreignConfig();
    if (foreign !== undefined) return { state: "failed", why: foreign };
    const marked = await this.marked();
    if (marked.length > 0) {
      return { state: "clash", files: marked, with: await this.mergingWith() };
    }
    const keys = await this.commit(subjectOf(input.words));
    if (keys.length > 0) return { state: "keys", keys };
    if ((await this.head("HEAD")) === "") return { state: "nothing" };

    let over: readonly string[] = [];
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const tried = await this.send(over);
      if ("state" in tried) return tried;
      over = tried.over;
    }
    return { state: "failed", why: "others kept sending first." };
  }

  /**
   * A person's folder made, or brought up to the room's `main` while nothing in it is theirs: no
   * file changed or added, nothing waiting to be sent, no clash (ADR 0224). Once something is
   * theirs, nothing in the folder changes; what others changed since is told instead.
   */
  async look(): Promise<FolderLook> {
    await this.ready();
    const fetched = await this.fetch();
    const trouble = fetched.ok ? undefined : remoteWords(fetched.err);
    const remote = await this.head("refs/remotes/origin/main");
    await this.settledAsTheirs(remote);
    const brought = await this.bringUntouched(remote);
    return { ...(await this.standing(remote)), ...brought, trouble };
  }

  /** The folder moved on to the room's `main` while nothing in it is theirs: what came in, whose. */
  private async bringUntouched(remote: string): Promise<{ came: string[]; cameBy: string[] }> {
    const mine = await this.head("HEAD");
    const none = { came: [], cameBy: [] };
    if (remote === "" || mine === remote || !(await this.untouched(mine, remote))) return none;
    const moved =
      mine === ""
        ? await this.git(["checkout", "--quiet", "-B", PROJECT_BRANCH, remote])
        : await this.git(["merge", "--quiet", "--ff-only", remote]);
    if (!moved.ok) return none;
    const from = mine === "" ? await this.emptyTree() : mine;
    return {
      came: lines((await this.git(["diff", "--name-only", from, remote])).out),
      cameBy: await this.authors(mine === "" ? remote : `${mine}..${remote}`),
    };
  }

  /**
   * A clash the person settled by taking the room's side whole: nothing of theirs is left to send,
   * so the folder goes back to the room's `main` and is kept up to date again. Every tracked file
   * is already the room's, and a file git doesn't track is never touched.
   */
  private async settledAsTheirs(remote: string): Promise<void> {
    if (remote === "" || !existsSync(join(this.copy, ".git", "MERGE_HEAD"))) return;
    if ((await this.marked()).length > 0) return;
    if (!(await this.git(["diff", "--quiet", remote])).ok) return;
    await this.git(["reset", "--quiet", "--hard", remote]);
  }

  /** Whether nothing in the folder is the person's own: no change, no unsent commit, no clash. */
  private async untouched(mine: string, remote: string): Promise<boolean> {
    if (existsSync(join(this.copy, ".git", "MERGE_HEAD"))) return false;
    const status = await this.git(["status", "--porcelain", "--untracked-files=all"]);
    if (!status.ok || status.out.trim() !== "") return false;
    if (mine === "") return true;
    return (await this.git(["merge-base", "--is-ancestor", mine, remote])).ok;
  }

  /** What the person changed, a clash, and what others changed that the folder hasn't. */
  private async standing(remote: string): Promise<Omit<FolderLook, "came" | "cameBy" | "trouble">> {
    const mine = await this.head("HEAD");
    const base = await this.baseOf(mine, remote);
    const counted = lines(
      (await this.git(["diff", "--numstat", "--no-renames", "-z", base])).out.replace(/\0/g, "\n"),
    ).map((line) => {
      const [added = "0", removed = "0", ...path] = line.split("\t");
      return { path: path.join("\t"), added: Number(added) || 0, removed: Number(removed) || 0 };
    });
    const added = lines(
      (await this.git(["ls-files", "--others", "--exclude-standard", "-z"])).out.replace(
        /\0/g,
        "\n",
      ),
    );
    const fresh = await Promise.all(
      added.map(async (path) => ({ path, added: await this.lineCount(path), removed: 0 })),
    );
    const changed = [...counted, ...fresh]
      .filter((change) => change.path !== "")
      .sort((a, b) => a.path.localeCompare(b.path));
    const clashes = await this.marked();
    const clashedWith = await this.mergingWith();
    const first = clashes[0];
    const marked = first === undefined ? undefined : await this.markedLines(first);
    const since =
      remote === "" || remote === base
        ? []
        : lines((await this.git(["diff", "--name-only", base, remote])).out);
    const by =
      since.length === 0 ? [] : await this.authors(mine === "" ? remote : `${base}..${remote}`);
    return { changed, clashes, clashedWith, marked, since, by };
  }

  /**
   * What the person's changes are measured from: where the folder and the room's `main` parted.
   * In a clash the room's side is already in the folder, so it is `main` itself: what differs from
   * it is what Send would change.
   */
  private async baseOf(mine: string, remote: string): Promise<string> {
    if (mine === "") return this.emptyTree();
    if (remote === "") return mine;
    if (existsSync(join(this.copy, ".git", "MERGE_HEAD"))) return remote;
    return (await this.git(["merge-base", mine, remote])).out.trim() || mine;
  }

  /** How many lines a file the person added has: the lines it adds. None for a picture. */
  private async lineCount(path: string): Promise<number> {
    try {
      const at = join(this.copy, path);
      if ((await stat(at)).size > READ_UP_TO) return 0;
      const words = await readFile(at, "utf8");
      if (words.includes("\0")) return 0;
      return words === "" ? 0 : words.split("\n").length - (words.endsWith("\n") ? 1 : 0);
    } catch {
      return 0;
    }
  }

  /** The first clash in a file, from the line before its first mark to the line after its last. */
  private async markedLines(path: string): Promise<string | undefined> {
    try {
      const all = (await readFile(join(this.copy, path), "utf8")).split("\n");
      const start = all.findIndex((line) => line.startsWith("<<<<<<< "));
      const end = all.findIndex((line, at) => at > start && line.startsWith(">>>>>>> "));
      if (start < 0 || end < 0) return undefined;
      const shown = all.slice(Math.max(0, start - 1), end + 2);
      return shown.length <= MARKED_LINES
        ? shown.join("\n")
        : [...shown.slice(0, MARKED_LINES - 1), "…"].join("\n");
    } catch {
      return undefined;
    }
  }

  /**
   * One try at sending: sent, nothing to send, or turned back; or, when somebody sent first, the
   * agent's commits replayed on top of theirs, for the next try, unless they clashed.
   */
  private async send(earlier: readonly string[]): Promise<Pushed | { over: readonly string[] }> {
    const fetched = await this.fetch();
    if (!fetched.ok) return { state: "failed", why: remoteWords(fetched.err) };
    const remote = await this.head("refs/remotes/origin/main");
    const ahead = await this.git([
      "rev-list",
      "--count",
      remote === "" ? "HEAD" : `${remote}..HEAD`,
    ]);
    if (ahead.out.trim() === "0") return { state: "nothing" };
    const sent = await this.git([
      "push",
      "--quiet",
      "--porcelain",
      this.remote,
      `HEAD:refs/heads/${PROJECT_BRANCH}`,
    ]);
    if (sent.ok) {
      const commit = await this.head("HEAD");
      // Sent by URL, git leaves `origin/main` where it was: the next turn counts from this commit.
      await this.git(["update-ref", "refs/remotes/origin/main", commit]);
      const from = remote === "" ? await this.emptyTree() : remote;
      const files = lines((await this.git(["diff", "--name-only", from, commit])).out);
      return { state: "sent", commit, files, over: earlier };
    }
    const said = `${sent.out}\n${sent.err}`;
    if (!REJECTED.test(said)) return { state: "refused", why: remoteWords(said) };
    // Somebody sent first: their commits fetched, and the agent's replayed on top.
    await this.fetch();
    const theirs = await this.head("refs/remotes/origin/main");
    const over = unique([...earlier, ...(await this.authors(`HEAD..${theirs}`))]);
    const replayed = await this.replay(theirs);
    if (replayed.trouble !== undefined) return { state: "failed", why: replayed.trouble };
    if (replayed.clashes === undefined) return { over };
    return { state: "clash", files: replayed.clashes, with: replayed.clashedWith ?? over };
  }

  /** The room's branches, from the project's own URL rather than whatever `origin` names (SEC-52). */
  private fetch(): Promise<Ran> {
    return this.git(["fetch", "--quiet", this.remote, "+refs/heads/*:refs/remotes/origin/*"]);
  }

  /**
   * Why an agent's copy is left alone: its config holds a setting git and the bridge didn't write,
   * or can't be read (SEC-52). Nothing for a person's folder, whose config is theirs.
   */
  private async foreignConfig(): Promise<string | undefined> {
    if (this.options.person === true) return undefined;
    const listed = await this.git(["config", "--local", "--list", "--name-only"]);
    if (!listed.ok) return remoteWords(listed.err);
    const foreign = unique(lines(listed.out).filter((key) => !OWN_CONFIG.test(key)));
    if (foreign.length === 0) return undefined;
    return `the copy's .git/config has settings Chips didn't put there (${namesInWords(foreign)}), so Chips won't fetch or send until they're taken out.`;
  }

  /**
   * The copy, made on first use, pointed at the room's project, its leave-out list written: whether
   * it was made now.
   */
  private async ready(): Promise<boolean> {
    if (existsSync(join(this.copy, ".git"))) {
      const pointed = (await this.git(["remote", "get-url", "origin"])).out.trim();
      if (pointed === this.remote) return false;
      if (this.options.person === true) {
        // A person's folder is found by its room (ADR 0224): the server moved, not the room.
        await this.git(["remote", "set-url", "origin", this.remote]);
        return false;
      }
      // The agent moved rooms (ADR 0087): its old copy is kept beside, named for that room.
      const was = /\/v1\/spaces\/([^/]+)\/project\.git$/.exec(pointed)?.[1] ?? "before";
      await rename(this.copy, join(this.options.folder, `room-${was}`));
    }
    await mkdir(this.copy, { recursive: true });
    await this.git(["init", "--quiet", `--initial-branch=${PROJECT_BRANCH}`]);
    await this.git(["remote", "add", "origin", this.remote]);
    await mkdir(join(this.copy, ".git", "info"), { recursive: true });
    await writeFile(
      join(this.copy, ".git", "info", "exclude"),
      `${PROJECT_LEAVE_OUT.join("\n")}\n`,
    );
    return true;
  }

  /** The copy at the room's `main`, with the agent's own unsent commits replayed on top. */
  private async bringUp(remote: string): Promise<Partial<ProjectFacts>> {
    const mine = await this.head("HEAD");
    if (mine === "") {
      const checked = await this.git(["checkout", "--quiet", "-B", PROJECT_BRANCH, remote]);
      return checked.ok ? {} : { trouble: remoteWords(checked.err) };
    }
    const replayed = await this.replay(remote);
    if (replayed.trouble !== undefined) return { trouble: replayed.trouble };
    return replayed.clashes === undefined
      ? {}
      : { clashes: replayed.clashes, clashedWith: replayed.clashedWith ?? [] };
  }

  /**
   * The agent's commits replayed on top of `onto`. Where they overlap, the replay is undone and the
   * two merged instead, which leaves both sides marked in the files, labelled for whose they are.
   * Two copies that both began in an empty project share no commit, and the merge is still made.
   */
  private async replay(onto: string): Promise<{
    clashes?: readonly string[];
    clashedWith?: readonly string[];
    trouble?: string;
  }> {
    const rebased = await this.git(["rebase", "--quiet", onto]);
    if (rebased.ok) return {};
    await this.git(["rebase", "--abort"]);
    const theirs = await this.authors(`HEAD..${onto}`);
    const merged = await this.git([
      "merge",
      "--quiet",
      "--no-edit",
      "--no-ff",
      "--allow-unrelated-histories",
      onto,
    ]);
    const clashes = lines((await this.git(["diff", "--name-only", "--diff-filter=U"])).out);
    if (clashes.length === 0) return merged.ok ? {} : { trouble: remoteWords(merged.err) };
    const label = theirs.length === 1 ? (theirs[0] ?? "the space") : "the space";
    for (const path of clashes) await this.label(path, onto, label);
    return { clashes, clashedWith: theirs };
  }

  /** git's labels for a clash's two sides, `HEAD` and a commit, as a person reads them. */
  private async label(path: string, onto: string, theirs: string): Promise<void> {
    const at = join(this.copy, path);
    try {
      const words = await readFile(at, "utf8");
      const relabelled = words
        .replace(/^<<<<<<< HEAD$/gm, "<<<<<<< yours")
        .replace(new RegExp(`^>>>>>>> ${onto}$`, "gm"), `>>>>>>> ${theirs}`);
      if (relabelled !== words) await writeFile(at, relabelled);
    } catch {
      // A file deleted on one side has no marks to label.
    }
  }

  /** Files git still holds as clashing that still carry marks. */
  private async marked(): Promise<string[]> {
    if (!existsSync(join(this.copy, ".git", "MERGE_HEAD"))) return [];
    const clashing = lines((await this.git(["diff", "--name-only", "--diff-filter=U"])).out);
    const marked: string[] = [];
    for (const path of clashing) {
      try {
        if (MARKS.test(await readFile(join(this.copy, path), "utf8"))) marked.push(path);
      } catch {
        // Gone from the copy: the agent settled it by deleting it.
      }
    }
    return marked;
  }

  /** Whose change a clash in progress is with, by name. */
  private async mergingWith(): Promise<string[]> {
    if (!existsSync(join(this.copy, ".git", "MERGE_HEAD"))) return [];
    return this.authors("HEAD..MERGE_HEAD");
  }

  /**
   * Everything in the copy committed as the agent, a clash it settled included; nothing when
   * nothing changed. A file that looks like it holds a key stops the commit: the keys, by file.
   */
  private async commit(subject: string): Promise<{ path: string; what: string }[]> {
    if (!existsSync(join(this.copy, ".git"))) return [];
    await this.git(["add", "--all"]);
    const staged = lines(
      (await this.git(["diff", "--cached", "--name-only", "--diff-filter=AMC"])).out,
    );
    const keys = await this.keysIn(staged);
    if (keys.length > 0) {
      await this.git(["reset", "--quiet"]);
      return keys;
    }
    const merging = existsSync(join(this.copy, ".git", "MERGE_HEAD"));
    const nothing = (await this.git(["diff", "--cached", "--quiet"])).ok;
    if (nothing && !merging) return [];
    // A settled clash too goes under the agent's words, not git's "Merge commit '…'".
    const made = await this.git(["commit", "--quiet", "-m", subject]);
    if (!made.ok) this.options.log?.(`project: ${this.options.name} couldn't commit: ${made.err}`);
    return [];
  }

  /** Which of these files hold what looks like a key, and whose. */
  private async keysIn(paths: readonly string[]): Promise<{ path: string; what: string }[]> {
    const keys: { path: string; what: string }[] = [];
    for (const path of paths) {
      if (isSecretsFile(path)) {
        keys.push({ path, what: "secrets, by its name" });
        continue;
      }
      const at = join(this.copy, path);
      try {
        if ((await stat(at)).size > READ_UP_TO) continue;
        const what = secretIn(await readFile(at, "latin1"));
        if (what !== undefined) keys.push({ path, what });
      } catch {
        // Gone again before it could be read: nothing to send.
      }
    }
    return keys;
  }

  private async facts(found: Partial<ProjectFacts>): Promise<ProjectFacts> {
    const tracked = lines((await this.git(["ls-files"])).out);
    return {
      folder: this.copy,
      files: tracked.length,
      changed: found.changed ?? [],
      by: (found.by ?? []).filter((name) => name !== this.options.name),
      clashes: found.clashes ?? [],
      clashedWith: found.clashedWith ?? [],
      keys: found.keys ?? [],
      trouble: found.trouble,
      markdown: tracked.some((path) => /\.(md|markdown)$/i.test(path)),
      pages: tracked.some((path) => /\.html?$/i.test(path)),
    };
  }

  /** Who made the commits in a range, by name, the agent itself left out. */
  private async authors(range: string): Promise<string[]> {
    const names = lines((await this.git(["log", "--no-merges", "--format=%an", range])).out);
    return unique(names.filter((name) => name !== this.options.name));
  }

  private async head(ref: string): Promise<string> {
    return (await this.git(["rev-parse", "--quiet", "--verify", `${ref}^{commit}`])).out.trim();
  }

  private async emptyTree(): Promise<string> {
    return (await this.git(["hash-object", "-t", "tree", "/dev/null"])).out.trim();
  }

  private git(args: readonly string[]): Promise<Ran> {
    const { options } = this;
    const person = options.person === true;
    const email = `${options.agentId}@${person ? "people" : "agents"}.chips.invalid`;
    const pairs: [string, string][] = [
      ["http.extraHeader", `Authorization: Bearer ${options.token}`],
      // A person's project token says who they are; an agent's harness token needs the agent.
      ...(person
        ? []
        : ([["http.extraHeader", `${PROJECT_ACTOR_HEADER}: ${options.agentId}`]] as [
            string,
            string,
          ][])),
      ["core.hooksPath", "/dev/null"],
      // A program git would run on most commands, with the token in its environment (SEC-52).
      // Empty is off in every git from 2.31; before 2.36, "false" would be run as the program.
      ["core.fsmonitor", ""],
      ["commit.gpgSign", "false"],
      ["merge.conflictStyle", "merge"],
      ["core.quotePath", "false"],
    ];
    const env: Record<string, string> = {
      // biome-ignore lint/style/noProcessEnv: git is found where the harness finds its tools.
      PATH: options.path ?? process.env["PATH"] ?? "/usr/bin:/bin",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: options.name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: options.name,
      GIT_COMMITTER_EMAIL: email,
      GIT_EDITOR: "true",
      GIT_CONFIG_COUNT: String(pairs.length),
    };
    pairs.forEach(([key, value], at) => {
      env[`GIT_CONFIG_KEY_${at}`] = key;
      env[`GIT_CONFIG_VALUE_${at}`] = value;
    });
    return new Promise((resolve) => {
      execFile(
        options.git ?? "git",
        [...args],
        { cwd: this.copy, env, maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => resolve({ ok: error === null, out: stdout, err: stderr }),
      );
    });
  }
}
