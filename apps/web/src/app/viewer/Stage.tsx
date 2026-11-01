/**
 * The stage: the picture or the video, fitted, and every gesture that moves it (the media viewer
 * proposal, §4.3 and §4.6). One surface over the deck, as the phone has one detector over the
 * current item, on core's arithmetic — `fitRect`, `zoomLimits`, `clampPan`, `rubberBand`,
 * `snapPage`, `dismissProgress` and `dismissDecision` — so the web and the phone cannot disagree
 * about when a swipe pages or a drag closes.
 *
 * The gestures themselves are `gestures.ts`'s: the pointer's and, through the same events, a
 * finger's. What is here is the pager — each item at its own page, one offset carrying them all,
 * with only the current one and its neighbours mounted, as the phone's does.
 *
 * The stage is `touch-action: none` and the dialog `overscroll-behavior: none`, so a mobile
 * browser's own pull-to-refresh and edge swipes do not take the gesture away mid-drag.
 */

import {
  type Attachment,
  type DeckItem,
  dismissProgress,
  fitRect,
  type Point,
  type Rect,
  type Size,
  zoomLimits,
} from "@chipschat/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { FileService } from "../files.ts";
import { type StageHandle, useStageGestures } from "./gestures.ts";
import type { Frame } from "./open.ts";
import { Picture } from "./Picture.tsx";
import type { PictureSource } from "./usePicture.ts";
import { VideoStage } from "./VideoStage.tsx";

export type { StageHandle } from "./gestures.ts";

/** iOS Photos's gutter between pages (§4.6). */
const GUTTER = 20;

export interface StageProps {
  readonly deck: readonly DeckItem[];
  readonly index: number;
  readonly files: FileService;
  readonly onIndex: (index: number) => void;
  readonly onClose: () => void;
  /** A click on the picture hides and shows the chrome. */
  readonly onChrome: () => void;
  /** How far a dismiss drag has got, so the backdrop can clear and the room show behind. */
  readonly onDismissing: (progress: { backdrop: number; dragging: boolean }) => void;
  /** Whether the current picture is zoomed: the filmstrip hides while it is (decision 8). */
  readonly onZoomed: (zoomed: boolean) => void;
  /** Whether the current video is playing, for the chrome's auto-hide and the Space key. */
  readonly onPlaying?: ((playing: boolean) => void) | undefined;
  readonly playRef?: RefObject<{ toggle: () => void } | null> | undefined;
  readonly handle: RefObject<StageHandle | null>;
  /**
   * Told where the current picture stands, in the viewport's pixels, which is where the open
   * animation flies to and the return animation flies from.
   */
  readonly onFitted: (frame: Frame | undefined) => void;
  /** What to draw for the current photo; a neighbour is its thumbnail until it is landed on. */
  readonly source: PictureSource;
  /** The current picture's element, for Copy image and the return animation. */
  readonly imageRef?: RefObject<HTMLImageElement | null> | undefined;
}

/** The natural size of an item, where the server measured it. */
function naturalOf(attachment: Attachment): Size | undefined {
  return attachment.width !== undefined && attachment.height !== undefined
    ? { width: attachment.width, height: attachment.height }
    : undefined;
}

export function Stage(props: StageProps) {
  const { deck, index, onIndex, onClose, onChrome, onDismissing, onZoomed, onFitted } = props;
  const surface = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  // What the current picture turned out to be, once it has loaded: a server that never measured
  // it leaves the size to the browser.
  const [measured, setMeasured] = useState<Size | undefined>(undefined);

  const item = deck[index];
  const natural = useMemo(
    () => (item === undefined ? undefined : (naturalOf(item.attachment) ?? measured)),
    [item, measured],
  );
  const fitted = useMemo(
    () => fitRect(natural ?? { width: 0, height: 0 }, stage),
    [natural, stage],
  );
  const limits = useMemo(
    () => zoomLimits(natural ?? { width: 0, height: 0 }, stage, window.devicePixelRatio || 1),
    [natural, stage],
  );

  // The stage's size, and again when the window changes: rotation re-fits and keeps the zoom.
  useEffect(() => {
    const element = surface.current;
    if (element === null) return;
    const measure = () => setStage({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A page forgets the last picture's size, so a photo the server never measured is measured
  // again by the browser; the zoom a page resets is the gestures' own.
  const standingOn = item?.attachment.id;
  useEffect(() => {
    if (standingOn !== undefined) setMeasured(undefined);
  }, [standingOn]);

  useEffect(() => {
    const box = surface.current?.getBoundingClientRect();
    onFitted(
      fitted.width > 0 && box !== undefined
        ? {
            left: box.left + fitted.x,
            top: box.top + fitted.y,
            width: fitted.width,
            height: fitted.height,
          }
        : undefined,
    );
  }, [fitted, onFitted]);

  const gestures = useStageGestures({
    deck,
    index,
    fitted,
    stage,
    limits,
    surface,
    onIndex,
    onClose,
    onChrome,
    onDismissing,
    handle: props.handle,
  });
  const { scale, translate, drag, settling } = gestures;

  // The filmstrip goes while the picture is zoomed (Arjun, decision 8).
  useEffect(() => onZoomed(scale > 1.01), [scale, onZoomed]);

  const dismissing = dismissProgress(drag.y);
  // Only the current item and its neighbours are mounted; each stands at its own page, and one
  // offset carries them all (the phone's pager, Phase 1's departure).
  const pages = deck
    .map((each, at) => ({ each, at }))
    .filter(({ at }) => Math.abs(at - index) <= 1);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the stage is the gesture surface; every action it offers is a button in the chrome, and the keys are the dialog's.
    <div
      className="viewer-stage"
      ref={surface}
      data-testid="viewer-stage"
      data-zoomed={scale > 1.01 ? "yes" : "no"}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
      onDoubleClick={gestures.onDoubleClick}
      onWheel={gestures.onWheel}
    >
      <div
        className="viewer-track"
        style={{
          transform: `translate3d(${-index * (stage.width + GUTTER) + drag.x}px, ${drag.y}px, 0) scale(${dismissing.scale})`,
          transition: settling ? `transform var(--motion-slow) var(--ease)` : "none",
        }}
      >
        {pages.map(({ each, at }) => (
          <Page
            key={each.attachment.id}
            item={each}
            at={at}
            current={at === index}
            stage={stage}
            fitted={fitted}
            zoom={{ scale, translate, settling }}
            files={props.files}
            source={props.source}
            onMeasured={setMeasured}
            {...(props.onPlaying === undefined ? {} : { onPlaying: props.onPlaying })}
            {...(props.playRef === undefined ? {} : { playRef: props.playRef })}
            {...(props.imageRef === undefined ? {} : { imageRef: props.imageRef })}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One page of the deck: the item at its own offset, drawn as a picture or as a video's stage.
 * Only the current one is given a source, a zoom, or the element refs — a neighbour is its
 * thumbnail until it is landed on, which is rule 6's "the neighbours, and the rest never".
 */
function Page({
  item,
  at,
  current,
  stage,
  fitted,
  zoom,
  files,
  source,
  onMeasured,
  onPlaying,
  playRef,
  imageRef,
}: {
  readonly item: DeckItem;
  /** Where this page stands in the deck, which is where it stands on the track. */
  readonly at: number;
  readonly current: boolean;
  readonly stage: Size;
  readonly fitted: Rect;
  readonly zoom: { readonly scale: number; readonly translate: Point; readonly settling: boolean };
  readonly files: FileService;
  readonly source: PictureSource;
  readonly onMeasured: (size: Size) => void;
  readonly onPlaying?: ((playing: boolean) => void) | undefined;
  readonly playRef?: RefObject<{ toggle: () => void } | null> | undefined;
  readonly imageRef?: RefObject<HTMLImageElement | null> | undefined;
}) {
  const only = <T,>(value: T): T | undefined => (current ? value : undefined);
  return (
    <div
      className="viewer-page"
      style={{ transform: `translateX(${at * (stage.width + GUTTER)}px)` }}
      aria-hidden={current ? undefined : true}
    >
      {item.kind === "video" ? (
        <VideoStage
          item={item}
          files={files}
          current={current}
          fitted={fitted}
          {...(onPlaying === undefined ? {} : { onPlaying })}
          {...(playRef === undefined ? {} : { playRef })}
          onMeasured={only(onMeasured)}
        />
      ) : (
        <Picture
          item={item}
          files={files}
          fitted={only(fitted)}
          stage={stage}
          zoom={only(zoom)}
          source={only(source)}
          onMeasured={only(onMeasured)}
          imageRef={only(imageRef)}
        />
      )}
    </div>
  );
}
