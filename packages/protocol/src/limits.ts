/**
 * How big an attachment may be (ADR 0047).
 *
 * Two numbers decide it. The server has a ceiling, `CHIPS_MAX_ATTACHMENT_BYTES`, which nothing
 * gets past; under it the workspace may cap photos, videos and files separately, by an event an
 * owner or an admin sends (`attachment.limits_set`). The arithmetic is here, in the package both
 * the server and the clients already share, so the phone refuses a file with the sentence the
 * server would have used, before a byte of it has left the phone.
 */

/** The three caps a workspace sets. Audio and everything else that is not a picture is a file. */
export type CapKind = "image" | "video" | "file";

export const CAP_KINDS: readonly CapKind[] = ["image", "video", "file"];

/** A cap in bytes for each kind, or `null` for the server's own ceiling. */
export interface AttachmentCaps {
  readonly image: number | null;
  readonly video: number | null;
  readonly file: number | null;
}

export const NO_CAPS: AttachmentCaps = { image: null, video: null, file: null };

/**
 * The longest voice note (ADR 0054): a phone stops recording at it, and the server writes down
 * what was said in sound no longer than it. Longer sound is kept, with its length and no words.
 */
export const LONGEST_VOICE_NOTE_MS = 5 * 60 * 1000;

/** The kind a cap is named for, from the kind a MIME type sorts into. */
export function capKind(kind: "image" | "video" | "audio" | "file"): CapKind {
  return kind === "image" || kind === "video" ? kind : "file";
}

/** The words each kind goes by on a screen and in a sentence. */
export const CAP_WORDS: Readonly<Record<CapKind, { readonly one: string; readonly many: string }>> =
  {
    image: { one: "photo", many: "photos" },
    video: { one: "video", many: "videos" },
    file: { one: "file", many: "files" },
  };

const KB = 1024;
const MB = KB * KB;

/** `50 MB`, `1.5 MB`, `512 KB` — whole megabytes without a decimal, since a cap is usually one. */
export function formatLimit(bytes: number, decimals = 1): string {
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`;
  const mb = bytes / MB;
  // "1.0 MB" beside a cap of "1 MB" reads as a bug; a decimal that is all zeros goes.
  return `${mb.toFixed(decimals).replace(/\.0+$/, "")} MB`;
}

/** The cap that applies to a kind here: the workspace's when it set one under the ceiling, else the ceiling. */
export function attachmentCap(
  caps: AttachmentCaps,
  kind: "image" | "video" | "audio" | "file",
  ceiling: number,
): number {
  const own = caps[capKind(kind)];
  return own === null ? ceiling : Math.min(own, ceiling);
}

/**
 * Why a file of this size may not be sent, or nothing when it may. One sentence, the same on
 * the server and on every client, naming whose limit it is: the workspace's cap, or the server's
 * ceiling when the workspace set none.
 */
export function sizeRefusal(
  caps: AttachmentCaps,
  kind: "image" | "video" | "audio" | "file",
  bytes: number,
  ceiling: number,
): string | undefined {
  const cap = attachmentCap(caps, kind, ceiling);
  if (bytes <= cap) return undefined;
  const words = CAP_WORDS[capKind(kind)];
  const capWords = formatLimit(cap);
  // A size that rounds to the cap's own words is said more finely: "capped at 1 MB, and this
  // one is 1 MB" reads as a bug.
  const size = formatLimit(bytes) === capWords ? formatLimit(bytes, 2) : formatLimit(bytes);
  const own = caps[capKind(kind)];
  if (own !== null && own <= ceiling) {
    return `${capitalise(words.many)} here are capped at ${capWords}, and this one is ${size}.`;
  }
  return `This server takes ${words.many} up to ${capWords}, and this one is ${size}.`;
}

/** A cap above the ceiling is refused when it is set, so no cap in the log is ever a dead letter. */
export function capsOverCeiling(caps: AttachmentCaps, ceiling: number): string | undefined {
  for (const kind of CAP_KINDS) {
    const cap = caps[kind];
    if (cap !== null && cap > ceiling) {
      return `A cap of ${formatLimit(cap)} on ${CAP_WORDS[kind].many} is more than this server takes (${formatLimit(ceiling)}).`;
    }
  }
  return undefined;
}

const IMAGE = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  "avif",
  "bmp",
  "tif",
  "tiff",
]);
const VIDEO = new Set(["mp4", "m4v", "mov", "webm", "mkv", "avi", "3gp"]);
const AUDIO = new Set(["mp3", "m4a", "aac", "wav", "ogg", "oga", "flac", "caf", "opus"]);

/**
 * The kind a file's name suggests, for a courtesy before the bytes are seen: a slot refused by
 * the name's kind saves the upload, and the bytes are judged again by what they turn out to be.
 * An SVG is a file, as the server serves it.
 */
export function kindFromName(filename: string): "image" | "video" | "audio" | "file" {
  const dot = filename.lastIndexOf(".");
  const extension = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
  if (IMAGE.has(extension)) return "image";
  if (VIDEO.has(extension)) return "video";
  if (AUDIO.has(extension)) return "audio";
  return "file";
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
