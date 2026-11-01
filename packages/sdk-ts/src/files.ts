/**
 * Files in and out (ADRs 0010, 0052, 0099). Out: `upload` asks for a slot and sends the bytes, in
 * four-megabyte pieces at an offset when there are more than that, asking the server how far it
 * got after a piece fails and going on from there; the upload id goes on a post as `uploadIds`.
 * In: an attachment's signed URL is bound to the token that was handed it, so `download` fetches
 * it with that token as the bearer, which a plain `fetch` of the URL would not.
 */

import type { SignedAttachment } from "@chipschat/protocol";
import { RefusedError } from "./outbox.js";

/** How big a piece is: what the phone and the desktop send (ADR 0052). */
export const PIECE_BYTES = 4 * 1024 * 1024;
/** How many times a piece is tried before the upload gives up. */
const PIECE_TRIES = 5;

export interface UploadInput {
  readonly bytes: Uint8Array;
  /** The name a person sees. The server reads the type from the bytes, never from this. */
  readonly filename: string;
  /** Keep a photo's or a video's metadata (where it was taken); dropped unless said. */
  readonly keepMetadata?: boolean | undefined;
}

/** What an upload turned out to be, as the server measured it. */
export interface Uploaded {
  /** What a post names in `uploadIds`. */
  readonly attachmentId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly kind: string;
}

/** One call to chipsd with the harness's token: JSON in and out, or bytes in. */
export type Call = (
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: Readonly<Record<string, unknown>> | Uint8Array,
) => Promise<Record<string, unknown>>;

function uploaded(answer: Record<string, unknown>): Uploaded {
  const attachment = (answer["attachment"] ?? {}) as Record<string, unknown>;
  return {
    attachmentId: String(attachment["attachment_id"]),
    filename: String(attachment["filename"]),
    mimeType: String(attachment["mime_type"]),
    byteSize: Number(attachment["byte_size"]),
    sha256: String(attachment["sha256"]),
    kind: String(attachment["kind"]),
  };
}

/** Send a file to chipsd. Resolves with what it stored; a refusal throws with the server's words. */
export async function upload(call: Call, input: UploadInput): Promise<Uploaded> {
  const size = input.bytes.byteLength;
  const pieces = size > PIECE_BYTES;
  const slot = await call("POST", "/v1/uploads", {
    filename: input.filename,
    ...(pieces ? { byte_size: size } : {}),
    ...(input.keepMetadata === true ? { keep_metadata: true } : {}),
  });
  const path = `/v1/uploads/${encodeURIComponent(String(slot["attachment_id"]))}`;
  if (!pieces) return uploaded(await call("PUT", path, input.bytes));
  return await inPieces(call, path, input.bytes);
}

/**
 * The bytes a piece at a time. After a piece is lost the server says how far it got, and the next
 * one goes from there; a refusal is the server's word, and final.
 */
async function inPieces(call: Call, path: string, bytes: Uint8Array): Promise<Uploaded> {
  let offset = 0;
  let failures = 0;
  for (;;) {
    try {
      const answer =
        failures > 0 ? await call("GET", path) : await sendPiece(call, path, bytes, offset);
      if (answer["attachment"] !== undefined) return uploaded(answer);
      offset = Number(answer["received_bytes"]);
      failures = 0;
    } catch (error) {
      failures += 1;
      await afterLoss(error, failures);
    }
  }
}

/** A refusal, or the last try, thrown on; a piece lost on the network waits a little longer each time. */
async function afterLoss(error: unknown, failures: number): Promise<void> {
  if (error instanceof RefusedError || failures >= PIECE_TRIES) throw error;
  await new Promise((resolve) => setTimeout(resolve, 250 * failures));
}

function sendPiece(
  call: Call,
  path: string,
  bytes: Uint8Array,
  offset: number,
): Promise<Record<string, unknown>> {
  const piece = bytes.subarray(offset, Math.min(offset + PIECE_BYTES, bytes.byteLength));
  return call("PUT", `${path}?offset=${offset}`, piece);
}

/** An attachment's bytes, fetched with the token its signed URL is bound to. */
export async function download(
  fetcher: typeof fetch,
  token: string,
  attachment: Pick<SignedAttachment, "url"> | string,
): Promise<Uint8Array> {
  const url = typeof attachment === "string" ? attachment : attachment.url;
  const response = await fetcher(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new RefusedError(String(response.status), `fetching ${url} answered ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
