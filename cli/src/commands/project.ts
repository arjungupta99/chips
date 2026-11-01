/**
 * `chips project clone <room> [folder]`: a room's project on this machine, as a git repository a
 * person works in and pushes to (ADR 0220, the plan's Phase 7). A push shows in the room as an
 * agent's does: "Arjun changed 2 files" (ADR 0222).
 *
 * git can't sign Chips's requests, so the CLI's paired device asks for a project token, good for a
 * short while, and gives it to git as the password. The clone keeps no token: its git config names
 * this CLI as its credential helper (`chips project credential`), which asks for a new one each time
 * git needs it, and nothing else in git's list of helpers is asked to store it.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectToken } from "@chipschat/protocol";
import { type CliDevice, call } from "../device.js";

/** A room as the CLI finds it: by its id, a link that has the id, or its name. */
export interface FoundRoom {
  readonly spaceId: string;
  readonly title: string;
}

/** The events the CLI reads a page at a time, to find a room by its name. */
const PAGE = 500;

interface EventsPage {
  readonly events: readonly {
    readonly seq: number;
    readonly type: string;
    readonly space_id?: string;
    readonly title?: unknown;
  }[];
  readonly next_cursor: number | null;
}

/** Every room this device's person is in, by its id, with the name it goes by now. */
async function roomTitles(device: CliDevice): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (let since = 0; ; ) {
    const page = await call<EventsPage>(device, "GET", `/v1/events?since=${since}&limit=${PAGE}`);
    for (const event of page.events) {
      const named =
        /^space\.(created|updated)$/.test(event.type) && typeof event.title === "string";
      if (named && event.space_id !== undefined) titles.set(event.space_id, String(event.title));
    }
    if (page.next_cursor === null || page.events.length === 0) return titles;
    since = page.next_cursor;
  }
}

/** The room asked for, by its id or a link with it in, or else by its name among the rooms here. */
export async function findRoom(device: CliDevice, asked: string): Promise<FoundRoom> {
  const id = /spc_[0-9A-HJKMNP-TV-Z]{26}/i.exec(asked)?.[0];
  const titles = await roomTitles(device);
  if (id !== undefined) return { spaceId: id, title: titles.get(id) ?? id };
  const wanted = asked.trim().toLowerCase();
  const named = [...titles].filter(([, title]) => title.trim().toLowerCase() === wanted);
  const [first] = named;
  if (named.length === 1 && first !== undefined) return { spaceId: first[0], title: first[1] };
  if (named.length > 1) {
    throw new Error(
      `${named.length} spaces are called ${asked}. Give one's id: ${named.map(([each]) => each).join(", ")}.`,
    );
  }
  throw new Error(
    `No space here is called ${asked}. Give its name as the space shows it, or its id.`,
  );
}

/** A folder name made from a room's name: `Sudoku night` → `sudoku-night`. */
export function folderFor(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "room-project" : slug;
}

/**
 * How git runs this CLI as its credential helper: the same Node and script, with the loader it was
 * started with (`tsx` in a checkout), quoted for git's shell.
 */
export function helperCommand(process: {
  readonly execPath: string;
  readonly execArgv: readonly string[];
  readonly argv: readonly string[];
}): string {
  const quote = (word: string) => `'${word.replace(/'/g, "'\\''")}'`;
  const script = process.argv[1] ?? "";
  return `!${[process.execPath, ...process.execArgv, script].map(quote).join(" ")} project credential`;
}

/** git's credential protocol: `key=value` lines, as git writes them to a helper. */
export function credentialAsked(input: string): Readonly<Record<string, string>> {
  const asked: Record<string, string> = {};
  for (const line of input.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) asked[line.slice(0, at)] = line.slice(at + 1);
  }
  return asked;
}

/**
 * The answer to git's `get`: a fresh project token as the password, for the room the path names.
 * Nothing for another server or a path that isn't a room's project, so git asks its other helpers.
 */
export async function credentialFor(
  device: CliDevice,
  asked: Readonly<Record<string, string>>,
): Promise<string> {
  const server = new URL(device.serverUrl);
  const spaceId = /^\/?v1\/spaces\/(spc_[0-9A-Za-z]+)\/project\.git/.exec(asked["path"] ?? "")?.[1];
  if (asked["host"] !== server.host || spaceId === undefined) return "";
  const { token } = await call<ProjectToken>(device, "POST", `/v1/spaces/${spaceId}/project/token`);
  return `username=chips\npassword=${token}\n`;
}

/** What `git` is given to run, so a test can watch it. */
export type Git = (args: readonly string[], cwd: string) => Promise<void>;

export const runGit: Git = (args, cwd) =>
  new Promise((done, failed) => {
    execFile("git", [...args], { cwd }, (error, _stdout, stderr) => {
      if (error === null) done();
      else failed(new Error(stderr.trim() || error.message));
    });
  });

/**
 * The room's project cloned into `folder`, its git told who the person is (so their commits are
 * theirs in the room's history) and to ask this CLI for a token whenever it needs one.
 */
export async function cloneProject(input: {
  readonly device: CliDevice;
  readonly room: FoundRoom;
  readonly folder: string;
  readonly cwd: string;
  readonly helper: string;
  readonly git?: Git | undefined;
}): Promise<string> {
  const { device, room } = input;
  const into = resolve(input.cwd, input.folder);
  if (existsSync(into))
    throw new Error(
      `${into} is there already. Name another folder: chips project clone "${room.title}" <folder>.`,
    );
  // Asked first, so a person who may not have it hears why before git says anything.
  const token = await call<ProjectToken>(
    device,
    "POST",
    `/v1/spaces/${room.spaceId}/project/token`,
  );
  const url = `${device.serverUrl}${token.path}`;
  const git = input.git ?? runGit;
  await git(
    [
      "clone",
      "--quiet",
      // Only this CLI answers for the project: the empty helper clears git's own list first.
      "-c",
      "credential.helper=",
      "-c",
      `credential.helper=${input.helper}`,
      "-c",
      "credential.useHttpPath=true",
      "-c",
      `user.name=${device.displayName}`,
      "-c",
      `user.email=${device.participantId}@people.chips.invalid`,
      url,
      into,
    ],
    input.cwd,
  );
  return into;
}
