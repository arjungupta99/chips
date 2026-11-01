/**
 * The filmstrip under the picture (the media viewer proposal, §4.3; Arjun, decision 8, 16
 * September 2026: on where there is room, off while zoomed).
 *
 * 56-pixel thumbnails of the deck, the current one ringed in gold — the brand's selection colour,
 * as `Flash` uses it, and never a status. It scrolls to keep the current one centred. Under 900
 * pixels of width it is not drawn at all, which is the stylesheet's doing rather than this
 * component's, and it goes while the picture is zoomed so the stage is the picture's.
 *
 * Each thumb is a button: a pointer clicks one to go there, and a screen reader is offered the
 * deck as a list of places to go rather than a strip of pictures.
 */

import type { DeckItem } from "@chipschat/core";
import { useEffect, useRef } from "react";
import type { FileService } from "../files.ts";
import { useThumb } from "./useThumb.ts";

export function Filmstrip({
  deck,
  index,
  files,
  onGo,
}: {
  readonly deck: readonly DeckItem[];
  readonly index: number;
  readonly files: FileService;
  readonly onGo: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);

  // Keep the current one in the middle, as the deck moves. `nearest` on the block, so the page
  // behind never scrolls to bring a thumb into view.
  const standingOn = deck[index]?.attachment.id;
  useEffect(() => {
    if (standingOn === undefined) return;
    current.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [standingOn]);

  if (deck.length < 2) return null;
  return (
    <div className="viewer-filmstrip" ref={strip} data-testid="viewer-filmstrip">
      <ul>
        {deck.map((item, at) => (
          <li key={item.attachment.id}>
            <Thumb
              item={item}
              files={files}
              at={at}
              of={deck.length}
              current={at === index}
              buttonRef={at === index ? current : undefined}
              onGo={onGo}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thumb({
  item,
  files,
  at,
  of,
  current,
  buttonRef,
  onGo,
}: {
  readonly item: DeckItem;
  readonly files: FileService;
  readonly at: number;
  readonly of: number;
  readonly current: boolean;
  readonly buttonRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  readonly onGo: (index: number) => void;
}) {
  const url = useThumb(files, item.attachment.id);
  return (
    <button
      type="button"
      ref={buttonRef}
      className="viewer-thumb"
      data-current={current ? "yes" : "no"}
      aria-current={current ? "true" : undefined}
      aria-label={`${item.kind === "video" ? "Video" : "Photo"} ${at + 1} of ${of}, ${item.attachment.filename}`}
      onClick={() => onGo(at)}
    >
      {url === undefined ? (
        <span className="viewer-thumb-waiting" />
      ) : (
        <img src={url} alt="" aria-hidden="true" />
      )}
      {item.kind === "video" && (
        <span className="viewer-thumb-play" aria-hidden="true">
          ▶
        </span>
      )}
    </button>
  );
}
