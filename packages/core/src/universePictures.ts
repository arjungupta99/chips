/**
 * Universe's pictures as a room's viewer takes them (ADR 0227's addenda of 13 and 14 November
 * 2026), the same on the phone, the web and the Mac. A picture of the room's project is handed to
 * the viewer as an attachment named for its path at the change that last brought it; each client
 * reads it from the project through its own files (`universeMedia.ts` on the phone,
 * `universePictures.ts` on the web), a small copy for a square or a row, a screen copy for the
 * viewer, and the file itself only for Download, Save, Share or Copy.
 */

import { projectFileType } from "@chipschat/protocol";
import type { Attachment } from "./attachments.js";
import { fileNameOf } from "./projectPage.js";
import type { MediaItem } from "./universe.js";
import type { DeckItem } from "./viewer.js";

/** Where a picture is read: its path, at the change that last brought it. */
export interface PictureWhere {
  readonly path: string;
  readonly at: string | undefined;
}

/** A picture as the viewer and the squares take it: its attachment, and the line it opens from. */
export interface ShownPicture {
  readonly item: MediaItem;
  readonly attachment: Attachment;
  readonly lineId: string;
}

/** The line a picture with no reply goes to: none of the room's, so Go to message only closes. */
export const NO_LINE = "universe:";

/** Whether Go to message names a line of the room. */
export function isRoomLine(lineId: string): boolean {
  return !lineId.startsWith(NO_LINE);
}

/**
 * Pictures as the viewer opens them, in the order given, each known by the id `know` gives where it
 * is read. `sizes` are the files' bytes as the listing gave them, for the viewer's details.
 */
export function picturesOf(
  media: readonly MediaItem[],
  head: string,
  sizes: Readonly<Record<string, number>>,
  know: (where: PictureWhere) => string,
): readonly ShownPicture[] {
  return media.map((item) => {
    const at = item.change?.commit ?? (head === "" ? undefined : head);
    const id = know({ path: item.path, at });
    return {
      item,
      attachment: {
        id,
        filename: fileNameOf(item.path),
        mimeType: projectFileType(item.path),
        byteSize: sizes[item.path] ?? 0,
      },
      lineId: item.change?.reply ?? `${NO_LINE}${item.path}`,
    };
  });
}

/**
 * The deck the viewer pages through: the pictures in their order, each with its size where it is
 * known by now, so the stage draws it at its shape. Read when a picture is opened.
 */
export function pictureDeckOf(
  shown: readonly ShownPicture[],
  sizeOf: (id: string) => { readonly width: number; readonly height: number } | undefined,
): readonly DeckItem[] {
  return shown.map(({ item, attachment, lineId }) => ({
    attachment: { ...attachment, ...sizeOf(attachment.id) },
    lineId,
    saidBy: item.change?.by ?? "",
    ts: item.change?.at ?? "",
    kind: "photo",
    inMessage: { index: 1, of: 1 },
  }));
}

/**
 * A picture's id, as the viewer and a client's kept files know it: letters and digits only, so a
 * kept file's name parses back to it, and the same for the same picture at the same change.
 */
export function pictureIdOf(spaceId: string, where: PictureWhere): string {
  const words = `${spaceId}\u0000${where.at ?? ""}\u0000${where.path}`;
  let one = 0x81_1c_9d_c5;
  let two = 0x01_00_01_93;
  for (let at = 0; at < words.length; at += 1) {
    const code = words.charCodeAt(at);
    one = Math.imul(one ^ code, 0x01_00_01_93) >>> 0;
    two = Math.imul(two ^ code, 0x5b_d1_e9_95) >>> 0;
  }
  return `uv${one.toString(36)}${two.toString(36)}`;
}
