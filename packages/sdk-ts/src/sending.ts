/**
 * The files an answer sends to its room (ADR 0099). An agent names a file on a line of its own,
 * `MEDIA:<path>`, a convention some harnesses' agents already keep; the bridge takes those lines
 * out of the words and posts each file with them, so it reaches the people and agents in the room.
 * A path alone reaches nobody: in the Tic Tac Toe runs of 17 October 2026 (finding TT-7) three
 * harnesses' agents answered with a path on the Mac, a `127.0.0.1` link to a server they started,
 * or a site they hosted, and one went looking through the Mac for a way in.
 *
 * Only a file inside one of the agent's own folders is sent: a line naming any other (`~/.ssh/…`,
 * or a link out of the folder) is refused, and the post says so.
 */

import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Uploaded, UploadInput } from "./files.js";

/**
 * How a file reaches a room, said with every turn of an agent whose bridge sends its files. A turn
 * that works on the room's project is told that only a file outside it needs sending: told that a
 * file "reaches this room only when you send it", agents sent the project's files too, each a room
 * file with versions of its own, even after the project's note said not to (Phase 8, AP-3, AP-9).
 */
export function sendingFiles(options: { readonly project?: boolean | undefined } = {}): string {
  const which = options.project === true ? "A file that isn't in the space's project" : "A file";
  return (
    `${which} reaches this space only when you send it: put MEDIA:<path> on a line of its own in ` +
    "your answer, one line for each file, from your own folder. A path, or a link to this machine, " +
    "reaches nobody: the people and agents here cannot open your folder."
  );
}

/** How a file reaches a room that has no project to work on. */
export const SENDING_FILES = sendingFiles();

/** The most files one post carries (`message.post`'s `upload_ids`). */
export const MOST_FILES = 20;

/** The most bytes a file may have; Chips judges the size again by what the file is. */
export const MOST_FILE_BYTES = 100 * 1024 * 1024;

/** An answer's words with its `MEDIA:` lines taken out, and what those lines named, in order. */
export interface NamedFiles {
  readonly words: string;
  readonly named: readonly string[];
}

/** The `MEDIA:` lines of an answer, taken out of its words. A line that only mentions one stays. */
export function filesNamedIn(answer: string): NamedFiles {
  const named: string[] = [];
  const kept = answer.split("\n").filter((line) => {
    const media = /^\s*MEDIA:\s*(\S.*?)\s*$/.exec(line);
    if (media?.[1] === undefined) return true;
    if (!named.includes(media[1])) named.push(media[1]);
    return false;
  });
  return {
    words: kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    named,
  };
}

/** What one `MEDIA:` line turned out to be. */
export type Sendable =
  | { readonly kind: "file"; readonly filename: string; readonly bytes: Uint8Array }
  /** A web address, which goes back into the words rather than being fetched. */
  | { readonly kind: "link"; readonly url: string }
  | { readonly kind: "refused"; readonly name: string; readonly why: string };

/** Whether `path` is `folder` or inside it, both as the disk resolves them. */
function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}

/** Where a line points on this disk, or what it is instead: a web address, or nothing a file has. */
function pathOf(said: string): string | Sendable {
  if (/^https?:\/\//i.test(said)) return { kind: "link", url: said };
  if (/^file:/i.test(said)) {
    try {
      return fileURLToPath(said);
    } catch {
      return { kind: "refused", name: said, why: "its address is not a file's" };
    }
  }
  return said === "~" || said.startsWith("~/") ? homedir() + said.slice(1) : said;
}

/** Whether a file the disk resolved may go: inside a folder, a file, not empty, not too big. */
async function refusalOf(real: string, folders: readonly string[]): Promise<string | undefined> {
  const roots = await Promise.all(folders.map((folder) => realpath(folder).catch(() => undefined)));
  if (!roots.some((root) => root !== undefined && inside(real, root))) {
    return "it is outside the agent's folder";
  }
  const info = await stat(real);
  if (!info.isFile()) return "it is not a file";
  if (info.size === 0) return "it is empty";
  if (info.size > MOST_FILE_BYTES) return `it is larger than ${MOST_FILE_BYTES / 1024 / 1024} MB`;
  return undefined;
}

/**
 * A file a line named, read if it is inside one of `folders`. A relative path starts in the first
 * of them, and `~/` at the home of the user the bridge runs as.
 */
export async function readSendable(
  reference: string,
  folders: readonly string[],
): Promise<Sendable> {
  const said = reference.trim().replace(/^<(.*)>$/, "$1");
  const path = pathOf(said);
  if (typeof path !== "string") return path;
  const name = basename(path) || said;
  const first = folders[0];
  if (first === undefined) {
    return { kind: "refused", name, why: "this agent has no folder its files are sent from" };
  }
  const real = await realpath(isAbsolute(path) ? path : resolve(first, path)).catch(
    () => undefined,
  );
  if (real === undefined) return { kind: "refused", name, why: "it is not there" };
  const why = await refusalOf(real, folders);
  if (why !== undefined) return { kind: "refused", name, why };
  return { kind: "file", filename: basename(real), bytes: new Uint8Array(await readFile(real)) };
}

/** An answer as it is posted, its files sent. */
export interface SentAnswer {
  /** The words without their `MEDIA:` lines, then a link a line gave, and why a file did not go. */
  readonly text: string;
  /** For the post's `uploadIds`. */
  readonly uploadIds: readonly string[];
  /** The files sent, by name. */
  readonly sent: readonly string[];
  /** The run's summary: the post's text, or what it sent when it has no words. */
  readonly summary: string;
}

export interface SendOptions {
  /** The agent's own folders. A file outside them is not sent. */
  readonly folders: readonly string[];
  /** `chips.upload`. */
  readonly upload: (input: UploadInput) => Promise<Uploaded>;
}

/** One named file sent, or a note in its place: a link, or why it did not go. */
async function sendOne(
  reference: string,
  options: SendOptions,
  room: boolean,
): Promise<{ readonly sent?: Uploaded; readonly note?: string }> {
  const file = await readSendable(reference, options.folders);
  if (file.kind === "link") return { note: file.url };
  if (file.kind === "refused") return { note: `(${file.name} was not attached: ${file.why}.)` };
  if (!room) {
    return { note: `(${file.filename} was not attached: a message takes ${MOST_FILES} files.)` };
  }
  try {
    return { sent: await options.upload({ bytes: file.bytes, filename: file.filename }) };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { note: `(${file.filename} was not attached: Chips refused it: ${why})` };
  }
}

/**
 * Take an answer's `MEDIA:` lines out of its words and send each file they name. Nothing is thrown
 * for a file that cannot go: the post says why instead, so the room is never told of a file it
 * did not get.
 */
export async function sendAnswer(answer: string, options: SendOptions): Promise<SentAnswer> {
  const { words, named } = filesNamedIn(answer);
  const uploadIds: string[] = [];
  const sent: string[] = [];
  const notes: string[] = [];
  for (const reference of named) {
    const one = await sendOne(reference, options, uploadIds.length < MOST_FILES);
    if (one.sent !== undefined) {
      uploadIds.push(one.sent.attachmentId);
      sent.push(one.sent.filename);
    }
    if (one.note !== undefined) notes.push(one.note);
  }
  const text = [words, ...notes].filter((part) => part !== "").join("\n\n");
  const summary = text !== "" ? text : sent.length > 0 ? `Sent ${sent.join(", ")}.` : "";
  return { text, uploadIds, sent, summary };
}
