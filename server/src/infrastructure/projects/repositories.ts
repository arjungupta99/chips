/**
 * The rooms' repositories (ADR 0220): one bare git repository per room, under the projects folder
 * beside the database, made on first use with `main` as its only branch, and served by git's own
 * `git http-backend`, as the spike's door did, in a process of its own for each request.
 *
 * What a repository may take is said to git on every request, through its environment, rather
 * than kept in the repository's own config, so that nothing written into a repository can loosen
 * it: no rewriting or deleting `main`, every object checked as it arrives, the push held to what
 * the room has left, and the check every push meets (`hook.ts`). git reads no config of the
 * machine's or of whoever runs the server.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { PROJECT_BRANCH, PROJECT_CHANGED_FILES } from "@chipschat/protocol";
import type {
  ProjectChanges,
  ProjectRequest,
  ProjectStore,
  Served,
} from "../../application/ports/projects.js";
import type { Git } from "./git.js";
import { rulesFor, writeHooks } from "./hook.js";
import { createReader } from "./reading.js";

const SPACE_ID = /^spc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** What `git http-backend` printed on stderr, kept to its end, for the log. */
const STDERR_TAIL = 4096;

export interface ProjectRepositoriesOptions {
  readonly git: Git;
  /** The projects folder: `<data dir>/projects`. */
  readonly root: string;
  /** The node that runs the hook: this process's. */
  readonly node: string;
  /** Told what git said on stderr for a request that went wrong. */
  readonly onGitError?: (spaceId: string, said: string) => void;
}

function run(git: Git, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      git.path,
      [...args],
      { cwd, env: plainEnvironment(git), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => (error === null ? resolve(stdout) : reject(error)),
    );
  });
}

/** git's whole environment: where it and the tools it calls are, and no config but what is given. */
function plainEnvironment(git: Git): Record<string, string> {
  return {
    PATH: `${dirname(git.path)}:/usr/bin:/bin`,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
}

/** Config for one git process, as `GIT_CONFIG_COUNT` and its keys and values. */
function configEnvironment(pairs: readonly (readonly [string, string])[]): Record<string, string> {
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(pairs.length) };
  pairs.forEach(([key, value], at) => {
    env[`GIT_CONFIG_KEY_${at}`] = key;
    env[`GIT_CONFIG_VALUE_${at}`] = value;
  });
  return env;
}

/** Every file's bytes under a folder, added up. */
async function bytesUnder(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    total += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return total;
}

/**
 * `git diff --numstat -z`: `added\tremoved\tpath\0` for each file, `-` for both counts of a binary
 * one.
 */
function numstat(said: string): { path: string; added: number | null; removed: number | null }[] {
  return said
    .split("\0")
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [added = "-", removed = "-", ...path] = entry.split("\t");
      return {
        path: path.join("\t"),
        added: added === "-" ? null : Number(added),
        removed: removed === "-" ? null : Number(removed),
      };
    });
}

/**
 * A CGI answer's head, `Status: 200 OK` and its headers, ended by an empty line; what follows is
 * the body. Nothing until the empty line has come.
 */
function cgiHead(
  bytes: Buffer,
): { status: number; headers: Record<string, string>; rest: Buffer } | undefined {
  const end = bytes.indexOf("\r\n\r\n");
  if (end < 0) return undefined;
  const headers: Record<string, string> = {};
  let status = 200;
  for (const line of bytes.subarray(0, end).toString("latin1").split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name.toLowerCase() === "status") status = Number.parseInt(value, 10) || 500;
    else headers[name] = value;
  }
  return { status, headers, rest: bytes.subarray(end + 4) };
}

export function createProjectRepositories(options: ProjectRepositoriesOptions): ProjectStore {
  const { git, root } = options;
  /** The hooks folder, written once, on the first request: written again at each start. */
  let hooksWritten: Promise<string> | undefined;
  const hooksReady = (): Promise<string> => {
    hooksWritten ??= mkdir(root, { recursive: true }).then(() => writeHooks(root, options.node));
    return hooksWritten;
  };

  const reader = createReader(git, () => plainEnvironment(git));
  const HEAD_REF = `refs/heads/${PROJECT_BRANCH}`;
  /** A room's repository, when it has one. */
  const existing = (spaceId: string): string | undefined => {
    const directory = directoryOf(spaceId);
    return existsSync(join(directory, "HEAD")) ? directory : undefined;
  };

  function directoryOf(spaceId: string): string {
    // Only a room's id names a folder here, so no path can reach out of the projects folder.
    if (!SPACE_ID.test(spaceId)) throw new Error(`not a space: ${spaceId}`);
    return join(root, `${spaceId}.git`);
  }

  async function ensure(spaceId: string): Promise<string> {
    const directory = directoryOf(spaceId);
    if (!existsSync(join(directory, "HEAD"))) {
      // No template: no sample hooks, nothing a repository holds that the room didn't push.
      await run(git, [
        "init",
        "--quiet",
        "--bare",
        "--template=",
        `--initial-branch=${PROJECT_BRANCH}`,
        directory,
      ]);
    }
    return directory;
  }

  /** What every request's git is told, and a push's besides. */
  function policy(hooks: string, push: ProjectRequest["push"]): Record<string, string> {
    const pairs: [string, string][] = [
      ["core.hooksPath", hooks],
      ["receive.denyNonFastForwards", "true"],
      ["receive.denyDeletes", "true"],
      ["receive.fsckObjects", "true"],
      ["http.receivepack", "true"],
      ["uploadpack.allowFilter", "true"],
    ];
    // Never 0, which git reads as no limit: a room with nothing left takes no push at all.
    if (push !== undefined)
      pairs.push(["receive.maxInputSize", String(Math.max(1, push.bytesLeft))]);
    return {
      ...configEnvironment(pairs),
      ...(push === undefined ? {} : { CHIPS_PROJECT_RULES: rulesFor(push) }),
    };
  }

  async function head(spaceId: string): Promise<string | null> {
    const directory = directoryOf(spaceId);
    if (!existsSync(join(directory, "HEAD"))) return null;
    try {
      const said = await run(
        git,
        ["rev-parse", "--verify", "--quiet", `refs/heads/${PROJECT_BRANCH}`],
        directory,
      );
      return said.trim() || null;
    } catch {
      // An unborn `main`: nothing has been pushed yet.
      return null;
    }
  }

  async function changes(
    spaceId: string,
    before: string | null,
    after: string,
  ): Promise<ProjectChanges> {
    const directory = directoryOf(spaceId);
    const from =
      before ?? (await run(git, ["hash-object", "-t", "tree", "/dev/null"], directory)).trim();
    const range = before === null ? [after] : [after, `^${before}`];
    const [count, subject, stat] = await Promise.all([
      run(git, ["rev-list", "--count", ...range], directory),
      run(git, ["log", "-1", "--format=%s", after], directory),
      run(git, ["diff", "--numstat", "-z", "--no-renames", from, after], directory),
    ]);
    const files = numstat(stat).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return {
      commits: Number(count.trim()),
      message: subject.trim().slice(0, 300),
      files: files.slice(0, PROJECT_CHANGED_FILES),
      moreFiles: Math.max(0, files.length - PROJECT_CHANGED_FILES),
      fileCount: await reader.fileCount(directory, after),
    };
  }

  async function serve(request: ProjectRequest): Promise<Served> {
    const hooks = await hooksReady();
    await ensure(request.spaceId);
    return new Promise<Served>((resolve) => {
      const child = spawn(git.path, ["http-backend"], {
        env: {
          ...plainEnvironment(git),
          ...policy(hooks, request.push),
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: "1",
          REMOTE_USER: request.who,
          REQUEST_METHOD: request.method,
          PATH_INFO: `/${request.spaceId}.git${request.rest}`,
          QUERY_STRING: request.query,
          CONTENT_TYPE: request.contentType ?? "",
          ...(request.contentLength === undefined ? {} : { CONTENT_LENGTH: request.contentLength }),
          HTTP_CONTENT_ENCODING: request.contentEncoding ?? "",
          GIT_PROTOCOL: request.gitProtocol ?? "",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      answer(child, request, resolve);
    });
  }

  /** The child's answer as a response: its head once it has come, its body as it streams. */
  function answer(
    child: ChildProcess,
    request: ProjectRequest,
    resolve: (served: Served) => void,
  ): void {
    const { stdin, stdout, stderr } = child as ChildProcess & {
      stdin: NonNullable<ChildProcess["stdin"]>;
      stdout: NonNullable<ChildProcess["stdout"]>;
      stderr: NonNullable<ChildProcess["stderr"]>;
    };
    let said = "";
    let head = Buffer.alloc(0);
    let answered = false;
    let finished = false;
    const body = new PassThrough();
    const done = new Promise<number | null>((settle) => child.on("close", settle));
    // Whoever asked went away before git was done: git goes too, rather than wait on a reader.
    body.on("error", () => child.kill());
    body.on("close", () => {
      if (!finished) child.kill();
    });

    stdin.on("error", () => child.kill());
    if (request.body === null) stdin.end();
    else {
      const source = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
      source.on("error", () => child.kill());
      source.pipe(stdin);
    }
    stderr.on("data", (chunk: Buffer) => {
      said = (said + chunk.toString("utf8")).slice(-STDERR_TAIL);
    });
    // git waits while whoever asked catches up, so a large clone is never held here whole.
    const pass = (chunk: Buffer) => {
      if (body.write(chunk)) return;
      stdout.pause();
      body.once("drain", () => stdout.resume());
    };
    stdout.on("data", (chunk: Buffer) => {
      if (answered) {
        pass(chunk);
        return;
      }
      head = Buffer.concat([head, chunk]);
      const parsed = cgiHead(head);
      if (parsed === undefined) return;
      answered = true;
      pass(parsed.rest);
      resolve({
        status: parsed.status,
        headers: parsed.headers,
        body: Readable.toWeb(body) as ReadableStream<Uint8Array>,
        done,
      });
    });
    stdout.on("end", () => {
      finished = true;
      body.end();
    });
    void done.then((code) => {
      if (code !== 0 && said.trim() !== "") options.onGitError?.(request.spaceId, said.trim());
      if (answered) return;
      finished = true;
      body.end();
      resolve({
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: Readable.toWeb(
          Readable.from(["git could not answer for this project.\n"]),
        ) as ReadableStream<Uint8Array>,
        done,
      });
    });
  }

  return {
    git: { path: git.path, version: git.version },
    serve,
    head,
    changes,
    async files(spaceId, at) {
      const directory = existing(spaceId);
      return directory === undefined ? undefined : reader.files(directory, at ?? HEAD_REF);
    },
    async read(spaceId, path, at, max) {
      const directory = existing(spaceId);
      return directory === undefined
        ? undefined
        : reader.read(directory, path, at ?? HEAD_REF, max);
    },
    async archive(spaceId, at, max) {
      const directory = existing(spaceId);
      return directory === undefined ? undefined : reader.archive(directory, at ?? HEAD_REF, max);
    },
    async authorOf(spaceId, commit) {
      const directory = existing(spaceId);
      return directory === undefined ? undefined : reader.authorOf(directory, commit);
    },
    async history(spaceId, path) {
      const directory = existing(spaceId);
      return directory === undefined ? [] : reader.history(directory, path);
    },
    async change(spaceId, commit) {
      const directory = existing(spaceId);
      return directory === undefined ? undefined : reader.change(directory, commit);
    },
    async undo(spaceId, input) {
      const directory = existing(spaceId);
      return directory === undefined ? { state: "not_on_main" } : reader.undo(directory, input);
    },
    async sizeOf(spaceId) {
      const directory = directoryOf(spaceId);
      return existsSync(directory) ? bytesUnder(directory) : 0;
    },
    async remove(spaceId) {
      await rm(directoryOf(spaceId), { recursive: true, force: true });
    },
  };
}
