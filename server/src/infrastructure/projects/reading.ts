/**
 * What people read of a room's project, and the one change they make to it themselves (ADR 0222):
 * the files at `main` or at a change, one file's words and its history, one change with its diff,
 * and Undo. Every read is of the bare repository alone, by git's plumbing; Undo is git's three-way
 * merge of a change taken back onto `main`, written with no working tree and moved onto `main` only
 * if `main` is still where it was read.
 */

import { execFile } from "node:child_process";
import { PROJECT_BRANCH, PROJECT_CHANGED_FILES } from "@chipschat/protocol";
import type {
  ProjectChange,
  ProjectChangeFile,
  ProjectFile,
  ProjectFileVersion,
  Undone,
} from "../../application/ports/projects.js";
import { atLeast, type Git, versionOf } from "./git.js";

/** The most of a change's diff a person is handed; a file's diff past it is cut. */
const DIFF_CAP = 512 * 1024;
/** How many of a file's changes its history names. */
const HISTORY = 50;
/** `git merge-tree --merge-base`, which Undo needs. */
const UNDO_GIT = [2, 40] as const;

interface Ran {
  readonly code: number;
  readonly out: Buffer;
}

/** One git command in a room's repository, its output as bytes, never thrown: its exit code. */
function git(
  tool: Git,
  directory: string,
  args: readonly string[],
  env: Record<string, string>,
  maxBuffer = 64 * 1024 * 1024,
): Promise<Ran> {
  return new Promise((resolve) => {
    execFile(
      tool.path,
      [...args],
      { cwd: directory, env, encoding: "buffer", maxBuffer },
      (error, stdout) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : 128;
        resolve({ code, out: stdout });
      },
    );
  });
}

const text = (ran: Ran): string => ran.out.toString("utf8");
const fields = (said: string): string[] => said.split("\0");

export interface Reader {
  readonly files: (directory: string, at: string) => Promise<readonly ProjectFile[] | undefined>;
  readonly read: (
    directory: string,
    path: string,
    at: string,
    max: number,
  ) => Promise<{ bytes: Buffer } | { tooBig: number } | undefined>;
  readonly archive: (
    directory: string,
    at: string,
    max: number,
  ) => Promise<{ bytes: Buffer } | { tooBig: number } | undefined>;
  readonly history: (directory: string, path: string) => Promise<readonly ProjectFileVersion[]>;
  readonly change: (directory: string, commit: string) => Promise<ProjectChange | undefined>;
  readonly fileCount: (directory: string, at: string) => Promise<number>;
  readonly authorOf: (directory: string, commit: string) => Promise<string | undefined>;
  readonly undo: (
    directory: string,
    input: { commit: string; name: string; email: string; message: string },
  ) => Promise<Undone>;
}

export function createReader(tool: Git, environment: () => Record<string, string>): Reader {
  const run = (directory: string, args: readonly string[], max?: number) =>
    git(tool, directory, args, environment(), max);

  /** A commit's id, when it names one that `main` has; nothing otherwise. */
  async function onMain(directory: string, ref: string): Promise<string | undefined> {
    const commit = text(
      await run(directory, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]),
    ).trim();
    if (commit === "") return undefined;
    const reached = await run(directory, [
      "merge-base",
      "--is-ancestor",
      commit,
      `refs/heads/${PROJECT_BRANCH}`,
    ]);
    return reached.code === 0 ? commit : undefined;
  }

  async function files(directory: string, at: string): Promise<readonly ProjectFile[] | undefined> {
    const commit = await onMain(directory, at);
    if (commit === undefined) return undefined;
    // `<mode> <type> <object> <size>\t<path>\0` for each file, folders walked into.
    const said = text(await run(directory, ["ls-tree", "-r", "-l", "-z", commit]));
    return fields(said)
      .filter((entry) => entry !== "")
      .flatMap((entry) => {
        const tab = entry.indexOf("\t");
        const [, type, , size] = entry.slice(0, tab).split(/\s+/);
        if (type !== "blob") return [];
        return [{ path: entry.slice(tab + 1), bytes: Number(size) || 0 }];
      });
  }

  async function authorOf(directory: string, wanted: string): Promise<string | undefined> {
    const commit = await onMain(directory, wanted);
    if (commit === undefined) return undefined;
    return text(await run(directory, ["log", "-1", "--format=%ae", commit])).trim() || undefined;
  }

  async function fileCount(directory: string, at: string): Promise<number> {
    const said = text(await run(directory, ["ls-tree", "-r", "-z", "--name-only", at]));
    return fields(said).filter((entry) => entry !== "").length;
  }

  async function read(
    directory: string,
    path: string,
    at: string,
    max: number,
  ): Promise<{ bytes: Buffer } | { tooBig: number } | undefined> {
    const commit = await onMain(directory, at);
    if (commit === undefined || path.startsWith("/") || path.split("/").includes(".."))
      return undefined;
    const object = `${commit}:${path}`;
    const size = Number(text(await run(directory, ["cat-file", "-s", object])).trim());
    if (
      !Number.isFinite(size) ||
      text(await run(directory, ["cat-file", "-t", object])).trim() !== "blob"
    ) {
      return undefined;
    }
    if (size > max) return { tooBig: size };
    const blob = await run(directory, ["cat-file", "blob", object], size + 1024);
    return blob.code === 0 ? { bytes: blob.out } : undefined;
  }

  /**
   * The files at a commit as one zip. Their sizes are summed first, so a project past `max` is
   * refused without git zipping it; the zip of what passes is no bigger than its files and a
   * header for each.
   */
  async function archive(
    directory: string,
    at: string,
    max: number,
  ): Promise<{ bytes: Buffer } | { tooBig: number } | undefined> {
    const listed = await files(directory, at);
    const commit = await onMain(directory, at);
    if (listed === undefined || commit === undefined) return undefined;
    const size = listed.reduce((total, file) => total + file.bytes, 0);
    if (size > max) return { tooBig: size };
    const room = size + listed.length * 512 + 64 * 1024;
    const zipped = await run(directory, ["archive", "--format=zip", commit], room);
    return zipped.code === 0 ? { bytes: zipped.out } : undefined;
  }

  async function history(directory: string, path: string): Promise<readonly ProjectFileVersion[]> {
    const said = text(
      await run(directory, [
        "log",
        "-z",
        `-n${HISTORY}`,
        "--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s",
        `refs/heads/${PROJECT_BRANCH}`,
        "--",
        path,
      ]),
    );
    return fields(said)
      .filter((entry) => entry.trim() !== "")
      .map((entry) => {
        const [commit = "", name = "", email = "", at = "", message = ""] = entry
          .trim()
          .split("\x1f");
        return { commit, name, email, at, message };
      });
  }

  async function change(directory: string, wanted: string): Promise<ProjectChange | undefined> {
    const commit = await onMain(directory, wanted);
    if (commit === undefined) return undefined;
    const parent = text(
      await run(directory, ["rev-parse", "--verify", "--quiet", `${commit}^1`]),
    ).trim();
    const from =
      parent !== ""
        ? parent
        : text(await run(directory, ["hash-object", "-t", "tree", "/dev/null"])).trim();
    const [head = "", name = "", email = "", at = "", ...message] = text(
      await run(directory, ["log", "-1", "--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%B", commit]),
    ).split("\x1f");
    const counted = text(
      await run(directory, ["diff", "--numstat", "-z", "--no-renames", from, commit]),
    )
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
    const patches = splitPatch(
      text(
        await run(directory, [
          "diff",
          "--no-color",
          "--no-renames",
          "--no-ext-diff",
          "-U3",
          from,
          commit,
        ]),
      ),
    );
    let left = DIFF_CAP;
    const changed: ProjectChangeFile[] = counted.slice(0, PROJECT_CHANGED_FILES).map((file) => {
      const whole = file.added === null ? undefined : patches.get(file.path);
      if (whole === undefined) return { ...file, patch: null, cut: false };
      const cut = whole.length > left;
      const patch = cut ? whole.slice(0, Math.max(0, left)) : whole;
      left = Math.max(0, left - patch.length);
      return { ...file, patch, cut };
    });
    return {
      commit: head.trim() || commit,
      parent: parent === "" ? null : parent,
      name,
      email,
      at,
      message: message.join("\x1f").trim(),
      files: changed,
      moreFiles: Math.max(0, counted.length - PROJECT_CHANGED_FILES),
    };
  }

  async function undo(
    directory: string,
    input: { commit: string; name: string; email: string; message: string },
  ): Promise<Undone> {
    const version = versionOf(tool.version) ?? [];
    if (!atLeast(version, UNDO_GIT)) {
      return {
        state: "unsupported",
        why: `Undo needs git ${UNDO_GIT.join(".")} or newer, and this server has ${tool.version}.`,
      };
    }
    const main = text(
      await run(directory, ["rev-parse", "--verify", "--quiet", `refs/heads/${PROJECT_BRANCH}`]),
    ).trim();
    const commit = await onMain(directory, input.commit);
    if (main === "" || commit === undefined) return { state: "not_on_main" };
    const stamp = {
      ...environment(),
      GIT_AUTHOR_NAME: input.name,
      GIT_AUTHOR_EMAIL: input.email,
      GIT_COMMITTER_NAME: input.name,
      GIT_COMMITTER_EMAIL: input.email,
    };
    const tree = await takenBack(directory, commit, main, await baseOf(directory, commit, stamp));
    if (typeof tree !== "string") return tree;
    const made = text(
      await git(tool, directory, ["commit-tree", tree, "-p", main, "-m", input.message], stamp),
    ).trim();
    if (made === "") return { state: "unsupported", why: "git couldn't write the undo." };
    // Onto `main` only if it is still where it was read; the room's pushes wait their turn meanwhile.
    const moved = await run(directory, ["update-ref", `refs/heads/${PROJECT_BRANCH}`, made, main]);
    if (moved.code !== 0)
      return { state: "unsupported", why: "the project moved while it was being undone." };
    return { state: "done", before: main, after: made };
  }

  /** What a change came from: its first parent, or, for the project's first change, nothing at all. */
  async function baseOf(
    directory: string,
    commit: string,
    stamp: Record<string, string>,
  ): Promise<string> {
    const parent = text(
      await run(directory, ["rev-parse", "--verify", "--quiet", `${commit}^1`]),
    ).trim();
    if (parent !== "") return parent;
    const empty = text(
      await run(directory, ["hash-object", "-t", "tree", "-w", "/dev/null"]),
    ).trim();
    return text(
      await git(
        tool,
        directory,
        ["commit-tree", empty, "-m", "The project before its first change"],
        stamp,
      ),
    ).trim();
  }

  /**
   * The change taken back: merged with its own base, so what `main` did since stays. The tree it
   * leaves, or why there is none.
   */
  async function takenBack(
    directory: string,
    commit: string,
    main: string,
    base: string,
  ): Promise<string | Exclude<Undone, { readonly state: "done" }>> {
    const merged = await run(directory, [
      "merge-tree",
      "--write-tree",
      "--name-only",
      "--no-messages",
      `--merge-base=${commit}`,
      main,
      base,
    ]);
    const [tree = "", ...conflicted] = text(merged)
      .split("\n")
      .filter((line) => line !== "");
    if (merged.code === 1) return { state: "clash", files: [...new Set(conflicted)] };
    if (merged.code !== 0 || tree === "")
      return { state: "unsupported", why: "git couldn't take the change back." };
    return tree;
  }

  return { files, read, archive, history, change, fileCount, authorOf, undo };
}

/** A whole diff split by file, at each `diff --git a/… b/…` line, keyed by the file's path. */
function splitPatch(patch: string): Map<string, string> {
  const byFile = new Map<string, string>();
  const parts = patch.split(/^(?=diff --git )/m);
  for (const part of parts) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(part);
    if (header === null) continue;
    byFile.set(header[2] ?? header[1] ?? "", part);
  }
  return byFile;
}
