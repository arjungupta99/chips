/**
 * The blob store on local disk, for solo mode (decision 10). A file lives at
 * `<dir>/<first two hex>/<sha256>`, written to a temporary name and renamed into place, so a
 * reader never sees half a file and the same bytes are kept once whoever uploads them.
 *
 * A request's answer is read from the file as it goes out, a run of it when a player asks for one
 * (ADR 0058): a megabyte of a 500 MB video is a megabyte read, and a player that lets go of a
 * request mid-way closes the file.
 */

import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BlobStore } from "../../application/ports/attachments.js";

const HEX = /^[a-f0-9]{64}$/;

/** How much of a file is read at a time into a stream: a few hundred milliseconds of a 1080p copy. */
const CHUNK_BYTES = 256 * 1024;

export function createLocalBlobStore(directory: string): BlobStore {
  const pathOf = (sha256: string): string => {
    if (!HEX.test(sha256)) throw new Error(`not a sha256: ${sha256}`);
    return join(directory, sha256.slice(0, 2), sha256);
  };

  return {
    async put(sha256, bytes) {
      const path = pathOf(sha256);
      try {
        await stat(path);
        return;
      } catch {
        // Not there yet: write it.
      }
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.part`;
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, path);
    },

    async get(sha256) {
      try {
        return new Uint8Array(await readFile(pathOf(sha256)));
      } catch {
        return undefined;
      }
    },

    async size(sha256) {
      try {
        return (await stat(pathOf(sha256))).size;
      } catch {
        return undefined;
      }
    },

    async read(sha256, range) {
      const path = pathOf(sha256);
      let size: number;
      try {
        size = (await stat(path)).size;
      } catch {
        return undefined;
      }
      return streamOf(path, range?.start ?? 0, range?.end ?? size - 1);
    },

    async remove(sha256) {
      await rm(pathOf(sha256), { force: true });
    },
  };
}

/**
 * A run of a file as a stream, read a chunk at a time as it is taken. The file is opened at the
 * first read, so an answer nobody reads — a request let go of before its body, a `HEAD` — never
 * holds one open, and it is closed at the run's end, on a failure, and when whoever was taking it
 * stops, even while it is still being opened: a handle left to the collector is an error Node 26
 * ends the process on.
 */
function streamOf(path: string, start: number, end: number): ReadableStream<Uint8Array> {
  let handle: FileHandle | undefined;
  let position = start;
  let closed = false;
  const close = async () => {
    closed = true;
    const file = handle;
    handle = undefined;
    await file?.close().catch(() => undefined);
  };
  /** The file, opened at the first read; nothing once the stream is let go of, opened or not. */
  const opened = async (): Promise<FileHandle | undefined> => {
    if (handle !== undefined || closed) return handle;
    const file = await open(path, "r");
    if (closed) {
      await file.close().catch(() => undefined);
      return undefined;
    }
    handle = file;
    return file;
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const left = end - position + 1;
          if (left <= 0) {
            await close();
            controller.close();
            return;
          }
          const file = await opened();
          if (file === undefined) return;
          const chunk = new Uint8Array(Math.min(CHUNK_BYTES, left));
          const { bytesRead } = await file.read(chunk, 0, chunk.byteLength, position);
          if (bytesRead === 0) {
            // The file is shorter than the run asked: what there was has gone.
            await close();
            controller.close();
            return;
          }
          position += bytesRead;
          controller.enqueue(bytesRead === chunk.byteLength ? chunk : chunk.subarray(0, bytesRead));
        } catch (failure) {
          await close();
          controller.error(failure);
        }
      },
      cancel: close,
    },
    { highWaterMark: 0 },
  );
}
