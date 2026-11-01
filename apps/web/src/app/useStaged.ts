/**
 * What the composer is about to send along with its text: files chosen, pasted or dropped,
 * each uploading the moment it arrives so the send itself is instant. A photo's location is
 * stripped unless the person keeps it; turning that on re-uploads the photos already staged,
 * since the server decided what to keep when it stored them.
 *
 * A file over the workspace's cap for its kind (ADR 0047) is staged as failed, with the sentence
 * the server would have used, and never uploaded: the chip says why, and the × takes it out.
 * The server's own ceiling is judged there, at the slot, before any bytes go.
 */

import { type Attachment, kindOf } from "@chipschat/core";
import { type AttachmentCaps, kindFromName, NO_CAPS, sizeRefusal } from "@chipschat/protocol";
import { useCallback, useRef, useState } from "react";
import type { FileService } from "./files.ts";

export interface Staged {
  readonly localId: string;
  readonly file: File;
  readonly status: "uploading" | "ready" | "failed";
  /** How much of it the server holds, from nought to one, while it is uploading. */
  readonly progress?: number | undefined;
  readonly attachment?: Attachment | undefined;
  readonly error?: string | undefined;
}

export interface StagedFiles {
  readonly staged: readonly Staged[];
  readonly keepLocation: boolean;
  readonly add: (files: Iterable<File>) => void;
  readonly remove: (localId: string) => void;
  readonly setKeepLocation: (keep: boolean) => void;
  /** The attachments ready to go, and a fresh start for the next message. */
  readonly take: () => Attachment[];
}

let counter = 0;

/** A photo or a video: what the server strips of where it was taken unless the person keeps it. */
export const carriesLocation = (file: File) =>
  file.type.startsWith("image/") || file.type.startsWith("video/");

/** Why this file may not be sent here, before a byte of it goes; nothing when it may. */
function refusalFor(file: File, caps: AttachmentCaps): string | undefined {
  const kind = file.type === "" ? kindFromName(file.name) : kindOf(file.type);
  return sizeRefusal(caps, kind, file.size, Number.POSITIVE_INFINITY);
}

export function useStaged(files: FileService, caps: AttachmentCaps = NO_CAPS): StagedFiles {
  const [staged, setStaged] = useState<readonly Staged[]>([]);
  const [keepLocation, setKeep] = useState(false);
  const keep = useRef(false);

  const patch = useCallback(
    (localId: string, change: Partial<Staged>) =>
      setStaged((list) =>
        list.map((item) => (item.localId === localId ? { ...item, ...change } : item)),
      ),
    [],
  );

  const upload = useCallback(
    (item: Staged) => {
      patch(item.localId, {
        status: "uploading",
        progress: undefined,
        attachment: undefined,
        error: undefined,
      });
      const onProgress = (sent: number, total: number) =>
        patch(item.localId, { progress: total === 0 ? 1 : sent / total });
      files.upload(item.file, keep.current, onProgress).then(
        (attachment) => patch(item.localId, { status: "ready", attachment }),
        (error: unknown) =>
          patch(item.localId, {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    },
    [files, patch],
  );

  const add = useCallback(
    (chosen: Iterable<File>) => {
      const items: Staged[] = [...chosen].map((file) => {
        counter += 1;
        const error = refusalFor(file, caps);
        return error === undefined
          ? { localId: `f${counter}`, file, status: "uploading" }
          : { localId: `f${counter}`, file, status: "failed", error };
      });
      if (items.length === 0) return;
      setStaged((list) => [...list, ...items]);
      for (const item of items) if (item.status === "uploading") upload(item);
    },
    [upload, caps],
  );

  const setKeepLocation = useCallback(
    (value: boolean) => {
      keep.current = value;
      setKeep(value);
      setStaged((list) => {
        for (const item of list) {
          if (carriesLocation(item.file) && refusalFor(item.file, caps) === undefined) {
            upload(item);
          }
        }
        return list;
      });
    },
    [upload, caps],
  );

  return {
    staged,
    keepLocation,
    add,
    remove: (localId) => setStaged((list) => list.filter((item) => item.localId !== localId)),
    setKeepLocation,
    take: () => {
      const ready = staged.flatMap((item) =>
        item.attachment === undefined ? [] : [item.attachment],
      );
      setStaged([]);
      return ready;
    },
  };
}
