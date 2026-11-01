/**
 * Files, from the shell's side of decision 10. An upload goes through the device's signature, a
 * slice of the `File` at a time, and goes on from where it got to when the connection drops
 * (ADR 0052);
 * a photo or a PDF comes back as a Blob and is shown through an object URL, because an
 * `<img src>` cannot sign a request. URLs are cached for the page's life, so a thumbnail is
 * fetched once however many snapshots redraw its row. Or, where the device reaches the server
 * directly, a grant (ADR 0058): a URL the `<video>` fetches itself, asking for the runs it needs as
 * it plays. Injected into the shell, so a test can hand it a fake instead of a socket and a key.
 */

import {
  type Attachment,
  type AttachmentGrant,
  type AttachmentVariant,
  type Device,
  fetchAttachment,
  fetchAttachmentWithType,
  grantAttachment,
  pageUrl,
  UploadError,
  uploadFile,
} from "@chipschat/core";
import { PAGE_HEADER_POLICY } from "@chipschat/protocol";
import { type Desktop, desktop } from "../native.ts";

/**
 * What `?variant=view` gave the viewer: something to draw, and whether it is the photo itself
 * rather than a copy made for a viewer (ADR 0058). The photo itself has no *Open original*, since
 * it is already open.
 */
export interface Viewed {
  readonly url: string;
  readonly original: boolean;
}

/** A grant is asked for afresh a minute before it expires, so a picture paged back to holds. */
const GRANT_SPARE_MS = 60_000;

export interface FileService {
  /**
   * Upload one file, saying how many bytes are in as they arrive. `keepMetadata` keeps where a
   * photo or a video was taken; off unless the person says so.
   */
  readonly upload: (
    file: File,
    keepMetadata: boolean,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<Attachment>;
  /** An object URL for the thumbnail. */
  readonly thumb: (id: string) => Promise<string>;
  /** An object URL for the file itself. */
  readonly file: (id: string) => Promise<string>;
  /**
   * An object URL to play a video from: its copy that plays everywhere once the server has made
   * it, and the file itself until then (ADR 0053).
   */
  readonly play: (id: string) => Promise<string>;
  /**
   * A URL a `<video>` or an `<img>` fetches with nothing else: a grant for one variant, good for
   * ten minutes, or a video's length and ten more (ADR 0058). A video starts at once and seeks
   * anywhere, and nothing is held in the page. Nothing through the relay, where the element cannot
   * follow, or from a server that grants nothing; the caller fetches a blob then.
   */
  readonly streamUrl: (id: string, variant: AttachmentVariant) => Promise<string | undefined>;
  /**
   * The same grant, with what it resolved to: the viewer needs `variant` to know a view that is
   * the photo itself, and `playable` to say the original is playing while the copy is being made
   * (ADR 0058). One grant is kept per attachment and variant until a minute before it expires, so
   * paging back to a picture does not ask again; `fresh` is *Try again*, which asks anew and takes
   * the copy once there is one.
   */
  readonly stream: (
    id: string,
    variant: AttachmentVariant,
    fresh?: boolean,
  ) => Promise<AttachmentGrant | undefined>;
  /**
   * An object URL for the copy made for a viewer — no longer than 2,048 pixels — and whether the
   * server gave the photo itself instead (a GIF, a photo `sharp` could not read, or a server from
   * before the copy). The bytes are kept once: a view that is the file is kept where `file` looks
   * for it. This is the path where there is no grant to be had — through the relay, or from a
   * server from before grants.
   */
  readonly view: (attachment: Attachment) => Promise<Viewed>;
  /**
   * A page's own words, for the page view (ADR 0100): read from the bytes, never by fetching the
   * object URL, which the app's policy (`connect-src 'self'`) refuses.
   */
  readonly page: (id: string) => Promise<string>;
  /**
   * Where a frame loads an HTML page from (ADR 0201), under which the page's own script runs and
   * nothing leaves: in the Mac shell, its own door — the bytes fetched through the device's link
   * as the page's words are, held by the shell and served once under the page's policy, since
   * the shell reaches its server through a tunnel the server's door cannot be reached across; in
   * a browser, a URL on the server's page door, from a signed ask, good once and for thirty
   * seconds. Nothing through a tunnel in a browser, where a frame cannot follow, or from a server
   * from before the door; the view draws the page's words then, still.
   */
  readonly pageUrl: (id: string) => Promise<string | undefined>;
  /**
   * A document held by the Mac shell's own door and served once under the page's policy, for a
   * page built elsewhere: a page of the room's project (ADR 0223). Nothing outside the shell, or
   * from a shell built before its door.
   */
  readonly holdPage: (html: string) => Promise<string | undefined>;
}

export function createFileService(
  device: Device,
  shell: Promise<Desktop | undefined> = desktop(),
): FileService {
  const urls = new Map<string, Promise<string>>();
  const cached = (key: string, load: () => Promise<Blob>): Promise<string> => {
    let url = urls.get(key);
    if (url === undefined) {
      url = load().then((blob) => URL.createObjectURL(blob));
      urls.set(key, url);
      url.catch(() => urls.delete(key));
    }
    return url;
  };
  const grants = new Map<string, { readonly grant: AttachmentGrant; readonly expiresAt: number }>();
  const stream = async (id: string, variant: AttachmentVariant, fresh = false) => {
    const key = `${variant}:${id}`;
    const kept = grants.get(key);
    if (!fresh && kept !== undefined && kept.expiresAt - Date.now() > GRANT_SPARE_MS) {
      return kept.grant;
    }
    const grant = await grantAttachment(device, id, variant).catch(() => undefined);
    if (grant !== undefined) grants.set(key, { grant, expiresAt: grant.expiresAt });
    return grant;
  };
  const views = new Map<string, Promise<Viewed>>();
  const viewOf = async (attachment: Attachment): Promise<Viewed> => {
    try {
      const {
        bytes,
        mimeType,
        view: said,
      } = await fetchAttachmentWithType(device, attachment.id, "view");
      // A server from before the copy says nothing, so the size and the type are the guess — the
      // same one the phone makes (`spaces/files.ts`).
      const itself =
        said === undefined
          ? bytes.byteLength === attachment.byteSize && mimeType === attachment.mimeType
          : said === "original";
      const blob = new Blob([bytes], { type: mimeType });
      // The file itself is kept once, under the key `file` looks in, so Open original and a
      // download do not fetch it again.
      const key = itself ? `file:${attachment.id}` : `view:${attachment.id}`;
      return { url: await cached(key, async () => blob), original: itself };
    } catch (failure) {
      // A video measured before migration 0022 has no poster copy, and answers 404.
      if (failure instanceof UploadError && failure.status === 404) {
        return {
          url: await cached(`file:${attachment.id}`, () => fetchAttachment(device, attachment.id)),
          original: true,
        };
      }
      throw failure;
    }
  };
  return {
    async upload(file, keepMetadata, onProgress) {
      const source = {
        size: file.size,
        read: async (start: number, end: number) =>
          new Uint8Array(await file.slice(start, end).arrayBuffer()),
      };
      return uploadFile(device, { name: file.name, source, keepMetadata }, { onProgress });
    },
    thumb: (id) => cached(`thumb:${id}`, () => fetchAttachment(device, id, "thumb")),
    file: (id) => cached(`file:${id}`, () => fetchAttachment(device, id)),
    play: (id) => cached(`play:${id}`, () => fetchAttachment(device, id, "play")),
    streamUrl: async (id, variant) => (await stream(id, variant))?.url,
    stream,
    page: async (id) => await (await fetchAttachment(device, id)).text(),
    pageUrl: async (id) => {
      const hold = (await shell)?.holdPage;
      if (hold !== undefined) {
        const html = await (await fetchAttachment(device, id)).text();
        try {
          return await hold(html, PAGE_HEADER_POLICY);
        } catch {
          // A shell built before its door: the server's is asked, as a browser asks it.
        }
      }
      return pageUrl(device, id);
    },
    holdPage: async (html) => {
      const hold = (await shell)?.holdPage;
      return hold === undefined
        ? undefined
        : await hold(html, PAGE_HEADER_POLICY).catch(() => undefined);
    },
    view(attachment) {
      let found = views.get(attachment.id);
      if (found === undefined) {
        found = viewOf(attachment);
        views.set(attachment.id, found);
        found.catch(() => views.delete(attachment.id));
      }
      return found;
    },
  };
}
