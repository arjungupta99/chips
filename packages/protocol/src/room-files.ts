/**
 * The room's files (ADR 0099). A file posted in a room is the room's: the files of one name are
 * its versions, in the order they were posted, and the newest is the current one. The ASCII Art
 * room (2 October 2026) had none of this: its agents were handed a path on another machine, and
 * the one page they shared was written over by whoever posted last.
 *
 * - **Versions.** Walking a room's files of one name in order, a file whose bytes differ from the
 *   version before it is the next version. The same bytes again are the same version, and bytes
 *   of an older one again are a new one: a revert is a change.
 * - **What a harness is handed.** The current version of each name, newest first, with a message
 *   for it (`context.files`), from `GET /v1/spaces/:id/files`, and from the context route.
 * - **Made from what.** A post says which version each of its files was made from (`replaces`). One
 *   made from bytes that are no longer the current version's is refused, `stale_file`, so two agents
 *   editing one file at once lose nothing silently: the one that loses is told who won, fetches the
 *   current version and redoes. A post that says nothing is the next version, unchecked.
 *
 * The server, the conformance fake and the SDK hand over the same list and refuse the same posts,
 * so the rules and the words live here, with the schemas.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most of a room's files a message hands over: its newest. The rest are the route's. */
export const ROOM_FILES_IN_CONTEXT = 20;
/** The most `GET /v1/spaces/:id/files` lists. */
export const ROOM_FILES_CEILING = 200;

/** The heading the room's files open with in the plain form. */
export const ROOM_FILES_HEADING = "Files in this space:";

/** The code a post is refused with when a file in it was made from a version no longer current. */
export const STALE_FILE = "stale_file";

export const roomFile = z
  .object({
    name: z.string().min(1).max(255).describe("The file's name, which its versions share."),
    version: z
      .int()
      .positive()
      .describe("Which version this is: 1 for the first, counting each change of its bytes."),
    attachment_id: id("attachment").describe(
      "The attachment that is this version: what a post names in `replaces` when it changes it.",
    ),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .describe("Lowercase hex digest of this version's bytes."),
    byte_size: z.int().nonnegative().describe("Size in bytes."),
    mime_type: z.string().min(1).max(255).describe("Sniffed from the bytes on upload."),
    by: z
      .object({
        id: z.string().min(1).max(120).describe("Their participant id."),
        kind: z.enum(["person", "harness", "agent", "system"]),
        name: z.string().min(1).max(120).describe("What they go by now."),
      })
      .describe("Who posted this version, as a line's `from` says it."),
    at: isoTimestamp.describe("When this version was posted."),
    message_id: id("message").optional().describe("The message that posted this version."),
    width: z.int().positive().optional().describe("Pixels, for a photo or a video."),
    height: z.int().positive().optional().describe("Pixels, for a photo or a video."),
    duration_ms: z.int().nonnegative().optional().describe("Milliseconds, for a sound or a video."),
    replaces: id("attachment")
      .optional()
      .describe(
        "In one name's versions (`?name=`): the version this one was made from, as its post said (`message.post.replaces`). Absent where the post said nothing, or named no version of this file.",
      ),
    url: z
      .url()
      .optional()
      .describe(
        "For a harness: a signed URL for this version, bound to its token, as a message's attachments are. Absent for a person, who fetches it by id.",
      ),
    url_expires_at: isoTimestamp.optional().describe("When `url` stops working."),
  })
  .describe(
    "One of a room's files at one of its versions: the current one, in the room's list (ADR 0099).",
  );
export type RoomFile = z.infer<typeof roomFile>;

export const roomFiles = z
  .array(roomFile)
  .max(ROOM_FILES_CEILING)
  .describe(
    "The current version of each of the room's files, newest first (ADR 0099); or, asked for one name (`?name=`), that name's versions, newest first (ADR 0100).",
  );

/** A file a message carried, where and by whom: what versions are worked out from. */
export interface PostedFile {
  /** The seq of the message that carried it. */
  readonly seq: number;
  readonly at: string;
  /** Who posted it: a participant id. */
  readonly by: string;
  readonly attachment_id: string;
  readonly filename: string;
  readonly sha256: string;
  readonly byte_size: number;
  readonly mime_type: string;
  /** The message that carried it. */
  readonly message_id?: string | undefined;
  /** Pixels and milliseconds, where the server measured them. */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly duration_ms?: number | undefined;
}

/** A version of a file: the post that made it, and which version it is. */
export interface FileVersion extends PostedFile {
  readonly version: number;
}

/**
 * Each name's versions, oldest first, from a room's files in the order they were posted. A file
 * whose bytes are the version before it is no version of its own.
 */
export function versionsOf(posted: readonly PostedFile[]): Map<string, FileVersion[]> {
  const versions = new Map<string, FileVersion[]>();
  for (const file of posted) {
    const known = versions.get(file.filename) ?? [];
    if (known.at(-1)?.sha256 === file.sha256) continue;
    known.push({ ...file, version: known.length + 1 });
    versions.set(file.filename, known);
  }
  return versions;
}

/** The current version of each name, newest first, as many as `most`. */
export function currentFiles(posted: readonly PostedFile[], most: number): FileVersion[] {
  const current = [...versionsOf(posted).values()].flatMap((known) => known.slice(-1));
  return current.sort((a, b) => b.seq - a.seq).slice(0, Math.max(0, most));
}

/** One name's versions, newest first, as many as `most` (ADR 0100). None for a name never posted. */
export function versionsNamed(
  posted: readonly PostedFile[],
  name: string,
  most: number,
): FileVersion[] {
  const known = versionsOf(posted.filter((file) => file.filename === name)).get(name) ?? [];
  return [...known].reverse().slice(0, Math.max(0, most));
}

/** A file a post carries that says which version it was made from. */
export interface MadeFrom {
  readonly filename: string;
  /** The bytes posted. */
  readonly sha256: string;
  /** The bytes of the version it says it was made from. */
  readonly from: string;
}

/** Why a post may not be taken: the first of its files made from a version no longer current. */
export interface StaleRefusal {
  readonly kind: typeof STALE_FILE;
  readonly message: string;
}

/**
 * The current version a post's file was not made from, when one was not: the first file made from
 * bytes that are not its name's current version, unless what it posts is the current version
 * already. A name with no version left in the room (each one taken back) has nothing to be stale
 * against. Nothing when the post may be taken.
 */
export function staleVersion(
  made: readonly MadeFrom[],
  versions: ReadonlyMap<string, readonly FileVersion[]>,
): FileVersion | undefined {
  for (const file of made) {
    const current = versions.get(file.filename)?.at(-1);
    if (current === undefined) continue;
    if (file.from === current.sha256 || file.sha256 === current.sha256) continue;
    return current;
  }
  return undefined;
}

/** The refusal of a post made from a version no longer current, naming who posted the current one. */
export function staleRefusal(
  current: Pick<FileVersion, "filename" | "version">,
  by: string,
): StaleRefusal {
  return { kind: STALE_FILE, message: staleWords(current, by) };
}

/**
 * The refusal's words, which name the file so an adapter can leave out just that one:
 * `ascii-alphabet.html is now v3, by Oc2. Fetch it and redo.`
 */
export function staleWords(current: Pick<FileVersion, "filename" | "version">, by: string): string {
  return `${current.filename} is now v${current.version}, by ${by}. Fetch it and redo.`;
}

/**
 * The room's files in the plain form, after the lines: one per file, `name · v3 · by Oc2 · when ·
 * url`. Nothing when there are none.
 */
export function renderRoomFiles(files: readonly RoomFile[] | undefined): string {
  if (files === undefined || files.length === 0) return "";
  const lines = files.map((file) =>
    [file.name, `v${file.version}`, `by ${file.by.name}`, file.at, file.url]
      .filter((part) => part !== undefined)
      .join(" · "),
  );
  return [ROOM_FILES_HEADING, ...lines].join("\n");
}
