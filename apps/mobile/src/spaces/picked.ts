/**
 * What is decided about a picked file before a byte of it moves: what to call it, what kind it
 * is, and whether the workspace will take it at all (ADR 0047). Pure, so the pickers in
 * `pick.ts` and the hook in `useStaged.ts` — which are the platform's and React's — hold
 * nothing that needs a phone to test.
 */

import { kindOf, voiceNoteName } from "@chipschat/core";
import { type AttachmentCaps, kindFromName, sizeRefusal } from "@chipschat/protocol";
import type { ImagePickerAsset } from "expo-image-picker";

/** A file chosen on this phone, before it is uploaded. */
export interface Picked {
  readonly name: string;
  readonly mimeType: string;
  /** Bytes, when the picker knew; the upload finds out for certain. */
  readonly size: number | undefined;
  /** Where the bytes are on this device: a `file://` on a phone, a blob or data URL on the web. */
  readonly uri: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/**
 * A voice note recorded on this phone (ADR 0054), named for when it was made in the phone's own
 * time — `voice-note-0913-1142.m4a` — and typed as the recorder makes it: an M4A on a phone, a
 * WebM in a browser.
 */
export function voiceNote(uri: string, at: Date, web: boolean): Picked {
  return {
    name: voiceNoteName(at, web ? "webm" : "m4a"),
    mimeType: web ? "audio/webm" : "audio/mp4",
    size: undefined,
    uri,
  };
}

/** A type from a name, for a picker that gave none; the server sniffs the bytes regardless. */
export function mimeFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/** The last segment of a URI, or the fallback when there is none worth the name. */
export function nameFromUri(uri: string, fallback: string): string {
  const last = uri.split("?")[0]?.split("/").pop() ?? "";
  return last === "" ? fallback : decodeURIComponent(last);
}

/**
 * A name that is only an id, which says nothing in the viewer or to an agent (the emulator, 16
 * October 2026), so it is named as a nameless pick is: a number is what Android's photo picker
 * gives for every photo and video (`19.jpg`), since it keeps the real name from the app, and a
 * UUID is what the camera's picture is saved under (`01a394c0-1223-….jpeg`).
 */
const PICKER_ID = /^(\d+|[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})\.[a-z0-9]+$/i;

/** What the photo library or the camera gave, as one shape with the Files app's. */
export function fromAsset(asset: ImagePickerAsset, index: number): Picked {
  const video = asset.type === "video";
  const fallback = `${video ? "video" : "photo"}-${index + 1}.${video ? "mp4" : "jpg"}`;
  const given = asset.fileName ?? nameFromUri(asset.uri, fallback);
  const name = PICKER_ID.test(given) ? fallbackFor(fallback, given) : given;
  return {
    name,
    mimeType: asset.mimeType ?? mimeFromName(name),
    size: asset.fileSize,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  };
}

/** The nameless pick's name, keeping the kind the picker's own name said it was. */
function fallbackFor(fallback: string, given: string): string {
  const stem = fallback.slice(0, fallback.lastIndexOf("."));
  return `${stem}${given.slice(given.lastIndexOf("."))}`;
}

/**
 * Why this file may not be sent here, before a byte of it goes; nothing when it may, and
 * nothing when its size is not known yet — the server will say. The server's own ceiling is
 * judged there, at the slot.
 */
export function refusalFor(picked: Picked, caps: AttachmentCaps): string | undefined {
  if (picked.size === undefined) return undefined;
  const kind =
    picked.mimeType === "application/octet-stream"
      ? kindFromName(picked.name)
      : kindOf(picked.mimeType);
  return sizeRefusal(caps, kind, picked.size, Number.POSITIVE_INFINITY);
}
