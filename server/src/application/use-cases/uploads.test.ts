/**
 * The upload use case with fake ports: a slot, then bytes, and what comes back is what the
 * bytes were. The real disk and the real `sharp` have tests of their own.
 */

import { createHash } from "node:crypto";
import { manualClock } from "@chipschat/platform";
import { type AttachmentCaps, createIdGenerator, NO_CAPS } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type {
  BlobStore,
  Images,
  Sounds,
  UploadPieces,
  UploadRow,
  UploadsRegistry,
  Videos,
} from "../ports/attachments.js";
import type { Principal } from "../ports/identity.js";
import { attachmentOf, createUploads } from "./uploads.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ARJUN: Principal = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000003",
  workspaceId: WS,
  displayName: "Arjun",
  via: "device_key",
};
const DANA: Principal = {
  ...ARJUN,
  participantId: "usr_01K4ZQPX000000000000000009",
  displayName: "Dana",
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

function harness(
  options: {
    readonly maxBytes?: number;
    readonly caps?: AttachmentCaps;
    readonly videos?: Videos;
    readonly sounds?: Sounds;
  } = {},
) {
  const rows = new Map<string, UploadRow>();
  const blobs = new Map<string, Uint8Array>();
  const viewsRecorded = { count: 0 };
  const shrinks: number[] = [];
  const registry: UploadsRegistry = {
    async open(slot) {
      rows.set(slot.id, {
        ...slot,
        state: "slot",
        mime_type: null,
        byte_size: null,
        sha256: null,
        width: null,
        height: null,
        duration_ms: null,
        thumbnail_sha256: null,
        thumbnail_mime_type: null,
        stored_at: null,
        playable_state: null,
        playable_how: null,
        playable_sha256: null,
        playable_mime_type: null,
        playable_note: null,
        transcript: null,
        view_sha256: null,
        view_mime_type: null,
      });
    },
    async find(_workspaceId, id) {
      return rows.get(id);
    },
    async viewMade(_workspaceId, id, view) {
      const row = rows.get(id);
      if (row === undefined || row.view_sha256 !== null) return false;
      rows.set(id, { ...row, view_sha256: view.sha256, view_mime_type: view.mimeType });
      viewsRecorded.count += 1;
      return true;
    },
    async stored(_workspaceId, id, facts) {
      const row = rows.get(id);
      if (row !== undefined) rows.set(id, { ...row, ...facts, state: "stored" });
    },
    async extend(_workspaceId, id, expiresAt) {
      const row = rows.get(id);
      if (row !== undefined) rows.set(id, { ...row, expires_at: expiresAt });
    },
    async nextPlayable() {
      return [...rows.values()].find((row) => row.playable_state === "pending");
    },
    async playableMade() {},
    async openAmong(ids, now) {
      return ids.filter((id) => {
        const row = rows.get(id);
        return row !== undefined && row.state === "slot" && row.expires_at > now;
      });
    },
  };
  const waiting = new Map<string, Uint8Array>();
  const pieces: UploadPieces = {
    async size(id) {
      return waiting.get(id)?.byteLength ?? 0;
    },
    async append(id, bytes) {
      waiting.set(id, new Uint8Array([...(waiting.get(id) ?? []), ...bytes]));
    },
    async read(id) {
      return waiting.get(id) ?? new Uint8Array(0);
    },
    async discard(id) {
      waiting.delete(id);
    },
    async waiting() {
      return [...waiting.keys()];
    },
  };
  const store: BlobStore = {
    async put(sha256, bytes) {
      blobs.set(sha256, bytes);
    },
    async remove(sha256) {
      blobs.delete(sha256);
    },
    async get(sha256) {
      return blobs.get(sha256);
    },
    async size(sha256) {
      return blobs.get(sha256)?.byteLength;
    },
    async read(sha256, range) {
      const bytes = blobs.get(sha256);
      if (bytes === undefined) return undefined;
      const run = range === undefined ? bytes : bytes.slice(range.start, range.end + 1);
      return new Response(run as Uint8Array<ArrayBuffer>).body ?? undefined;
    },
  };
  /**
   * Treats any PNG-shaped bytes as a 1600×1200 photo; a thumbnail is the bytes with a byte on, 1 at
   * the thumbnail's edge and 2 at a viewer's.
   */
  const images: Images = {
    async inspect(bytes) {
      return bytes[0] === 0x89 ? { width: 1600, height: 1200 } : undefined;
    },
    async prepare(bytes) {
      return {
        bytes: new Uint8Array([...bytes, 0xee]),
        mimeType: "image/png",
        width: 1200,
        height: 1600,
      };
    },
    async thumbnail(bytes, maxEdge) {
      shrinks.push(maxEdge);
      if (bytes[0] === 0x47) throw new Error("not a photo sharp reads");
      return {
        bytes: new Uint8Array([...bytes, maxEdge === 512 ? 0x01 : 0x02]),
        mimeType: "image/webp",
        width: 512,
        height: 384,
      };
    },
  };
  const clock = manualClock(1_788_336_000_000);
  const queued = { count: 0 };
  const metadataKept: [string, string][] = [];
  const ids = createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(2) });
  const uploads = createUploads({
    registry,
    blobs: store,
    pieces,
    images,
    clock,
    ids,
    limits: {
      maxBytes: options.maxBytes ?? 1_000_000,
      slotTtlSeconds: 900,
      thumbnailEdge: 512,
      viewEdge: 2048,
    },
    caps: async () => options.caps ?? NO_CAPS,
    videos: options.videos,
    onPlayableQueued: () => {
      queued.count += 1;
    },
    onMetadataKept: (id, note) => metadataKept.push([id, note]),
    sounds: options.sounds,
  });
  return { uploads, rows, blobs, clock, waiting, queued, metadataKept, viewsRecorded, shrinks };
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("an upload", () => {
  it("opens a slot, then stores what the bytes turn out to be, by their digest", async () => {
    const h = harness();
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename: "IMG_2210.jpg" });
    expect(slot.ok).toBe(true);
    if (!slot.ok) return;
    expect(slot.value.id).toMatch(/^att_/);
    expect(slot.value.expiresAt).toBe("2026-09-02T08:15:00.000Z");

    const stored = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: PNG });
    expect(stored.ok, JSON.stringify(stored)).toBe(true);
    if (!stored.ok) return;
    // A PNG, whatever the name said; straightened and stripped, so the digest is of what is kept.
    const kept = new Uint8Array([...PNG, 0xee]);
    expect(stored.value).toMatchObject({
      attachment_id: slot.value.id,
      filename: "IMG_2210.jpg",
      mime_type: "image/png",
      byte_size: kept.byteLength,
      sha256: sha(kept),
      width: 1200,
      height: 1600,
      kind: "image",
      has_thumbnail: true,
    });
    expect(h.blobs.get(sha(kept))).toEqual(kept);
    expect(h.rows.get(slot.value.id)?.thumbnail_mime_type).toBe("image/webp");
  });

  it("makes a photo's copy for a viewer beside its thumbnail, from what is kept (ADR 0058)", async () => {
    const h = harness();
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename: "IMG_2210.jpg" });
    if (!slot.ok) throw new Error("no slot");
    await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: PNG });
    const row = h.rows.get(slot.value.id);
    const view = new Uint8Array([...PNG, 0xee, 0x02]);
    expect(row).toMatchObject({ view_sha256: sha(view), view_mime_type: "image/webp" });
    expect(h.blobs.get(sha(view))).toEqual(view);
    expect(h.shrinks).toEqual([512, 2048]);
    if (row === undefined) return;
    expect(await h.uploads.bytesOf(row, "view")).toEqual({
      ok: true,
      bytes: {
        variant: "view",
        sha256: sha(view),
        mime: "image/webp",
        name: "IMG_2210.jpg.webp",
        view: "copy",
      },
    });
  });

  it("keeps a file that is not a photo as it came, with no thumbnail, and calls markup a download", async () => {
    const h = harness();
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename: "page.pdf" });
    if (!slot.ok) throw new Error("no slot");
    const stored = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: HTML });
    expect(stored.ok).toBe(true);
    if (stored.ok) {
      expect(stored.value).toMatchObject({
        mime_type: "text/html",
        kind: "file",
        has_thumbnail: false,
        sha256: sha(HTML),
      });
    }
  });

  it("stores the same slot's bytes once, and answers a retry with the same attachment", async () => {
    const h = harness();
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename: "a.png" });
    if (!slot.ok) throw new Error("no slot");
    const first = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: PNG });
    const again = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: HTML });
    expect(again).toEqual(first);
    // The photo, its thumbnail and its copy for a viewer.
    expect(h.blobs.size).toBe(3);
  });

  it("refuses another person's slot, an expired one, an unknown one, and too many bytes", async () => {
    const h = harness({ maxBytes: 8 });
    const tooBig = await h.uploads.openSlot({ principal: ARJUN, filename: "x", byteSize: 9 });
    expect(tooBig).toMatchObject({ ok: false, error: { kind: "too_large" } });

    const slot = await h.uploads.openSlot({ principal: ARJUN, filename: "x" });
    if (!slot.ok) throw new Error("no slot");
    expect(await h.uploads.store({ principal: DANA, id: slot.value.id, bytes: PNG })).toMatchObject(
      {
        ok: false,
        error: { kind: "not_yours" },
      },
    );
    expect(
      await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: PNG }),
    ).toMatchObject({
      ok: false,
      error: { kind: "too_large" },
    });
    expect(
      await h.uploads.store({ principal: ARJUN, id: "att_01K4ZQPX00000000000000000X", bytes: PNG }),
    ).toMatchObject({
      ok: false,
      error: { kind: "unknown_slot" },
    });
    h.clock.advance(901_000);
    expect(
      await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: new Uint8Array(4) }),
    ).toMatchObject({
      ok: false,
      error: { kind: "expired" },
    });
  });

  it("describes a stored row as an attachment, and a slot as nothing", () => {
    const row: UploadRow = {
      id: "att_01K4ZQPX000000000000000008",
      workspace_id: WS,
      uploaded_by: ARJUN.participantId,
      filename: "PO-4471.pdf",
      state: "stored",
      mime_type: "application/pdf",
      byte_size: 184_302,
      sha256: "a".repeat(64),
      width: null,
      height: null,
      duration_ms: null,
      thumbnail_sha256: null,
      thumbnail_mime_type: null,
      keep_metadata: false,
      created_at: "t",
      expires_at: "t",
      stored_at: "t",
      declared_bytes: 184_302,
      playable_state: null,
      playable_how: null,
      playable_sha256: null,
      playable_mime_type: null,
      playable_note: null,
      transcript: null,
      view_sha256: null,
      view_mime_type: null,
    };
    expect(attachmentOf(row)).toMatchObject({
      kind: "file",
      has_thumbnail: false,
      byte_size: 184_302,
    });
    expect(attachmentOf({ ...row, state: "slot", sha256: null })).toBeUndefined();
  });
});

const MB = 1024 * 1024;

/** Bytes of a size, wearing a signature: a PNG's, or an MP4's `ftyp` at offset four. */
function sized(bytes: number, kind: "png" | "mp4"): Uint8Array {
  const out = new Uint8Array(bytes);
  if (kind === "png") out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  else out.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
  return out;
}

describe("a workspace's caps by kind (ADR 0047)", () => {
  it("refuses a slot by the kind the name suggests, with the sentence a phone says first", async () => {
    const h = harness({ maxBytes: 4 * MB, caps: { ...NO_CAPS, image: 1 * MB } });
    const photo = await h.uploads.openSlot({
      principal: ARJUN,
      filename: "holiday.jpg",
      byteSize: 1.5 * MB,
    });
    expect(photo).toEqual({
      ok: false,
      error: {
        kind: "too_large",
        message: "Photos here are capped at 1 MB, and this one is 1.5 MB.",
      },
    });
    const clip = await h.uploads.openSlot({
      principal: ARJUN,
      filename: "clip.mp4",
      byteSize: 1.5 * MB,
    });
    expect(clip.ok).toBe(true);
  });

  it("judges the bytes by what they are, not by what the name said", async () => {
    const h = harness({ maxBytes: 4 * MB, caps: { ...NO_CAPS, video: 1 * MB } });
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename: "clip.jpg" });
    if (!slot.ok) throw new Error("no slot");
    const asVideo = await h.uploads.store({
      principal: ARJUN,
      id: slot.value.id,
      bytes: sized(1.5 * MB, "mp4"),
    });
    expect(asVideo).toEqual({
      ok: false,
      error: {
        kind: "too_large",
        message: "Videos here are capped at 1 MB, and this one is 1.5 MB.",
      },
    });
    // The slot stays open for the right bytes: nothing was stored.
    expect(h.rows.get(slot.value.id)?.state).toBe("slot");

    const other = await h.uploads.openSlot({ principal: ARJUN, filename: "movie.mp4" });
    if (!other.ok) throw new Error("no slot");
    const asPhoto = await h.uploads.store({
      principal: ARJUN,
      id: other.value.id,
      bytes: sized(1.5 * MB, "png"),
    });
    expect(asPhoto.ok, JSON.stringify(asPhoto)).toBe(true);
  });

  it("holds the server's ceiling over a cap set above it", async () => {
    const h = harness({ maxBytes: 4 * MB, caps: { ...NO_CAPS, image: 10 * MB } });
    const slot = await h.uploads.openSlot({
      principal: ARJUN,
      filename: "big.png",
      byteSize: 5 * MB,
    });
    expect(slot).toEqual({
      ok: false,
      error: {
        kind: "too_large",
        message: "This server takes photos up to 4 MB, and this one is 5 MB.",
      },
    });
  });
});

describe("an upload in pieces (ADR 0052)", () => {
  async function slotFor(
    h: ReturnType<typeof harness>,
    filename: string,
    byteSize: number | undefined,
  ): Promise<string> {
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename, byteSize });
    if (!slot.ok) throw new Error(JSON.stringify(slot.error));
    return slot.value.id;
  }

  it("holds each piece, and stores the whole when the last one brings it to the size", async () => {
    const h = harness();
    const id = await slotFor(h, "IMG_2210.jpg", PNG.byteLength);
    const first = await h.uploads.piece({
      principal: ARJUN,
      id,
      offset: 0,
      bytes: PNG.slice(0, 5),
    });
    expect(first).toEqual({ ok: true, value: { received: 5 } });
    const second = await h.uploads.piece({
      principal: ARJUN,
      id,
      offset: 5,
      bytes: PNG.slice(5, 10),
    });
    expect(second).toEqual({ ok: true, value: { received: 10 } });
    expect(h.rows.get(id)?.state).toBe("slot");

    const last = await h.uploads.piece({ principal: ARJUN, id, offset: 10, bytes: PNG.slice(10) });
    expect(last.ok, JSON.stringify(last)).toBe(true);
    if (!last.ok || !("attachment" in last.value)) throw new Error("not finished");
    // What a whole upload of the same bytes makes: a PNG, straightened, with its thumbnail.
    const kept = new Uint8Array([...PNG, 0xee]);
    expect(last.value).toMatchObject({
      received: PNG.byteLength,
      attachment: {
        attachment_id: id,
        mime_type: "image/png",
        sha256: sha(kept),
        has_thumbnail: true,
      },
    });
    expect(h.rows.get(id)?.state).toBe("stored");
    expect(h.waiting.has(id)).toBe(false);
  });

  it("refuses a piece at any offset but the bytes it holds, saying how many, and one past the size", async () => {
    const h = harness();
    const id = await slotFor(h, "notes.txt", 10);
    await h.uploads.piece({ principal: ARJUN, id, offset: 0, bytes: new Uint8Array(4) });
    expect(
      await h.uploads.piece({ principal: ARJUN, id, offset: 8, bytes: new Uint8Array(2) }),
    ).toEqual({
      ok: false,
      error: {
        kind: "wrong_offset",
        message: "that upload has 4 bytes; send the piece that starts there",
        received: 4,
      },
    });
    expect(
      await h.uploads.piece({ principal: ARJUN, id, offset: 4, bytes: new Uint8Array(7) }),
    ).toMatchObject({ ok: false, error: { kind: "past_size" } });
    expect(await h.uploads.progress({ principal: ARJUN, id })).toMatchObject({
      ok: true,
      value: { received: 4, declared: 10 },
    });
  });

  it("takes no pieces for a slot that did not say how big the file is, nor another person's", async () => {
    const h = harness();
    const unsized = await slotFor(h, "notes.txt", undefined);
    expect(
      await h.uploads.piece({ principal: ARJUN, id: unsized, offset: 0, bytes: HTML }),
    ).toMatchObject({ ok: false, error: { kind: "no_size" } });
    const sized = await slotFor(h, "notes.txt", HTML.byteLength);
    expect(
      await h.uploads.piece({ principal: DANA, id: sized, offset: 0, bytes: HTML }),
    ).toMatchObject({ ok: false, error: { kind: "not_yours" } });
    expect(await h.uploads.progress({ principal: DANA, id: sized })).toMatchObject({
      ok: false,
      error: { kind: "not_yours" },
    });
  });

  it("judges the size the slot named at the first piece, by what the file is, before the rest is sent", async () => {
    const h = harness({ maxBytes: 4 * MB, caps: { ...NO_CAPS, video: 1 * MB } });
    // Named as a photo, so the slot is not refused; the first piece says it is a video.
    const id = await slotFor(h, "photo.jpg", 1.5 * MB);
    const first = await h.uploads.piece({
      principal: ARJUN,
      id,
      offset: 0,
      bytes: sized(1 * MB, "mp4"),
    });
    expect(first).toEqual({
      ok: false,
      error: {
        kind: "too_large",
        message: "Videos here are capped at 1 MB, and this one is 1.5 MB.",
      },
    });
    expect(h.waiting.has(id)).toBe(false);
  });

  it("takes a piece sent twice at once only once, and answers a retry of the last with the attachment", async () => {
    const h = harness();
    const id = await slotFor(h, "a.png", PNG.byteLength);
    const head = PNG.slice(0, 6);
    const [one, two] = await Promise.all([
      h.uploads.piece({ principal: ARJUN, id, offset: 0, bytes: head }),
      h.uploads.piece({ principal: ARJUN, id, offset: 0, bytes: head }),
    ]);
    expect([one, two]).toEqual([
      { ok: true, value: { received: 6 } },
      expect.objectContaining({ ok: false, error: expect.objectContaining({ received: 6 }) }),
    ]);

    const tail = PNG.slice(6);
    const [last, retry] = await Promise.all([
      h.uploads.piece({ principal: ARJUN, id, offset: 6, bytes: tail }),
      h.uploads.piece({ principal: ARJUN, id, offset: 6, bytes: tail }),
    ]);
    expect(last.ok).toBe(true);
    expect(retry).toEqual(last);
    expect(await h.uploads.progress({ principal: ARJUN, id })).toMatchObject({
      ok: true,
      value: { received: PNG.byteLength, attachment: { attachment_id: id } },
    });
  });

  it("keeps a slot open while pieces keep coming, and sweeps the pieces of one that stopped", async () => {
    const h = harness();
    const id = await slotFor(h, "notes.txt", 30);
    for (let offset = 0; offset < 20; offset += 10) {
      h.clock.advance(800_000);
      const moved = await h.uploads.piece({
        principal: ARJUN,
        id,
        offset,
        bytes: new Uint8Array(10),
      });
      expect(moved.ok, JSON.stringify(moved)).toBe(true);
    }
    // Nearly half an hour since the slot opened, and it is still open: each piece moved it on.
    expect(h.rows.get(id)?.expires_at).toBe("2026-09-02T08:41:40.000Z");
    expect(await h.uploads.abandon(h.clock.nowIso())).toBe(0);

    h.clock.advance(901_000);
    expect(await h.uploads.progress({ principal: ARJUN, id })).toMatchObject({
      ok: false,
      error: { kind: "expired" },
    });
    expect(await h.uploads.abandon(h.clock.nowIso())).toBe(1);
    expect(h.waiting.size).toBe(0);
  });
});

describe("a video (ADR 0053)", () => {
  const MP4 = sized(2048, "mp4");
  /** What the fake makes of `MP4` without its metadata: the bytes with a byte on. */
  const STRIPPED = new Uint8Array([...MP4, 0x5e]);
  const POSTER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

  /**
   * Measures anything as a sideways two-minute clip, with a frame, needing what it is told; drops
   * metadata by putting a byte on, and counts how often it was asked to.
   */
  function videos(
    playable: "as_is" | "remux" | "transcode",
    poster = true,
  ): Videos & { stripped: string[] } {
    const fake = {
      stripped: [] as string[],
      async measure() {
        return {
          durationMs: 120_000,
          width: 1080,
          height: 1920,
          playable,
          ...(poster ? { poster: POSTER } : {}),
        };
      },
      async strip(bytes: Uint8Array, mime: string) {
        fake.stripped.push(mime);
        return new Uint8Array([...bytes, 0x5e]);
      },
      async playable(): Promise<Uint8Array> {
        throw new Error("not made here");
      },
    };
    return fake;
  }

  async function keepVideo(h: ReturnType<typeof harness>, keepMetadata = false) {
    const slot = await h.uploads.openSlot({
      principal: ARJUN,
      filename: "IMG_4410.MOV",
      keepMetadata,
    });
    if (!slot.ok) throw new Error("no slot");
    const stored = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: MP4 });
    if (!stored.ok) throw new Error(JSON.stringify(stored.error));
    return { id: slot.value.id, attachment: stored.value };
  }

  it("keeps a video without its metadata, with its length and size, its frame as the thumbnail, and a copy queued", async () => {
    const h = harness({ videos: videos("transcode") });
    const { id, attachment } = await keepVideo(h);
    expect(attachment).toMatchObject({
      mime_type: "video/mp4",
      byte_size: STRIPPED.byteLength,
      sha256: sha(STRIPPED),
      width: 1080,
      height: 1920,
      duration_ms: 120_000,
      kind: "video",
      has_thumbnail: true,
    });
    // The thumbnail is the frame, through the same thumbnailer a photo's goes through.
    const row = h.rows.get(id);
    expect(h.blobs.get(row?.thumbnail_sha256 ?? "")).toEqual(new Uint8Array([...POSTER, 0x01]));
    // And so is its copy for a viewer (ADR 0058).
    expect(h.blobs.get(row?.view_sha256 ?? "")).toEqual(new Uint8Array([...POSTER, 0x02]));
    expect(row).toMatchObject({ playable_state: "pending", playable_how: "transcode" });
    expect(h.queued.count).toBe(1);
    // What is kept, and what the copy is made from later, is the video without its metadata.
    expect(h.blobs.get(sha(STRIPPED))).toEqual(STRIPPED);
    expect(h.blobs.has(sha(MP4))).toBe(false);
    expect(h.metadataKept).toEqual([]);
  });

  it("keeps a video's bytes as they came when its uploader kept its metadata", async () => {
    const fake = videos("transcode");
    const h = harness({ videos: fake });
    const { attachment } = await keepVideo(h, true);
    expect(attachment).toMatchObject({ byte_size: MP4.byteLength, sha256: sha(MP4), width: 1080 });
    expect(h.blobs.get(sha(MP4))).toEqual(MP4);
    expect(fake.stripped).toEqual([]);
    expect(h.metadataKept).toEqual([]);
  });

  it("keeps a video as it came and says why, when it cannot be copied without its metadata or read at all", async () => {
    const failing: Videos = {
      ...videos("remux"),
      strip: async () => {
        throw new Error("Could not find tag for codec none in stream #1");
      },
    };
    const h = harness({ videos: failing });
    const { id, attachment } = await keepVideo(h);
    // Measured, and queued for its copy, all the same.
    expect(attachment).toMatchObject({ sha256: sha(MP4), duration_ms: 120_000 });
    expect(h.rows.get(id)?.playable_state).toBe("pending");
    expect(h.metadataKept).toEqual([[id, "Could not find tag for codec none in stream #1"]]);

    const unread = harness({ videos: { ...videos("remux"), measure: async () => undefined } });
    const kept = await keepVideo(unread);
    expect(kept.attachment.sha256).toBe(sha(MP4));
    expect(unread.metadataKept).toEqual([[kept.id, "it could not be read"]]);
  });

  it("queues nothing for a video that already plays everywhere", async () => {
    const h = harness({ videos: videos("as_is") });
    const { id } = await keepVideo(h);
    expect(h.rows.get(id)).toMatchObject({ playable_state: "skipped", playable_how: null });
    expect(h.queued.count).toBe(0);
  });

  it("keeps a video it could not take a frame of, measured, with no thumbnail", async () => {
    const h = harness({ videos: videos("remux", false) });
    const { attachment } = await keepVideo(h);
    expect(attachment).toMatchObject({ duration_ms: 120_000, has_thumbnail: false });
  });

  it("keeps a video as it came, unmeasured, where the tool fails or there is none", async () => {
    const failing: Videos = {
      measure: async () => {
        throw new Error("ffprobe crashed");
      },
      strip: async () => new Uint8Array(0),
      playable: async () => new Uint8Array(0),
    };
    for (const h of [harness({ videos: failing }), harness()]) {
      const { id, attachment } = await keepVideo(h);
      expect(attachment).toMatchObject({ kind: "video", has_thumbnail: false, sha256: sha(MP4) });
      expect(attachment.duration_ms).toBeUndefined();
      expect(h.rows.get(id)?.playable_state).toBeNull();
      expect(h.queued.count).toBe(0);
    }
  });
});

describe("a voice note (ADR 0054)", () => {
  /** A phone's voice memo: the brand of an M4A, and nothing else a player would want. */
  const M4A = (() => {
    const out = new Uint8Array(1024);
    out.set([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
    return out;
  })();

  function hearing(heard: Awaited<ReturnType<Sounds["hear"]>>): Sounds & { calls: number } {
    const sounds = {
      calls: 0,
      async hear() {
        sounds.calls += 1;
        return heard;
      },
    };
    return sounds;
  }

  async function keep(h: ReturnType<typeof harness>, filename: string, bytes: Uint8Array) {
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename });
    if (!slot.ok) throw new Error("no slot");
    const stored = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes });
    if (!stored.ok) throw new Error(JSON.stringify(stored.error));
    return { id: slot.value.id, attachment: stored.value };
  }

  it("keeps a voice note as it came, with its length and what was said, before the upload answers", async () => {
    const sounds = hearing({ durationMs: 8400, transcript: "Book the train for Tuesday." });
    const h = harness({ sounds });
    const { id, attachment } = await keep(h, "voice-note.m4a", M4A);
    expect(attachment).toMatchObject({
      mime_type: "audio/mp4",
      byte_size: M4A.byteLength,
      sha256: sha(M4A),
      duration_ms: 8400,
      transcript: "Book the train for Tuesday.",
      kind: "audio",
      has_thumbnail: false,
    });
    expect(h.rows.get(id)).toMatchObject({ transcript: "Book the train for Tuesday." });
    expect(h.blobs.get(sha(M4A))).toEqual(M4A);
    expect(h.queued.count).toBe(0);
  });

  it("keeps sound nobody spoke in with its length and no transcript", async () => {
    const h = harness({ sounds: hearing({ durationMs: 4000, note: "nobody spoke" }) });
    const { id, attachment } = await keep(h, "pocket.m4a", M4A);
    expect(attachment).toMatchObject({ kind: "audio", duration_ms: 4000 });
    expect(attachment.transcript).toBeUndefined();
    expect(h.rows.get(id)?.transcript).toBeNull();
  });

  it("calls a video's box with sound and no picture sound, and hears it", async () => {
    const sounds = hearing({ durationMs: 3000, transcript: "Hello." });
    const videos: Videos = {
      measure: async () => ({ soundOnly: true }),
      strip: async () => {
        throw new Error("not a video");
      },
      playable: async () => {
        throw new Error("not a video");
      },
    };
    const h = harness({ videos, sounds });
    const webm = new Uint8Array(512);
    webm.set([0x1a, 0x45, 0xdf, 0xa3]);
    const { id, attachment } = await keep(h, "recording.webm", webm);
    expect(attachment).toMatchObject({
      mime_type: "audio/webm",
      kind: "audio",
      transcript: "Hello.",
    });
    expect(h.rows.get(id)?.playable_state).toBeNull();
    expect(sounds.calls).toBe(1);
  });

  it("keeps sound as it came, unheard, where the tool fails or there is none", async () => {
    const failing: Sounds = {
      hear: async () => {
        throw new Error("ffprobe crashed");
      },
    };
    for (const h of [harness({ sounds: failing }), harness()]) {
      const { attachment } = await keep(h, "voice-note.m4a", M4A);
      expect(attachment).toMatchObject({ kind: "audio", mime_type: "audio/mp4" });
      expect(attachment.duration_ms).toBeUndefined();
      expect(attachment.transcript).toBeUndefined();
    }
  });

  it("hears nothing that is not sound", async () => {
    const sounds = hearing({ durationMs: 1, transcript: "never" });
    const h = harness({ sounds });
    await keep(h, "notes.txt", HTML);
    await keep(h, "po.png", PNG);
    expect(sounds.calls).toBe(0);
  });
});

describe("which bytes a variant names (ADR 0058)", () => {
  async function photo(h: ReturnType<typeof harness>, filename = "IMG_2210.jpg") {
    const slot = await h.uploads.openSlot({ principal: ARJUN, filename });
    if (!slot.ok) throw new Error("no slot");
    const stored = await h.uploads.store({ principal: ARJUN, id: slot.value.id, bytes: PNG });
    if (!stored.ok) throw new Error(JSON.stringify(stored.error));
    const row = h.rows.get(slot.value.id);
    if (row === undefined) throw new Error("no row");
    return row;
  }

  /** A photo as a row kept before migration 0022 has it: no view copy. */
  async function olderPhoto(h: ReturnType<typeof harness>) {
    const row = { ...(await photo(h)), view_sha256: null, view_mime_type: null };
    h.rows.set(row.id, row);
    return row;
  }

  it("names the file for no variant and for one it does not know, and the thumbnail for thumb", async () => {
    const h = harness();
    const row = await photo(h);
    const file = { variant: "file", sha256: row.sha256, mime: "image/png", name: "IMG_2210.jpg" };
    expect(await h.uploads.bytesOf(row, undefined)).toEqual({ ok: true, bytes: file });
    expect(await h.uploads.bytesOf(row, "poster")).toEqual({ ok: true, bytes: file });
    expect(await h.uploads.bytesOf(row, "thumb")).toMatchObject({
      ok: true,
      bytes: { variant: "thumb", sha256: row.thumbnail_sha256, mime: "image/webp" },
    });
    expect(await h.uploads.bytesOf({ ...row, thumbnail_sha256: null }, "thumb")).toEqual({
      ok: false,
      message: "That attachment has no thumbnail.",
    });
  });

  it("gives a photo kept before view copies one at its first ask, and records it once", async () => {
    const h = harness();
    const row = await olderPhoto(h);
    expect(h.uploads.willHaveView(row)).toBe(true);
    h.shrinks.length = 0;

    const [first, second] = await Promise.all([
      h.uploads.bytesOf(row, "view"),
      h.uploads.bytesOf(row, "view"),
    ]);
    const view = new Uint8Array([...PNG, 0xee, 0x02]);
    expect(first).toMatchObject({ ok: true, bytes: { variant: "view", sha256: sha(view) } });
    expect(second).toEqual(first);
    expect(h.shrinks).toEqual([2048]);
    expect(h.viewsRecorded.count).toBe(1);
    expect(h.rows.get(row.id)).toMatchObject({ view_sha256: sha(view) });

    // Asked again with the row as it was read before the copy was made: not made again.
    expect(await h.uploads.bytesOf(row, "view")).toEqual(first);
    expect(h.shrinks).toEqual([2048]);
    expect(h.viewsRecorded.count).toBe(1);
  });

  it("names the photo itself as the view of a GIF, of one sharp could not read, and when making it fails", async () => {
    const h = harness();
    const row = await olderPhoto(h);
    const gif = { ...row, mime_type: "image/gif" };
    expect(h.uploads.willHaveView(gif)).toBe(false);
    expect(await h.uploads.bytesOf(gif, "view")).toMatchObject({
      ok: true,
      bytes: { variant: "file", sha256: row.sha256, view: "original" },
    });
    const unread = { ...row, thumbnail_sha256: null, thumbnail_mime_type: null };
    expect(h.uploads.willHaveView(unread)).toBe(false);
    expect(await h.uploads.bytesOf(unread, "view")).toMatchObject({
      ok: true,
      bytes: { variant: "file", view: "original" },
    });
    // The fake's thumbnailer refuses what begins with a G.
    const refused = { ...row, sha256: sha(new Uint8Array([0x47])) };
    h.blobs.set(refused.sha256, new Uint8Array([0x47]));
    expect(await h.uploads.bytesOf(refused, "view")).toMatchObject({
      ok: true,
      bytes: { variant: "file", view: "original" },
    });
    expect(h.viewsRecorded.count).toBe(0);
  });

  it("has no view for a video without a poster's copy, or for a file", async () => {
    const h = harness();
    const row = await photo(h);
    const video = { ...row, mime_type: "video/mp4", view_sha256: null, view_mime_type: null };
    expect(await h.uploads.bytesOf(video, "view")).toEqual({
      ok: false,
      message: "That attachment has no copy for a viewer.",
    });
    const pdf = { ...video, mime_type: "application/pdf" };
    expect(await h.uploads.bytesOf(pdf, "view")).toMatchObject({ ok: false });
  });

  it("names the file to play while the copy is being made, and the copy once it is", async () => {
    const h = harness();
    const row = {
      ...(await photo(h)),
      filename: "IMG_4410.MOV",
      mime_type: "video/quicktime",
      playable_state: "pending" as const,
    };
    expect(await h.uploads.bytesOf(row, "play")).toMatchObject({
      ok: true,
      bytes: { variant: "file", sha256: row.sha256, mime: "video/quicktime", playable: "pending" },
    });
    const done = {
      ...row,
      playable_state: "done" as const,
      playable_sha256: "c".repeat(64),
      playable_mime_type: "video/mp4",
    };
    expect(await h.uploads.bytesOf(done, "play")).toEqual({
      ok: true,
      bytes: {
        variant: "play",
        sha256: "c".repeat(64),
        mime: "video/mp4",
        name: "IMG_4410.mp4",
        playable: "done",
      },
    });
    expect(await h.uploads.bytesOf({ ...row, playable_state: null }, "play")).toMatchObject({
      ok: true,
      bytes: { variant: "file" },
    });
  });
});
