/**
 * The ports attachments need (decision 10): somewhere to keep bytes by their digest, something
 * that understands images, something that understands video (ADR 0053) and something that hears
 * sound (ADR 0054), a registry of what was uploaded, and somewhere for the pieces of an upload
 * that has not finished (ADR 0052). Local disk, `sharp`, `ffmpeg` and `whisper` fill them in solo
 * mode; S3 and a worker do in Phase 6.
 */

import type { Playable } from "../../domain/index.js";

/** A run of a blob's bytes, from `start` to `end`, both included, as `Content-Range` counts them. */
export interface BlobRange {
  readonly start: number;
  readonly end: number;
}

/** Bytes, kept once by their SHA-256. */
export interface BlobStore {
  readonly put: (sha256: string, bytes: Uint8Array) => Promise<void>;
  /** Every byte, in memory: for what the server works on itself, a photo to shrink. */
  readonly get: (sha256: string) => Promise<Uint8Array | undefined>;
  /** How many bytes are kept under this digest; nothing when none are. */
  readonly size: (sha256: string) => Promise<number | undefined>;
  /**
   * The bytes, or a run of them, as they are read (ADR 0058): what a request is answered with, so a
   * player's megabyte of a 500 MB video is a megabyte read. Nothing when none are kept. Cancelling
   * the stream lets go of what it holds.
   */
  readonly read: (
    sha256: string,
    range?: BlobRange | undefined,
  ) => Promise<ReadableStream<Uint8Array> | undefined>;
  /**
   * Let a file go (ADR 0067): only for a digest nothing refers to any more, which an erase works
   * out. Removing one that is not there is not a failure.
   */
  readonly remove: (sha256: string) => Promise<void>;
}

export interface ImageResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

/** What the server does to a photo: reads it, straightens it and strips it, shrinks it. */
export interface Images {
  /** The size, when these bytes are an image this server can read. */
  readonly inspect: (bytes: Uint8Array) => Promise<{ width: number; height: number } | undefined>;
  /**
   * The photo as it will be kept: its orientation applied, and its metadata — location
   * included — dropped unless the uploader asked to keep it.
   */
  readonly prepare: (bytes: Uint8Array, options: { keepMetadata: boolean }) => Promise<ImageResult>;
  /** A copy no larger than `maxEdge` on its longer side: for the grid, and for a viewer (ADR 0058). */
  readonly thumbnail: (bytes: Uint8Array, maxEdge: number) => Promise<ImageResult>;
}

/** A video as measured when it arrived, with a frame to show before it plays (ADR 0053). */
export interface MeasuredVideo {
  readonly durationMs: number;
  /** As displayed, its rotation applied. */
  readonly width: number;
  readonly height: number;
  readonly playable: Playable;
  /** One frame, as a JPEG, when one could be taken. */
  readonly poster?: Uint8Array | undefined;
}

/** What looked like a video and holds sound and no picture: a voice note in a video's box. */
export interface SoundOnly {
  readonly soundOnly: true;
}

/**
 * What the server does to a video, in a process of its own under limits (ADR 0053): measures it
 * and takes a frame, drops what the camera wrote into the file, and makes a copy that plays
 * everywhere.
 */
export interface Videos {
  /** Nothing when these bytes are not a video the measuring tool can read in time. */
  readonly measure: (
    bytes: Uint8Array,
    mime: string,
  ) => Promise<MeasuredVideo | SoundOnly | undefined>;
  /**
   * The video as it will be kept when its uploader did not keep its metadata: the same container,
   * its picture and its sound copied and not encoded again, its rotation kept, and nothing else —
   * no metadata, location included, no chapters and no other track. Rejects with the tool's last
   * words when it fails, runs out of time, or would outgrow the server's ceiling.
   */
  readonly strip: (bytes: Uint8Array, mime: string) => Promise<Uint8Array>;
  /**
   * An MP4 that plays everywhere, by copying the streams or encoding them again. Rejects with the
   * tool's last words when it fails, runs out of time, or would outgrow the server's ceiling.
   */
  readonly playable: (
    bytes: Uint8Array,
    how: "remux" | "transcode",
    durationMs: number,
  ) => Promise<Uint8Array>;
}

/** Sound as it was heard when it arrived (ADR 0054). */
export interface HeardSound {
  readonly durationMs: number;
  /** What was said. Nothing when nobody spoke, it was too long, or nothing here transcribes. */
  readonly transcript?: string | undefined;
  /** Why there is no transcript, for the log. */
  readonly note?: string | undefined;
}

/** What the server does to sound, in processes of their own under limits (ADR 0054). */
export interface Sounds {
  /** Nothing when these bytes are not sound the measuring tool can read in time. */
  readonly hear: (bytes: Uint8Array) => Promise<HeardSound | undefined>;
}

/** Where a video's playable copy has got to. Null for anything that is not a measured video. */
export type PlayableState = "pending" | "done" | "skipped" | "failed";

/** An upload as the registry holds it: a slot, or a stored file. */
export interface UploadRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly uploaded_by: string;
  readonly filename: string;
  readonly state: "slot" | "stored";
  readonly mime_type: string | null;
  readonly byte_size: number | null;
  readonly sha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration_ms: number | null;
  readonly thumbnail_sha256: string | null;
  readonly thumbnail_mime_type: string | null;
  readonly keep_metadata: boolean;
  readonly created_at: string;
  readonly expires_at: string;
  readonly stored_at: string | null;
  /** The size the slot said it would be; a pieced upload needs it (ADR 0052). */
  readonly declared_bytes: number | null;
  readonly playable_state: PlayableState | null;
  /** How a pending copy is to be made. */
  readonly playable_how: "remux" | "transcode" | null;
  readonly playable_sha256: string | null;
  readonly playable_mime_type: string | null;
  /** Why a copy failed, in the tool's words. */
  readonly playable_note: string | null;
  /** What was said in a voice note, as the server heard it (ADR 0054). */
  readonly transcript: string | null;
  /** The copy a viewer shows: a photo, or a video's poster, at 2,048 pixels at most (ADR 0058). */
  readonly view_sha256: string | null;
  readonly view_mime_type: string | null;
}

/** A playable copy made, or not (ADR 0053). */
export type PlayableOutcome =
  | { readonly state: "done"; readonly sha256: string; readonly mimeType: string }
  | { readonly state: "failed"; readonly note: string };

export interface StoredFacts {
  readonly mime_type: string;
  readonly byte_size: number;
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly thumbnail_sha256: string | null;
  readonly thumbnail_mime_type: string | null;
  readonly stored_at: string;
  readonly duration_ms: number | null;
  readonly playable_state: PlayableState | null;
  readonly playable_how: "remux" | "transcode" | null;
  readonly transcript: string | null;
  readonly view_sha256: string | null;
  readonly view_mime_type: string | null;
}

export interface UploadsRegistry {
  readonly open: (
    slot: Pick<
      UploadRow,
      | "id"
      | "workspace_id"
      | "uploaded_by"
      | "filename"
      | "keep_metadata"
      | "created_at"
      | "expires_at"
      | "declared_bytes"
    >,
  ) => Promise<void>;
  readonly find: (workspaceId: string, id: string) => Promise<UploadRow | undefined>;
  readonly stored: (workspaceId: string, id: string, facts: StoredFacts) => Promise<void>;
  /** A piece arrived: the slot waits until then for the next (ADR 0052). */
  readonly extend: (workspaceId: string, id: string, expiresAt: string) => Promise<void>;
  /** Of these ids, the slots still waiting for bytes at `now`. */
  readonly openAmong: (ids: readonly string[], now: string) => Promise<readonly string[]>;
  /** The video that has waited longest for its playable copy, in any workspace. */
  readonly nextPlayable: () => Promise<UploadRow | undefined>;
  /** Record what came of making a video's playable copy. */
  readonly playableMade: (
    workspaceId: string,
    id: string,
    outcome: PlayableOutcome,
  ) => Promise<void>;
  /**
   * Record the view copy made for a photo kept before there were any (ADR 0058). Only a row with
   * none is written, so it is recorded once; false when it already had one.
   */
  readonly viewMade: (
    workspaceId: string,
    id: string,
    view: { readonly sha256: string; readonly mimeType: string },
  ) => Promise<boolean>;
}

/**
 * The pieces of an upload that has not finished (ADR 0052), one run of bytes per slot, appended
 * in order. How much has arrived is the length of that run, and nothing else.
 */
export interface UploadPieces {
  /** How many bytes of this slot have arrived; nought when none have. */
  readonly size: (id: string) => Promise<number>;
  /** Put a piece after the ones already there. */
  readonly append: (id: string, bytes: Uint8Array) => Promise<void>;
  /** Every byte that arrived, in order. */
  readonly read: (id: string) => Promise<Uint8Array>;
  /** Forget the pieces; nothing happens when there are none. */
  readonly discard: (id: string) => Promise<void>;
  /** The slots that have pieces waiting. */
  readonly waiting: () => Promise<readonly string[]>;
}
