/**
 * Uploads and fetches with no server: what comes back is what a test says. The shell's tests and
 * the viewer's share it, so a method added to `FileService` is answered in one place.
 */

import type { AttachmentGrant, AttachmentVariant } from "@chipschat/core";
import type { FileService, Viewed } from "../app/files.ts";

export interface FakeFiles extends FileService {
  readonly uploaded: File[];
  /** Every grant asked for, in order: `["view:att_1", "play:att_2 fresh", …]`. */
  readonly asked: string[];
}

export function fakeFiles(
  answers: {
    /** Which attachments a grant can be had for; none, where a test wants the blob path. */
    readonly grants?: (id: string, variant: AttachmentVariant) => AttachmentGrant | undefined;
    /** What `?variant=view` gave: a copy unless a test says the photo itself. */
    readonly view?: (id: string) => Viewed;
    /** A page's words, by its attachment's id. */
    readonly page?: (id: string) => string;
    /**
     * Where a frame loads an HTML page from (ADR 0201): a URL on the page door, unless a test
     * says there is none (a tunnel, an older server), when the view draws the words instead.
     */
    readonly pageUrl?: (id: string) => string | undefined;
  } = {},
): FakeFiles {
  const uploaded: File[] = [];
  const asked: string[] = [];
  return {
    uploaded,
    asked,
    async upload(file) {
      uploaded.push(file);
      return {
        id: `att_${uploaded.length}`,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
      };
    },
    thumb: async (id) => `blob:thumb-${id}`,
    file: async (id) => `blob:file-${id}`,
    play: async (id) => `blob:play-${id}`,
    streamUrl: async (id, variant) => answers.grants?.(id, variant)?.url,
    stream: async (id, variant, fresh) => {
      asked.push(`${variant}:${id}${fresh === true ? " fresh" : ""}`);
      return answers.grants?.(id, variant);
    },
    view: async (attachment) =>
      answers.view?.(attachment.id) ?? { url: `blob:view-${attachment.id}`, original: false },
    page: async (id) => answers.page?.(id) ?? `<p>${id}</p>`,
    pageUrl: async (id) =>
      answers.pageUrl === undefined ? `/v1/pages/ticket-for-${id}` : answers.pageUrl(id),
    // A browser's: no shell, so nothing holds a page here.
    holdPage: async () => undefined,
  };
}
