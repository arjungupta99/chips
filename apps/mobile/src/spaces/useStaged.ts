/**
 * What the composer is about to send along with its words: files picked on this phone, each
 * uploading the moment it is picked so the send itself is instant. The desktop's `useStaged`,
 * over what a phone's picker gives rather than a browser's `File`.
 *
 * A file over the workspace's cap for its kind (ADR 0047) is staged as failed, with the sentence
 * the server would have used, and never uploaded — the chip says why, and the × takes it out.
 * The server's own ceiling is judged there, at the slot, before any bytes go.
 */

import { type Attachment, kindOf } from "@chipschat/core";
import { type AttachmentCaps, NO_CAPS } from "@chipschat/protocol";
import { Image, type ImageRef } from "expo-image";
import { useCallback, useState } from "react";
import { thisDevice } from "../device/word";
import type { FileService } from "./files";
import { type Picked, refusalFor } from "./picked";

export interface Staged {
  readonly localId: string;
  readonly picked: Picked;
  readonly status: "uploading" | "ready" | "failed";
  /** How much of it the server holds, from nought to one, while it is uploading. */
  readonly progress?: number | undefined;
  readonly attachment?: Attachment | undefined;
  /**
   * A photo's thumbnail as the room will draw it, kept on this phone: fetched the moment the
   * upload is in, so the send flies the picture the tile shows and not the file the picker gave
   * (`SendFlight.tsx`). Nothing until it has come, or for anything but a photo.
   */
  readonly thumbUri?: string | undefined;
  /**
   * That thumbnail decoded, held here rather than by any view: the copy a send flies draws it in
   * its first frame. Drawn from a file, the copy showed nothing for a frame as the chip went (the
   * simulator, 4 October 2026), however warm the file was; a decoded picture is drawn as it is
   * handed over. Held here because the chip that showed it is gone the moment the copy needs it.
   */
  readonly picture?: ImageRef | undefined;
  readonly error?: string | undefined;
  /** Failed by the workspace's cap rather than by the network: trying again changes nothing. */
  readonly refused?: true | undefined;
}

export interface StagedFiles {
  readonly staged: readonly Staged[];
  readonly add: (picked: readonly Picked[]) => void;
  readonly remove: (localId: string) => void;
  /** Try a failed upload again. */
  readonly retry: (localId: string) => void;
  /** The attachments ready to go, and a fresh start for the next message. */
  readonly take: () => Attachment[];
}

let counter = 0;

/** As wide as a decoded thumbnail is kept: a tile's width, at the phone's scale, and some. */
const DECODED_WIDE = 1024;

/** A picture decoded ahead of being drawn; nothing where that cannot be done. */
function decoded(uri: string): Promise<ImageRef | undefined> {
  try {
    return Promise.resolve(Image.loadAsync(uri, { maxWidth: DECODED_WIDE })).then(
      (picture) => picture ?? undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve(undefined);
  }
}

export function useStaged(
  files: FileService | undefined,
  caps: AttachmentCaps = NO_CAPS,
): StagedFiles {
  const [staged, setStaged] = useState<readonly Staged[]>([]);

  const patch = useCallback(
    (localId: string, change: Partial<Staged>) =>
      setStaged((list) =>
        list.map((item) => (item.localId === localId ? { ...item, ...change } : item)),
      ),
    [],
  );

  const upload = useCallback(
    (item: Staged) => {
      if (files === undefined) {
        patch(item.localId, { status: "failed", error: `${thisDevice(true)} is not paired.` });
        return;
      }
      patch(item.localId, {
        status: "uploading",
        progress: undefined,
        attachment: undefined,
        thumbUri: undefined,
        picture: undefined,
        error: undefined,
      });
      const onProgress = (sent: number, total: number) =>
        patch(item.localId, { progress: total === 0 ? 1 : sent / total });
      files.upload(item.picked, onProgress).then(
        (attachment) => {
          patch(item.localId, { status: "ready", attachment });
          // The room fetches a photo's thumbnail once per attachment for the life of the app
          // (`files.ts`); fetching it now is the same fetch, before the send rather than after.
          // One that will not come leaves the chip's own picture to fly.
          if (kindOf(item.picked.mimeType) !== "image") return;
          files.thumb(attachment.id).then(
            (thumbUri) => {
              patch(item.localId, { thumbUri });
              void decoded(thumbUri).then((picture) => {
                if (picture !== undefined) patch(item.localId, { picture });
              });
            },
            () => undefined,
          );
        },
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
    (chosen: readonly Picked[]) => {
      const items: Staged[] = chosen.map((picked) => {
        counter += 1;
        const error = refusalFor(picked, caps);
        return error === undefined
          ? { localId: `f${counter}`, picked, status: "uploading" }
          : { localId: `f${counter}`, picked, status: "failed", error, refused: true };
      });
      if (items.length === 0) return;
      setStaged((list) => [...list, ...items]);
      for (const item of items) if (item.status === "uploading") upload(item);
    },
    [upload, caps],
  );

  return {
    staged,
    add,
    remove: (localId) => setStaged((list) => list.filter((item) => item.localId !== localId)),
    retry: (localId) => {
      const item = staged.find((each) => each.localId === localId);
      if (item !== undefined && refusalFor(item.picked, caps) === undefined) upload(item);
    },
    take: () => {
      const ready = staged.flatMap((item) =>
        item.attachment === undefined ? [] : [item.attachment],
      );
      setStaged([]);
      return ready;
    },
  };
}
