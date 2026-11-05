/**
 * Files on a message (decision 10). Photos and the videos the server measured are one album, in
 * the order the message listed them (decision 7 of the media viewer proposal, 16 September 2026):
 * a grid of up to four with `+N` on the fourth, a video's tile its poster, a play mark and how long
 * it runs. Every tile opens the media viewer (ADR 0057), which has Download. A video the server
 * never measured is a card with no poster, which opens the viewer on it alone and keeps its
 * Download; a voice note is Play, its length and what was said, as the server wrote it down
 * (ADR 0054); anything else is a card with the name, the kind and the size, and a PDF shows its
 * first page. A file downloads; a page a harness sent opens in a frame that reaches nothing (ADR
 * 0100), never on the app's own origin; a PDF opens in the same dialog, drawn by the browser's own
 * viewer (ADR 0125).
 *
 * Until 16 September 2026 a photo's click was `window.open` on the object URL: in a browser a
 * second tab at a blob, and in the desktop shell nothing at all, since a WKWebView opens no
 * window the shell has not been asked for (§1.6, verified that day). Until Phase 7 a measured
 * video was a card under the grid, its poster above a Download, so a message with photos and a
 * clip was two things in the room and one in the viewer.
 */

import {
  type Attachment,
  aloneTile,
  formatBytes,
  formatDuration,
  inAlbum,
  isPdf,
  isVoiceNoteName,
  kindOf,
} from "@chipschat/core";
import { AttachmentChip, Icon } from "@chipschat/ui";
import { useEffect, useState } from "react";
import type { FileService } from "./files.ts";
import { opensInView, PageView } from "./PageView.tsx";
import { download } from "./viewer/actions.ts";
import { useViewer } from "./viewer/useViewer.ts";

export const GRID_MAX = 4;

export function Attachments({
  attachments,
  files,
  lineId,
}: {
  readonly attachments: readonly Attachment[];
  readonly files: FileService;
  /** The line these hang under: what the viewer's deck is built around, and *Open message* lands on. */
  readonly lineId: string;
}) {
  const album = attachments.filter(inAlbum);
  const others = attachments.filter((attachment) => !inAlbum(attachment));
  return (
    <>
      {album.length > 0 && (
        <div
          className="photo-grid"
          data-count={Math.min(album.length, GRID_MAX)}
          data-testid="photo-grid"
        >
          {album.slice(0, GRID_MAX).map((item, index) => (
            <Tile
              key={item.id}
              attachment={item}
              files={files}
              lineId={lineId}
              more={index === GRID_MAX - 1 ? album.length - GRID_MAX : 0}
              alone={album.length === 1}
            />
          ))}
        </div>
      )}
      {others.map((file) => {
        const kind = kindOf(file.mimeType);
        if (kind === "video")
          return <VideoCard key={file.id} attachment={file} files={files} lineId={lineId} />;
        if (kind === "audio") return <VoiceCard key={file.id} attachment={file} files={files} />;
        return <FileCard key={file.id} attachment={file} files={files} />;
      })}
    </>
  );
}

/** An object URL once it is loaded, or nothing while it is on its way or if it failed. */
function useObjectUrl(load: () => Promise<string>, enabled = true): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then(
      (loaded) => {
        if (live) setUrl(loaded);
      },
      () => {
        if (live) setUrl(undefined);
      },
    );
    return () => {
      live = false;
    };
  }, [load, enabled]);
  return url;
}

/**
 * One tile of the album: a photo's thumbnail, or a measured video's poster with a play mark and how
 * long it runs, opening the viewer on it from where it stands. A tile alone is the phone's size for
 * one (core's `aloneTile`), said before its picture comes, so the row is as tall from its first frame
 * as it will be; the picture fades up over its ground once it is decoded (ADR 0268 addendum). Until
 * 3 November a tile alone stood as tall as its picture, up to 360, and the row grew a frame after
 * the room opened.
 */
function Tile({
  attachment,
  files,
  lineId,
  more,
  alone,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
  readonly lineId: string;
  /** How many more there are than the grid shows, on the last tile. */
  readonly more: number;
  /** The album's only tile. */
  readonly alone: boolean;
}) {
  const [load] = useState(() => () => files.thumb(attachment.id));
  const url = useObjectUrl(load);
  const [decoded, setDecoded] = useState(false);
  const viewer = useViewer();
  const video = kindOf(attachment.mimeType) === "video";
  return (
    <button
      type="button"
      className="photo"
      data-kind={video ? "video" : "photo"}
      style={alone ? { ...aloneTile(attachment), maxWidth: "100%" } : undefined}
      ref={(element) => viewer.registerTile(attachment.id, element)}
      onClick={() => viewer.open({ attachmentId: attachment.id, lineId })}
      aria-label={`${video ? "Play" : "Open"} ${attachment.filename}`}
      data-testid={video ? "video-tile" : "photo"}
    >
      {url !== undefined && (
        <img
          src={url}
          alt={video ? "" : attachment.filename}
          data-decoded={decoded}
          onLoad={() => setDecoded(true)}
        />
      )}
      {video && (
        <>
          <span className="video-play" aria-hidden="true">
            ▶
          </span>
          {attachment.durationMs !== undefined && (
            <span className="video-duration">{formatDuration(attachment.durationMs)}</span>
          )}
        </>
      )}
      {more > 0 && <span className="photo-more">+{more}</span>}
    </button>
  );
}

/**
 * A video the server never measured: no poster and no length to show, and in no room's deck, so
 * its card opens the viewer on it alone (core's `deckOfOne`, as the phone's row does) — §4.3, which
 * moved the in-row player onto the viewer's stage. The card keeps its Download, which is the file
 * as it was sent. A measured video is a tile of the album instead.
 */
function VideoCard({
  attachment,
  files,
  lineId,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
  readonly lineId: string;
}) {
  const viewer = useViewer();
  const shape =
    attachment.width !== undefined && attachment.height !== undefined
      ? { aspectRatio: `${attachment.width} / ${attachment.height}` }
      : undefined;
  return (
    <div className="video-card" data-testid="video-card">
      <button
        type="button"
        className="video-poster"
        style={shape}
        ref={(element) => viewer.registerTile(attachment.id, element)}
        onClick={() => viewer.openOne({ attachmentId: attachment.id, lineId })}
        aria-label={`Play ${attachment.filename}`}
      >
        <span className="video-play" aria-hidden="true">
          ▶
        </span>
      </button>
      <button
        type="button"
        className="file-card-open"
        onClick={() => void download(files, attachment)}
        aria-label={`Download ${attachment.filename}`}
      >
        <AttachmentChip
          name={attachment.filename}
          meta={formatBytes(attachment.byteSize)}
          kind="video"
        />
      </button>
    </div>
  );
}

/**
 * A voice note (ADR 0054): Play, what it is and how long it runs, and under them what was said —
 * the words are what a glance at a room wants. The sound is fetched when Play is pressed, not when
 * the room is drawn, and then it is the browser's own player.
 */
function VoiceCard({
  attachment,
  files,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
}) {
  const [source, setSource] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const title = isVoiceNoteName(attachment.filename) ? "Voice note" : attachment.filename;
  const play = async () => {
    setProblem(undefined);
    try {
      setSource(await files.file(attachment.id));
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return (
    <div className="voice-card" data-testid="voice-card">
      {source === undefined ? (
        <div className="voice-row">
          <button
            type="button"
            className="voice-play"
            onClick={() => void play()}
            aria-label={`Play ${title}`}
          >
            <Icon name="play" size={14} />
          </button>
          <span className="voice-title">{title}</span>
          {attachment.durationMs !== undefined && (
            <span className="voice-duration">{formatDuration(attachment.durationMs)}</span>
          )}
        </div>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: what was said is written out under the player.
        <audio
          className="voice-player"
          src={source}
          controls
          autoPlay
          onError={() =>
            setProblem("This browser cannot play this voice note. Download it to hear it.")
          }
          data-testid="voice-player"
        />
      )}
      {attachment.transcript !== undefined && (
        <p className="voice-transcript" data-testid="voice-transcript">
          {attachment.transcript}
        </p>
      )}
      {problem !== undefined && (
        <p className="video-problem" role="alert">
          {problem}
        </p>
      )}
      <button
        type="button"
        className="file-card-open"
        onClick={() => void download(files, attachment)}
        aria-label={`Download ${attachment.filename}`}
      >
        <AttachmentChip
          name={attachment.filename}
          meta={formatBytes(attachment.byteSize)}
          kind="audio"
        />
      </button>
    </div>
  );
}

/**
 * Any other file: its name, its kind and its size, a PDF's first page over them, and a click that
 * downloads it — or, for a page a harness sent or a PDF, opens it in the page view (ADR 0100, ADR
 * 0125), which has Download.
 */
function FileCard({
  attachment,
  files,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
}) {
  const pdf = isPdf(attachment.mimeType);
  const [load] = useState(() => () => files.file(attachment.id));
  const url = useObjectUrl(load, pdf);
  const [reading, setReading] = useState(false);
  const page = opensInView(attachment);
  return (
    <div className="file-card" data-testid="file-card" data-kind={kindOf(attachment.mimeType)}>
      {pdf && url !== undefined && (
        <object
          className="pdf-preview"
          data={`${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          type="application/pdf"
          aria-label={`First page of ${attachment.filename}`}
          data-testid="pdf-preview"
        />
      )}
      <button
        type="button"
        className="file-card-open"
        onClick={() => (page ? setReading(true) : void download(files, attachment))}
        aria-label={`${page ? "Open" : "Download"} ${attachment.filename}`}
      >
        <AttachmentChip
          name={attachment.filename}
          meta={formatBytes(attachment.byteSize)}
          kind={kindOf(attachment.mimeType)}
        />
      </button>
      {reading && (
        <PageView attachment={attachment} files={files} onClose={() => setReading(false)} />
      )}
    </div>
  );
}
