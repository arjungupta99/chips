/**
 * The check git runs on every push to a room's project, before any ref moves (ADR 0220). git runs
 * it as a hook, in a process of its own, with the push's objects held aside, so it is a script and
 * not a module: the server writes it into its projects folder as it starts, with the node that
 * runs the server, and hands it the rules on each push (`CHIPS_PROJECT_RULES`). Every repository
 * takes its hooks from that one folder (`core.hooksPath`), so a repository holds no copy to go
 * stale.
 *
 * It refuses the whole push, naming each file and why, when:
 *
 * - a ref it moves is not `main`;
 * - a file is over the workspace's cap for files;
 * - a file's name says it holds secrets (`.env`, `.env.local`);
 * - a file's words hold what looks like a key.
 *
 * It looks at every commit the push adds, not only the last, since a key put in and taken out
 * again is still in the history everyone clones. Rewriting and deleting `main` are refused by git
 * itself, before the hook (`receive.denyNonFastForwards`, `receive.denyDeletes`). The SDK checks
 * the same things before it commits (ADR 0221), so this is the backstop.
 */

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SECRET_SHAPES, SECRETS_FILE } from "@chipschat/protocol";

/** What the hook is handed for one push. */
export interface PushRules {
  /** The most one file may be, in bytes. */
  readonly fileCap: number;
  /** The same, in words: `100 MB`. */
  readonly fileCapWords: string;
}

/** The rules as the hook reads them from its environment. */
export function rulesFor(push: PushRules): string {
  return JSON.stringify({
    fileCap: push.fileCap,
    fileCapWords: push.fileCapWords,
    secretsFile: SECRETS_FILE,
    shapes: SECRET_SHAPES,
  });
}

/**
 * The check itself, CommonJS for whichever node runs it. A file over four megabytes is checked
 * for its size and its name, not read for keys: a key lives in a config file or a script.
 */
const CHECK = `"use strict";
// Written by chipsd as it starts (ADR 0220): the check of a push to a space's project.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const rules = JSON.parse(process.env.CHIPS_PROJECT_RULES || "null");
if (rules === null) {
  process.stderr.write("This push came without Chips's rules, so it is refused.\\n");
  process.exit(1);
}
const shapes = rules.shapes.map((shape) => ({ what: shape.what, pattern: new RegExp(shape.source) }));
const secretsName = new RegExp(rules.secretsFile.source);
const exampleName = new RegExp(rules.secretsFile.unless);
const READ_UP_TO = 4 * 1024 * 1024;
const NONE = /^0+$/;

const git = (args, input) =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], { input, maxBuffer: 1 << 30 });
const lines = (out) => out.toString("utf8").split("\\n").filter((line) => line !== "");
const megabytes = (bytes) =>
  bytes < 1024 * 1024 ? Math.round(bytes / 1024) + " KB" : (bytes / 1048576).toFixed(1).replace(/\\.0$/, "") + " MB";
const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);

const refused = [];
const said = new Set();
const refuse = (words) => {
  if (said.has(words)) return;
  said.add(words);
  refused.push(words);
};

for (const line of lines(readFileSync(0))) {
  const [before, after, ref] = line.split(" ");
  if (ref !== "refs/heads/main") {
    refuse(ref + " isn't main: a space's project has one branch, main.");
    continue;
  }
  if (NONE.test(after)) continue;
  const range = NONE.test(before) ? [after] : [after, "^" + before];

  for (const path of lines(git(["log", "--format=", "--name-only", "--no-renames", "-m", "--diff-filter=AMC", ...range]))) {
    const name = baseName(path);
    if (secretsName.test(name) && !exampleName.test(name)) {
      refuse(path + " holds secrets, by its name: keep it outside the project.");
    }
  }

  const objects = lines(git(["rev-list", "--objects", ...range]));
  const pathOf = new Map();
  for (const object of objects) {
    const space = object.indexOf(" ");
    if (space > 0) pathOf.set(object.slice(0, space), object.slice(space + 1));
  }
  const toRead = [];
  const listed = lines(git(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], [...pathOf.keys()].join("\\n") + "\\n"));
  for (const entry of listed) {
    const [id, type, size] = entry.split(" ");
    if (type !== "blob") continue;
    const bytes = Number(size);
    const path = pathOf.get(id);
    if (bytes > rules.fileCap) {
      refuse(path + " is " + megabytes(bytes) + ", and files in a space's project are capped at " + rules.fileCapWords + ".");
    } else if (bytes <= READ_UP_TO) {
      toRead.push(id);
    }
  }
  if (toRead.length === 0) continue;
  const read = git(["cat-file", "--batch"], toRead.join("\\n") + "\\n");
  let at = 0;
  while (at < read.length) {
    const end = read.indexOf(10, at);
    const [id, , size] = read.subarray(at, end).toString("utf8").split(" ");
    const bytes = Number(size);
    const words = read.subarray(end + 1, end + 1 + bytes).toString("latin1");
    at = end + 1 + bytes + 1;
    const shape = shapes.find((candidate) => candidate.pattern.test(words));
    if (shape !== undefined) {
      refuse(pathOf.get(id) + " holds what looks like " + shape.what + ": take it out, and keep keys outside the project.");
    }
  }
}

if (refused.length > 0) {
  for (const words of refused) process.stderr.write(words + "\\n");
  process.exit(1);
}
`;

/** The folder every repository's hooks are read from, made or written over as the server starts. */
export async function writeHooks(root: string, node: string): Promise<string> {
  const hooks = join(root, ".hooks");
  await mkdir(hooks, { recursive: true });
  const check = join(hooks, "check-push.cjs");
  await writeFile(check, CHECK, { mode: 0o644 });
  const hook = join(hooks, "pre-receive");
  // A shell line rather than node on the first line: the path to node may have spaces in it.
  await writeFile(hook, `#!/bin/sh\nexec ${quoted(node)} ${quoted(check)}\n`, { mode: 0o755 });
  await chmod(hook, 0o755);
  return hooks;
}

/** A word for `sh`, in single quotes. */
function quoted(word: string): string {
  return `'${word.replaceAll("'", `'"'"'`)}'`;
}
