/**
 * The pieces of unfinished uploads on local disk, for solo mode (ADR 0052). One file per slot,
 * `<dir>/<attachment id>`, each piece appended to it; how much has arrived is the file's length,
 * so a write cut short by a crash leaves a shorter file and the client that asks is told so.
 */

import { appendFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { UploadPieces } from "../../application/ports/attachments.js";

/** An attachment id, and nothing that could name a path outside the directory. */
const ID = /^[A-Za-z0-9_]{1,80}$/;

export function createLocalUploadPieces(directory: string): UploadPieces {
  const pathOf = (id: string): string => {
    if (!ID.test(id)) throw new Error(`not an upload id: ${id}`);
    return join(directory, id);
  };

  return {
    async size(id) {
      try {
        return (await stat(pathOf(id))).size;
      } catch {
        return 0;
      }
    },

    async append(id, bytes) {
      const path = pathOf(id);
      await mkdir(directory, { recursive: true });
      await appendFile(path, bytes, { mode: 0o600 });
    },

    async read(id) {
      try {
        return new Uint8Array(await readFile(pathOf(id)));
      } catch {
        return new Uint8Array(0);
      }
    },

    async discard(id) {
      await rm(pathOf(id), { force: true });
    },

    async waiting() {
      try {
        return (await readdir(directory)).filter((name) => ID.test(name));
      } catch {
        return [];
      }
    },
  };
}
