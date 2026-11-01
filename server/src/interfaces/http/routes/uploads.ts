/**
 * Attachments over HTTP (decision 10, M1.5).
 *
 *   POST /v1/uploads              ask for a slot: what the file is called, how big it is, and
 *                                 whether to keep its metadata
 *   PUT  /v1/uploads/:id          the bytes; the answer is what they turned out to be
 *   PUT  /v1/uploads/:id?offset=N a piece of them at byte N; the last piece answers as above,
 *                                 every other one with how many bytes are in (ADR 0052)
 *   GET  /v1/uploads/:id          how far an upload got, for a client going on after a failure
 *   GET  /v1/attachments/:id      the bytes back — inline for a photo or a PDF, a download for
 *                                 everything else — for a member of the space the
 *                                 attachment was sent in, the uploader, or a harness presenting
 *                                 a signed grant for its own token. `?variant=thumb` is the
 *                                 thumbnail, a video's poster included; `?variant=view` is the
 *                                 copy a viewer shows, or a photo itself where there is none,
 *                                 and says which in `x-chips-view` (ADR 0058); `?variant=play` is
 *                                 a video's copy that plays everywhere once it is made, and the
 *                                 original until then (ADR 0053), and says which in
 *                                 `x-chips-playable`. A `Range` is served (ADR 0058). A harness's
 *                                 fetch is an audit event.
 *   POST /v1/attachments/:id/grant a URL a device may hand a player for one variant, admitted as
 *                                 that device with no other credential, for ten minutes, or a
 *                                 video's length and ten more (ADR 0058).
 *   GET  /v1/limits               what this server takes at most: the attachment ceiling a
 *                                 workspace caps under (ADR 0047), and the message size.
 */

import { byteRange, contentRange, type RangeAnswer } from "@chipschat/protocol";
import type { Context, Hono } from "hono";
import type {
  NamedBytes,
  Principal,
  StoredAttachment,
  UploadFailure,
  UploadRow,
} from "../../../application/index.js";
import { kindOf, servingHeaders } from "../../../domain/index.js";
import {
  deviceGrantPath,
  verifyDeviceGrant,
  verifyGrant,
} from "../../../infrastructure/attachments/signing.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { errorBody, HttpError } from "../errors.js";

function refuse(error: UploadFailure): never {
  switch (error.kind) {
    case "too_large":
      throw new HttpError("invalid_event", error.message);
    case "unknown_slot":
      throw new HttpError("not_found", error.message);
    case "not_yours":
      throw new HttpError("forbidden", error.message);
    default:
      throw new HttpError("invalid_event", error.message);
  }
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw === "" ? "{}" : raw);
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError("invalid_event", "The body is not a JSON object.");
  }
}

/**
 * The header a video's `?variant=play` answers with: where its copy that plays everywhere has got
 * to — `pending` while it is being made, `done` once it is what these bytes are, `skipped` when the
 * original already plays everywhere, `failed` when it could not be made. A client says *the copy is
 * being made* from it, which it could not tell from the bytes; a video never measured has none.
 */
const PLAYABLE_HEADER = "x-chips-playable";

/** What a `?variant=view` answer is: the copy made for a viewer, or the photo itself (ADR 0058). */
const VIEW_HEADER = "x-chips-view";

/** How long an answer may be kept, in seconds, when nothing says otherwise. */
const KEPT_SECONDS = 600;

/** The longest a grant holds, whatever it is for: an hour (ADR 0058). */
const LONGEST_GRANT_SECONDS = 60 * 60;

/**
 * What an answer may be kept as. The original, served while its copy is being made, is not the
 * answer for long: a client's HTTP cache that kept it for the ten minutes every other answer may be
 * kept went on handing a phone that could not play the original that original, when it asked again
 * for the copy (the media viewer, Phase 3, on the Android emulator). So it is not kept at all. An
 * answer to a grant, whose URL is a bearer, is kept by the one who asked and never past its expiry.
 */
function cacheControl(named: NamedBytes, grantExpiresIn: number | undefined): string {
  if (named.playable === "pending") return "no-store";
  if (grantExpiresIn !== undefined) return `private, max-age=${Math.max(0, grantExpiresIn)}`;
  return `private, max-age=${KEPT_SECONDS}`;
}

/** What an answer says of the bytes, beyond their type: which a view or a play turned out to be. */
function saidOf(named: NamedBytes, asked: string | undefined): Readonly<Record<string, string>> {
  return {
    ...(asked === "play" && named.playable !== undefined
      ? { [PLAYABLE_HEADER]: named.playable }
      : {}),
    ...(named.view === undefined ? {} : { [VIEW_HEADER]: named.view }),
  };
}

/**
 * The response for an attachment's bytes, with the headers that keep markup from running: the whole
 * file, or the run a `Range` asks for (`206`), or `416` for a run past the end. The bytes are read
 * from the store as they go out. `If-Range` naming other bytes than these gets the whole file.
 */
async function serve(
  c: Context<GatewayEnv>,
  deps: GatewayDeps,
  named: NamedBytes,
  extra: Readonly<Record<string, string>>,
): Promise<Response> {
  const size = await deps.blobs.size(named.sha256);
  if (size === undefined) throw new HttpError("not_found", "The bytes are not in the store.");
  const tag = `"${named.sha256}"`;
  const ifRange = c.req.header("if-range");
  const range: RangeAnswer =
    ifRange === undefined || ifRange === tag
      ? byteRange(c.req.header("range"), size)
      : { kind: "whole" };
  const served = servingHeaders(named.mime, named.name);
  const headers: Record<string, string> = {
    "content-type": served.contentType,
    "content-disposition": served.disposition,
    "accept-ranges": "bytes",
    etag: tag,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    ...extra,
  };
  if (range.kind === "unsatisfiable") {
    return c.json(
      errorBody("invalid_event", "That range starts past the end of the file.", c.get("requestId")),
      416,
      { "accept-ranges": "bytes", "content-range": contentRange(range, size) ?? "" },
    );
  }
  const run = range.kind === "part" ? { start: range.start, end: range.end } : undefined;
  const length = run === undefined ? size : run.end - run.start + 1;
  headers["content-length"] = String(length);
  if (range.kind === "part") headers["content-range"] = contentRange(range, size) ?? "";
  const status = range.kind === "part" ? 206 : 200;
  // A HEAD is answered with the headers alone, and never opens the file.
  if (c.req.method === "HEAD") return new Response(null, { status, headers });
  const body = await deps.blobs.read(named.sha256, run);
  if (body === undefined) throw new HttpError("not_found", "The bytes are not in the store.");
  return new Response(body, { status, headers });
}

export function registerUploadRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/limits", (c) =>
    c.json({
      max_attachment_bytes: deps.config.limits.maxAttachmentBytes,
      max_message_bytes: deps.config.limits.maxMessageBytes,
    }),
  );

  app.post("/v1/uploads", async (c) => {
    const body = parseBody(c.get("rawBody"));
    const filename = typeof body["filename"] === "string" ? body["filename"] : "";
    if (filename.trim() === "") {
      throw new HttpError("invalid_event", "`filename` is what the file is called.");
    }
    const byteSize = body["byte_size"] === undefined ? undefined : Number(body["byte_size"]);
    if (byteSize !== undefined && (!Number.isSafeInteger(byteSize) || byteSize < 0)) {
      throw new HttpError("invalid_event", "`byte_size` is how many bytes you are about to send.");
    }
    const result = await deps.uploads.openSlot({
      principal: c.get("principal"),
      filename,
      byteSize,
      keepMetadata: body["keep_metadata"] === true,
    });
    if (!result.ok) refuse(result.error);
    c.get("logger").info({ attachmentId: result.value.id, byteSize }, "upload slot issued");
    return c.json(
      {
        attachment_id: result.value.id,
        upload_url: `/v1/uploads/${result.value.id}`,
        method: "PUT",
        expires_at: result.value.expiresAt,
        // This server takes `?offset=` (ADR 0052). One from before it would store the first piece
        // as the whole file, so a client sends pieces only to a slot that says so.
        pieces: true,
      },
      201,
    );
  });

  app.get("/v1/uploads/:id", async (c) => {
    const result = await deps.uploads.progress({
      principal: c.get("principal"),
      id: c.req.param("id"),
    });
    if (!result.ok) refuse(result.error);
    const { value } = result;
    return c.json({
      attachment_id: value.id,
      received_bytes: value.received,
      byte_size: value.declared,
      expires_at: value.expiresAt,
      ...(value.attachment === undefined ? {} : { attachment: value.attachment }),
    });
  });

  app.put("/v1/uploads/:id", async (c) => {
    const bytes = c.get("rawBytes");
    if (bytes === undefined || bytes.byteLength === 0) {
      throw new HttpError("invalid_event", "Send the file's bytes as the body.");
    }
    const offset = c.req.query("offset");
    if (offset !== undefined) return putPiece(c, deps, offsetOf(offset), bytes);
    const result = await deps.uploads.store({
      principal: c.get("principal"),
      id: c.req.param("id"),
      bytes,
    });
    if (!result.ok) refuse(result.error);
    const attachment: StoredAttachment = result.value;
    c.get("logger").info(
      {
        attachmentId: attachment.attachment_id,
        mime: attachment.mime_type,
        bytes: attachment.byte_size,
      },
      "upload stored",
    );
    return c.json({ attachment }, 201);
  });

  app.get("/v1/attachments/:id", async (c) => {
    const principal = c.get("principal");
    const upload = await storedUpload(deps, principal, c.req.param("id"));
    await admitReader(c, deps, upload);

    const asked = c.req.query("variant");
    const named = await deps.uploads.bytesOf(upload, asked);
    if (!named.ok) throw new HttpError("not_found", named.message);

    // A harness's read is recorded once, at its first byte, not at every run a player asks for.
    const first = byteRange(c.req.header("range"), Number.POSITIVE_INFINITY);
    const fromStart = first.kind !== "part" || first.start === 0;
    if (principal.kind === "harness" && asked !== "thumb" && fromStart) {
      await recordFetch(deps, principal, upload);
    }
    const expires = principal.via === "device_grant" ? Number(c.req.query("exp")) : undefined;
    const now = Math.floor(deps.clock.nowMs() / 1000);
    return serve(c, deps, named.bytes, {
      ...saidOf(named.bytes, asked),
      "cache-control": cacheControl(named.bytes, expires === undefined ? undefined : expires - now),
    });
  });

  app.post("/v1/attachments/:id/grant", async (c) => {
    const principal = c.get("principal");
    if (principal.kind !== "person" || principal.deviceId === undefined) {
      throw new HttpError(
        "forbidden",
        "A grant is a device's to hand its player; a harness is given its URLs in message.new.",
      );
    }
    const upload = await storedUpload(deps, principal, c.req.param("id"));
    await admitReader(c, deps, upload);
    const asked = parseBody(c.get("rawBody"))["variant"] ?? "file";
    if (asked !== "file" && asked !== "thumb" && asked !== "view" && asked !== "play") {
      throw new HttpError("invalid_event", "`variant` is `file`, `thumb`, `view` or `play`.");
    }
    const named = grantableAs(deps, upload, asked);
    if (!named.ok) throw new HttpError("not_found", named.message);
    const seconds = grantSeconds(deps, upload, named.variant);
    const expiresAt = Math.floor(deps.clock.nowMs() / 1000) + seconds;
    const grant = {
      attachmentId: upload.id,
      variant: named.variant,
      deviceId: principal.deviceId,
      expiresAt,
    };
    c.get("logger").info(
      { attachmentId: upload.id, variant: named.variant, expiresAt },
      "device grant issued",
    );
    return c.json({
      url: deviceGrantPath(grant, deps.grants.secret),
      expires_at: new Date(expiresAt * 1000).toISOString(),
      variant: named.variant,
      ...(asked === "play" && upload.playable_state !== null
        ? { playable: upload.playable_state }
        : {}),
    });
  });
}

/** A stored attachment in the caller's workspace, or not found. */
export async function storedUpload(
  deps: GatewayDeps,
  principal: Principal,
  id: string,
): Promise<UploadRow> {
  const upload = await deps.uploadsRegistry.find(principal.workspaceId, id);
  if (upload === undefined || upload.state !== "stored" || upload.sha256 === null) {
    throw new HttpError("not_found", "No attachment with that id here.");
  }
  return upload;
}

/**
 * The variant a grant names for what was asked: the bytes a request for it would get, as they are
 * now, so the grant's URL names the same bytes for its whole life. A play whose copy is still being
 * made names the file, and a view of a photo with no copy to have names the file too; a view of an
 * older photo names the view, which its first request makes.
 */
function grantableAs(
  deps: GatewayDeps,
  upload: UploadRow,
  asked: "file" | "thumb" | "view" | "play",
):
  | { readonly ok: true; readonly variant: NamedBytes["variant"] }
  | { readonly ok: false; readonly message: string } {
  switch (asked) {
    case "thumb":
      return upload.thumbnail_sha256 === null
        ? { ok: false, message: "That attachment has no thumbnail." }
        : { ok: true, variant: "thumb" };
    case "view":
      if (deps.uploads.willHaveView(upload)) return { ok: true, variant: "view" };
      return kindOf(upload.mime_type ?? "") === "image"
        ? { ok: true, variant: "file" }
        : { ok: false, message: "That attachment has no copy for a viewer." };
    case "play":
      return {
        ok: true,
        variant:
          upload.playable_state === "done" && upload.playable_sha256 !== null ? "play" : "file",
      };
    default:
      return { ok: true, variant: "file" };
  }
}

/**
 * How long a grant holds. A player asks for runs of a video for as long as it plays, so a grant to
 * play one, or to its file, holds for the video's length and ten minutes more, and an hour at most;
 * one of unknown length holds the hour. Anything else holds for as long as a harness's URL does.
 */
function grantSeconds(
  deps: GatewayDeps,
  upload: UploadRow,
  variant: NamedBytes["variant"],
): number {
  const moving =
    kindOf(upload.mime_type ?? "") === "video" && (variant === "file" || variant === "play");
  if (!moving) return deps.grants.ttlSeconds;
  if (upload.duration_ms === null) return LONGEST_GRANT_SECONDS;
  return Math.min(
    LONGEST_GRANT_SECONDS,
    Math.ceil(upload.duration_ms / 1000) + deps.grants.ttlSeconds,
  );
}

/** `?offset=` as a whole number of bytes, or a refusal that says what it should be. */
function offsetOf(raw: string): number {
  const offset = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(offset)) {
    throw new HttpError("invalid_event", "`offset` is the byte this piece starts at.");
  }
  return offset;
}

/**
 * A piece of an upload (ADR 0052). The last one answers `201` with the attachment, as a whole
 * upload does; any other, `200` with how many bytes the server now holds.
 */
async function putPiece(
  c: Context<GatewayEnv>,
  deps: GatewayDeps,
  offset: number,
  bytes: Uint8Array,
): Promise<Response> {
  const id = c.req.param("id") ?? "";
  const result = await deps.uploads.piece({ principal: c.get("principal"), id, offset, bytes });
  if (!result.ok) refuse(result.error);
  const { value } = result;
  if (!("attachment" in value)) {
    return c.json({ attachment_id: id, received_bytes: value.received });
  }
  c.get("logger").info(
    {
      attachmentId: value.attachment.attachment_id,
      mime: value.attachment.mime_type,
      bytes: value.attachment.byte_size,
    },
    "upload stored from pieces",
  );
  return c.json({ attachment: value.attachment }, 201);
}

/**
 * Who may read: a harness presenting a signed grant for its own token; otherwise the uploader,
 * or a member of a space the attachment was sent in — the person a device's grant admits included,
 * asked again on every request, so a person who has left the space reads nothing with a grant they
 * were given before. A device that signs its request and carries a grant must be the grant's own.
 */
async function admitReader(
  c: Context<GatewayEnv>,
  deps: GatewayDeps,
  upload: UploadRow,
): Promise<void> {
  const principal = c.get("principal");
  const sig = c.req.query("sig");
  const dev = c.req.query("dev");
  if (dev !== undefined && principal.via !== "device_grant") {
    heldToDeviceGrant(c, deps, upload, principal, dev);
  } else if (sig !== undefined && dev === undefined) {
    const verdict = verifyGrant({
      grant: {
        attachmentId: upload.id,
        tokenId: c.req.query("tok") ?? "",
        expiresAt: Number(c.req.query("exp")),
      },
      signature: sig,
      secret: deps.grants.secret,
      presentedTokenId: principal.tokenId,
      nowSeconds: Math.floor(deps.clock.nowMs() / 1000),
    });
    if (verdict.ok) return;
    c.get("logger").warn({ attachmentId: upload.id, reason: verdict.reason }, "grant refused");
    throw new HttpError(
      "forbidden",
      `That link is not good here: ${verdict.reason.replace("_", " ")}.`,
    );
  }
  await mayRead(deps, principal, upload);
}

/**
 * The reader is the uploader, or in a space the attachment was sent in; anyone else is refused.
 * The page door asks it again when a ticket is spent (ADR 0201), as a grant is asked on every
 * request.
 */
export async function mayRead(
  deps: GatewayDeps,
  principal: Principal,
  upload: UploadRow,
): Promise<void> {
  if (upload.uploaded_by === principal.participantId) return;
  await memberOfASpace(deps, principal, upload);
}

/** A device grant carried by a request that signed: good only for the device that signed it. */
function heldToDeviceGrant(
  c: Context<GatewayEnv>,
  deps: GatewayDeps,
  upload: UploadRow,
  principal: Principal,
  deviceId: string,
): void {
  const expires = c.req.query("exp") ?? "";
  const verdict = verifyDeviceGrant({
    grant: {
      attachmentId: upload.id,
      variant: c.req.query("variant") ?? "file",
      deviceId,
      expiresAt: /^\d+$/.test(expires) ? Number(expires) : Number.NaN,
    },
    signature: c.req.query("sig") ?? "",
    secret: deps.grants.secret,
    presentedDeviceId: principal.deviceId,
    nowSeconds: Math.floor(deps.clock.nowMs() / 1000),
  });
  if (verdict.ok) return;
  c.get("logger").warn({ attachmentId: upload.id, reason: verdict.reason }, "device grant refused");
  throw new HttpError(
    "forbidden",
    `That link is not good here: ${verdict.reason.replace("_", " ")}.`,
  );
}

/** The reader is in a space the attachment was sent in. */
async function memberOfASpace(
  deps: GatewayDeps,
  principal: Principal,
  upload: UploadRow,
): Promise<void> {
  const spaces = await deps.readModels.attachmentSpaces(principal.workspaceId, upload.id);
  const roles = await Promise.all(
    spaces.map((space) =>
      deps.readModels.memberRole(principal.workspaceId, space, principal.participantId),
    ),
  );
  if (!roles.some((role) => role !== undefined)) {
    throw new HttpError("forbidden", "That attachment was not sent in a space you are in.");
  }
}

/** Every harness fetch is an audit event (blueprint): "Scout read IMG_2210.jpg". */
async function recordFetch(
  deps: GatewayDeps,
  harness: Principal,
  upload: UploadRow,
): Promise<void> {
  const spaces = await deps.readModels.attachmentSpaces(harness.workspaceId, upload.id);
  await deps.store.append({
    v: 1,
    type: "attachment.fetched",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: harness.workspaceId,
    ...(spaces[0] === undefined ? {} : { space_id: spaces[0] }),
    actor: { kind: "harness", id: harness.participantId },
    idempotency_key: deps.ids.next("event"),
    attachment_id: upload.id,
    filename: upload.filename,
    by: harness.participantId,
  });
}
