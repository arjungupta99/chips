/**
 * What a file is, from its bytes, never from its name or from what the client claimed
 * (decision 10). And what may be shown inline: a photo, a PDF, a recorded video and recorded sound
 * render; anything that could carry a script — HTML, SVG, and everything else — is served as a
 * download, never rendered.
 * Pure: bytes in, a word out.
 */

export type AttachmentKind = "image" | "video" | "audio" | "file";

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** Text, when the first kilobyte decodes as text with no control characters in it. */
function textHead(bytes: Uint8Array): string | undefined {
  const head = bytes.subarray(0, 1024);
  if (head.length === 0) return undefined;
  for (const byte of head) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) return undefined;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(head).toLowerCase();
  } catch {
    return undefined;
  }
}

const TEXT_BY_EXTENSION: Readonly<Record<string, string>> = {
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain",
  ts: "text/plain",
  js: "text/plain",
  py: "text/plain",
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** A byte signature at an offset, and the type it announces. */
interface Signature {
  readonly at: number;
  readonly bytes: readonly number[] | string;
  readonly mime: string;
  /** A second signature that must also hold, for the RIFF family. */
  readonly and?: { readonly at: number; readonly bytes: string };
}

const SIGNATURES: readonly Signature[] = [
  { at: 0, bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png" },
  { at: 0, bytes: "GIF87a", mime: "image/gif" },
  { at: 0, bytes: "GIF89a", mime: "image/gif" },
  { at: 0, bytes: "RIFF", and: { at: 8, bytes: "WEBP" }, mime: "image/webp" },
  { at: 0, bytes: "RIFF", and: { at: 8, bytes: "WAVE" }, mime: "audio/wav" },
  { at: 0, bytes: "%PDF-", mime: "application/pdf" },
  // The ISO base media family, by brand: a phone's photo is a HEIC in the same box an MP4 is,
  // so the brand is read before `ftyp` alone is allowed to mean a video (M4.4).
  { at: 4, bytes: "ftypheic", mime: "image/heic" },
  { at: 4, bytes: "ftypheix", mime: "image/heic" },
  { at: 4, bytes: "ftyphevc", mime: "image/heic" },
  { at: 4, bytes: "ftypmif1", mime: "image/heif" },
  { at: 4, bytes: "ftypmsf1", mime: "image/heif" },
  { at: 4, bytes: "ftypavif", mime: "image/avif" },
  // A phone's voice memo is AAC in the same box, and says so by its brand (ADR 0054).
  { at: 4, bytes: "ftypM4A ", mime: "audio/mp4" },
  { at: 4, bytes: "ftypM4B ", mime: "audio/mp4" },
  { at: 4, bytes: "ftypqt", mime: "video/quicktime" },
  { at: 4, bytes: "ftyp", mime: "video/mp4" },
  { at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3], mime: "video/webm" },
  { at: 0, bytes: "OggS", mime: "audio/ogg" },
  { at: 0, bytes: "ID3", mime: "audio/mpeg" },
  { at: 0, bytes: [0xff, 0xfb], mime: "audio/mpeg" },
  { at: 0, bytes: [0xff, 0xf3], mime: "audio/mpeg" },
  { at: 0, bytes: [0xff, 0xf2], mime: "audio/mpeg" },
  { at: 0, bytes: [0xff, 0xf1], mime: "audio/aac" },
  { at: 0, bytes: [0xff, 0xf9], mime: "audio/aac" },
  { at: 0, bytes: "fLaC", mime: "audio/flac" },
  { at: 0, bytes: "caff", mime: "audio/x-caf" },
  { at: 0, bytes: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip" },
];

function matches(bytes: Uint8Array, at: number, expected: readonly number[] | string): boolean {
  return typeof expected === "string"
    ? ascii(bytes, at, expected.length) === expected
    : expected.every((byte, index) => bytes[at + index] === byte);
}

/** The MIME type of these bytes. The filename settles only which kind of text a text is. */
export function sniffMime(bytes: Uint8Array, filename = ""): string {
  const known = SIGNATURES.find(
    (signature) =>
      matches(bytes, signature.at, signature.bytes) &&
      (signature.and === undefined || matches(bytes, signature.and.at, signature.and.bytes)),
  );
  if (known !== undefined) return known.mime;

  const text = textHead(bytes);
  if (text === undefined) return "application/octet-stream";
  if (text.includes("<svg")) return "image/svg+xml";
  if (/<!doctype html|<html|<script|<body|<iframe/.test(text)) return "text/html";
  return TEXT_BY_EXTENSION[extensionOf(filename)] ?? "text/plain";
}

/** The kind a chip or a grid shows. An SVG is a file: it is served as one. */
export function kindOf(mime: string): AttachmentKind {
  if (mime === "image/svg+xml") return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * What a file sniffed as a video is when it turns out to hold sound and no picture: a voice note a
 * browser recorded into a WebM, or an MP4 whose brand does not say it is sound (ADR 0054).
 */
export function soundOnlyMime(mime: string): string {
  return mime === "video/webm" ? "audio/webm" : "audio/mp4";
}

/** The images the server will make a thumbnail of and strip metadata from. */
const RASTER: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isRasterImage(mime: string): boolean {
  return RASTER.has(mime);
}

/**
 * What a browser may render in place: photos, PDFs, and the video and sound a phone or a browser
 * records, which a player picks its engine for by their type (ADR 0053, ADR 0054). None of them is
 * markup that runs. Everything else is a download.
 */
const INLINE: ReadonlySet<string> = new Set([
  ...RASTER,
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
]);

export function servesInline(mime: string): boolean {
  return INLINE.has(mime);
}

/** Percent-encoded for `filename*`: RFC 5987 also refuses four marks encodeURIComponent keeps. */
const extValue = (name: string): string =>
  encodeURIComponent(name).replace(
    /['()*]/g,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * `content-disposition` for a file of this name (RFC 6266). A header is bytes, and `new Response`
 * throws on a character past U+00FF, as macOS's U+202F before the PM in every screen recording's
 * name is. So a name that is not plain ASCII goes out twice: an ASCII stand-in in `filename`, and
 * the name itself in `filename*`, which a client that knows it prefers.
 *
 * Marks that would end the quoted string, control characters, and half a surrogate pair (the
 * 255-character cut can leave one, and encodeURIComponent throws on it) are in neither form.
 */
export function contentDisposition(how: "inline" | "attachment", filename: string): string {
  const name = filename.replace(/["\\\p{Cc}\p{Cs}]/gu, "_");
  const standIn = name.replace(/\p{Zs}/gu, " ").replace(/[^\x20-\x7e]/gu, "_");
  return standIn === name
    ? `${how}; filename="${name}"`
    : `${how}; filename="${standIn}"; filename*=UTF-8''${extValue(name)}`;
}

/**
 * The headers an attachment is served with. An inline type keeps its own; anything else goes
 * out as an opaque download, so an uploaded `.html` or `.svg` never runs in the app's origin.
 */
export function servingHeaders(
  mime: string,
  filename: string,
): { readonly contentType: string; readonly disposition: string } {
  if (servesInline(mime)) {
    return { contentType: mime, disposition: contentDisposition("inline", filename) };
  }
  return {
    contentType: "application/octet-stream",
    disposition: contentDisposition("attachment", filename),
  };
}
