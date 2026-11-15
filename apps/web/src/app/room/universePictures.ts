/**
 * Universe's pictures in the web's and the Mac's viewer (ADR 0227's addenda of 13 and 14 November
 * 2026), as the phone's `universeMedia.ts` hands them to its own. The viewer opens attachments
 * through a `FileService`; a picture of the room's project is handed to it as an attachment named
 * for its path at the change that last brought it (core's `picturesOf`), and this service reads it
 * from the project instead: a square or a row draws the server's small copy, the viewer its screen
 * copy, and only Download and Copy fetch the file itself.
 *
 * A server from before the copies, or a picture it can't read (a HEIC without the codec), refuses
 * with a 404, and the file itself is read in its place, once: the window draws what it can.
 */

import { type PictureWhere, pictureIdOf } from "@chipschat/core";
import type { FileService, Viewed } from "../files.ts";
import type { ProjectActions } from "./Project.tsx";

export interface PictureFiles extends FileService {
  /** The id a picture is known by to the viewer, from where it is read. */
  readonly know: (where: PictureWhere) => string;
  /** A picture's size in pixels, once its copy or its file has come. */
  readonly sizeOf: (id: string) => { readonly width: number; readonly height: number } | undefined;
}

/** What a picture's 404 looks like, from the store: a status on the error. */
function refused(failure: unknown): boolean {
  return (failure as { status?: unknown } | null)?.status === 404;
}

/** A picture's size, read from the picture itself where the server said none. */
function measured(url: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}

/** The pictures of one room's project, read for its Universe. */
export function createPictureFiles(
  project: Pick<ProjectActions, "file" | "picture">,
  spaceId: string,
): PictureFiles {
  const known = new Map<string, PictureWhere>();
  const urls = new Map<string, Promise<string>>();
  const sizes = new Map<string, { readonly width: number; readonly height: number }>();
  const whereOf = (id: string): PictureWhere => {
    const where = known.get(id);
    if (where === undefined) throw new Error("That picture isn't in the space's project now.");
    return where;
  };
  const cached = (key: string, load: () => Promise<Blob>): Promise<string> => {
    let url = urls.get(key);
    if (url === undefined) {
      url = load().then((blob) => URL.createObjectURL(blob));
      urls.set(key, url);
      url.catch(() => urls.delete(key));
    }
    return url;
  };
  const blobOf = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });
  const fileOf = (id: string) =>
    cached(`file:${id}`, async () => {
      const { path, at } = whereOf(id);
      const { bytes, type } = await project.file(path, at);
      return blobOf(bytes, type);
    });
  /** A copy, or nothing when the server makes none of this picture: an older one makes none. */
  const copyOf = (id: string, edge: "small" | "screen") =>
    cached(`${edge}:${id}`, async () => {
      const picture = project.picture;
      if (picture === undefined) throw Object.assign(new Error("No copies here."), { status: 404 });
      const { path, at } = whereOf(id);
      const copy = await picture(path, edge, at);
      if (copy.width !== undefined && copy.height !== undefined) {
        sizes.set(id, { width: copy.width, height: copy.height });
      }
      return blobOf(copy.bytes, copy.type);
    }).catch((failure: unknown) => {
      if (!refused(failure)) throw failure;
      return undefined;
    });
  const notHere = (what: string) => () => Promise.reject(new Error(what));
  return {
    sizeOf: (id) => sizes.get(id),
    know(where) {
      const id = pictureIdOf(spaceId, where);
      known.set(id, where);
      return id;
    },
    async thumb(id) {
      const copy = await copyOf(id, "small");
      if (copy !== undefined) return copy;
      // No copy: the file itself, measured here, as an older server says nothing of its size.
      const url = await fileOf(id);
      if (!sizes.has(id)) {
        const size = await measured(url);
        if (size !== undefined) sizes.set(id, size);
      }
      return url;
    },
    async view(attachment): Promise<Viewed> {
      const copy = await copyOf(attachment.id, "screen");
      if (copy !== undefined) return { url: copy, original: false };
      return { url: await fileOf(attachment.id), original: true };
    },
    file: fileOf,
    // Never a grant: the viewer takes the screen copy through `view`.
    stream: () => Promise.resolve(undefined),
    streamUrl: () => Promise.resolve(undefined),
    upload: notHere("Universe shows the project's pictures; it sends none."),
    play: notHere("Universe shows pictures, not videos, for now."),
    page: notHere("A picture isn't a page."),
    pageUrl: () => Promise.resolve(undefined),
    holdPage: () => Promise.resolve(undefined),
  };
}
