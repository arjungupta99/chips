/**
 * Images, with `sharp` (decision 10). A photo is straightened by its orientation tag and, by
 * default, re-encoded with no metadata at all — location included — because the safe default
 * is to drop what a phone wrote into a file. The uploader may keep it. Thumbnails are WebP, no
 * larger than the edge asked for, never enlarged.
 */

import sharp, { type FormatEnum } from "sharp";
import type { ImageResult, Images } from "../../application/ports/attachments.js";

const MIME_BY_FORMAT: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function createSharpImages(): Images {
  return {
    async inspect(bytes) {
      try {
        const meta = await sharp(bytes).metadata();
        if (meta.width === undefined || meta.height === undefined) return undefined;
        if (MIME_BY_FORMAT[meta.format ?? ""] === undefined) return undefined;
        return { width: meta.width, height: meta.height };
      } catch {
        return undefined;
      }
    },

    async prepare(bytes, options): Promise<ImageResult> {
      const source = sharp(bytes, { animated: true });
      const meta = await source.metadata();
      const format = (meta.format ?? "jpeg") as keyof FormatEnum;
      // `rotate()` with no angle applies the EXIF orientation, so the pixels are upright and
      // the tag is no longer needed. Metadata is dropped unless kept; keeping keeps all of it.
      let pipeline = source.rotate();
      if (options.keepMetadata) pipeline = pipeline.withMetadata();
      const { data, info } = await pipeline.toFormat(format).toBuffer({
        resolveWithObject: true,
      });
      return {
        bytes: new Uint8Array(data),
        mimeType: MIME_BY_FORMAT[info.format] ?? `image/${info.format}`,
        width: info.width,
        height: info.height,
      };
    },

    async thumbnail(bytes, maxEdge): Promise<ImageResult> {
      const { data, info } = await sharp(bytes)
        .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      return {
        bytes: new Uint8Array(data),
        mimeType: "image/webp",
        width: info.width,
        height: info.height,
      };
    },
  };
}
