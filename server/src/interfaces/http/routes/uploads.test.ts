/**
 * Attachments over HTTP (decision 10, M1.5): a slot, the bytes, and the bytes back — inline for
 * a photo, as a download for markup — to the people in the space and to a harness with a
 * signed grant, whose fetch is an audit event.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, manualClock, processEnvironment } from "@chipschat/platform";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSweep } from "../../../application/index.js";
import { deviceGrantPath, grantUrl } from "../../../infrastructure/attachments/signing.js";
import { createFfmpegVideos, findMediaTools } from "../../../infrastructure/media/ffmpeg-videos.js";
import { createWhisperSounds, findWhisper } from "../../../infrastructure/media/whisper-sounds.js";
import { makeClip, makeSpeech } from "../../../testing/clips.js";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace({
    config: { limits: { maxAttachmentBytes: 4_000_000 } } as never,
  });
});
afterEach(async () => {
  await ws.close();
});

const BASE = "http://chips.local";

async function photo(width = 1600, height = 1200): Promise<Uint8Array<ArrayBuffer>> {
  const data = await sharp({ create: { width, height, channels: 3, background: "#c87828" } })
    .jpeg({ quality: 80 })
    .withMetadata({ orientation: 1 })
    .withExifMerge({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } })
    .toBuffer();
  return new Uint8Array(data);
}

async function uploadAs(
  person: TestWorkspace["arjun"],
  filename: string,
  // Over an `ArrayBuffer` of its own rather than the wider `ArrayBufferLike`: a request body is
  // a view a `SharedArrayBuffer` cannot back, and every caller here already has one.
  bytes: Uint8Array<ArrayBuffer>,
  keepMetadata = false,
): Promise<Record<string, unknown>> {
  const slotBody = JSON.stringify({
    filename,
    byte_size: bytes.byteLength,
    keep_metadata: keepMetadata,
  });
  const slot = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/uploads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...person.sign("POST", "/v1/uploads", slotBody),
      },
      body: slotBody,
    }),
  );
  expect(slot.status).toBe(201);
  const { upload_url: target } = (await slot.json()) as { upload_url: string };
  const put = await ws.gateway.app.fetch(
    new Request(`${BASE}${target}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", ...person.sign("PUT", target, bytes) },
      body: bytes,
    }),
  );
  expect(put.status, await put.clone().text()).toBe(201);
  return ((await put.json()) as { attachment: Record<string, unknown> }).attachment;
}

async function fetchAs(person: TestWorkspace["arjun"], target: string): Promise<Response> {
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${target}`, { headers: person.sign("GET", target, "") }),
  );
  return response;
}

async function scoutTokenId(): Promise<string> {
  const row = await ws.db
    .selectFrom("harness_tokens")
    .select("id")
    .where("harness_id", "=", ws.scout.participantId)
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("uploading", () => {
  it("stores what the bytes turn out to be: a photo, straightened, stripped, with a thumbnail", async () => {
    const attachment = await uploadAs(ws.arjun, "holiday.txt", await photo());
    expect(attachment).toMatchObject({
      filename: "holiday.txt",
      mime_type: "image/jpeg",
      width: 1600,
      height: 1200,
      kind: "image",
      has_thumbnail: true,
    });

    const id = String(attachment["attachment_id"]);
    const file = await fetchAs(ws.arjun, `/v1/attachments/${id}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(file.headers.get("content-disposition")).toBe('inline; filename="holiday.txt"');
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    // The location is gone.
    const meta = await sharp(new Uint8Array(await file.arrayBuffer())).metadata();
    expect(meta.exif).toBeUndefined();

    const thumb = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=thumb`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    const thumbMeta = await sharp(new Uint8Array(await thumb.arrayBuffer())).metadata();
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBe(512);
  });

  it("keeps a photo's metadata when asked", async () => {
    const attachment = await uploadAs(ws.arjun, "IMG_2210.jpg", await photo(), true);
    const file = await fetchAs(ws.arjun, `/v1/attachments/${attachment["attachment_id"]}`);
    const meta = await sharp(new Uint8Array(await file.arrayBuffer())).metadata();
    expect(meta.exif).toBeDefined();
  });

  it("serves an uploaded .html file as a download, never as a page", async () => {
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    const attachment = await uploadAs(ws.arjun, "report.html", html);
    expect(attachment).toMatchObject({
      mime_type: "text/html",
      kind: "file",
      has_thumbnail: false,
    });

    const file = await fetchAs(ws.arjun, `/v1/attachments/${attachment["attachment_id"]}`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/octet-stream");
    expect(file.headers.get("content-disposition")).toBe('attachment; filename="report.html"');
    expect(file.headers.get("content-security-policy")).toContain("sandbox");
    expect(
      await fetchAs(ws.arjun, `/v1/attachments/${attachment["attachment_id"]}?variant=thumb`),
    ).toMatchObject({
      status: 404,
    });
  });

  it.each([
    ["a Mac screen recording's U+202F", "Screen Recording 2026-11-08 at 7.23.58 PM.pdf"],
    ["an emoji", "party \u{1f389}.pdf"],
    ["Japanese", "日本語.pdf"],
  ])("serves a file whose name has %s, bytes intact", async (_what, filename) => {
    const bytes = new TextEncoder().encode("%PDF-1.4 a small file");
    const attachment = await uploadAs(ws.arjun, filename, bytes);
    expect(attachment).toMatchObject({ filename, mime_type: "application/pdf" });
    const target = `/v1/attachments/${attachment["attachment_id"]}`;

    const file = await fetchAs(ws.arjun, target);
    expect(file.status).toBe(200);
    const disposition = file.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposition.split("''")[1] ?? "")).toBe(filename);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);

    const head = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method: "HEAD",
        headers: ws.arjun.sign("HEAD", target, ""),
      }),
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("content-disposition")).toBe(disposition);
  });

  it("serves a download whose name has a character a header cannot carry, and a piece of it", async () => {
    const html = new TextEncoder().encode("<!doctype html><p>日本</p>");
    const attachment = await uploadAs(ws.arjun, "報告 .html", html);
    const target = `/v1/attachments/${attachment["attachment_id"]}`;

    const file = await fetchAs(ws.arjun, target);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/octet-stream");
    expect(file.headers.get("content-disposition")).toBe(
      `attachment; filename="__ .html"; filename*=UTF-8''%E5%A0%B1%E5%91%8A%E2%80%AF.html`,
    );
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(html);

    const part = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        headers: { ...ws.arjun.sign("GET", target, ""), range: "bytes=0-4" },
      }),
    );
    expect(part.status).toBe(206);
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(html.subarray(0, 5));
  });

  it("serves a file whose name the 255-character cut left half an emoji on", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 a small file");
    const attachment = await uploadAs(ws.arjun, `${"a".repeat(254)}\u{1f389}.pdf`, bytes);
    const file = await fetchAs(ws.arjun, `/v1/attachments/${attachment["attachment_id"]}`);
    expect(file.status).toBe(200);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("binds the signature to the bytes: other bytes under the same signature are refused", async () => {
    const slotBody = JSON.stringify({ filename: "a.bin" });
    const slot = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/uploads", slotBody),
        },
        body: slotBody,
      }),
    );
    const { upload_url: target } = (await slot.json()) as { upload_url: string };
    const put = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method: "PUT",
        headers: ws.arjun.sign("PUT", target, new Uint8Array([1, 2, 3])),
        body: new Uint8Array([9, 9, 9]),
      }),
    );
    expect(put.status).toBe(401);
  });

  it("refuses more bytes than the workspace allows, and a slot that is not yours", async () => {
    const slotBody = JSON.stringify({ filename: "big.bin", byte_size: 5_000_000 });
    const tooBig = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/uploads", slotBody),
        },
        body: slotBody,
      }),
    );
    expect(tooBig.status).toBe(422);

    const mine = JSON.stringify({ filename: "mine.txt" });
    const slot = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/uploads", mine),
        },
        body: mine,
      }),
    );
    const { upload_url: target } = (await slot.json()) as { upload_url: string };
    const bytes = new TextEncoder().encode("hello");
    const dana = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method: "PUT",
        headers: ws.dana.sign("PUT", target, bytes),
        body: bytes,
      }),
    );
    expect(dana.status).toBe(403);
  });
});

describe("who may fetch", () => {
  it("lets the members of the space it was sent in read it, and nobody else without a grant", async () => {
    const attachment = await uploadAs(ws.arjun, "PO-4471.txt", new TextEncoder().encode("po"));
    const id = String(attachment["attachment_id"]);

    // Not yet sent anywhere: the uploader may read it, Dana may not.
    expect((await fetchAs(ws.arjun, `/v1/attachments/${id}`)).status).toBe(200);
    expect((await fetchAs(ws.dana, `/v1/attachments/${id}`)).status).toBe(403);

    const posted = await ws.gateway.deps.submitEvent({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "Here's the PO.",
        upload_ids: [id],
        idempotency_key: "po-message",
      },
    });
    expect(posted.ok).toBe(true);
    if (posted.ok) {
      // The door filled the attachment in from the store, as the bytes turned out.
      expect(posted.value.event.payload["attachments"]).toEqual([
        expect.objectContaining({ attachment_id: id, mime_type: "text/plain", byte_size: 2 }),
      ]);
    }
    expect((await fetchAs(ws.dana, `/v1/attachments/${id}`)).status).toBe(200);
  });

  it("never moves an attachment into a room by naming it in a message's own attachments (SEC-5)", async () => {
    // The row an attachment projects to is keyed by its id alone: a message Dana posted in her
    // room with another room's attachment in its `attachments` relabelled that row hers and
    // handed her its bytes. What a message attaches is what its `upload_ids` name, and nothing
    // the sender wrote.
    type Principal = Parameters<typeof ws.gateway.deps.submitEvent>[0]["principal"];
    const personOf = (person: TestWorkspace["arjun"], displayName: string): Principal => ({
      kind: "person",
      participantId: person.participantId,
      workspaceId: ws.workspaceId,
      displayName,
      via: "device_key",
      role: person.participantId === ws.arjun.participantId ? "owner" : "member",
    });
    const arjun = personOf(ws.arjun, "Arjun");
    const dana = personOf(ws.dana, "Dana");

    // Arjun opens a room Dana is not in, and sends a file there.
    const privateRoom = ws.ids.next("space");
    const opened = await ws.gateway.deps.submitEvent({
      principal: arjun,
      event: {
        type: "space.created",
        space_id: privateRoom,
        kind: "group",
        title: "Private",
        idempotency_key: "private-room",
      },
    });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    const attachment = await uploadAs(ws.arjun, "secret.txt", new TextEncoder().encode("secret"));
    const id = String(attachment["attachment_id"]);
    const sent = await ws.gateway.deps.submitEvent({
      principal: arjun,
      event: {
        type: "message.post",
        space_id: privateRoom,
        text: "Keep this here.",
        upload_ids: [id],
        idempotency_key: "private-file",
      },
    });
    expect(sent.ok, JSON.stringify(sent)).toBe(true);
    const wire = sent.ok ? (sent.value.event.payload["attachments"] as unknown[])[0] : undefined;
    expect(wire).toMatchObject({ attachment_id: id });
    expect((await fetchAs(ws.dana, `/v1/attachments/${id}`)).status).toBe(403);

    // Dana posts it in her room, as the stored attachment describes itself.
    const forged = await ws.gateway.deps.submitEvent({
      principal: dana,
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "Mine now.",
        attachments: [wire],
        idempotency_key: "forged-attachment",
      },
    });
    expect(forged.ok, JSON.stringify(forged)).toBe(true);
    if (forged.ok) expect(forged.value.event.payload["attachments"]).toBeUndefined();
    expect(await ws.gateway.deps.readModels.attachmentSpaces(ws.workspaceId, id)).toEqual([
      privateRoom,
    ]);
    expect((await fetchAs(ws.dana, `/v1/attachments/${id}`)).status).toBe(403);
  });

  it("refuses an upload id that is not stored, or not the sender's", async () => {
    const refused = await ws.gateway.deps.submitEvent({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "Here's nothing.",
        upload_ids: ["att_01K4ZQPX00000000000000000X"],
        idempotency_key: "no-file",
      },
    });
    expect(refused).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  it("lets a harness in with a signed grant for its own token, and records the fetch", async () => {
    const attachment = await uploadAs(ws.arjun, "PO-4471.txt", new TextEncoder().encode("po"));
    const id = String(attachment["attachment_id"]);
    const tokenId = await scoutTokenId();
    const secret = ws.gateway.deps.grants.secret;
    const soon = Math.floor(Date.now() / 1000) + 600;

    const good = grantUrl(BASE, { attachmentId: id, tokenId, expiresAt: soon }, secret);
    const fetched = await ws.gateway.app.fetch(new Request(good, { headers: ws.scout.headers }));
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe("po");

    const head = await ws.gateway.deps.store.head(ws.workspaceId);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, head - 1, 10);
    expect(page.events.at(-1)).toMatchObject({
      type: "attachment.fetched",
      actor: { kind: "harness", id: ws.scout.participantId },
      payload: { attachment_id: id, filename: "PO-4471.txt", by: ws.scout.participantId },
    });

    const otherToken = grantUrl(
      BASE,
      { attachmentId: id, tokenId: "tok_someone_else", expiresAt: soon },
      secret,
    );
    expect(
      (await ws.gateway.app.fetch(new Request(otherToken, { headers: ws.scout.headers }))).status,
    ).toBe(403);
    const expired = grantUrl(BASE, { attachmentId: id, tokenId, expiresAt: soon - 1200 }, secret);
    expect(
      (await ws.gateway.app.fetch(new Request(expired, { headers: ws.scout.headers }))).status,
    ).toBe(403);
    // A grant is worth nothing without the token it was minted for.
    expect((await ws.gateway.app.fetch(new Request(good))).status).toBe(401);
  });
});

describe("what the workspace allows (ADR 0047)", () => {
  const MB = 1024 * 1024;

  it("tells a client what the server takes at most", async () => {
    const response = await fetchAs(ws.arjun, "/v1/limits");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      max_attachment_bytes: 4_000_000,
      max_message_bytes: ws.config.limits.maxMessageBytes,
    });
  });

  it("stops an upload at a cap the owner set, with the sentence a phone says first", async () => {
    const asOwner = await ws.gateway.deps.submitEvent({
      event: {
        type: "attachment.limits_set",
        image_bytes: 1 * MB,
        video_bytes: null,
        file_bytes: null,
        idempotency_key: "caps-1",
      },
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
        deviceId: ws.arjun.deviceId,
        role: "owner",
      },
    });
    expect(asOwner.ok, JSON.stringify(asOwner)).toBe(true);

    const slotBody = JSON.stringify({ filename: "holiday.png", byte_size: 2 * MB });
    const refused = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/uploads", slotBody),
        },
        body: slotBody,
      }),
    );
    expect(refused.status).toBe(422);
    const body = (await refused.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Photos here are capped at 1 MB, and this one is 2 MB.");

    // A member sets nothing.
    const asMember = await ws.gateway.deps.submitEvent({
      event: {
        type: "attachment.limits_set",
        image_bytes: null,
        video_bytes: null,
        file_bytes: null,
        idempotency_key: "caps-2",
      },
      principal: {
        kind: "person",
        participantId: ws.dana.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Dana",
        via: "device_key",
        deviceId: ws.dana.deviceId,
        role: "member",
      },
    });
    expect(asMember).toMatchObject({ ok: false, error: { kind: "wrong_role" } });
  });
});

describe("an upload in pieces (ADR 0052)", () => {
  async function slot(filename: string, byteSize: number): Promise<string> {
    const body = JSON.stringify({ filename, byte_size: byteSize });
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/uploads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/uploads", body),
        },
        body,
      }),
    );
    expect(response.status).toBe(201);
    const answer = (await response.json()) as { upload_url: string; pieces: boolean };
    // The slot says it takes pieces, since a server from before ADR 0052 would take the first
    // piece for the whole file.
    expect(answer.pieces).toBe(true);
    return answer.upload_url;
  }

  async function piece(
    target: string,
    offset: number | string,
    bytes: Uint8Array<ArrayBuffer>,
    signedFor = `${target}?offset=${offset}`,
  ): Promise<Response> {
    return ws.gateway.app.fetch(
      new Request(`${BASE}${target}?offset=${offset}`, {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          ...ws.arjun.sign("PUT", signedFor, bytes),
        },
        body: bytes,
      }),
    );
  }

  it("takes a photo in pieces, says how far it got, and makes of the last what a whole upload makes", async () => {
    const bytes = await photo();
    const target = await slot("IMG_2210.jpg", bytes.byteLength);
    const third = Math.floor(bytes.byteLength / 3);

    const first = await piece(target, 0, bytes.slice(0, third));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      attachment_id: target.split("/").at(-1),
      received_bytes: third,
    });
    const second = await piece(target, third, bytes.slice(third, 2 * third));
    expect(second.status).toBe(200);

    const halfway = await fetchAs(ws.arjun, target);
    expect(halfway.status).toBe(200);
    expect(await halfway.json()).toMatchObject({
      received_bytes: 2 * third,
      byte_size: bytes.byteLength,
    });

    const last = await piece(target, 2 * third, bytes.slice(2 * third));
    expect(last.status, await last.clone().text()).toBe(201);
    const { attachment } = (await last.json()) as { attachment: Record<string, unknown> };
    expect(attachment).toMatchObject({
      filename: "IMG_2210.jpg",
      mime_type: "image/jpeg",
      width: 1600,
      height: 1200,
      kind: "image",
      has_thumbnail: true,
    });

    const done = await fetchAs(ws.arjun, target);
    expect(await done.json()).toMatchObject({
      received_bytes: bytes.byteLength,
      attachment: { attachment_id: attachment["attachment_id"] },
    });
    const back = await fetchAs(ws.arjun, `/v1/attachments/${attachment["attachment_id"]}`);
    expect(back.status).toBe(200);
    expect(back.headers.get("content-type")).toBe("image/jpeg");
  });

  it("binds the offset to the signature: a piece signed for one place is refused at another", async () => {
    const target = await slot("notes.txt", 10);
    const bytes = new TextEncoder().encode("hello");
    const moved = await piece(target, 5, bytes, `${target}?offset=0`);
    expect(moved.status).toBe(401);
  });

  it("refuses a piece at the wrong offset, saying how many bytes are in, and tells only the uploader", async () => {
    const target = await slot("notes.txt", 10);
    expect((await piece(target, 0, new TextEncoder().encode("hello"))).status).toBe(200);

    const wrong = await piece(target, 7, new TextEncoder().encode("abc"));
    expect(wrong.status).toBe(422);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toBe(
      "that upload has 5 bytes; send the piece that starts there",
    );
    const notANumber = await piece(target, "five", new TextEncoder().encode("world"));
    expect(notANumber.status).toBe(422);

    const dana = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, { headers: ws.dana.sign("GET", target, "") }),
    );
    expect(dana.status).toBe(403);
  });

  it("leaves a moving upload's pieces alone, and the sweep deletes them once its slot expires", async () => {
    const target = await slot("notes.txt", 10);
    expect((await piece(target, 0, new TextEncoder().encode("hello"))).status).toBe(200);
    const sweepAt = (ms: number) =>
      createSweep({
        store: ws.gateway.deps.store,
        readModels: ws.gateway.deps.readModels,
        clock: manualClock(ms),
        ids: ws.ids,
        uploads: ws.gateway.deps.uploads,
      });

    expect((await sweepAt(Date.now())()).abandoned).toBe(0);
    expect(await (await fetchAs(ws.arjun, target)).json()).toMatchObject({ received_bytes: 5 });
    expect((await sweepAt(Date.now() + 16 * 60_000)()).abandoned).toBe(1);
    expect(await (await fetchAs(ws.arjun, target)).json()).toMatchObject({ received_bytes: 0 });
  });
});

describe("a video (ADR 0053)", () => {
  /** A real JPEG, since the thumbnailer the gateway uses is the real `sharp`. */
  const frame = async () =>
    new Uint8Array(
      await sharp({ create: { width: 320, height: 568, channels: 3, background: "#2878c8" } })
        .jpeg()
        .toBuffer(),
    );
  /** MP4-shaped bytes: what the sniff calls a video. */
  const clip = () => {
    const bytes = new Uint8Array(4096).fill(3);
    bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    return bytes;
  };
  const COPY = new TextEncoder().encode("an mp4 that plays everywhere");
  /** The copy is made only once a test lets it be: keeping a video starts the worker at once. */
  let release: () => void = () => undefined;

  beforeEach(async () => {
    const poster = await frame();
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await ws.close();
    ws = await createTestWorkspace({
      config: { limits: { maxAttachmentBytes: 4_000_000 } } as never,
      videos: {
        measure: async () => ({
          durationMs: 42_500,
          width: 1080,
          height: 1920,
          playable: "transcode",
          poster,
        }),
        // A clip with no metadata in it to drop: the one from the real iPhone is below.
        strip: async (bytes) => bytes,
        playable: async () => {
          await released;
          return COPY;
        },
      },
    });
  });

  const posting = (id: string, key: string) =>
    ws.gateway.deps.submitEvent({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "From the site.",
        upload_ids: [id],
        idempotency_key: key,
      },
    });

  it("is measured as it arrives: the message carries its length and size, and its poster is the thumbnail", async () => {
    const attachment = await uploadAs(ws.arjun, "IMG_4410.MOV", clip());
    expect(attachment).toMatchObject({
      mime_type: "video/mp4",
      duration_ms: 42_500,
      width: 1080,
      height: 1920,
      kind: "video",
      has_thumbnail: true,
    });
    const id = String(attachment["attachment_id"]);
    const poster = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=thumb`);
    expect(poster.status).toBe(200);
    expect(poster.headers.get("content-type")).toBe("image/webp");

    const posted = await posting(id, "video-message");
    expect(posted.ok, JSON.stringify(posted)).toBe(true);
    if (posted.ok) {
      expect(posted.value.event.payload["attachments"]).toEqual([
        expect.objectContaining({ attachment_id: id, duration_ms: 42_500, width: 1080 }),
      ]);
    }
  });

  it("plays the original until its copy is made, then the copy, and never replaces the original", async () => {
    const bytes = clip();
    const attachment = await uploadAs(ws.arjun, "IMG_4410.MOV", bytes);
    const id = String(attachment["attachment_id"]);

    const early = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=play`);
    expect(early.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await early.arrayBuffer())).toEqual(bytes);
    // The original, and the header says why: its copy is still being made.
    expect(early.headers.get("x-chips-playable")).toBe("pending");
    // And not to be kept: asked again once the copy is made, a cache must not answer instead.
    expect(early.headers.get("cache-control")).toBe("no-store");

    release();
    // The worker keeping the video started is the one this joins: one copy made.
    expect(await ws.gateway.deps.playables?.drain()).toBe(1);
    const played = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=play`);
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(COPY);
    expect(played.headers.get("content-disposition")).toContain("IMG_4410.mp4");
    expect(played.headers.get("x-chips-playable")).toBe("done");
    expect(played.headers.get("cache-control")).toBe("private, max-age=600");

    const original = await fetchAs(ws.arjun, `/v1/attachments/${id}`);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes);
    // Only what to play says where the copy has got to.
    expect(original.headers.get("x-chips-playable")).toBeNull();
    // Asked again, there is nothing left to make.
    expect(await ws.gateway.deps.playables?.drain()).toBe(0);
  });
});

const tools = findMediaTools({ path: processEnvironment()["PATH"] });

describe.skipIf(tools === undefined)(
  "a video from an iPhone, through the real ffmpeg (ADR 0053)",
  () => {
    let scratch: string;
    const HEVC = [
      ...["-c:v", "libx265", "-x265-params", "log-level=error", "-tag:v", "hvc1"],
      ...["-c:a", "aac"],
    ];

    beforeEach(async () => {
      scratch = mkdtempSync(join(tmpdir(), "chips-video-route-"));
      await ws.close();
      ws = await createTestWorkspace({
        config: { limits: { maxAttachmentBytes: 4_000_000 } } as never,
        videos: createFfmpegVideos(tools as NonNullable<typeof tools>, {
          maxOutputBytes: 4_000_000,
        }),
      });
    });
    afterEach(() => {
      rmSync(scratch, { recursive: true, force: true });
    });

    it("measures a sideways HEVC clip, serves its poster, and plays it as H.264 once made", async () => {
      const found = tools as NonNullable<typeof tools>;
      const bytes = makeClip(found.ffmpeg, scratch, "IMG_4410.MOV", {
        seconds: 2,
        encode: HEVC,
        sideways: true,
      });

      const attachment = await uploadAs(ws.arjun, "IMG_4410.MOV", bytes);
      expect(attachment).toMatchObject({
        mime_type: "video/quicktime",
        width: 360,
        height: 640,
        duration_ms: 2000,
        has_thumbnail: true,
      });
      const id = String(attachment["attachment_id"]);
      const poster = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=thumb`);
      const posterMeta = await sharp(new Uint8Array(await poster.arrayBuffer())).metadata();
      // Upright, as the clip is seen.
      expect(posterMeta).toMatchObject({ format: "webp", width: 288, height: 512 });

      // Keeping the video started the worker; this waits for whatever of it is left.
      await ws.gateway.deps.playables?.drain();
      const played = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=play`);
      expect(played.headers.get("content-type")).toBe("video/mp4");
      const copy = join(scratch, "played.mp4");
      writeFileSync(copy, new Uint8Array(await played.arrayBuffer()));
      const probed = execFileSync(found.ffprobe, [
        ...[
          "-v",
          "error",
          "-show_entries",
          "stream=codec_name,width,height",
          "-of",
          "csv=p=0",
          copy,
        ],
      ])
        .toString("utf8")
        .trim()
        .split("\n");
      expect(probed).toEqual(["h264,360,640", "aac"]);
    });

    it("serves the original without where it was taken, still turned, to a person and to a harness", async () => {
      const found = tools as NonNullable<typeof tools>;
      const WHERE = "+51.5007-000.1246+020.000/";
      const bytes = makeClip(found.ffmpeg, scratch, "IMG_4411.MOV", {
        seconds: 1,
        encode: HEVC,
        sideways: true,
        location: WHERE,
      });
      const says = (served: Uint8Array) => Buffer.from(served).includes("51.5007");
      expect(says(bytes)).toBe(true);

      const attachment = await uploadAs(ws.arjun, "IMG_4411.MOV", bytes);
      const id = String(attachment["attachment_id"]);
      const original = new Uint8Array(
        await (await fetchAs(ws.arjun, `/v1/attachments/${id}`)).arrayBuffer(),
      );
      expect(says(original)).toBe(false);
      // The digest a message names is of the bytes served.
      expect(attachment).toMatchObject({
        sha256: createHash("sha256").update(original).digest("hex"),
        byte_size: original.byteLength,
        width: 360,
        height: 640,
      });
      const path = join(scratch, "served.mov");
      writeFileSync(path, original);
      const probed = execFileSync(found.ffprobe, [
        ...["-v", "error", "-select_streams", "v:0", "-show_entries", "stream_side_data=rotation"],
        ...["-of", "csv=p=0", path],
      ]);
      expect(probed.toString("utf8").trim()).toBe("90");

      const grant = grantUrl(
        BASE,
        {
          attachmentId: id,
          tokenId: await scoutTokenId(),
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        },
        ws.gateway.deps.grants.secret,
      );
      const fetched = await ws.gateway.app.fetch(new Request(grant, { headers: ws.scout.headers }));
      expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(original);

      // Kept by its uploader, it is served as it was sent.
      const kept = await uploadAs(ws.arjun, "IMG_4412.MOV", bytes, true);
      const served = await fetchAs(ws.arjun, `/v1/attachments/${kept["attachment_id"]}`);
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
    });
  },
);

describe("a voice note (ADR 0054)", () => {
  /** M4A-shaped bytes: what a phone's recorder makes, and what the sniff calls sound. */
  const memo = () => {
    const bytes = new Uint8Array(2048).fill(5);
    bytes.set([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
    return bytes;
  };

  beforeEach(async () => {
    await ws.close();
    ws = await createTestWorkspace({
      config: { limits: { maxAttachmentBytes: 4_000_000 } } as never,
      sounds: {
        hear: async () => ({ durationMs: 8400, transcript: "Send Priya the receipt." }),
      },
    });
  });

  it("is heard before the upload answers, so the message that attaches it carries its words, and is found by them", async () => {
    const bytes = memo();
    const attachment = await uploadAs(ws.arjun, "voice-note.m4a", bytes);
    expect(attachment).toMatchObject({
      mime_type: "audio/mp4",
      duration_ms: 8400,
      transcript: "Send Priya the receipt.",
      kind: "audio",
      has_thumbnail: false,
    });
    const id = String(attachment["attachment_id"]);

    // Played in place, as the recorder made it.
    const played = await fetchAs(ws.arjun, `/v1/attachments/${id}`);
    expect(played.headers.get("content-type")).toBe("audio/mp4");
    expect(played.headers.get("content-disposition")).toContain("inline");
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(bytes);

    const posted = await ws.gateway.deps.submitEvent({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "",
        upload_ids: [id],
        idempotency_key: "voice-message",
      },
    });
    expect(posted.ok, JSON.stringify(posted)).toBe(true);
    if (posted.ok) {
      expect(posted.value.event.payload["attachments"]).toEqual([
        expect.objectContaining({
          attachment_id: id,
          duration_ms: 8400,
          transcript: "Send Priya the receipt.",
        }),
      ]);
    }
    // And a search finds the note by what was said in it.
    const found = await ws.gateway.deps.readModels.search(ws.workspaceId, [ws.spaceId], {
      text: "priya receipt",
      limit: 25,
    });
    expect(found.hits).toMatchObject([{ kind: "message", snippet_from: "transcript" }]);
  });
});

const whisper = findWhisper({
  modelPath: processEnvironment()["CHIPS_WHISPER_MODEL"],
  modelsDirectory: fileURLToPath(new URL("../../../../../.chips/models", import.meta.url)),
  path: processEnvironment()["PATH"],
});

describe.skipIf(tools === undefined || whisper === undefined)(
  "a voice note, through the real ffmpeg and whisper (ADR 0054)",
  () => {
    it("writes down what was said before the upload answers", async () => {
      const found = tools as NonNullable<typeof tools>;
      const scratch = mkdtempSync(join(tmpdir(), "chips-voice-route-"));
      try {
        await ws.close();
        ws = await createTestWorkspace({
          config: { limits: { maxAttachmentBytes: 4_000_000 } } as never,
          sounds: createWhisperSounds(found, { whisper }),
        });
        const speech = makeSpeech(
          found.ffmpeg,
          scratch,
          "voice-note.m4a",
          "Scout, add the hardware store receipt to the March expenses.",
          ["-c:a", "aac", "-f", "ipod"],
        );
        if (speech === undefined) return;
        const attachment = await uploadAs(ws.arjun, "voice-note.m4a", speech);
        expect(attachment).toMatchObject({ mime_type: "audio/mp4", kind: "audio" });
        // Machine-heard: the Mac's voice has been written down as "hardware stall", so the test
        // holds whisper to the words that carry the errand, not to every one of them.
        expect(String(attachment["transcript"])).toMatch(/receipt/i);
        expect(String(attachment["transcript"])).toMatch(/March expenses/i);
        expect(Number(attachment["duration_ms"])).toBeGreaterThan(2000);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }, 60_000);
  },
);

describe("byte ranges (ADR 0058)", () => {
  /** Ten thousand bytes no sniff calls anything, so each byte says where it is. */
  const BYTES = new Uint8Array(10_000).map((_, i) => (i * 7) % 251);

  async function stored(): Promise<string> {
    return String((await uploadAs(ws.arjun, "run.bin", BYTES))["attachment_id"]);
  }

  async function ranged(target: string, range: string, method = "GET"): Promise<Response> {
    return ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method,
        headers: { range, ...ws.arjun.sign(method, target, "") },
      }),
    );
  }

  it("serves the whole file saying it takes ranges, and a first, a middle and an open-ended run", async () => {
    const target = `/v1/attachments/${await stored()}`;
    const whole = await fetchAs(ws.arjun, target);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(whole.headers.get("content-length")).toBe("10000");
    expect(whole.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(BYTES);

    for (const [range, start, end] of [
      ["bytes=0-499", 0, 499],
      ["bytes=5000-5999", 5000, 5999],
      ["bytes=9500-", 9500, 9999],
      ["bytes=-100", 9900, 9999],
      ["bytes=0-1", 0, 1],
    ] as const) {
      const part = await ranged(target, range);
      expect(part.status, range).toBe(206);
      expect(part.headers.get("content-range"), range).toBe(`bytes ${start}-${end}/10000`);
      expect(part.headers.get("content-length"), range).toBe(String(end - start + 1));
      expect(part.headers.get("accept-ranges")).toBe("bytes");
      expect(new Uint8Array(await part.arrayBuffer()), range).toEqual(BYTES.slice(start, end + 1));
    }
  });

  it("answers 416 for a run past the end, saying how long the file is", async () => {
    const target = `/v1/attachments/${await stored()}`;
    const past = await ranged(target, "bytes=10000-");
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe("bytes */10000");
    expect(((await past.json()) as { error: { message: string } }).error.message).toBe(
      "That range starts past the end of the file.",
    );
    expect((await ranged(target, "bytes=20000-30000")).status).toBe(416);
  });

  it("serves the whole file for a range it does not read, and for an If-Range naming other bytes", async () => {
    const target = `/v1/attachments/${await stored()}`;
    expect((await ranged(target, "bytes=0-1,5-6")).status).toBe(200);
    expect((await ranged(target, "lines=1-2")).status).toBe(200);
    const stale = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        headers: { range: "bytes=0-9", "if-range": '"stale"', ...ws.arjun.sign("GET", target, "") },
      }),
    );
    expect(stale.status).toBe(200);
    const tag = (await fetchAs(ws.arjun, target)).headers.get("etag") ?? "";
    const fresh = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        headers: { range: "bytes=0-9", "if-range": tag, ...ws.arjun.sign("GET", target, "") },
      }),
    );
    expect(fresh.status).toBe(206);
  });

  it("answers a HEAD with the length and no body", async () => {
    const target = `/v1/attachments/${await stored()}`;
    const head = await ranged(target, "bytes=100-199", "HEAD");
    expect(head.status).toBe(206);
    expect(head.headers.get("content-length")).toBe("100");
    expect(await head.text()).toBe("");
  });
});

describe("a photo's copy for a viewer (ADR 0058)", () => {
  async function uploadRow(id: string) {
    return ws.db.selectFrom("uploads").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  }

  it("is made at upload, no longer than 2,048 pixels, and says it is the copy", async () => {
    const attachment = await uploadAs(ws.arjun, "wide.jpg", await photo(3000, 2000));
    const id = String(attachment["attachment_id"]);
    expect(await uploadRow(id)).toMatchObject({ view_mime_type: "image/webp" });
    const view = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=view`);
    expect(view.status).toBe(200);
    expect(view.headers.get("content-type")).toBe("image/webp");
    expect(view.headers.get("x-chips-view")).toBe("copy");
    const meta = await sharp(new Uint8Array(await view.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([2048, 1365]);
  });

  it("is made for a photo kept before there were copies at its first ask, and recorded once", async () => {
    const attachment = await uploadAs(ws.arjun, "older.jpg", await photo(2400, 1800));
    const id = String(attachment["attachment_id"]);
    await ws.db
      .updateTable("uploads")
      .set({ view_sha256: null, view_mime_type: null })
      .where("id", "=", id)
      .execute();

    const first = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=view`);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-chips-view")).toBe("copy");
    const recorded = await uploadRow(id);
    expect(recorded.view_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.headers.get("etag")).toBe(`"${recorded.view_sha256}"`);

    const again = await fetchAs(ws.arjun, `/v1/attachments/${id}?variant=view`);
    expect(again.headers.get("etag")).toBe(first.headers.get("etag"));
    expect((await uploadRow(id)).view_sha256).toBe(recorded.view_sha256);
  });

  it("is the photo itself where there is no copy to have, and nothing for a file", async () => {
    const gif = new Uint8Array(
      await sharp({ create: { width: 40, height: 30, channels: 3, background: "#123456" } })
        .gif()
        .toBuffer(),
    );
    const moving = await uploadAs(ws.arjun, "moving.gif", gif);
    const view = await fetchAs(ws.arjun, `/v1/attachments/${moving["attachment_id"]}?variant=view`);
    expect(view.status).toBe(200);
    expect(view.headers.get("content-type")).toBe("image/gif");
    expect(view.headers.get("x-chips-view")).toBe("original");

    const text = await uploadAs(ws.arjun, "notes.txt", new TextEncoder().encode("notes"));
    expect(
      (await fetchAs(ws.arjun, `/v1/attachments/${text["attachment_id"]}?variant=view`)).status,
    ).toBe(404);
  });
});

describe("a grant a device may hand a player (ADR 0058)", () => {
  interface Granted {
    readonly url: string;
    readonly expires_at: string;
    readonly variant: string;
    readonly playable?: string;
  }

  async function grant(
    person: TestWorkspace["arjun"],
    id: string,
    variant?: string,
  ): Promise<Response> {
    const target = `/v1/attachments/${id}/grant`;
    const body = JSON.stringify(variant === undefined ? {} : { variant });
    return ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...person.sign("POST", target, body) },
        body,
      }),
    );
  }

  async function granted(id: string, variant?: string): Promise<Granted> {
    const answer = await grant(ws.arjun, id, variant);
    expect(answer.status, await answer.clone().text()).toBe(200);
    return (await answer.json()) as Granted;
  }

  /** The grant's URL, fetched with nothing else: what a player does. */
  const play = (url: string, headers: Record<string, string> = {}) =>
    ws.gateway.app.fetch(new Request(`${BASE}${url}`, { headers }));

  const now = () => Math.floor(Date.now() / 1000);

  async function sentInTheSpace(filename: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const id = String((await uploadAs(ws.arjun, filename, bytes))["attachment_id"]);
    const posted = await ws.gateway.deps.submitEvent({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text: "Here.",
        upload_ids: [id],
        idempotency_key: `sent-${id}`,
      },
    });
    expect(posted.ok).toBe(true);
    return id;
  }

  it("is admitted as its device with no other credential, for a range too, kept no longer than it holds", async () => {
    const bytes = new Uint8Array(5000).map((_, i) => i % 199);
    const id = String((await uploadAs(ws.arjun, "clip.bin", bytes))["attachment_id"]);
    const answer = await granted(id);
    expect(answer.variant).toBe("file");
    expect(answer.url).toMatch(
      new RegExp(`^/v1/attachments/${id}\\?dev=${ws.arjun.deviceId}&exp=\\d+&sig=[a-f0-9]{64}$`),
    );
    const expiresIn = Date.parse(answer.expires_at) / 1000 - now();
    expect(expiresIn).toBeGreaterThan(590);
    expect(expiresIn).toBeLessThanOrEqual(600);

    const whole = await play(answer.url);
    expect(whole.status).toBe(200);
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(bytes);
    const cached = Number(/max-age=(\d+)/.exec(whole.headers.get("cache-control") ?? "")?.[1]);
    expect(whole.headers.get("cache-control")).toMatch(/^private, max-age=\d+$/);
    expect(cached).toBeLessThanOrEqual(600);
    expect(cached).toBeGreaterThan(590);

    const part = await play(answer.url, { range: "bytes=1000-1999" });
    expect(part.status).toBe(206);
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(1000, 2000));
    expect((await play(answer.url, { range: "bytes=6000-" })).status).toBe(416);
  });

  it("is refused for another device, after its expiry, and for another variant", async () => {
    const id = await sentInTheSpace("wide.jpg", await photo(3000, 2000));
    const secret = ws.gateway.deps.grants.secret;
    const thumb = await granted(id, "thumb");
    expect(thumb.variant).toBe("thumb");
    expect((await play(thumb.url)).status).toBe(200);

    // Another device named in the URL: the signature is not its.
    const otherDevice = thumb.url.replace(ws.arjun.deviceId, ws.dana.deviceId);
    const forged = await play(otherDevice);
    expect(forged.status).toBe(403);
    expect(((await forged.json()) as { error: { message: string } }).error.message).toBe(
      "That link is not good here: bad signature.",
    );
    // Another device signing its own request with Arjun's grant: it is not the grant's device.
    const dana = await ws.gateway.app.fetch(
      new Request(`${BASE}${thumb.url}`, { headers: ws.dana.sign("GET", thumb.url, "") }),
    );
    expect(dana.status).toBe(403);
    expect(((await dana.json()) as { error: { message: string } }).error.message).toBe(
      "That link is not good here: wrong device.",
    );
    // Arjun's own signed request with his grant is his.
    const own = await ws.gateway.app.fetch(
      new Request(`${BASE}${thumb.url}`, { headers: ws.arjun.sign("GET", thumb.url, "") }),
    );
    expect(own.status).toBe(200);

    // After its expiry.
    const expired = deviceGrantPath(
      { attachmentId: id, variant: "thumb", deviceId: ws.arjun.deviceId, expiresAt: now() - 1 },
      secret,
    );
    const late = await play(expired);
    expect(late.status).toBe(403);
    expect(((await late.json()) as { error: { message: string } }).error.message).toBe(
      "That link is not good here: expired.",
    );

    // For another variant: the thumbnail's grant asked for the file, or for the view copy.
    expect((await play(thumb.url.replace("variant=thumb&", ""))).status).toBe(403);
    expect((await play(thumb.url.replace("variant=thumb", "variant=view"))).status).toBe(403);
    // For another attachment.
    const other = await sentInTheSpace("other.jpg", await photo(400, 300));
    expect((await play(thumb.url.replace(id, other))).status).toBe(403);
  });

  it("admits nobody once its device is withdrawn, or its person has left the space", async () => {
    const id = await sentInTheSpace("wide.jpg", await photo(800, 600));
    const dana = await grant(ws.dana, id, "view");
    expect(dana.status).toBe(200);
    const { url } = (await dana.json()) as Granted;
    expect((await play(url)).status).toBe(200);

    await ws.db
      .deleteFrom("memberships")
      .where("space_id", "=", ws.spaceId)
      .where("participant_id", "=", ws.dana.participantId)
      .execute();
    expect((await play(url)).status).toBe(403);

    const own = await granted(id, "view");
    expect((await play(own.url)).status).toBe(200);
    await ws.db
      .updateTable("devices")
      .set({ revoked_at: new Date().toISOString() })
      .where("id", "=", ws.arjun.deviceId)
      .execute();
    expect((await play(own.url)).status).toBe(401);
  });

  it("is refused to a person who may not read the file, to a harness, and for a variant it does not know", async () => {
    const id = String(
      (await uploadAs(ws.arjun, "mine.txt", new TextEncoder().encode("mine")))["attachment_id"],
    );
    expect((await grant(ws.dana, id)).status).toBe(403);
    expect((await grant(ws.arjun, id, "poster")).status).toBe(422);
    expect((await grant(ws.arjun, id, "thumb")).status).toBe(404);
    expect((await grant(ws.arjun, "att_01K4ZQPX00000000000000000Z")).status).toBe(404);

    const target = `/v1/attachments/${id}/grant`;
    const harness = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: "{}",
      }),
    );
    expect(harness.status).toBe(403);
    // A grant is only ever a read of an attachment's bytes.
    const own = await granted(id);
    const query = own.url.slice(own.url.indexOf("?"));
    expect((await play(`/v1/uploads/${id}${query}`)).status).toBe(401);
    expect(
      (await ws.gateway.app.fetch(new Request(`${BASE}${own.url}`, { method: "DELETE" }))).status,
    ).toBe(401);
  });

  it("names the file while a video's copy is being made, and holds for its length and ten minutes, an hour at most", async () => {
    const bytes = new Uint8Array(4000).map((_, i) => i % 13);
    const id = String((await uploadAs(ws.arjun, "clip.bin", bytes))["attachment_id"]);
    const row = await ws.db
      .selectFrom("uploads")
      .select("sha256")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    const asVideo = (set: Record<string, unknown>) =>
      ws.db
        .updateTable("uploads")
        .set({ mime_type: "video/mp4", duration_ms: 90_000, ...set })
        .where("id", "=", id)
        .execute();
    const heldFor = (answer: Granted) => Math.round(Date.parse(answer.expires_at) / 1000 - now());

    await asVideo({ playable_state: "pending", playable_how: "transcode" });
    const pending = await granted(id, "play");
    expect(pending).toMatchObject({ variant: "file", playable: "pending" });
    expect(heldFor(pending)).toBeGreaterThan(685);
    expect(heldFor(pending)).toBeLessThanOrEqual(690);
    const original = await play(pending.url);
    expect(original.status).toBe(200);
    // Named the file, so its answer may be kept while the grant holds, and is not the pending play's.
    expect(original.headers.get("x-chips-playable")).toBeNull();

    await asVideo({
      playable_state: "done",
      playable_sha256: row.sha256,
      playable_mime_type: "video/mp4",
    });
    const done = await granted(id, "play");
    expect(done).toMatchObject({ variant: "play", playable: "done" });
    expect(done.url).toContain("variant=play&");
    expect((await play(done.url, { range: "bytes=0-1" })).status).toBe(206);
    // The grant issued while the copy was being made still names the file, as it did.
    expect((await play(pending.url)).status).toBe(200);

    await asVideo({ duration_ms: 2 * 60 * 60 * 1000 });
    expect(heldFor(await granted(id, "play"))).toBeLessThanOrEqual(3600);
    expect(heldFor(await granted(id, "play"))).toBeGreaterThan(3590);
    await asVideo({ duration_ms: null });
    expect(heldFor(await granted(id, "file"))).toBeGreaterThan(3590);
  });

  it("never appears in a log line, issued, refused or failed", async () => {
    const lines: string[] = [];
    const logged = await createTestWorkspace({
      logger: createLogger({
        level: "debug",
        destination: { write: (line: string) => void lines.push(line) },
      }),
    });
    try {
      const target = `/v1/uploads`;
      const slotBody = JSON.stringify({ filename: "a.bin" });
      const slot = await logged.gateway.app.fetch(
        new Request(`${BASE}${target}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...logged.arjun.sign("POST", target, slotBody),
          },
          body: slotBody,
        }),
      );
      const { upload_url: put, attachment_id: id } = (await slot.json()) as {
        upload_url: string;
        attachment_id: string;
      };
      const bytes = new Uint8Array([1, 2, 3, 4]);
      await logged.gateway.app.fetch(
        new Request(`${BASE}${put}`, {
          method: "PUT",
          headers: logged.arjun.sign("PUT", put, bytes),
          body: bytes,
        }),
      );
      const grantTarget = `/v1/attachments/${id}/grant`;
      const answer = await logged.gateway.app.fetch(
        new Request(`${BASE}${grantTarget}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...logged.arjun.sign("POST", grantTarget, "{}"),
          },
          body: "{}",
        }),
      );
      const { url } = (await answer.json()) as Granted;
      const sig = new URL(url, BASE).searchParams.get("sig") ?? "";
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
      await logged.gateway.app.fetch(new Request(`${BASE}${url}`));
      await logged.gateway.app.fetch(
        new Request(`${BASE}${url.replace(logged.arjun.deviceId, logged.dana.deviceId)}`),
      );
      await logged.gateway.app.fetch(
        new Request(`${BASE}${url}`, { headers: logged.dana.sign("GET", url, "") }),
      );
      // A failure whose error carries the URL, as an unexpected one might.
      logged.gateway.deps.logger.error(
        { err: new Error(`could not read ${url}`) },
        "request failed",
      );

      expect(lines.some((line) => line.includes("device grant issued"))).toBe(true);
      expect(lines.some((line) => line.includes("device grant refused"))).toBe(true);
      expect(lines.join("\n")).not.toContain(sig);
    } finally {
      await logged.close();
    }
  });
});
