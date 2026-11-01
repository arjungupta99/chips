/**
 * The room's files as a person sees them (ADR 0099, ADR 0100). The server keeps the list: the
 * current version of each name, newest first (`store.roomFiles`), and one name's versions
 * (`store.fileVersions`). A device reads the list again when a line carrying a file lands in the
 * room or one is taken back (`fileLinesKey`), rather than working versions out from the lines it
 * holds, which are only the room's newest pages: its version numbers are always the server's.
 *
 * Files leaves out what nobody works on: a voice note, said in the room, and a photo or a video
 * with the name a picker or a camera gives (`image.png`, `IMG_0233.png`). Nine screenshots called
 * `image.png` are no file's nine versions. Both stay in the room and in the viewer, and agents are
 * still handed them (ADR 0099).
 */

import { type Attachment, isVoiceNoteName, kindOf } from "../attachments.js";
import { type Directory, nameOf } from "../events.js";
import type { Space } from "./types.js";

/** One of a room's files at one of its versions, and who posted it. */
export interface RoomFileOf {
  readonly name: string;
  readonly version: number;
  readonly attachment: Attachment;
  /** Who posted this version: a participant id. */
  readonly by: string;
  /** What they went by when the server said, for somebody this device no longer knows. */
  readonly byName: string;
  readonly at: string;
  /** The line that posted it, by the id the device's lines go by. */
  readonly lineId?: string | undefined;
}

/** A name a photo library, a camera or a pasted picture gives, rather than one somebody chose. */
const PICKED = [
  /^(?:image|photo|video|picture|screenshot)(?:[-_ ]?\d+)?\.[a-z0-9]+$/i,
  /^(?:IMG|VID|PXL|MVIMG|DSC|DSCN)_?\d+[\w-]*\.[a-z0-9]+$/i,
];

/** Whether a file of this name and type has a place in the room's Files (ADR 0100). */
export function inFiles(name: string, mimeType: string): boolean {
  const kind = kindOf(mimeType);
  if (kind === "audio" && isVoiceNoteName(name)) return false;
  if (kind !== "image" && kind !== "video") return true;
  return !PICKED.some((picked) => picked.test(name));
}

/**
 * What changes when the room's files may have: a line carrying a file landing, or being taken
 * back. A device reads the list again when it does, and not for every other line.
 */
export function fileLinesKey(space: Pick<Space, "lines">): string {
  let count = 0;
  let last = "";
  for (const line of space.lines) {
    if (line.deleted === true || line.pending === true) continue;
    if ((line.attachments ?? []).length === 0) continue;
    count += 1;
    last = line.id;
  }
  return `${count}:${last}`;
}

/**
 * Who posted a version, as Files says it: `you`, a name the directory knows, or the name the server
 * gave for somebody this device no longer does.
 */
export function postedBy(file: RoomFileOf, directory: Directory, selfId: string): string {
  if (file.by === selfId) return "you";
  return directory[file.by] === undefined ? file.byName : nameOf(directory, file.by);
}
