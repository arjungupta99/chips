/**
 * Uploads (decision 10, M1.5). A client asks for a slot, sends the bytes, and gets back what
 * the bytes turned out to be — never what it claimed. The MIME type is sniffed; a photo is
 * straightened, stripped of its metadata unless the uploader kept it, and given a thumbnail;
 * everything is kept once, by its SHA-256. Sending the same slot's bytes twice changes nothing.
 *
 * How big is decided twice (ADR 0047): at the slot, by the kind the filename suggests — a
 * courtesy that saves sending what would be refused — and at the bytes, by what they turn out
 * to be, which is the rule. The sentence is the protocol's, so a phone says the same one first.
 *
 * A video is measured by a tool in a process of its own (ADR 0053): its length and size go on the
 * row, a frame becomes its thumbnail, its metadata is dropped as a photo's is, and a copy that
 * plays everywhere is queued for after. Sound is heard the same way (ADR 0054): its length, and
 * what was said in it, before the upload answers, so a message that attaches a voice note carries
 * its words.
 *
 * The bytes come whole, or in pieces at an offset (ADR 0052). Pieces wait on disk until the one
 * that brings them to the size the slot named, and then the upload is what a whole one is. The
 * server says how much it holds, so a client that lost a piece to the network goes on from there.
 *
 * A photo, and a video's poster, also get a copy for a viewer (ADR 0058): no longer than 2,048
 * pixels on its longer side, made beside the thumbnail. A photo kept before there were any is given
 * one the first time it is asked for, once. Which bytes a request names — the file, its thumbnail,
 * its view copy, what to play — is decided here too, for the route and for a grant alike.
 */

import { createHash } from "node:crypto";
import { type AttachmentCaps, kindFromName, sizeRefusal } from "@chipschat/protocol";
import { isRasterImage, kindOf, sniffMime, soundOnlyMime } from "../../domain/index.js";
import type {
  BlobStore,
  Images,
  MeasuredVideo,
  PlayableState,
  Sounds,
  StoredFacts,
  UploadPieces,
  UploadRow,
  UploadsRegistry,
  Videos,
} from "../ports/attachments.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, IdGenerator } from "../ports/index.js";

export interface UploadLimits {
  readonly maxBytes: number;
  /** How long a slot waits for its bytes. */
  readonly slotTtlSeconds: number;
  /** The longer side of a thumbnail, in pixels. */
  readonly thumbnailEdge: number;
  /** The longer side of a viewer's copy, in pixels (ADR 0058). */
  readonly viewEdge: number;
}

export interface UploadsDeps {
  readonly registry: UploadsRegistry;
  readonly blobs: BlobStore;
  readonly pieces: UploadPieces;
  readonly images: Images;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly limits: UploadLimits;
  /** The workspace's caps by kind, under `limits.maxBytes` (ADR 0047). */
  readonly caps: (workspaceId: string) => Promise<AttachmentCaps>;
  /** What measures a video; absent where ffmpeg is not installed, and a video is kept as it came. */
  readonly videos?: Videos | undefined;
  /** A video was kept whose playable copy is still to be made (ADR 0053). */
  readonly onPlayableQueued?: (() => void) | undefined;
  /**
   * A video was kept with its metadata, location included, though its uploader did not keep it:
   * it could not be read, or copied without it. The note says why, for the log.
   */
  readonly onMetadataKept?: ((attachmentId: string, note: string) => void) | undefined;
  /** What hears sound; absent where ffmpeg is not installed, and sound is kept as it came. */
  readonly sounds?: Sounds | undefined;
}

/** An attachment as a message carries it, plus what the grid needs to know. */
export interface StoredAttachment {
  readonly attachment_id: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly byte_size: number;
  readonly sha256: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /** For a video the server measured (ADR 0053), or sound it heard (ADR 0054). */
  readonly duration_ms?: number | undefined;
  /** What was said, for sound the server transcribed (ADR 0054). */
  readonly transcript?: string | undefined;
  readonly kind: "image" | "video" | "audio" | "file";
  readonly has_thumbnail: boolean;
}

export type UploadFailure =
  | { readonly kind: "too_large"; readonly message: string }
  | { readonly kind: "unknown_slot"; readonly message: string }
  | { readonly kind: "not_yours"; readonly message: string }
  | { readonly kind: "expired"; readonly message: string }
  | { readonly kind: "no_size"; readonly message: string }
  | { readonly kind: "wrong_offset"; readonly message: string; readonly received: number }
  | { readonly kind: "past_size"; readonly message: string };

type Outcome<T> = { ok: true; value: T } | { ok: false; error: UploadFailure };

/** Bytes made from an upload, and their type. */
interface Made {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

interface Examined {
  readonly kept: Uint8Array;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly thumb?: Made | undefined;
  /** The copy a viewer shows (ADR 0058). */
  readonly view?: Made | undefined;
  readonly durationMs?: number | undefined;
  readonly playableState?: PlayableState | undefined;
  readonly playableHow?: "remux" | "transcode" | undefined;
  readonly transcript?: string | undefined;
  /** Why a video whose uploader did not keep its metadata was kept with it. */
  readonly metadataNote?: string | undefined;
}

export interface OpenSlotInput {
  readonly principal: Principal;
  readonly filename: string;
  /** What the client expects to send. A larger PUT is refused anyway. */
  readonly byteSize?: number | undefined;
  readonly keepMetadata?: boolean | undefined;
}

export interface Slot {
  readonly id: string;
  readonly expiresAt: string;
}

export interface PieceInput {
  readonly principal: Principal;
  readonly id: string;
  /** Where in the file the piece goes: the number of bytes the server already holds. */
  readonly offset: number;
  readonly bytes: Uint8Array;
}

/** What a piece did: brought the upload on, or finished it. */
export type PieceResult =
  | { readonly received: number }
  | { readonly received: number; readonly attachment: StoredAttachment };

/**
 * Which bytes of an attachment: the file as it was sent, its thumbnail (a video's poster too), the
 * copy a viewer shows (ADR 0058), or what to play (ADR 0053).
 */
export type AttachmentVariant = "file" | "thumb" | "view" | "play";

/** The bytes a request for a variant names, and what they are. */
export interface NamedBytes {
  /**
   * What they are, as a grant names them: the variant asked for, or `file` where the file itself is
   * what that variant gives — a video whose copy is not made, a photo with no copy to make.
   */
  readonly variant: AttachmentVariant;
  readonly sha256: string;
  readonly mime: string;
  /** What a download of them is called. */
  readonly name: string;
  /** For a `view`: the copy, or the file itself where there is no copy. */
  readonly view?: "copy" | "original" | undefined;
  /** For a `play` of a measured video: where its copy that plays everywhere has got to. */
  readonly playable?: PlayableState | undefined;
}

/** What a variant names, or why nothing. */
export type Naming =
  | { readonly ok: true; readonly bytes: NamedBytes }
  | { readonly ok: false; readonly message: string };

/** How far an upload got, for a client that must know before it goes on (ADR 0052). */
export interface UploadProgress {
  readonly id: string;
  readonly received: number;
  readonly declared: number | null;
  readonly expiresAt: string;
  readonly attachment?: StoredAttachment | undefined;
}

/** The attachment a stored row describes, for a message or for `upload_ids`. */
export function attachmentOf(row: UploadRow): StoredAttachment | undefined {
  if (row.state !== "stored" || row.mime_type === null || row.sha256 === null) return undefined;
  return {
    attachment_id: row.id,
    filename: row.filename,
    mime_type: row.mime_type,
    byte_size: row.byte_size ?? 0,
    sha256: row.sha256,
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    ...(row.duration_ms === null ? {} : { duration_ms: row.duration_ms }),
    ...(row.transcript === null ? {} : { transcript: row.transcript }),
    kind: kindOf(row.mime_type),
    has_thumbnail: row.thumbnail_sha256 !== null,
  };
}

export function createUploads(deps: UploadsDeps) {
  const { limits } = deps;

  /** Why these bytes may not be sent here as this kind, or nothing. */
  async function tooLarge(
    workspaceId: string,
    kind: ReturnType<typeof kindOf>,
    bytes: number,
  ): Promise<UploadFailure | undefined> {
    const why = sizeRefusal(await deps.caps(workspaceId), kind, bytes, limits.maxBytes);
    return why === undefined ? undefined : { kind: "too_large", message: why };
  }

  async function openSlot(input: OpenSlotInput): Promise<Outcome<Slot>> {
    if (input.byteSize !== undefined) {
      const kind = kindFromName(input.filename);
      const refused = await tooLarge(input.principal.workspaceId, kind, input.byteSize);
      if (refused !== undefined) return { ok: false, error: refused };
    }
    const id = deps.ids.next("attachment");
    const now = deps.clock.nowMs();
    const expiresAt = new Date(now + limits.slotTtlSeconds * 1000).toISOString();
    await deps.registry.open({
      id,
      workspace_id: input.principal.workspaceId,
      uploaded_by: input.principal.participantId,
      filename: input.filename.trim() === "" ? "file" : input.filename.trim().slice(0, 255),
      keep_metadata: input.keepMetadata === true,
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      declared_bytes: input.byteSize ?? null,
    });
    return { ok: true, value: { id, expiresAt } };
  }

  /**
   * What the bytes are, and — for a photo or a video — what to keep, what to show in the grid, and
   * for a video what is still to do.
   */
  async function examine(
    bytes: Uint8Array,
    filename: string,
    keepMetadata: boolean,
  ): Promise<Examined> {
    const mime = sniffMime(bytes, filename);
    if (kindOf(mime) === "video") return examineVideo(bytes, mime, keepMetadata);
    if (kindOf(mime) === "audio") return examineSound(bytes, mime);
    if (!isRasterImage(mime) || (await deps.images.inspect(bytes)) === undefined) {
      return { kept: bytes, mime, width: null, height: null };
    }
    const prepared = await deps.images.prepare(bytes, { keepMetadata });
    const thumbnail = await deps.images.thumbnail(prepared.bytes, limits.thumbnailEdge);
    return {
      kept: prepared.bytes,
      mime: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      thumb: { bytes: thumbnail.bytes, mime: thumbnail.mimeType },
      view: hasViewCopy(prepared.mimeType)
        ? await shrunk(prepared.bytes, limits.viewEdge)
        : undefined,
    };
  }

  /** A copy no longer than `edge` on its longer side; nothing when it cannot be made. */
  async function shrunk(bytes: Uint8Array, edge: number): Promise<Made | undefined> {
    const made = await deps.images.thumbnail(bytes, edge).catch(() => undefined);
    return made === undefined ? undefined : { bytes: made.bytes, mime: made.mimeType };
  }

  /**
   * A video, measured and given a poster when it can be, and kept without its metadata unless its
   * uploader kept it. That happens before its digest is taken, since the digest and the size are
   * what a message will name: after this the kept bytes are never changed. A video that cannot be
   * read, or copied without its metadata, is kept as it came.
   */
  async function examineVideo(
    bytes: Uint8Array,
    mime: string,
    keepMetadata: boolean,
  ): Promise<Examined> {
    const { videos } = deps;
    const measured = await videos?.measure(bytes, mime).catch(() => undefined);
    if (videos === undefined || measured === undefined) {
      const unread =
        videos === undefined || keepMetadata ? {} : { metadataNote: "it could not be read" };
      return { kept: bytes, mime, width: null, height: null, ...unread };
    }
    if ("soundOnly" in measured) return examineSound(bytes, soundOnlyMime(mime));
    return {
      ...(keepMetadata ? { kept: bytes } : await stripped(videos, bytes, mime)),
      mime,
      width: measured.width,
      height: measured.height,
      durationMs: measured.durationMs,
      ...(await postersOf(measured)),
      ...playableOf(measured),
    };
  }

  /** The video without its metadata, or as it came and why, when that copy could not be made. */
  async function stripped(
    videos: Videos,
    bytes: Uint8Array,
    mime: string,
  ): Promise<Pick<Examined, "kept" | "metadataNote">> {
    try {
      return { kept: await videos.strip(bytes, mime) };
    } catch (error) {
      return { kept: bytes, metadataNote: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Sound, kept as it came, with its length and what was said in it when it can be heard. A voice
   * note that cannot be heard is still an upload: with no transcript, as sound was before ADR 0054.
   */
  async function examineSound(bytes: Uint8Array, mime: string): Promise<Examined> {
    const heard = await deps.sounds?.hear(bytes).catch(() => undefined);
    return {
      kept: bytes,
      mime,
      width: null,
      height: null,
      durationMs: heard?.durationMs,
      transcript: heard?.transcript,
    };
  }

  /**
   * The frame, made a thumbnail and a viewer's copy the way a photo's are; nothing when there is no
   * frame to make them of.
   */
  async function postersOf(measured: MeasuredVideo): Promise<Pick<Examined, "thumb" | "view">> {
    if (measured.poster === undefined) return {};
    return {
      thumb: await shrunk(measured.poster, limits.thumbnailEdge),
      view: await shrunk(measured.poster, limits.viewEdge),
    };
  }

  /** Whose slot it is, and whether it is still open. How big the bytes are is judged on what they are. */
  async function admit(
    principal: Principal,
    id: string,
  ): Promise<Outcome<UploadRow> | { ok: true; value: UploadRow; already: StoredAttachment }> {
    const row = await deps.registry.find(principal.workspaceId, id);
    if (row === undefined) {
      return { ok: false, error: { kind: "unknown_slot", message: `no upload ${id} here` } };
    }
    if (row.uploaded_by !== principal.participantId) {
      return {
        ok: false,
        error: { kind: "not_yours", message: "that upload slot is somebody else's" },
      };
    }
    const already = attachmentOf(row);
    if (already !== undefined) return { ok: true, value: row, already };
    if (Date.parse(row.expires_at) <= deps.clock.nowMs()) {
      return {
        ok: false,
        error: { kind: "expired", message: "that upload slot has expired; ask for another" },
      };
    }
    return { ok: true, value: row };
  }

  /** The bytes into the store by their digest, the thumbnail beside them, the row filled in. */
  async function keep(row: UploadRow, bytes: Uint8Array): Promise<StoredAttachment> {
    const examined = await examine(bytes, row.filename, row.keep_metadata);
    const sha256 = digest(examined.kept);
    await deps.blobs.put(sha256, examined.kept);
    const thumbnailSha = await keepMade(examined.thumb);
    const viewSha = await keepMade(examined.view);
    const facts = factsOf(examined, sha256, { thumbnailSha, viewSha }, deps.clock.nowIso());
    await deps.registry.stored(row.workspace_id, row.id, facts);
    await deps.pieces.discard(row.id);
    if (examined.metadataNote !== undefined) deps.onMetadataKept?.(row.id, examined.metadataNote);
    if (facts.playable_state === "pending") deps.onPlayableQueued?.();
    const stored = attachmentOf({ ...row, state: "stored", ...facts });
    if (stored === undefined) throw new Error("a stored upload has no attachment");
    return stored;
  }

  /** Bytes made from an upload, into the store by their digest; the digest, or null for none. */
  async function keepMade(made: Made | undefined): Promise<string | null> {
    if (made === undefined) return null;
    const sha256 = digest(made.bytes);
    await deps.blobs.put(sha256, made.bytes);
    return sha256;
  }

  /**
   * One slot's pieces are taken one at a time: two retries of the same piece racing each other
   * would otherwise both find the offset right and both append.
   */
  const queues = new Map<string, Promise<unknown>>();
  function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (queues.get(key) ?? Promise.resolve()).then(work);
    const settled = next.catch(() => undefined);
    queues.set(key, settled);
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return next;
  }

  async function store(input: {
    readonly principal: Principal;
    readonly id: string;
    readonly bytes: Uint8Array;
  }): Promise<Outcome<StoredAttachment>> {
    const admitted = await admit(input.principal, input.id);
    if (!admitted.ok) return admitted;
    if ("already" in admitted) return { ok: true, value: admitted.already };
    const row = admitted.value;
    // The cap by what the bytes are, not by what the name said: a video called `photo.jpg`
    // is capped as a video. The ceiling is in the same sentence, for bytes over it with no cap.
    const kind = kindOf(sniffMime(input.bytes, row.filename));
    const refused = await tooLarge(row.workspace_id, kind, input.bytes.byteLength);
    if (refused !== undefined) return { ok: false, error: refused };
    return { ok: true, value: await keep(row, input.bytes) };
  }

  /**
   * A piece of the file at an offset (ADR 0052). The offset must be what the server holds, the
   * piece must not go past the size the slot named, and the first piece — which carries what the
   * sniff reads — has that size judged against the cap for what the file is. The piece that
   * reaches the size finishes the upload; a retry of it after that answers the same attachment.
   */
  async function piece(input: PieceInput): Promise<Outcome<PieceResult>> {
    // Admitted inside the queue, so a retry of the last piece waits for the first to finish and
    // then finds the attachment rather than an empty run of pieces.
    return oneAtATime(`${input.principal.workspaceId}/${input.id}`, async () => {
      const admitted = await admit(input.principal, input.id);
      if (!admitted.ok) return admitted;
      if ("already" in admitted) {
        const received = admitted.value.declared_bytes ?? admitted.already.byte_size;
        return { ok: true, value: { received, attachment: admitted.already } };
      }
      return take(admitted.value, input);
    });
  }

  /** Append the piece if it may be, move the slot on, and finish when it is the last. */
  async function take(row: UploadRow, input: PieceInput): Promise<Outcome<PieceResult>> {
    const held = await deps.pieces.size(row.id);
    const refused = await refusePiece(row, input, held);
    if (refused !== undefined) return { ok: false, error: refused };
    await deps.pieces.append(row.id, input.bytes);
    const expiresAt = new Date(deps.clock.nowMs() + limits.slotTtlSeconds * 1000);
    await deps.registry.extend(row.workspace_id, row.id, expiresAt.toISOString());
    const received = held + input.bytes.byteLength;
    if (received < (row.declared_bytes ?? received)) return { ok: true, value: { received } };
    return finish(row, received);
  }

  /** Why this piece may not go after the `held` bytes of this slot, or nothing. */
  async function refusePiece(
    row: UploadRow,
    input: PieceInput,
    held: number,
  ): Promise<UploadFailure | undefined> {
    const declared = row.declared_bytes;
    if (declared === null) {
      return {
        kind: "no_size",
        message: "that slot did not say how big the file is, so it takes the bytes whole",
      };
    }
    if (input.offset !== held) {
      return {
        kind: "wrong_offset",
        message: `that upload has ${held} bytes; send the piece that starts there`,
        received: held,
      };
    }
    if (held + input.bytes.byteLength > declared) {
      return {
        kind: "past_size",
        message: `that piece goes past the ${declared} bytes the slot said the file is`,
      };
    }
    if (held > 0) return undefined;
    // The first piece carries what the sniff reads: the size the slot named, judged by what it is.
    return tooLarge(row.workspace_id, kindOf(sniffMime(input.bytes, row.filename)), declared);
  }

  /** Every piece is in: judge the whole by what it is, as a whole upload is judged, and keep it. */
  async function finish(row: UploadRow, received: number): Promise<Outcome<PieceResult>> {
    const bytes = await deps.pieces.read(row.id);
    const kind = kindOf(sniffMime(bytes, row.filename));
    const refused = await tooLarge(row.workspace_id, kind, bytes.byteLength);
    if (refused !== undefined) {
      // Nothing sent again will change what these bytes are.
      await deps.pieces.discard(row.id);
      return { ok: false, error: refused };
    }
    return { ok: true, value: { received, attachment: await keep(row, bytes) } };
  }

  /** How far an upload got: the bytes held, the size named, and the attachment once there is one. */
  async function progress(input: {
    readonly principal: Principal;
    readonly id: string;
  }): Promise<Outcome<UploadProgress>> {
    const admitted = await admit(input.principal, input.id);
    if (!admitted.ok) return admitted;
    const row = admitted.value;
    if ("already" in admitted) {
      const { already } = admitted;
      return {
        ok: true,
        value: {
          id: row.id,
          received: row.declared_bytes ?? already.byte_size,
          declared: row.declared_bytes,
          expiresAt: row.expires_at,
          attachment: already,
        },
      };
    }
    return {
      ok: true,
      value: {
        id: row.id,
        received: await deps.pieces.size(row.id),
        declared: row.declared_bytes,
        expiresAt: row.expires_at,
      },
    };
  }

  /** The sweep's part: forget the pieces of every slot not waiting at `now`. How many, back. */
  async function abandon(now: string): Promise<number> {
    const waiting = await deps.pieces.waiting();
    if (waiting.length === 0) return 0;
    const open = new Set(await deps.registry.openAmong(waiting, now));
    const gone = waiting.filter((id) => !open.has(id));
    for (const id of gone) await deps.pieces.discard(id);
    return gone.length;
  }

  /**
   * The bytes a request for a variant names (ADR 0058). A variant it does not know is the file, as
   * it always was. A photo kept before there were view copies is given one now, once.
   */
  async function bytesOf(row: UploadRow, asked: string | undefined): Promise<Naming> {
    const original: NamedBytes = {
      variant: "file",
      sha256: row.sha256 ?? "",
      mime: row.mime_type ?? "",
      name: row.filename,
    };
    switch (asked) {
      case "thumb":
        return thumbOf(row);
      case "view":
        return viewOf(row, original);
      case "play":
        return { ok: true, bytes: playOf(row, original) };
      default:
        return { ok: true, bytes: original };
    }
  }

  /** A photo's view copy, or a video poster's; the file itself for a photo with none to have. */
  async function viewOf(row: UploadRow, original: NamedBytes): Promise<Naming> {
    const copy = row.view_sha256 === null ? await viewMadeFor(row) : viewRecorded(row);
    if (copy !== undefined) {
      return {
        ok: true,
        bytes: { variant: "view", ...copy, name: `${row.filename}.webp`, view: "copy" },
      };
    }
    if (kindOf(row.mime_type ?? "") === "image") {
      return { ok: true, bytes: { ...original, view: "original" } };
    }
    return { ok: false, message: "That attachment has no copy for a viewer." };
  }

  /**
   * Whether a request for the view copy will be answered with one: it has one, or it is a photo kept
   * before there were any, which is given one when it is asked for. A grant names the variant by it.
   */
  function willHaveView(row: UploadRow): boolean {
    return row.view_sha256 !== null || mayMakeViewFor(row);
  }

  /** Photos being given a view copy now, by id, so two first asks make it once. */
  const making = new Map<string, Promise<{ sha256: string; mime: string } | undefined>>();

  /** The view copy for a photo kept before there were any, made from the file and recorded once. */
  function viewMadeFor(row: UploadRow): Promise<{ sha256: string; mime: string } | undefined> {
    if (!mayMakeViewFor(row)) return Promise.resolve(undefined);
    const key = `${row.workspace_id}/${row.id}`;
    let made = making.get(key);
    if (made === undefined) {
      made = makeView(row).finally(() => making.delete(key));
      making.set(key, made);
    }
    return made;
  }

  async function makeView(row: UploadRow): Promise<{ sha256: string; mime: string } | undefined> {
    // Asked again, since a request that read the row before another made its copy comes here late.
    const now = await deps.registry.find(row.workspace_id, row.id);
    if (now !== undefined && now.view_sha256 !== null) return viewRecorded(now);
    const bytes = await deps.blobs.get(row.sha256 ?? "");
    if (bytes === undefined) return undefined;
    const copy = await shrunk(bytes, limits.viewEdge);
    if (copy === undefined) return undefined;
    const sha256 = await keepMade(copy);
    if (sha256 === null) return undefined;
    await deps.registry.viewMade(row.workspace_id, row.id, { sha256, mimeType: copy.mime });
    return { sha256, mime: copy.mime };
  }

  return { openSlot, store, piece, progress, abandon, bytesOf, willHaveView };
}

export type Uploads = ReturnType<typeof createUploads>;

/**
 * Whether a photo of this type gets a view copy. A GIF does not: a copy is one still frame, and a
 * viewer shows the file, moving.
 */
function hasViewCopy(mime: string): boolean {
  return isRasterImage(mime) && mime !== "image/gif";
}

/**
 * A photo kept before there were view copies, which can be given one: one `sharp` read when it
 * arrived, which is what its thumbnail says.
 */
function mayMakeViewFor(row: UploadRow): boolean {
  return (
    row.state === "stored" &&
    row.view_sha256 === null &&
    row.sha256 !== null &&
    row.thumbnail_sha256 !== null &&
    hasViewCopy(row.mime_type ?? "")
  );
}

function viewRecorded(row: UploadRow): { sha256: string; mime: string } | undefined {
  return row.view_sha256 === null || row.view_mime_type === null
    ? undefined
    : { sha256: row.view_sha256, mime: row.view_mime_type };
}

/** The thumbnail, a video's poster included. */
function thumbOf(row: UploadRow): Naming {
  if (row.thumbnail_sha256 === null || row.thumbnail_mime_type === null) {
    return { ok: false, message: "That attachment has no thumbnail." };
  }
  return {
    ok: true,
    bytes: {
      variant: "thumb",
      sha256: row.thumbnail_sha256,
      mime: row.thumbnail_mime_type,
      name: `${row.filename}.webp`,
    },
  };
}

/**
 * What to play: a video's copy that plays everywhere once it is made (ADR 0053), and the file itself
 * until then, or when there never is one. A copy made is made for good, so `play` always names the
 * same bytes; the file, while the copy is being made, is named as the file.
 */
function playOf(row: UploadRow, original: NamedBytes): NamedBytes {
  const playable = row.playable_state ?? undefined;
  if (
    row.playable_state !== "done" ||
    row.playable_sha256 === null ||
    row.playable_mime_type === null
  ) {
    return { ...original, playable };
  }
  return {
    variant: "play",
    sha256: row.playable_sha256,
    mime: row.playable_mime_type,
    name: `${row.filename.replace(/\.[^.]*$/, "")}.mp4`,
    playable,
  };
}

/** What the registry records of a kept upload. */
function factsOf(
  examined: Examined,
  sha256: string,
  made: { readonly thumbnailSha: string | null; readonly viewSha: string | null },
  storedAt: string,
): StoredFacts {
  return {
    mime_type: examined.mime,
    byte_size: examined.kept.byteLength,
    sha256,
    width: examined.width,
    height: examined.height,
    thumbnail_sha256: made.thumbnailSha,
    thumbnail_mime_type: examined.thumb?.mime ?? null,
    view_sha256: made.viewSha,
    view_mime_type: made.viewSha === null ? null : (examined.view?.mime ?? null),
    stored_at: storedAt,
    duration_ms: examined.durationMs ?? null,
    playable_state: examined.playableState ?? null,
    playable_how: examined.playableHow ?? null,
    transcript: examined.transcript ?? null,
  };
}

/** What is still to do for a measured video: nothing, or a copy to make and how. */
function playableOf(measured: MeasuredVideo): Pick<Examined, "playableState" | "playableHow"> {
  switch (measured.playable) {
    case "remux":
    case "transcode":
      return { playableState: "pending", playableHow: measured.playable };
    default:
      return { playableState: "skipped" };
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
