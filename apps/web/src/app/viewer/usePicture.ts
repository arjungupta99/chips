/**
 * What the stage draws for a photo, and where those bytes come from (the media viewer proposal,
 * §4.3; ADR 0058).
 *
 * Where the device reaches the server itself there is a grant: a URL the `<img>` fetches with
 * nothing else, so the browser's own loader draws it as it arrives rather than waiting on a blob
 * the page assembled. Where there is none — through the relay, or from a server from before
 * grants — the copy made for a viewer is fetched and shown through an object URL.
 *
 * Either way the answer says whether these are a copy or the photo itself: a grant names `file`
 * when the view resolved to the file, and `?variant=view` says `x-chips-view: original`. A view
 * that is the photo itself has no *Open original*, because it is already open.
 *
 * A lightbox left open past a grant's expiry asks once more with a fresh grant; then the bytes
 * themselves are fetched, since an `<img>` that will not load a URL does not say whether nothing
 * came or what came will not draw. A picture whose bytes are here and still will not draw (a
 * HEIC) says so, with Download. One that did not come says that, with why and Try again. Both
 * once said the browser could not show it, a connection that dropped among them (ADR 0179).
 */

import type { DeckItem } from "@chipschat/core";
import { useCallback, useEffect, useState } from "react";
import type { FileService } from "../files.ts";

/** Said when its bytes are here and the browser still will not draw them. */
export const CANNOT_DRAW = "This browser cannot show this picture. Download it to see it.";
/** Said when its bytes did not come: the connection or the server, not the browser. */
export const NOT_FETCHED = "Could not fetch the photo.";

/** What the stage says instead of a picture: what happened, why when known, and whether to ask again. */
export interface PictureProblem {
  readonly said: string;
  readonly under?: string | undefined;
  readonly retry: boolean;
}

export interface PictureSource {
  /** What to draw, once it is known. */
  readonly src: string | undefined;
  /** The photo itself rather than a copy made for a viewer. */
  readonly original: boolean;
  /** Said on the stage when there is nothing to draw. */
  readonly problem: PictureProblem | undefined;
  /** The `<img>` would not load it: a fresh grant, then the bytes, then say it cannot be drawn. */
  readonly failed: () => void;
  /** Ask again after the bytes did not come. */
  readonly tryAgain: () => void;
}

export function usePicture(
  files: FileService,
  item: DeckItem | undefined,
  /** *Open original* is on: the file as it was sent, not the copy. */
  wantOriginal: boolean,
): PictureSource {
  const id = item?.attachment.id;
  // What was asked for, so what came back for something else is nobody's: paging, or *Open
  // original*, makes what is held here stale by that fact rather than by an effect that clears it.
  const asked = `${id ?? ""}:${wantOriginal ? "original" : "view"}`;
  const [found, setFound] = useState<
    { for: string; src: string; original: boolean; here: boolean } | undefined
  >(undefined);
  const [tries, setTries] = useState<{ for: string; count: number }>({ for: asked, count: 0 });
  const [problem, setProblem] = useState<({ for: string } & PictureProblem) | undefined>(undefined);
  const count = tries.for === asked ? tries.count : 0;

  useEffect(() => {
    if (item === undefined) return;
    let live = true;
    // `here`: the bytes are in this page, so an `<img>` that will not load them cannot draw them.
    const load = async (): Promise<{ src: string; original: boolean; here: boolean }> => {
      if (wantOriginal) {
        return { src: await files.file(item.attachment.id), original: true, here: true };
      }
      // A fresh grant on the second try: the first may have expired under an open lightbox.
      if (count < 2) {
        const grant = await files.stream(item.attachment.id, "view", count > 0);
        if (grant !== undefined) {
          return { src: grant.url, original: grant.variant === "file", here: false };
        }
      }
      const viewed = await files.view(item.attachment);
      return { src: viewed.url, original: viewed.original, here: true };
    };
    load().then(
      (source) => {
        if (live) setFound({ for: asked, ...source });
      },
      (error: unknown) => {
        const under = error instanceof Error && error.message !== "" ? error.message : undefined;
        if (live) setProblem({ for: asked, said: NOT_FETCHED, under, retry: true });
      },
    );
    return () => {
      live = false;
    };
  }, [files, item, asked, count, wantOriginal]);

  const mine = found?.for === asked ? found : undefined;
  const here = mine?.here === true;
  const failed = useCallback(() => {
    if (here) setProblem({ for: asked, said: CANNOT_DRAW, retry: false });
    else setTries({ for: asked, count: count + 1 });
  }, [asked, count, here]);
  const tryAgain = useCallback(() => {
    setProblem(undefined);
    setTries({ for: asked, count: count + 1 });
  }, [asked, count]);

  const said = problem?.for === asked ? problem : undefined;
  return {
    src: mine?.src,
    original: mine?.original ?? false,
    problem:
      said === undefined ? undefined : { said: said.said, under: said.under, retry: said.retry },
    failed,
    tryAgain,
  };
}

/**
 * The neighbours are fetched ahead of the swipe, and the rest never (rule 6). A grant's URL handed
 * to `new Image()` is the browser's own cache filling, so the picture is already there when the
 * swipe lands; where there is no grant the copy is not prefetched, since a blob the page holds is
 * memory spent on something that may never be looked at.
 */
export function useNeighbours(files: FileService, deck: readonly DeckItem[], index: number): void {
  useEffect(() => {
    let cancelled = false;
    for (const at of [index - 1, index + 1]) {
      const near = deck[at];
      if (near === undefined || near.kind !== "photo") continue;
      void files
        .stream(near.attachment.id, "view")
        .then((grant) => {
          if (cancelled || grant === undefined) return;
          const ahead = new Image();
          ahead.decoding = "async";
          ahead.src = grant.url;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [files, deck, index]);
}
