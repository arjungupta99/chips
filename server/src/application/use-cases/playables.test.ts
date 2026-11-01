/** The playable-copy worker with fake ports (ADR 0053); the real ffmpeg has tests of its own. */

import { createHash } from "node:crypto";
import { manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type {
  BlobStore,
  PlayableOutcome,
  UploadRow,
  UploadsRegistry,
  Videos,
} from "../ports/attachments.js";
import { createPlayables, type PlayableMade } from "./playables.js";

function row(id: string, overrides: Partial<UploadRow> = {}): UploadRow {
  return {
    id,
    workspace_id: "ws_1",
    uploaded_by: "usr_1",
    filename: `${id}.mov`,
    state: "stored",
    mime_type: "video/quicktime",
    byte_size: 3,
    sha256: createHash("sha256").update(id).digest("hex"),
    width: 1080,
    height: 1920,
    duration_ms: 3000,
    thumbnail_sha256: null,
    thumbnail_mime_type: null,
    keep_metadata: false,
    created_at: "t",
    expires_at: "t",
    stored_at: "t",
    declared_bytes: 3,
    playable_state: "pending",
    playable_how: "transcode",
    playable_sha256: null,
    playable_mime_type: null,
    playable_note: null,
    transcript: null,
    view_sha256: null,
    view_mime_type: null,
    ...overrides,
  };
}

function bench(videos: Videos, pending: UploadRow[]) {
  const outcomes: { id: string; outcome: PlayableOutcome }[] = [];
  const blobs = new Map<string, Uint8Array>();
  for (const each of pending) {
    if (each.sha256 !== null) blobs.set(each.sha256, new TextEncoder().encode(each.id));
  }
  const registry: Pick<UploadsRegistry, "nextPlayable" | "playableMade"> = {
    async nextPlayable() {
      return pending.find((each) => !outcomes.some((done) => done.id === each.id));
    },
    async playableMade(_workspaceId, id, outcome) {
      outcomes.push({ id, outcome });
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
  const made: PlayableMade[] = [];
  const playables = createPlayables({
    registry,
    blobs: store,
    videos,
    clock: manualClock(0),
    onMade: (each) => made.push(each),
  });
  return { playables, outcomes, blobs, made };
}

describe("making videos playable (ADR 0053)", () => {
  it("makes each pending copy in turn, keeps it by its digest, and records it done", async () => {
    const asked: string[] = [];
    const videos: Videos = {
      measure: async () => undefined,
      strip: async (bytes) => bytes,
      async playable(bytes, how, durationMs) {
        asked.push(`${new TextDecoder().decode(bytes)} ${how} ${durationMs}`);
        return new TextEncoder().encode(`mp4 of ${new TextDecoder().decode(bytes)}`);
      },
    };
    const b = bench(videos, [row("att_a"), row("att_b", { playable_how: "remux" })]);
    expect(await b.playables.drain()).toBe(2);
    expect(asked).toEqual(["att_a transcode 3000", "att_b remux 3000"]);
    const copy = new TextEncoder().encode("mp4 of att_a");
    const digest = createHash("sha256").update(copy).digest("hex");
    expect(b.outcomes[0]).toEqual({
      id: "att_a",
      outcome: { state: "done", sha256: digest, mimeType: "video/mp4" },
    });
    expect(b.blobs.get(digest)).toEqual(copy);
    expect(b.made.map((each) => each.state)).toEqual(["done", "done"]);
  });

  it("records a failure in the tool's words and goes on to the next", async () => {
    const videos: Videos = {
      measure: async () => undefined,
      strip: async (bytes) => bytes,
      async playable(bytes) {
        if (new TextDecoder().decode(bytes) === "att_a") throw new Error("moov atom not found");
        return new Uint8Array([1]);
      },
    };
    const b = bench(videos, [row("att_a"), row("att_b"), row("att_c")]);
    // The third's original has gone from the store.
    b.blobs.delete(row("att_c").sha256 ?? "");
    expect(await b.playables.drain()).toBe(3);
    expect(b.outcomes.map((each) => each.outcome.state)).toEqual(["failed", "done", "failed"]);
    expect(b.outcomes[0]?.outcome).toEqual({ state: "failed", note: "moov atom not found" });
    expect(b.outcomes[2]?.outcome).toEqual({
      state: "failed",
      note: "the original is not in the store",
    });
  });

  it("runs one copy at a time: a drain asked for while one runs joins it", async () => {
    let release: (() => void) | undefined;
    let running = 0;
    let most = 0;
    const videos: Videos = {
      measure: async () => undefined,
      strip: async (bytes) => bytes,
      async playable() {
        running += 1;
        most = Math.max(most, running);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        running -= 1;
        return new Uint8Array([1]);
      },
    };
    const b = bench(videos, [row("att_a")]);
    const first = b.playables.drain();
    const second = b.playables.drain();
    expect(second).toBe(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release?.();
    expect(await first).toBe(1);
    expect(most).toBe(1);
  });
});
