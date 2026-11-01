/**
 * Media & files, a page of the room's sheet (ADR 0202, and its addendum for the desktop). The Media
 * & files card on the first page turns to it; it takes the place of the Files page.
 *
 * - **Media** first: the newest eight things the room's lines carry, four to a row, photos and
 *   videos as their pictures, a voice note and a document by their marks (core's `newestFilesOf`).
 *   A photo or a video opens the viewer on the room's every photo and video, newest first as the
 *   page lists them (core's `newestDeckOf`); a page opens in the page view; anything else is
 *   saved, as Files does (ADR 0100). *See all*, and the eighth square when there are more, unfold
 *   the rest here: the phone's go to the space's own Media (ADR 0165), which the desktop has not
 *   got.
 * - **Files** under it: the room's files at their current version, as the Files page listed them,
 *   each opening the same way and unfolding its versions (`RoomFiles.tsx`).
 *
 * One scroll for the page, so a room with many files reaches them under its pictures.
 */

import {
  type CarriedFile,
  type Directory,
  inAlbum,
  indexOfItem,
  type Lane,
  newestDeckOf,
  newestFilesOf,
  type Space,
} from "@chipschat/core";
import { useState } from "react";
import type { FileService } from "../files.ts";
import { opensInView, PageView } from "../PageView.tsx";
import { RoomFiles, type RoomFilesRead } from "../RoomFiles.tsx";
import { clockOrDay } from "../time.ts";
import { download } from "../viewer/actions.ts";
import { useViewer } from "../viewer/useViewer.ts";
import { Back, Chev } from "./parts.tsx";
import { MediaThumb, Section } from "./RoomTiles.tsx";

/** How many of the newest things the page shows before See all. */
export const PAGE_MEDIA = 8;

export function MediaFilesPage(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
  readonly read: RoomFilesRead;
  readonly onBack: () => void;
}) {
  const { space, lanes, directory, files, read } = props;
  const media = newestFilesOf(space, lanes);
  const [all, setAll] = useState(false);
  const [reading, setReading] = useState<CarriedFile | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const viewer = useViewer();
  const more = all ? 0 : Math.max(0, media.length - PAGE_MEDIA);

  // A photo or a video in the viewer, on the room's every one, newest first as the page lists
  // them, so the arrows go on through the rest in its order (core's `newestDeckOf`); a page in the
  // page view; anything else saved, or why it would not be.
  const open = async (item: CarriedFile) => {
    setFailed(undefined);
    const { attachment } = item;
    if (opensInView(attachment)) {
      setReading(item);
      return;
    }
    if (inAlbum(attachment)) {
      const deck = newestDeckOf(space, lanes, directory);
      if (indexOfItem(deck, attachment.id) !== -1) {
        viewer.openDeck(deck, attachment.id);
        return;
      }
    }
    try {
      await download(files, attachment);
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <>
      <Back
        titleId={props.titleId}
        title="Media & files"
        onBack={props.onBack}
        testId="room-media-back"
      />
      <div className="sheet-scroll" data-testid="room-media-page">
        <Section
          name="Media"
          count={media.length}
          trailing={
            more > 0 && (
              <button
                type="button"
                className="sheet-see-all"
                onClick={() => setAll(true)}
                aria-label="See all media"
                data-testid="room-media-all"
              >
                See all
                <Chev />
              </button>
            )
          }
        />
        {media.length === 0 ? (
          <p className="sheet-none">Nothing has been sent here yet.</p>
        ) : (
          <MediaGrid
            media={all ? media : media.slice(0, PAGE_MEDIA)}
            files={files}
            more={more}
            onOpen={(item) => void open(item)}
            onAll={() => setAll(true)}
          />
        )}
        {failed !== undefined && (
          <p className="sheet-none sheet-none-failed" role="alert" data-testid="room-media-failed">
            {failed}
          </p>
        )}
        <Section name="Files" count={read.listed?.length} />
        {(read.listed === undefined || read.listed.length === 0) && (
          <p className="sheet-none">
            {read.listed === undefined ? "Reading the space's files…" : "No files yet."}
          </p>
        )}
        <RoomFiles read={read} directory={directory} selfId={props.selfId} files={files} />
      </div>
      {reading !== undefined && (
        <PageView
          attachment={reading.attachment}
          files={files}
          said={clockOrDay(reading.ts)}
          onClose={() => setReading(undefined)}
        />
      )}
    </>
  );
}

/** The squares, four to a row; the last, when there are more, says how many and unfolds them. */
function MediaGrid(props: {
  readonly media: readonly CarriedFile[];
  readonly files: FileService;
  readonly more: number;
  readonly onOpen: (item: CarriedFile) => void;
  readonly onAll: () => void;
}) {
  const last = props.media.at(-1)?.attachment.id;
  return (
    <div className="sheet-media-grid" data-testid="room-media">
      {props.media.map((item) => {
        const { attachment } = item;
        const over = props.more > 0 && attachment.id === last;
        return (
          <button
            key={attachment.id}
            type="button"
            className="sheet-media-cell"
            onClick={() => (over ? props.onAll() : props.onOpen(item))}
            aria-label={over ? `See all media, ${props.more} more` : `Open ${attachment.filename}`}
            data-testid={over ? "room-media-more" : `room-media-${attachment.id}`}
          >
            <MediaThumb item={item} files={props.files} />
            {over && (
              <span
                className="sheet-media-more"
                data-over={inAlbum(attachment) ? "true" : undefined}
              >
                +{props.more}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
