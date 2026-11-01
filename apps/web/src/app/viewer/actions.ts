/**
 * What can be done with a picture, one press or one key away (the media viewer proposal, rule 8).
 * On the desktop that is Download, Copy image, Open message, Details, Fullscreen and Open
 * original — Save is the phone's row, because a browser's download *is* the save.
 *
 * Download hands over the file as it was sent, which is what the phone's Save does. Copy puts what
 * is on the stage on the clipboard, as the phone's Copy does; a browser will only take a PNG there,
 * so a WebP copy made for a viewer is drawn through a canvas on its way.
 */

import type { Attachment } from "@chipschat/core";
import type { FileService } from "../files.ts";

/** Save the file as it was sent, under its own name. */
export async function download(files: FileService, attachment: Attachment): Promise<void> {
  const href = await files.file(attachment.id);
  const link = document.createElement("a");
  link.href = href;
  link.download = attachment.filename;
  link.click();
}

/** Said when the clipboard would not take the picture. */
export const COPY_REFUSED = "This browser would not copy the picture.";

/**
 * Copy what is on the stage. The clipboard takes a PNG and little else, so whatever the picture
 * is — a WebP copy, a JPEG — it is drawn once into a canvas and handed over as a PNG. A picture
 * fetched from a grant is same-origin to the page `chipsd` serves, and an object URL always is,
 * so the canvas is never tainted.
 */
export async function copyImage(image: HTMLImageElement | null): Promise<void> {
  if (image === null || image.naturalWidth === 0) throw new Error(COPY_REFUSED);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const paper = canvas.getContext("2d");
  if (paper === null) throw new Error(COPY_REFUSED);
  paper.drawImage(image, 0, 0);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (png === null) throw new Error(COPY_REFUSED);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
