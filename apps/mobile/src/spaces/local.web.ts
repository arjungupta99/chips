import type { UploadSource } from "@chipschat/core";

/**
 * `local.ts` for the web target: a picked file's bytes come through `fetch` of the blob or data
 * URL the picker made, and are sliced from the blob a piece at a time, a fetched attachment becomes an object URL, and opening a file is the
 * download the desktop does too. Nothing here touches a file system, because a browser has none
 * to offer.
 */

export async function openSource(
  uri: string,
): Promise<UploadSource & { readonly close: () => void }> {
  const blob = await (await fetch(uri)).blob();
  return {
    size: blob.size,
    read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
    close: () => undefined,
  };
}

export async function keepLocally(
  _id: string,
  _name: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
}

/** Nothing is kept on a disk here: an object URL goes with the page. */
export async function forgetKept(_ids: readonly string[]): Promise<void> {}

/** One file kept on a phone (`local.ts`); a browser keeps none. */
export interface KeptFile {
  readonly name: string;
  readonly uri: string;
  readonly size: number;
}

export async function keptFiles(): Promise<readonly KeptFile[]> {
  return [];
}

export function keptLetGo(): readonly string[] {
  return [];
}

/** A browser keeps nothing to find: every file is fetched (`local.ts` looks first, ADR 0161). */
export function findKept(_id: string, _part: string): string | undefined {
  return undefined;
}

/** Nothing is kept, so there is nothing to measure or clear (ADR 0085). */
export function keptClearings(): number {
  return 0;
}

export async function keptBytes(): Promise<number> {
  return 0;
}

export async function clearKept(): Promise<void> {}

/** An object URL's words, read as UTF-8: an HTML page, to draw in the app. */
export async function readText(uri: string): Promise<string> {
  return (await fetch(uri)).text();
}

export async function openLocally(uri: string, name: string): Promise<void> {
  const link = document.createElement("a");
  link.href = uri;
  link.download = name;
  link.click();
}

/** Bytes made to leave, a room's project as a zip (ADR 0224): downloaded under their name. */
export async function shareBytes(bytes: Uint8Array, name: string, mimeType: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  await openLocally(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A browser has no Quick Look: a file is looked at where it is downloaded to. */
export const previewLocally = openLocally;

/** A document of the room's project (ADR 0227), looked at where it is downloaded to. */
export const previewBytes = shareBytes;

/** A browser has no library to save into; Share is the download. */
export const canSaveToLibrary = false;

export async function saveToLibrary(_uri: string, _name: string): Promise<void> {
  throw new Error("A browser saves a picture through Share, which downloads it.");
}

/** An object URL's bytes as base64, which is what the clipboard takes an image as. */
export async function base64Of(uri: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x80_00) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x80_00));
  }
  return btoa(binary);
}
