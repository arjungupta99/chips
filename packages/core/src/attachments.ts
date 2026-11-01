/**
 * Attachments, from the client's side (decision 10). An upload asks for a slot, then sends the
 * bytes in signed pieces (ADR 0052): a piece that fails on the network is sent again from
 * wherever the server says the upload got to, so a video on a train still arrives. What comes
 * back is what the bytes turned out to be — the server sniffed them — and that is what a message
 * attaches, by id. Fetching is a signed GET; the bytes come back as a Blob for an object URL,
 * because an `<img src>` cannot sign a request. Or a device asks for a grant (ADR 0058): a URL it
 * hands to a player, which fetches it with nothing else and asks for runs of it as it plays.
 */

import type { Device } from "./device.js";
import { endpoint, signRequest } from "./device.js";
import { type Link, linkFor, readOnLink } from "./link.js";

export type AttachmentKind = "image" | "video" | "audio" | "file";

/** An attachment as a message carries it and as the server described it after the upload. */
export interface Attachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /** How long a video or a sound runs, when the server measured it (ADR 0053, ADR 0054). */
  readonly durationMs?: number | undefined;
  /** What was said, for a voice note the server transcribed when it arrived (ADR 0054). */
  readonly transcript?: string | undefined;
  /** The bytes' digest, which tells one version of a room's file from the next (ADR 0099). */
  readonly sha256?: string | undefined;
  /** The version of the room's file of this name that this one was made from (ADR 0099). */
  readonly replaces?: string | undefined;
}

/** The kind a chip or a grid shows. An SVG is a file: the server serves it as one. */
export function kindOf(mimeType: string): AttachmentKind {
  if (mimeType === "image/svg+xml") return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

/** What the server made a thumbnail of: every raster image. */
export function hasThumbnail(mimeType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType);
}

/**
 * Whether a video is worth asking for its poster: one the server measured, which it did in the
 * same run that took the frame (ADR 0053). One it did not measure has none to give.
 */
export function hasPoster(attachment: Attachment): boolean {
  return kindOf(attachment.mimeType) === "video" && attachment.durationMs !== undefined;
}

/**
 * Whether a file stands in its message's album: a photo the server made a thumbnail of, or a video
 * it measured (decision 7 of the media viewer proposal, 16 September 2026). The room's grid on
 * both clients draws these as tiles, in the order the message listed them, and the viewer's deck is
 * made of the same ones, so a tile always has an item to open and an item always has a tile. A
 * video the server never measured has no poster to be a tile with, and stays a row.
 */
export function inAlbum(attachment: Attachment): boolean {
  return hasThumbnail(attachment.mimeType) || hasPoster(attachment);
}

/**
 * A file that opens as a page (ADR 0059): an HTML document, as the server sniffed it, or a Markdown
 * file, which is made into one first (ADR 0123, `markdownPage`). On the phone in a web view that
 * reaches nothing, on the Mac in a frame that reaches nothing (ADR 0100).
 */
export function isPage(mimeType: string): boolean {
  return typeOf(mimeType) === "text/html" || isMarkdown(mimeType);
}

/**
 * A PDF, as the server sniffs one by its bytes: on the Mac and the web it opens in the page view's
 * dialog, drawn by the browser's own viewer (ADR 0125); on an iPhone, in Quick Look (ADR 0124).
 */
export function isPdf(mimeType: string): boolean {
  return typeOf(mimeType) === "application/pdf";
}

/** Markdown, as the server sniffs a `.md` or `.markdown` file: drawn as a page made from it. */
export function isMarkdown(mimeType: string): boolean {
  return typeOf(mimeType) === "text/markdown";
}

/** A type without its parameters, in lower case: `text/html; charset=utf-8` is `text/html`. */
function typeOf(mimeType: string): string {
  return (mimeType.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * The largest page drawn in the app. A page is read whole into its view, and a mock or a report is
 * tens of kilobytes; one of megabytes is not a page to hold in memory twice. Past it, the file is
 * handed on as any other file is: the share sheet on a phone, a download on the Mac.
 */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;

/** `0:42`, `12:05`, `1:02:03`. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

const two = (value: number) => String(value).padStart(2, "0");

/**
 * A recorded voice note's name (ADR 0054): when it was made, in the recording device's own time,
 * and the extension its recorder's container takes. `voice-note-0913-1142.m4a`. A room shows a
 * file named so as a voice note rather than by its name.
 */
export function voiceNoteName(at: Date, extension: string): string {
  const stamp = `${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`;
  return `voice-note-${stamp}.${extension}`;
}

/** Whether a file is named as a recorded voice note. */
export const isVoiceNoteName = (filename: string): boolean => filename.startsWith("voice-note-");

/** `212 KB`, `1.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface WireAttachment {
  readonly attachment_id: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
  readonly duration_ms?: number;
  readonly transcript?: string;
  readonly sha256?: string;
  readonly replaces?: string;
}

export function attachmentFromWire(wire: WireAttachment): Attachment {
  return {
    id: wire.attachment_id,
    filename: wire.filename,
    mimeType: wire.mime_type,
    byteSize: wire.byte_size,
    ...(wire.width === undefined ? {} : { width: wire.width }),
    ...(wire.height === undefined ? {} : { height: wire.height }),
    ...(wire.duration_ms === undefined ? {} : { durationMs: wire.duration_ms }),
    ...(wire.transcript === undefined ? {} : { transcript: wire.transcript }),
    ...(wire.sha256 === undefined ? {} : { sha256: wire.sha256 }),
    ...(wire.replaces === undefined ? {} : { replaces: wire.replaces }),
  };
}

export class UploadError extends Error {
  override readonly name = "UploadError";
  /** The server's status, where a server answered; a network failure has none. */
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function reasonOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return body.error?.message ?? `the server answered ${response.status}`;
}

/** Where an upload's bytes come from: how many there are, and a way to read a run of them. */
export interface UploadSource {
  readonly size: number;
  /** The bytes from `start` up to, and not including, `end`. */
  readonly read: (start: number, end: number) => Promise<Uint8Array<ArrayBuffer>>;
}

/** Bytes already in memory, as a source. */
export function sourceOf(bytes: Uint8Array<ArrayBuffer>): UploadSource {
  return {
    size: bytes.byteLength,
    read: async (start, end) =>
      start === 0 && end === bytes.byteLength ? bytes : bytes.slice(start, end),
  };
}

export type UploadInput = {
  readonly name: string;
  /** Keep the photo's metadata, location included. Off unless the person says so. */
  readonly keepMetadata?: boolean | undefined;
} & (
  | { readonly bytes: Uint8Array<ArrayBuffer> }
  /** Read a piece at a time, so a video is never in memory whole to be sent. */
  | { readonly source: UploadSource }
);

export interface UploadOptions {
  /** How many bytes the server holds, of how many, after every piece it takes. */
  readonly onProgress?: ((sent: number, total: number) => void) | undefined;
  /** How long to wait before trying again. A test passes one that does not wait. */
  readonly wait?: ((ms: number) => Promise<void>) | undefined;
  /** The size of a piece; the server takes any size up to what the slot has left. */
  readonly pieceBytes?: number | undefined;
}

/** Four megabytes: a few seconds to send again on a phone, and a hundred megabytes in 25. */
export const PIECE_BYTES = 4 * 1024 * 1024;

/** Failures in a row, with nothing gained between them, before an upload gives up. */
const PATIENCE = 6;

/** Half a second, then doubling, and never more than eight. */
function backoff(failures: number): number {
  return Math.min(500 * 2 ** (failures - 1), 8000);
}

/** A status worth trying again: the server busy or broken, not a refusal of these bytes. */
function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Upload one file: a slot, then the bytes a piece at a time. When a piece fails on the network or
 * the server is briefly unable, wait, ask how far the upload got, and go on from there; give up
 * after six failures in a row with nothing gained. The answer is what the server made of the bytes.
 */
export async function uploadFile(
  device: Device,
  input: UploadInput,
  options: UploadOptions = {},
): Promise<Attachment> {
  const source = "source" in input ? input.source : sourceOf(input.bytes);
  const upload = await openSlot(device, input, source, options.pieceBytes ?? PIECE_BYTES);

  const patience = patienceFor(input.name, options.wait ?? pause);
  let offset = 0;
  for (;;) {
    let step: Step | undefined = await sendPiece(upload, offset, input.name);
    if ("failed" in step) {
      await patience.failed(step.failed);
      // Whether the server kept the piece is not known: ask.
      step = await askHowFar(device, upload.target);
    }
    if (step === undefined) continue;
    if ("attachment" in step) {
      options.onProgress?.(source.size, source.size);
      return step.attachment;
    }
    // A piece taken, or a failure the server had in fact kept, is progress.
    if (step.received > offset) patience.gained();
    offset = step.received;
    options.onProgress?.(offset, source.size);
  }
}

/** Failures in a row, each waited out a little longer, until there have been too many. */
function patienceFor(name: string, wait: (ms: number) => Promise<void>) {
  let failures = 0;
  return {
    /** One more failure: wait it out, or give up with its reason when it is one too many. */
    async failed(reason: string): Promise<void> {
      failures += 1;
      if (failures >= PATIENCE) throw new UploadError(`Could not upload ${name}: ${reason}.`);
      await wait(backoff(failures));
    },
    /** Bytes got through: the count starts again. */
    gained(): void {
      failures = 0;
    },
  };
}

/** What one step of an upload came to: finished, moved on, or failed in a way worth retrying. */
type Step =
  | { readonly attachment: Attachment }
  | { readonly received: number }
  | { readonly failed: string };

/** An upload under way: where its bytes go, where they come from, and how many at a time. */
interface Upload {
  readonly device: Device;
  readonly target: string;
  readonly source: UploadSource;
  /** False for a server that takes the bytes whole: one `PUT`, with no offset. */
  readonly pieces: boolean;
  readonly pieceBytes: number;
}

/**
 * A slot for the source's bytes, and how they will go to it: in pieces, or whole to a server from
 * before ADR 0052, whose slot does not say it takes pieces and which would store the first piece
 * as the whole file.
 */
async function openSlot(
  device: Device,
  input: UploadInput,
  source: UploadSource,
  pieceBytes: number,
): Promise<Upload> {
  const body = JSON.stringify({
    filename: input.name,
    byte_size: source.size,
    keep_metadata: input.keepMetadata === true,
  });
  const slot = await linkFor(device).fetch(endpoint(device, "/v1/uploads"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await signRequest(device, "POST", "/v1/uploads", body)),
    },
    body,
  });
  if (!slot.ok) throw new UploadError(`Could not start the upload: ${await reasonOf(slot)}.`);
  const answer = (await slot.json()) as { upload_url: string; pieces?: boolean };
  const pieces = answer.pieces === true;
  return {
    device,
    target: answer.upload_url,
    source,
    pieces,
    pieceBytes: pieces ? pieceBytes : source.size,
  };
}

/**
 * The piece that starts at `offset`. A refusal of the bytes is thrown, since sending them again
 * changes nothing; the network failing, or the server being busy or broken, is a step to retry.
 */
async function sendPiece(piece: Upload, offset: number, name: string): Promise<Step> {
  const { device, target, source } = piece;
  const bytes = await source.read(offset, Math.min(offset + piece.pieceBytes, source.size));
  // The offset is in the target, so the signature covers where in the file the piece goes. It
  // covers the path the server sees; the fetch adds the origin the device is paired with, which
  // for a browser served by that server is nothing at all.
  const at = piece.pieces ? `${target}?offset=${offset}` : target;
  const headers = {
    "content-type": "application/octet-stream",
    ...(await signRequest(device, "PUT", at, bytes)),
  };
  const sent = await attempt(() =>
    linkFor(device).fetch(endpoint(device, at), { method: "PUT", headers, body: bytes }),
  );
  if ("error" in sent) return { failed: sent.error };
  const { response } = sent;
  if (response.status === 201) {
    const { attachment } = (await response.json()) as { attachment: WireAttachment };
    return { attachment: attachmentFromWire(attachment) };
  }
  if (response.ok) {
    return { received: ((await response.json()) as { received_bytes: number }).received_bytes };
  }
  if (retryable(response.status)) return { failed: await reasonOf(response) };
  throw new UploadError(`Could not upload ${name}: ${await reasonOf(response)}.`);
}

/**
 * How far the server says an upload got, after a piece whose fate is not known. Nothing when
 * asking fails too: the next piece goes from the same place, and the server says if that was wrong.
 */
async function askHowFar(
  device: Device,
  target: string,
): Promise<Exclude<Step, { readonly failed: string }> | undefined> {
  const headers = await signRequest(device, "GET", target, "");
  const asked = await attempt(() => linkFor(device).fetch(endpoint(device, target), { headers }));
  if ("error" in asked || !asked.response.ok) return undefined;
  const progress = (await asked.response.json()) as {
    readonly received_bytes: number;
    readonly attachment?: WireAttachment;
  };
  return progress.attachment === undefined
    ? { received: progress.received_bytes }
    : { attachment: attachmentFromWire(progress.attachment) };
}

/** A request's answer, or why there was none: the network, the tunnel, the phone offline. */
async function attempt(
  request: () => Promise<Response>,
): Promise<{ readonly response: Response } | { readonly error: string }> {
  try {
    return { response: await request() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Which bytes of an attachment: the file as it was sent, its thumbnail (a video's poster too), what
 * to play — a video's copy that plays everywhere once the server has made it, and the file until
 * then (ADR 0053) — or what a viewer shows, a photo no longer than 2,048 pixels on its longer side
 * (ADR 0058), which says in `x-chips-view` whether it is that copy or the photo itself. A server
 * from before that copy answers `view` with the file itself and says nothing, or refuses it with a
 * 404; a viewer takes the file either way.
 */
export type AttachmentVariant = "file" | "thumb" | "play" | "view";

/**
 * Where a video's copy that plays everywhere has got to, as `?variant=play` says in its
 * `x-chips-playable` header (ADR 0053): being made, made, not needed, or not to be had. Until it is
 * `done`, what plays is the file as it was sent.
 */
export type PlayableState = "pending" | "done" | "skipped" | "failed";

const PLAYABLE_STATES: readonly string[] = ["pending", "done", "skipped", "failed"];

/** How many bytes of a download have come, and how many there are when the server said. */
export type FetchProgress = (received: number, total: number | undefined) => void;

/** An attachment's bytes as the server served them, with the type it said they are. */
export interface FetchedAttachment {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
  /** For `?variant=play`, where the copy that plays everywhere has got to; nothing for the rest. */
  readonly playable: PlayableState | undefined;
  /**
   * For `?variant=view`, whether these are the copy made for a viewer or the photo itself; nothing
   * from a server from before the copy (ADR 0058).
   */
  readonly view?: "copy" | "original" | undefined;
}

function lengthOf(header: string | null): number | undefined {
  const length = header === null ? Number.NaN : Number(header);
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

/**
 * A body read as it arrives, saying how much has come after each chunk. The bytes go straight into
 * one buffer of the length the server gave, grown only if it said too little.
 */
async function readCounting(
  body: ReadableStream<Uint8Array>,
  total: number | undefined,
  onProgress: FetchProgress,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  let buffer = new Uint8Array(total ?? 64 * 1024);
  let received = 0;
  const reader = body.getReader();
  // Let go of, the reader stops, which through the relay tells the server to stop (ADR 0153).
  const stop = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    onProgress(0, total);
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      const chunk = read.value;
      if (received + chunk.length > buffer.length) {
        const grown = new Uint8Array(Math.max(buffer.length * 2, received + chunk.length));
        grown.set(buffer.subarray(0, received));
        buffer = grown;
      }
      buffer.set(chunk, received);
      received += chunk.length;
      onProgress(received, total);
    }
  } finally {
    signal?.removeEventListener("abort", stop);
  }
  if (signal?.aborted === true) throw letGo();
  return received === buffer.length ? buffer : buffer.slice(0, received);
}

/** What a download that was let go of rejects with: an `AbortError`, as `fetch`'s is. */
function letGo(): Error {
  const error = new Error("The download was let go of.");
  error.name = "AbortError";
  return error;
}

interface FetchOptions {
  readonly onProgress?: FetchProgress | undefined;
  readonly copyOnly?: boolean | undefined;
  /**
   * Nobody wants it any more: the download stops where it is and rejects with an `AbortError`.
   * Through the relay the server is told to stop sending too (ADR 0153).
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * An attachment's bytes as the server served them, with the type it said they are. Given
 * `onProgress`, the body is read as it arrives — on the network and through the relay alike — and
 * each chunk says how much has come of the length the server gave, which is what a video's poster
 * shows while its copy downloads (the media viewer, Phase 2). A platform whose response has no body
 * to read says it once, at the end.
 *
 * Given `copyOnly`, a `play` that answers with the original because its copy is still being made,
 * or will not be, is left unread: `bytes` is empty and `playable` says why. A phone that already
 * has the original, and cannot play it, asks that way for the copy without fetching the original
 * again (the media viewer, Phase 3).
 */
export async function fetchAttachmentWithType(
  device: Device,
  id: string,
  variant: AttachmentVariant,
  options: FetchOptions = {},
): Promise<FetchedAttachment> {
  // Cut off by the connection dropping, it is asked again once the device is back (ADR 0179).
  return await readOnLink(device, (link) => fetchThrough(link, device, id, variant, options));
}

/** One ask for an attachment's bytes, through one link, read to its end. */
async function fetchThrough(
  link: Link,
  device: Device,
  id: string,
  variant: AttachmentVariant,
  options: FetchOptions,
): Promise<FetchedAttachment> {
  const target =
    variant === "file" ? `/v1/attachments/${id}` : `/v1/attachments/${id}?variant=${variant}`;
  const { signal } = options;
  const response = await link.fetch(endpoint(device, target), {
    headers: await signRequest(device, "GET", target, "", link),
    ...(signal === undefined ? {} : { signal }),
  });
  if (signal?.aborted === true) {
    await response.body?.cancel().catch(() => undefined);
    throw letGo();
  }
  if (!response.ok) {
    throw new UploadError(
      `Could not fetch the attachment: ${await reasonOf(response)}.`,
      response.status,
    );
  }
  const { onProgress } = options;
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const playable = playableOf(response.headers.get("x-chips-playable"));
  const said = response.headers.get("x-chips-view");
  const view: Pick<FetchedAttachment, "view"> =
    said === "copy" || said === "original" ? { view: said } : {};
  if (options.copyOnly === true && (playable === "pending" || playable === "failed")) {
    await response.body?.cancel().catch(() => undefined);
    return { bytes: new Uint8Array(0), mimeType, playable, ...view };
  }
  const bytes = await bytesOf(response, onProgress, signal);
  return { bytes, mimeType, playable, ...view };
}

/**
 * A response's body: read as it arrives when somebody is listening for how much has come or may
 * let go of it, and whole otherwise, as a platform whose response has no body to read gives it.
 */
async function bytesOf(
  response: Response,
  onProgress: FetchProgress | undefined,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  const total = lengthOf(response.headers.get("content-length"));
  if ((onProgress !== undefined || signal !== undefined) && response.body != null) {
    return await readCounting(response.body, total, onProgress ?? (() => undefined), signal);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  onProgress?.(bytes.byteLength, total ?? bytes.byteLength);
  return bytes;
}

/** A grant: a URL a player fetches with nothing else, until when, and which bytes it names. */
export interface AttachmentGrant {
  /** The URL, on the server this device reaches: what a player is handed. */
  readonly url: string;
  /** Milliseconds since the epoch. Past it the URL is refused, and a player asking for more fails. */
  readonly expiresAt: number;
  /**
   * The bytes it names: the variant asked for, or `file` where the file itself is what that gives —
   * a video whose copy is still being made, a photo with no copy for a viewer.
   */
  readonly variant: AttachmentVariant;
  /** For a `play`, where the video's copy that plays everywhere has got to. */
  readonly playable: PlayableState | undefined;
}

/**
 * A grant for one variant of an attachment (ADR 0058), for a player that cannot sign a request:
 * AVPlayer, ExoPlayer, a `<video>` or an `<img>`. The URL is a bearer for that file until it
 * expires — ten minutes, or a video's length and ten more — and names the same bytes all that time,
 * so a player's runs of it agree: a play asked for while the copy is being made names the file.
 *
 * Nothing when the device reaches its server through a tunnel — the relay's, or the door on the
 * server's own network (ADR 0191) — where a player cannot follow the request inside, and a grant
 * would send the file over the plain port in the clear; and nothing from a server from before
 * grants. Either way the caller fetches the bytes as it did before. A refusal of anything else is
 * thrown, with the server's words.
 */
export async function grantAttachment(
  device: Device,
  id: string,
  variant: AttachmentVariant,
): Promise<AttachmentGrant | undefined> {
  const link = linkFor(device);
  if (link.kind !== "direct") return undefined;
  const target = `/v1/attachments/${id}/grant`;
  const body = JSON.stringify({ variant });
  const response = await link.fetch(endpoint(device, target), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await signRequest(device, "POST", target, body)),
    },
    body,
  });
  // A server from before grants has no such route; one with them has no such bytes. Either way the
  // bytes are fetched the old way, which says which it was.
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const reason = (await reasonOf(response)).replace(/\.$/, "");
    throw new UploadError(`Could not play it here: ${reason}.`, response.status);
  }
  const granted = (await response.json()) as {
    readonly url: string;
    readonly expires_at: string;
    readonly variant: AttachmentVariant;
    readonly playable?: string;
  };
  return {
    url: endpoint(device, granted.url),
    expiresAt: Date.parse(granted.expires_at),
    variant: granted.variant,
    playable: playableOf(granted.playable ?? null),
  };
}

/**
 * Where a frame may load an HTML page from (ADR 0201): the server's page door, by a ticket a
 * signed ask mints, good once and for thirty seconds. A frame cannot sign the request for its
 * document, and a frame given its document takes the app's own policy with it, which runs no
 * inline script (ADR 0100); loaded from the door, the page's own policy comes as a header and its
 * script runs.
 *
 * Nothing when the device reaches its server through a tunnel — the relay's, or the door on the
 * server's own network (ADR 0191) — where a frame cannot follow the request inside, as a grant
 * is nothing there; and nothing from a server from before the door (`404`). Either way the
 * caller draws the page from its words, as it did before, still. A refusal of anything else is
 * thrown, with the server's words.
 */
export async function pageUrl(device: Device, id: string): Promise<string | undefined> {
  const link = linkFor(device);
  if (link.kind !== "direct") return undefined;
  const target = `/v1/attachments/${id}/page`;
  const response = await link.fetch(endpoint(device, target), {
    method: "POST",
    headers: await signRequest(device, "POST", target, ""),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const reason = (await reasonOf(response)).replace(/\.$/, "");
    throw new UploadError(`Could not open it here: ${reason}.`, response.status);
  }
  const { url } = (await response.json()) as { readonly url: string };
  return endpoint(device, url);
}

/**
 * Where a frame may load a page of a room's project from (ADR 0223): the page door, by a ticket
 * whose ask builds the page into one document first. Nothing through a tunnel, as `pageUrl`; the
 * caller asks for the document itself there (`projectPage`). A refusal is thrown in the server's
 * words.
 */
export async function projectPageUrl(
  device: Device,
  spaceId: string,
  path: string,
  at?: string,
): Promise<string | undefined> {
  const link = linkFor(device);
  if (link.kind !== "direct") return undefined;
  const target = `/v1/spaces/${encodeURIComponent(spaceId)}/project/page`;
  const body = JSON.stringify({ path, ...(at === undefined ? {} : { at }) });
  const response = await link.fetch(endpoint(device, target), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await signRequest(device, "POST", target, body)),
    },
    body,
  });
  if (!response.ok) {
    const reason = (await reasonOf(response)).replace(/\.$/, "");
    throw new UploadError(`Could not open it here: ${reason}.`, response.status);
  }
  const { url } = (await response.json()) as { readonly url: string };
  return endpoint(device, url);
}

/** `x-chips-playable` as this client knows it; a state it does not know is no state. */
function playableOf(header: string | null): PlayableState | undefined {
  return header !== null && PLAYABLE_STATES.includes(header)
    ? (header as PlayableState)
    : undefined;
}

/**
 * The bytes of an attachment, or its thumbnail, fetched with the device's signature. Bytes
 * rather than a blob, because a phone writes them to a file and plays or shares that; the
 * browser's blob is made from them by `fetchAttachment`.
 */
export async function fetchAttachmentBytes(
  device: Device,
  id: string,
  variant: AttachmentVariant = "file",
): Promise<Uint8Array<ArrayBuffer>> {
  return (await fetchAttachmentWithType(device, id, variant)).bytes;
}

/**
 * The same, as a Blob for an object URL, which is how an `<img>` in a browser shows it — and
 * typed as the server served it, because an `<object type="application/pdf">` will not draw a
 * blob that says it is a stream of bytes.
 */
export async function fetchAttachment(
  device: Device,
  id: string,
  variant: AttachmentVariant = "file",
): Promise<Blob> {
  const { bytes, mimeType } = await fetchAttachmentWithType(device, id, variant);
  return new Blob([bytes], { type: mimeType });
}
