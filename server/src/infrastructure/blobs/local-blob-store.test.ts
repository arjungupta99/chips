import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalBlobStore } from "./local-blob-store.js";

let directory: string;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "chips-blobs-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("the local blob store", () => {
  it("keeps bytes by their digest, once, and hands them back", async () => {
    const store = createLocalBlobStore(directory);
    const bytes = new TextEncoder().encode("hello");
    await store.put(sha("hello"), bytes);
    await store.put(sha("hello"), bytes);
    expect(await store.get(sha("hello"))).toEqual(bytes);
    // One file, under the first two hex characters of its digest.
    expect(readdirSync(join(directory, sha("hello").slice(0, 2)))).toEqual([sha("hello")]);
  });

  it("has nothing for a digest it never saw, and refuses a name that is not a digest", async () => {
    const store = createLocalBlobStore(directory);
    expect(await store.get(sha("never"))).toBeUndefined();
    await expect(store.put("../../etc/passwd", new Uint8Array(1))).rejects.toThrow("not a sha256");
  });

  it("says how big a blob is, and nothing for one it never saw", async () => {
    const store = createLocalBlobStore(directory);
    await store.put(sha("hello"), new TextEncoder().encode("hello"));
    expect(await store.size(sha("hello"))).toBe(5);
    expect(await store.size(sha("never"))).toBeUndefined();
  });

  it("reads the whole of a blob, or a run of it, as a stream, and nothing for one it never saw", async () => {
    const store = createLocalBlobStore(directory);
    const bytes = new Uint8Array(1_000_000).map((_, i) => i % 251);
    const digest = createHash("sha256").update(bytes).digest("hex");
    await store.put(digest, bytes);

    expect(await collect(await store.read(digest))).toEqual(bytes);
    expect(await collect(await store.read(digest, { start: 0, end: 1 }))).toEqual(
      bytes.slice(0, 2),
    );
    expect(await collect(await store.read(digest, { start: 400_000, end: 700_000 }))).toEqual(
      bytes.slice(400_000, 700_001),
    );
    expect(await collect(await store.read(digest, { start: 999_990, end: 999_999 }))).toEqual(
      bytes.slice(999_990),
    );
    expect(await store.read(sha("never"))).toBeUndefined();
  });

  it("reads no more of a 64 MB blob than the run asked for, and lets go of it when cancelled", async () => {
    const store = createLocalBlobStore(directory);
    const bytes = new Uint8Array(64 * 1024 * 1024);
    const digest = createHash("sha256").update(bytes).digest("hex");
    await store.put(digest, bytes);

    const stream = await store.read(digest, { start: 1024, end: 1024 * 1024 + 1023 });
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    let read = 0;
    let chunks = 0;
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      read += next.value.byteLength;
      chunks += 1;
    }
    expect(read).toBe(1024 * 1024);
    // A megabyte is a few chunks, not the file.
    expect(chunks).toBeLessThanOrEqual(4);

    const whole = await store.read(digest);
    const taking = (whole as ReadableStream<Uint8Array>).getReader();
    expect((await taking.read()).value?.byteLength).toBeGreaterThan(0);
    await taking.cancel();
    expect((await taking.read()).done).toBe(true);
  });

  it("closes the file when its reader lets go while it is still opening", async () => {
    // A reader that cancelled during the first read's open left the file to the collector, and
    // Node 26 makes that an error the server ends on (SEC-17): a browser letting go of a photo
    // as it began took chipsd down mid-run on 25 October 2026.
    const store = createLocalBlobStore(directory);
    const bytes = new TextEncoder().encode("words");
    const digest = createHash("sha256").update(bytes).digest("hex");
    await store.put(digest, bytes);
    const open = () => readdirSync("/dev/fd").length;
    const before = open();
    for (let i = 0; i < 20; i += 1) {
      const reader = ((await store.read(digest)) as ReadableStream<Uint8Array>).getReader();
      const reading = reader.read().catch(() => undefined);
      // Into the first read, where the file is being opened, then let go.
      for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
      await reader.cancel();
      await reading;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(open()).toBe(before);
  });
});

async function collect(stream: ReadableStream<Uint8Array> | undefined): Promise<Uint8Array> {
  if (stream === undefined) throw new Error("no stream");
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
