/**
 * A video's copy that plays everywhere, made after the upload answered (ADR 0053). One video at
 * a time, oldest first: the worst a queue of long videos costs is waiting, never a second ffmpeg
 * competing with the first. A copy is kept once by its digest beside the original, which is never
 * replaced. A failure is recorded with the tool's words and not tried again; a server that stops
 * mid-run leaves the video pending, and the next start takes it up.
 */

import { createHash } from "node:crypto";
import type { BlobStore, UploadRow, UploadsRegistry, Videos } from "../ports/attachments.js";
import type { Clock } from "../ports/index.js";

export interface PlayablesDeps {
  readonly registry: Pick<UploadsRegistry, "nextPlayable" | "playableMade">;
  readonly blobs: BlobStore;
  readonly videos: Videos;
  readonly clock: Pick<Clock, "nowMs">;
  /** Told of every copy made or failed, for the log. */
  readonly onMade?: ((made: PlayableMade) => void) | undefined;
}

export type PlayableMade =
  | { readonly id: string; readonly state: "done"; readonly bytes: number; readonly ms: number }
  | { readonly id: string; readonly state: "failed"; readonly note: string };

export function createPlayables(deps: PlayablesDeps) {
  let running: Promise<number> | undefined;

  /** Make the next pending copy. False when there was none. */
  async function next(): Promise<boolean> {
    const row = await deps.registry.nextPlayable();
    if (row === undefined) return false;
    await make(row);
    return true;
  }

  async function make(row: UploadRow): Promise<void> {
    const failed = async (note: string) => {
      await deps.registry.playableMade(row.workspace_id, row.id, { state: "failed", note });
      deps.onMade?.({ id: row.id, state: "failed", note });
    };
    const original = row.sha256 === null ? undefined : await deps.blobs.get(row.sha256);
    if (original === undefined || row.playable_how === null) {
      await failed("the original is not in the store");
      return;
    }
    const started = deps.clock.nowMs();
    let copy: Uint8Array;
    try {
      copy = await deps.videos.playable(original, row.playable_how, row.duration_ms ?? 0);
    } catch (error) {
      await failed(error instanceof Error ? error.message : String(error));
      return;
    }
    const sha256 = createHash("sha256").update(copy).digest("hex");
    await deps.blobs.put(sha256, copy);
    await deps.registry.playableMade(row.workspace_id, row.id, {
      state: "done",
      sha256,
      mimeType: "video/mp4",
    });
    const ms = deps.clock.nowMs() - started;
    deps.onMade?.({ id: row.id, state: "done", bytes: copy.byteLength, ms });
  }

  /**
   * Make every pending copy, one after another, and say how many. A call while the queue is being
   * worked joins that run rather than starting a second one beside it.
   */
  function drain(): Promise<number> {
    if (running !== undefined) return running;
    running = (async () => {
      let made = 0;
      try {
        while (await next()) made += 1;
      } finally {
        running = undefined;
      }
      return made;
    })();
    return running;
  }

  return { drain };
}

export type Playables = ReturnType<typeof createPlayables>;
