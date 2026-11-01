/**
 * A room's project in the fake (ADR 0220): one bare git repository per room, in a folder of the
 * fake's own, served by git's `http-backend` as the server serves it, behind the harness's token
 * and the agent it names in `chips-actor`. A push that moves `main` is recorded as
 * `project.changed`, before git's answer ends, as the server records it.
 *
 * It keeps git's own refusals, no rewriting or deleting `main`, and pushes to a room are taken one
 * at a time. It does not check each push for secrets, sizes or other branches, as the server's
 * hook does: the SDK makes the same check before it commits (ADR 0221), and that is what a bridge
 * is tested on. A machine with no git answers 503, in words, as the server does.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECT_ACTOR_HEADER, PROJECT_BRANCH, PROJECT_CHANGED_FILES } from "@chipschat/protocol";
import type { Workspace } from "./workspace.js";

/** git told what a room's project may take, through its environment, as the server tells it. */
const POLICY: readonly (readonly [string, string])[] = [
  ["receive.denyNonFastForwards", "true"],
  ["receive.denyDeletes", "true"],
  ["receive.fsckObjects", "true"],
  ["http.receivepack", "true"],
];

function environment(): Record<string, string> {
  const env: Record<string, string> = {
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: String(POLICY.length),
  };
  POLICY.forEach(([key, value], at) => {
    env[`GIT_CONFIG_KEY_${at}`] = key;
    env[`GIT_CONFIG_VALUE_${at}`] = value;
  });
  return env;
}

function git(args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, env: environment(), encoding: "utf8" }, (error, stdout) =>
      error === null ? resolve(stdout) : reject(error),
    );
  });
}

function words(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...(status === 401 ? { "www-authenticate": 'Basic realm="Chips"' } : {}),
  });
  response.end(`${message}\n`);
}

/** A CGI answer's head, `Status:` and its headers to the empty line; nothing until that has come. */
function cgiHead(
  bytes: Buffer,
): { status: number; headers: Record<string, string>; rest: Buffer } | undefined {
  const end = bytes.indexOf("\r\n\r\n");
  if (end < 0) return undefined;
  let status = 200;
  const headers: Record<string, string> = {};
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

export class FakeProjects {
  private readonly root = mkdtempSync(join(tmpdir(), "chips-fake-projects-"));
  /** The push going on in each room, which the next one waits for. */
  private readonly pushing = new Map<string, Promise<void>>();

  constructor(private readonly workspace: Workspace) {}

  /** One of git's requests to a room's project, from a harness whose token has been checked. */
  async serve(
    request: IncomingMessage,
    response: ServerResponse,
    asked: { readonly spaceId: string; readonly rest: string; readonly query: string },
  ): Promise<void> {
    const admitted = this.admit(request, asked);
    if (typeof admitted !== "string") return words(response, admitted.status, admitted.message);
    try {
      await this.ensure(asked.spaceId);
    } catch {
      return words(
        response,
        503,
        "Projects are off on this server: git was not found on this machine.",
      );
    }
    if (request.method === "POST" && asked.rest === "/git-receive-pack") {
      return this.push(request, response, asked, admitted);
    }
    return this.backend(request, response, asked, admitted);
  }

  /** The agent a request is for, or the words it is refused with. */
  private admit(
    request: IncomingMessage,
    asked: { readonly spaceId: string; readonly rest: string },
  ): string | { status: number; message: string } {
    const method = request.method ?? "GET";
    const reads = method === "GET" && asked.rest === "/info/refs";
    const posts =
      method === "POST" &&
      (asked.rest === "/git-upload-pack" || asked.rest === "/git-receive-pack");
    if (!reads && !posts) {
      return {
        status: 404,
        message: "A space's project answers git's smart HTTP, and nothing else.",
      };
    }
    const actor = request.headers[PROJECT_ACTOR_HEADER];
    const agentId = typeof actor === "string" ? actor : undefined;
    const refused = this.workspace.refuseOnProject(agentId, asked.spaceId);
    if (refused !== undefined) {
      return { status: refused.endsWith("with that id.") ? 404 : 403, message: refused };
    }
    return agentId ?? "";
  }

  /** A push, in the room's turn, recorded before git's answer ends when it moved `main`. */
  private async push(
    request: IncomingMessage,
    response: ServerResponse,
    asked: { readonly spaceId: string; readonly rest: string; readonly query: string },
    agentId: string,
  ): Promise<void> {
    const release = await this.turnIn(asked.spaceId);
    try {
      const before = await this.head(asked.spaceId);
      await this.backend(request, response, asked, agentId, async () => {
        const after = await this.head(asked.spaceId);
        if (after === null || after === before) return;
        const change = await this.changes(asked.spaceId, before, after);
        this.workspace.recordProjectChange(asked.spaceId, agentId, change);
      });
    } finally {
      release();
    }
  }

  close(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  private directoryOf(spaceId: string): string {
    if (!/^spc_[0-9A-Z]{26}$/.test(spaceId)) throw new Error(`not a space: ${spaceId}`);
    return join(this.root, `${spaceId}.git`);
  }

  private async ensure(spaceId: string): Promise<void> {
    const directory = this.directoryOf(spaceId);
    if (existsSync(join(directory, "HEAD"))) return;
    await git([
      "init",
      "--quiet",
      "--bare",
      "--template=",
      `--initial-branch=${PROJECT_BRANCH}`,
      directory,
    ]);
  }

  private async head(spaceId: string): Promise<string | null> {
    try {
      return (
        (
          await git(
            ["rev-parse", "--verify", "--quiet", `refs/heads/${PROJECT_BRANCH}`],
            this.directoryOf(spaceId),
          )
        ).trim() || null
      );
    } catch {
      return null;
    }
  }

  private async changes(
    spaceId: string,
    before: string | null,
    after: string,
  ): Promise<Record<string, unknown>> {
    const directory = this.directoryOf(spaceId);
    const from =
      before ?? (await git(["hash-object", "-t", "tree", "/dev/null"], directory)).trim();
    const range = before === null ? [after] : [after, `^${before}`];
    const count = await git(["rev-list", "--count", ...range], directory);
    const subject = await git(["log", "-1", "--format=%s", after], directory);
    const files = (await git(["diff", "--numstat", "-z", "--no-renames", from, after], directory))
      .split("\0")
      .filter((entry) => entry !== "")
      .map((entry) => {
        const [added = "-", removed = "-", ...path] = entry.split("\t");
        return {
          path: path.join("\t"),
          added: added === "-" ? null : Number(added),
          removed: removed === "-" ? null : Number(removed),
        };
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return {
      before,
      after,
      commits: Number(count.trim()),
      message: subject.trim().slice(0, 300),
      files: files.slice(0, PROJECT_CHANGED_FILES),
      ...(files.length > PROJECT_CHANGED_FILES
        ? { more_files: files.length - PROJECT_CHANGED_FILES }
        : {}),
    };
  }

  private async turnIn(spaceId: string): Promise<() => void> {
    const before = this.pushing.get(spaceId) ?? Promise.resolve();
    let release = () => {};
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = before.then(() => mine);
    this.pushing.set(spaceId, chained);
    await before;
    return () => {
      release();
      if (this.pushing.get(spaceId) === chained) this.pushing.delete(spaceId);
    };
  }

  /** git's answer, streamed back; `after` runs once git is done, before the answer ends. */
  private backend(
    request: IncomingMessage,
    response: ServerResponse,
    asked: { readonly spaceId: string; readonly rest: string; readonly query: string },
    who: string,
    after?: () => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn("git", ["http-backend"], {
        env: {
          ...environment(),
          GIT_PROJECT_ROOT: this.root,
          GIT_HTTP_EXPORT_ALL: "1",
          REMOTE_USER: who,
          REQUEST_METHOD: request.method ?? "GET",
          PATH_INFO: `/${asked.spaceId}.git${asked.rest}`,
          QUERY_STRING: asked.query,
          CONTENT_TYPE: request.headers["content-type"] ?? "",
          HTTP_CONTENT_ENCODING: request.headers["content-encoding"] ?? "",
          GIT_PROTOCOL: String(request.headers["git-protocol"] ?? ""),
        },
      });
      request.pipe(child.stdin);
      child.stdin.on("error", () => child.kill());
      let head = Buffer.alloc(0);
      let answered = false;
      const held: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => {
        if (answered) {
          held.push(chunk);
          return;
        }
        head = Buffer.concat([head, chunk]);
        const parsed = cgiHead(head);
        if (parsed === undefined) return;
        answered = true;
        response.writeHead(parsed.status, parsed.headers);
        held.push(parsed.rest);
      });
      child.on("close", () => {
        void (async () => {
          if (!answered) {
            words(response, 500, "git could not answer for this project.");
            resolve();
            return;
          }
          // Written once git is done, the record first: what the answer says has been recorded.
          await after?.().catch(() => undefined);
          response.end(Buffer.concat(held));
          resolve();
        })();
      });
    });
  }
}
