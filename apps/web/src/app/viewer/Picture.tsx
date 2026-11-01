/**
 * One photo on the stage (the media viewer proposal, §4.3). The thumbnail the room already has is
 * drawn underneath until the bigger picture loads, so the stage is never black while bytes are on
 * their way — which is fault 2 of §1, on the phone and here.
 *
 * Zoom is a CSS transform on the fitted box, so the browser samples the whole bitmap and a zoomed
 * photo is sharp without a second decode.
 */

import type { DeckItem, Point, Rect, Size } from "@chipschat/core";
import { useEffect, useState } from "react";
import type { FileService } from "../files.ts";
import type { PictureSource } from "./usePicture.ts";

export function Picture({
  item,
  files,
  fitted,
  stage,
  zoom,
  source,
  onMeasured,
  imageRef,
}: {
  readonly item: DeckItem;
  readonly files: FileService;
  /** Where it stands on the stage; a neighbour is drawn at the stage's own middle. */
  readonly fitted: Rect | undefined;
  readonly stage: Size;
  readonly zoom:
    | { readonly scale: number; readonly translate: Point; readonly settling: boolean }
    | undefined;
  /** What to draw, for the current item; a neighbour is its thumbnail alone until it is landed on. */
  readonly source?: PictureSource | undefined;
  /** A photo the server never measured: the browser knows its size once it has drawn it. */
  readonly onMeasured?: ((size: Size) => void) | undefined;
  /** The element itself, for Copy image and for the picture the return animation flies. */
  readonly imageRef?: React.RefObject<HTMLImageElement | null> | undefined;
}) {
  const [thumb, setThumb] = useState<string | undefined>(undefined);
  // Which source has finished loading, rather than a flag: a new source is by that fact not
  // loaded, so the thumbnail comes back underneath without an effect to put it there.
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(undefined);
  const loaded = source?.src !== undefined && loadedSrc === source.src;
  const id = item.attachment.id;

  useEffect(() => {
    let live = true;
    files.thumb(id).then(
      (url) => {
        if (live) setThumb(url);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [files, id]);

  const box: Rect = fitted ?? {
    x: 0,
    y: 0,
    width: stage.width,
    height: stage.height,
  };
  const transform =
    zoom === undefined
      ? undefined
      : `translate(${zoom.translate.x}px, ${zoom.translate.y}px) scale(${zoom.scale})`;

  return (
    <div
      className="viewer-picture"
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        ...(transform === undefined ? {} : { transform }),
        ...(zoom?.settling === true
          ? { transition: "transform var(--motion-slow) var(--ease)" }
          : {}),
      }}
    >
      {thumb !== undefined && !loaded && (
        <img className="viewer-under" src={thumb} alt="" aria-hidden="true" />
      )}
      {source?.src !== undefined && source.problem === undefined && (
        <img
          className="viewer-image"
          ref={imageRef}
          src={source.src}
          alt={item.attachment.filename}
          decoding="async"
          data-testid="viewer-image"
          data-loaded={loaded ? "yes" : "no"}
          onLoad={(event) => {
            setLoadedSrc(source.src);
            const image = event.currentTarget;
            if (onMeasured !== undefined && image.naturalWidth > 0) {
              onMeasured({ width: image.naturalWidth, height: image.naturalHeight });
            }
          }}
          onError={() => source.failed()}
        />
      )}
      {source?.problem !== undefined && (
        <div className="viewer-problem" role="alert" data-testid="viewer-problem">
          <p>{source.problem.said}</p>
          {source.problem.under !== undefined && <p>{source.problem.under}</p>}
          {source.problem.retry && (
            <button type="button" className="viewer-retry" onClick={source.tryAgain}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
