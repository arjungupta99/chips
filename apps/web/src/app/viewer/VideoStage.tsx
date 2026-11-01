/**
 * A video on the stage (the media viewer proposal, §4.3 and rule 7). It plays when landed on and
 * pauses when paged away from, which is Arjun's decision 2; on the web a browser allows sound on
 * autoplay only after a gesture on the page, and the click that opened the lightbox is one.
 *
 * It streams from a grant where the device reaches the server itself (ADR 0058) — a URL the
 * `<video>` fetches itself, asking for the runs it needs as it plays, so a two-minute clip starts
 * in about a second rather than arriving whole first. Through the relay, and from a server from
 * before grants, the whole copy is fetched into the page as it was before.
 *
 * The words are the phone's, so the two viewers say the same thing: the original is playing while
 * the copy that plays everywhere is being made; this browser cannot play the original; the copy is
 * being made, try again in a minute. *Try again* asks for a fresh grant, which names the copy once
 * there is one — and that same fresh ask is what a grant expired under an open lightbox needs.
 *
 * `§4.3` moves the in-row player here: `VideoCard`'s poster opens the viewer now, and the row keeps
 * its Download.
 */

import type { DeckItem, Rect, Size } from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileService } from "../files.ts";

/** The phone's words, so the two viewers say the same thing (`apps/mobile/src/media`). */
const MAKING_COPY = "Playing the original · the copy that plays everywhere is being made";
const CANNOT_PLAY = "This browser cannot play the original.";
const COPY_COMING = "The copy that plays everywhere is being made. Try again in a minute.";
const WOULD_NOT_PLAY = "This video came, but would not play here.";
/** Said when the video did not come at all: the connection or the server, not the browser. */
const NOT_FETCHED = "Could not fetch the video.";

interface Source {
  readonly src: string;
  /** The copy that plays everywhere is still being made, so the original is what is playing. */
  readonly beingMade: boolean;
}

export function VideoStage({
  item,
  files,
  current,
  fitted,
  onPlaying,
  playRef,
  onMeasured,
}: {
  readonly item: DeckItem;
  readonly files: FileService;
  /** Whether the deck is standing on it: it plays when landed on, and pauses when it is left. */
  readonly current: boolean;
  readonly fitted: Rect;
  readonly onPlaying?: ((playing: boolean) => void) | undefined;
  /** The Space key, and the chrome's play button, reach the element through this. */
  readonly playRef?: React.RefObject<{ toggle: () => void } | null> | undefined;
  readonly onMeasured?: ((size: Size) => void) | undefined;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [poster, setPoster] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<Source | undefined>(undefined);
  const [problem, setProblem] = useState<{ said: string; under?: string } | undefined>(undefined);
  const [tries, setTries] = useState(0);
  const id = item.attachment.id;

  useEffect(() => {
    let live = true;
    files.thumb(id).then(
      (url) => {
        if (live) setPoster(url);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [files, id]);

  // Only the video being stood on is fetched: a neighbour is its poster until it is landed on.
  useEffect(() => {
    if (!current) return;
    let live = true;
    setProblem(undefined);
    const load = async (): Promise<Source> => {
      const grant = await files.stream(id, "play", tries > 0);
      if (grant !== undefined) return { src: grant.url, beingMade: grant.playable === "pending" };
      return { src: await files.play(id), beingMade: false };
    };
    load().then(
      (found) => {
        if (live) setSource(found);
      },
      (error: unknown) => {
        const under = error instanceof Error && error.message !== "" ? error.message : undefined;
        if (live) setProblem({ said: NOT_FETCHED, ...(under === undefined ? {} : { under }) });
      },
    );
    return () => {
      live = false;
    };
  }, [files, id, current, tries]);

  // Landed on it plays; left, it pauses. The start waits for the element, as the phone's does.
  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    if (current && source !== undefined) void element.play().catch(() => {});
    else element.pause();
  }, [current, source]);

  const tryAgain = useCallback(() => {
    setProblem(undefined);
    setSource(undefined);
    setTries((was) => was + 1);
  }, []);

  useEffect(() => {
    if (playRef === undefined) return;
    playRef.current = {
      toggle: () => {
        const element = video.current;
        if (element === null) return;
        if (element.paused) void element.play().catch(() => {});
        else element.pause();
      },
    };
    return () => {
      if (playRef.current !== null) playRef.current = null;
    };
  }, [playRef]);

  const failed = () => {
    // A grant that expired under an open lightbox is asked for again, once, before it says it
    // could not (Phase 4's departure, carried to the web).
    if (tries === 0) {
      tryAgain();
      return;
    }
    setProblem(
      source?.beingMade === true
        ? { said: CANNOT_PLAY, under: COPY_COMING }
        : { said: WOULD_NOT_PLAY },
    );
  };

  return (
    <div
      className="viewer-video"
      style={{
        left: `${fitted.x}px`,
        top: `${fitted.y}px`,
        width: `${fitted.width}px`,
        height: `${fitted.height}px`,
      }}
      data-testid={current ? "viewer-video" : undefined}
    >
      {(source === undefined || problem !== undefined) && poster !== undefined && (
        <img className="viewer-under" src={poster} alt="" aria-hidden="true" />
      )}
      {source !== undefined && problem === undefined && (
        // biome-ignore lint/a11y/useMediaCaption: a person's own recording has no captions to give.
        <video
          ref={video}
          className="viewer-player"
          src={source.src}
          poster={poster}
          controls
          playsInline
          data-testid="viewer-player"
          onPlay={() => onPlaying?.(true)}
          onPause={() => onPlaying?.(false)}
          onError={failed}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            if (onMeasured !== undefined && element.videoWidth > 0) {
              onMeasured({ width: element.videoWidth, height: element.videoHeight });
            }
          }}
        />
      )}
      {source?.beingMade === true && problem === undefined && (
        <p className="viewer-caption" data-testid="viewer-caption">
          {MAKING_COPY}
        </p>
      )}
      {problem !== undefined && (
        <div className="viewer-problem" role="alert" data-testid="viewer-problem">
          <p>{problem.said}</p>
          {problem.under !== undefined && <p>{problem.under}</p>}
          <button type="button" className="viewer-retry" onClick={tryAgain}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
