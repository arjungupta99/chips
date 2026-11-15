/**
 * Universe's Media in the room's own viewer (ADR 0227's addendum of 13 November 2026). The viewer
 * opens attachments through a `FileService`; a picture of the room's project is handed to it as an
 * attachment named for its path at the change that last brought it, and this service reads it from
 * the project instead: a square draws the server's small copy, the viewer its screen copy, and only
 * Share, Save and Copy fetch the file itself. Arjun, 13 November 2026, of a space of screenshots:
 * "the opening experience is poor".
 *
 * A server from before the copies, or a picture it can't read (a HEIC without the codec), refuses
 * with a 404, and the file itself is fetched in its place, once: the phone draws what it can.
 */

import {
  type Attachment,
  type DeckItem,
  fileNameOf,
  isRoomLine,
  type MediaItem,
  NO_LINE,
  type PictureWhere,
  pictureDeckOf,
  pictureIdOf,
  picturesOf as projectPicturesOf,
  type ShownPicture,
} from "@chipschat/core";
import { projectFileType } from "@chipschat/protocol";
import { Image } from "react-native";
import type { FileService, Viewed } from "./files";
import { findKept, keepLocally, openLocally, previewLocally } from "./local";
import type { ProjectActions } from "./RoomProject";

/** A picture as the viewer and the squares take it: its attachment, and the line it opens from. */
export type Shown = ShownPicture;

/** Where a picture is read: its path, at the change that last brought it. */
type Where = PictureWhere;

export { isRoomLine, NO_LINE };

/**
 * The pictures of Media as the viewer opens them, newest first, and the service that reads them.
 * `sizes` are the files' bytes as the listing gave them, for the viewer's details.
 */
export function picturesOf(
  media: readonly MediaItem[],
  head: string,
  sizes: Readonly<Record<string, number>>,
  files: PictureFiles,
): readonly Shown[] {
  return projectPicturesOf(media, head, sizes, files.know);
}

/**
 * The deck the viewer pages through: Media's pictures, in Media's order, each with its size where
 * it is known by now, so the stage draws it at its shape. Read when a square is tapped.
 */
export function deckOf(shown: readonly Shown[], files: PictureFiles): readonly DeckItem[] {
  return pictureDeckOf(shown, files.sizeOf);
}

export interface PictureFiles extends FileService {
  /** The id a picture is known by to the viewer, from where it is read. */
  readonly know: (where: Where) => string;
  /** A picture's size in pixels, once its copy or its file has come. */
  readonly sizeOf: (id: string) => { readonly width: number; readonly height: number } | undefined;
}

/** The pictures of one room's project, read for its Universe. */
export function createPictureFiles(project: ProjectActions, spaceId: string): PictureFiles {
  const known = new Map<string, Where>();
  const uris = new Map<string, Promise<string>>();
  const sizes = new Map<string, { readonly width: number; readonly height: number }>();
  const whereOf = (id: string): Where => {
    const where = known.get(id);
    if (where === undefined) throw new Error("That picture isn't in the space's project now.");
    return where;
  };
  const cached = (key: string, load: () => Promise<string>): Promise<string> => {
    let uri = uris.get(key);
    if (uri === undefined) {
      uri = load();
      uris.set(key, uri);
      uri.catch(() => uris.delete(key));
    }
    return uri;
  };
  const fileOf = (attachment: Attachment) =>
    cached(`file:${attachment.id}`, async () => {
      const kept = findKept(attachment.id, "file");
      if (kept !== undefined) return kept;
      const { path, at } = whereOf(attachment.id);
      const { bytes } = await project.file(path, at);
      return keepLocally(attachment.id, attachment.filename, attachment.mimeType, bytes);
    });
  /** A copy, or nothing when the server makes none of this picture: an older one makes none. */
  const copyOf = async (id: string, edge: "small" | "screen") => {
    const { path, at } = whereOf(id);
    try {
      const copy = await project.picture(path, edge, at);
      if (copy.width !== undefined && copy.height !== undefined) {
        sizes.set(id, { width: copy.width, height: copy.height });
      }
      return copy;
    } catch (failure) {
      if ((failure as { status?: unknown }).status !== 404) throw failure;
      return undefined;
    }
  };
  return {
    sizeOf: (id) => sizes.get(id),
    know(where) {
      const id = pictureIdOf(spaceId, where);
      known.set(id, where);
      return id;
    },
    // Asked of the server each time the app starts rather than taken from what the phone kept:
    // a few tens of kilobytes, and the answer says the picture's size, which the viewer needs.
    thumb: (id) =>
      cached(`thumb:${id}`, async () => {
        const copy = await copyOf(id, "small");
        if (copy !== undefined) {
          return keepLocally(`${id}-thumb`, "thumb.webp", copy.type, copy.bytes);
        }
        // No copy: the file itself, measured here, as an older server says nothing of its size.
        const { path } = whereOf(id);
        const uri = await fileOf({
          id,
          filename: fileNameOf(path),
          mimeType: projectFileType(path),
          byteSize: 0,
        });
        await Image.getSize(uri).then(
          (size) => sizes.set(id, size),
          () => undefined,
        );
        return uri;
      }),
    async view(attachment): Promise<Viewed> {
      const kept = findKept(attachment.id, "view");
      if (kept !== undefined) return { uri: kept, original: false };
      const copy = await copyOf(attachment.id, "screen");
      if (copy === undefined) return { uri: await fileOf(attachment), original: true };
      const uri = await cached(`view:${attachment.id}`, () =>
        keepLocally(`${attachment.id}-view`, "view.webp", copy.type, copy.bytes),
      );
      return { uri, original: false };
    },
    file: fileOf,
    upload: () =>
      Promise.reject(new Error("Universe shows the project's pictures; it sends none.")),
    play: () => Promise.reject(new Error("Universe shows pictures, not videos, for now.")),
    streamUrl: () => Promise.resolve(undefined),
    async open(attachment) {
      await openLocally(await fileOf(attachment), attachment.filename, attachment.mimeType);
    },
    async preview(attachment) {
      await previewLocally(await fileOf(attachment), attachment.filename, attachment.mimeType);
    },
    page: () => Promise.reject(new Error("A picture isn't a page.")),
  };
}
