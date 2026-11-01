/**
 * The web's lightbox (the media viewer proposal, §4.3). A `<dialog>` in `document.body` opened
 * with `showModal()`, so the top layer, the focus trap, the inert room behind and Escape are the
 * platform's rather than ours — which is rule 9's screen reader and rule 11's back, both for free.
 *
 * It grows out of the tile it was opened from and shrinks back into the tile of whatever is
 * current when it closes, which may be another message's (rule 3, `open.ts`). Focus goes to Close
 * on opening and back to the tile on closing.
 *
 * The chrome is the counter, the caption and the actions, and a tap on the picture takes it away.
 * The keys are §4.3's, and they are listed here, in the desktop guide, and behind `?`.
 */

import {
  type DeckItem,
  type Directory,
  formatBytes,
  formatDuration,
  nameOf,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FileService } from "../files.ts";
import { clockTime } from "../time.ts";
import { COPY_REFUSED, copyImage, download } from "./actions.ts";
import { Filmstrip } from "./Filmstrip.tsx";
import { ZOOM_STEP } from "./gestures.ts";
import { Stage, type StageHandle } from "./Stage.tsx";
import { useFlight } from "./useFlight.ts";
import { useNeighbours, usePicture } from "./usePicture.ts";

/** The keys, in one place: the dialog reads them, `?` lists them, and the guide's table copies them. */
export const KEYS: readonly { readonly key: string; readonly does: string }[] = [
  { key: "Esc", does: "Close, back to the tile" },
  { key: "← →", does: "Older, newer" },
  { key: "Home  End", does: "The first, the last" },
  { key: "Space", does: "Play and pause a video" },
  { key: "+  −  0", does: "Zoom in, out, and back to fitted" },
  { key: "F", does: "Fullscreen" },
  { key: "I", does: "Details" },
  { key: "D", does: "Download the file as it was sent" },
  { key: "?", does: "This list" },
];

export function Lightbox({
  deck,
  index,
  files,
  directory,
  tileOf,
  onIndex,
  onClose,
  onGoToMessage,
}: {
  readonly deck: readonly DeckItem[];
  readonly index: number;
  readonly files: FileService;
  readonly directory: Directory;
  readonly tileOf: (attachmentId: string) => HTMLElement | undefined;
  readonly onIndex: (index: number) => void;
  readonly onClose: () => void;
  /** The viewer closes and the room lands on the line, with the flash it already has. */
  readonly onGoToMessage: ((lineId: string) => void) | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const stageHandle = useRef<StageHandle | null>(null);
  const player = useRef<{ toggle: () => void } | null>(null);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [details, setDetails] = useState(false);
  const [keysShown, setKeysShown] = useState(false);
  const [wantOriginal, setWantOriginal] = useState(false);
  const [backdrop, setBackdrop] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | undefined>(undefined);
  const item = deck[index];
  const source = usePicture(files, item, wantOriginal);
  const picture = useRef<HTMLImageElement | null>(null);
  // The tile the viewer was opened from, read at the first render and never again: the return
  // looks its own tile up when it closes, which may be another message's.
  const openedFrom = useRef<HTMLElement | undefined>(undefined);
  const opened = useRef(false);
  if (!opened.current) {
    opened.current = true;
    openedFrom.current = item === undefined ? undefined : tileOf(item.attachment.id);
  }
  const { phase, shut, onFitted } = useFlight({
    deck,
    index,
    tileOf,
    openedFrom,
    picture,
    dialog,
    closeButton,
    onClose,
  });

  const go = useCallback(
    (to: number) => {
      const landed = Math.min(deck.length - 1, Math.max(0, to));
      if (landed !== index) {
        setWantOriginal(false);
        setDetails(false);
        onIndex(landed);
      }
    },
    [deck.length, index, onIndex],
  );

  useNeighbours(files, deck, index);
  useFocusHeld(dialog, zoomed);

  const toggleFullscreen = useCallback(async () => {
    const element = dialog.current;
    if (element === null) return;
    try {
      if (document.fullscreenElement === null) await element.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setNote("This browser would not go fullscreen.");
    }
  }, []);

  /**
   * §4.3's keys: a key nobody has claimed is left to the platform, so Tab still moves the focus
   * around the chrome.
   */
  const keys = useCallback(
    (event: React.KeyboardEvent<HTMLDialogElement>) => {
      const act = keyTable({
        index,
        of: deck.length,
        go,
        stage: stageHandle,
        player,
        item,
        files,
        onFullscreen: toggleFullscreen,
        onDetails: () => setDetails((was) => !was),
        onKeys: () => setKeysShown((was) => !was),
      })[event.key.toLowerCase()];
      if (act === undefined) return;
      event.preventDefault();
      act();
    },
    [deck.length, index, go, files, item, toggleFullscreen],
  );

  const onDismissing = useCallback(
    ({ backdrop: to, dragging: now }: { backdrop: number; dragging: boolean }) => {
      setBackdrop(to);
      setDragging(now);
    },
    [],
  );

  const onCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      // Escape: the platform's close, turned into the return to the tile (rule 11).
      event.preventDefault();
      shut();
    },
    [shut],
  );

  const who = item === undefined ? "" : nameOf(directory, item.saidBy);
  const place = useMemo(
    () => (deck.length > 1 ? `${index + 1} of ${deck.length}` : ""),
    [deck.length, index],
  );

  if (item === undefined) return null;

  // *Photo 8 of 8, receipt.jpg, from Arjun, 11:26* — the dialog's name, and what a reader hears
  // when the deck moves (rule 9).
  const said = describe(item, index, deck.length, who);

  return createPortal(
    <dialog
      ref={dialog}
      className="viewer"
      // Focusable so it can hold the focus itself when what had it is taken away (`useFocusHeld`).
      tabIndex={-1}
      data-phase={phase}
      data-chrome={chrome ? "on" : "off"}
      data-zoomed={zoomed ? "yes" : "no"}
      aria-label={said}
      style={{ ["--viewer-backdrop" as string]: String(backdrop) }}
      onKeyDown={keys}
      onCancel={onCancel}
    >
      <Stage
        deck={deck}
        index={index}
        files={files}
        source={source}
        imageRef={picture}
        handle={stageHandle}
        playRef={player}
        onIndex={go}
        onClose={shut}
        onChrome={() => setChrome((was) => !was)}
        onDismissing={onDismissing}
        onZoomed={setZoomed}
        onFitted={onFitted}
      />

      {/* What a screen reader hears when the deck moves; the stage itself is pictures. */}
      <p className="viewer-said" aria-live="polite" data-testid="viewer-said">
        {said}
      </p>

      <Chrome
        hidden={!chrome || dragging}
        deck={deck}
        index={index}
        item={item}
        who={who}
        place={place}
        files={files}
        picture={picture}
        zoomed={zoomed}
        closeRef={closeButton}
        details={details}
        keysShown={keysShown}
        canOpenOriginal={item.kind === "photo" && !source.original && !wantOriginal}
        onGo={go}
        onClose={shut}
        onOpenOriginal={() => setWantOriginal(true)}
        onDetails={() => setDetails((was) => !was)}
        onCloseDetails={() => setDetails(false)}
        onCloseKeys={() => setKeysShown(false)}
        onFullscreen={() => void toggleFullscreen()}
        onNote={setNote}
        {...(onGoToMessage === undefined
          ? {}
          : {
              onOpenMessage: () => {
                const line = item.lineId;
                shut();
                onGoToMessage(line);
              },
            })}
      />

      {note !== undefined && (
        <p className="viewer-note" role="alert" data-testid="viewer-note">
          {note}
        </p>
      )}
    </dialog>,
    document.body,
  );
}

/** How one item of the deck reads out: its kind, its place, its name, who sent it and when. */
function describe(item: DeckItem, index: number, of: number, who: string): string {
  const kind = item.kind === "video" ? "Video" : "Photo";
  return `${kind} ${index + 1} of ${of}, ${item.attachment.filename}, from ${who}, ${clockTime(item.ts)}`;
}

/**
 * Everything drawn over the stage: the bars, the arrows, the filmstrip, the actions, and the two
 * cards Details and `?` open. A tap on the picture takes the lot away (§4.3), which is what
 * `hidden` says; it is drawn either way, so nothing has to be measured again when it comes back.
 */
function Chrome({
  hidden,
  deck,
  index,
  item,
  who,
  place,
  files,
  picture,
  zoomed,
  closeRef,
  details,
  keysShown,
  canOpenOriginal,
  onGo,
  onClose,
  onOpenOriginal,
  onOpenMessage,
  onDetails,
  onCloseDetails,
  onCloseKeys,
  onFullscreen,
  onNote,
}: {
  readonly hidden: boolean;
  readonly deck: readonly DeckItem[];
  readonly index: number;
  readonly item: DeckItem;
  readonly who: string;
  readonly place: string;
  readonly files: FileService;
  readonly picture: RefObject<HTMLImageElement | null>;
  readonly zoomed: boolean;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
  readonly details: boolean;
  readonly keysShown: boolean;
  readonly canOpenOriginal: boolean;
  readonly onGo: (index: number) => void;
  readonly onClose: () => void;
  readonly onOpenOriginal: () => void;
  readonly onOpenMessage?: (() => void) | undefined;
  readonly onDetails: () => void;
  readonly onCloseDetails: () => void;
  readonly onCloseKeys: () => void;
  readonly onFullscreen: () => void;
  readonly onNote: (said: string) => void;
}) {
  return (
    <>
      <div className="viewer-chrome" data-hidden={hidden ? "yes" : "no"} data-kind={item.kind}>
        <TopBar
          place={place}
          name={item.attachment.filename}
          closeRef={closeRef}
          onClose={onClose}
        />
        <Arrows index={index} of={deck.length} onGo={onGo} />
        <div className="viewer-bar viewer-bottom">
          <p className="viewer-caption-line">
            {who}
            {" · "}
            {clockTime(item.ts)}
            {item.inMessage.of > 1 && ` · ${item.inMessage.index} of ${item.inMessage.of}`}
          </p>
          {/* The strip goes while the picture is zoomed (Arjun, decision 8). */}
          {!zoomed && <Filmstrip deck={deck} index={index} files={files} onGo={onGo} />}
          <Actions
            item={item}
            files={files}
            picture={picture}
            canOpenOriginal={canOpenOriginal}
            onOpenOriginal={onOpenOriginal}
            onDetails={onDetails}
            onFullscreen={onFullscreen}
            onNote={onNote}
            {...(onOpenMessage === undefined ? {} : { onOpenMessage })}
          />
        </div>
      </div>
      {details && <Details item={item} who={who} onDone={onCloseDetails} />}
      {keysShown && <KeysCard onDone={onCloseKeys} />}
    </>
  );
}

/**
 * What each key does, as a table rather than a run of branches: the same list `?` shows and the
 * desktop guide carries.
 */
function keyTable(what: {
  readonly index: number;
  readonly of: number;
  readonly go: (index: number) => void;
  readonly stage: RefObject<StageHandle | null>;
  readonly player: RefObject<{ toggle: () => void } | null>;
  readonly item: DeckItem | undefined;
  readonly files: FileService;
  readonly onFullscreen: () => void;
  readonly onDetails: () => void;
  readonly onKeys: () => void;
}): Record<string, (() => void) | undefined> {
  const { index, of, go, stage, player, item, files } = what;
  const zoom = (factor: number) => stage.current?.zoomBy(factor);
  return {
    arrowleft: () => go(index - 1),
    arrowright: () => go(index + 1),
    home: () => go(0),
    end: () => go(of - 1),
    " ": () => player.current?.toggle(),
    "+": () => zoom(ZOOM_STEP),
    "=": () => zoom(ZOOM_STEP),
    "-": () => zoom(1 / ZOOM_STEP),
    "0": () => stage.current?.fit(),
    f: what.onFullscreen,
    i: what.onDetails,
    d: () => {
      if (item !== undefined) void download(files, item.attachment);
    },
    "?": what.onKeys,
  };
}

/**
 * The keys are the dialog's, so the focus stays in it. A zoom takes the filmstrip away, and a thumb
 * clicked a moment before had the focus: gone with it, the focus fell to the page behind, which is
 * inert under the modal, and `0`, the arrows and every other key went nowhere until a click put it
 * back. The dialog takes it instead. `e2e/viewer.spec.ts` found it on 16 September 2026, failing
 * the same with or without that day's changes to the room's grid.
 */
function useFocusHeld(dialog: RefObject<HTMLDialogElement | null>, zoomed: boolean) {
  useEffect(() => {
    const element = dialog.current;
    if (!zoomed || element === null || element.contains(document.activeElement)) return;
    element.focus({ preventScroll: true });
  }, [dialog, zoomed]);
}

/** Where it stands, what it is called, and the way out. */
function TopBar({
  place,
  name,
  closeRef,
  onClose,
}: {
  readonly place: string;
  readonly name: string;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
}) {
  return (
    <div className="viewer-bar viewer-top">
      <span className="viewer-count" data-testid="viewer-count">
        {place}
      </span>
      <span className="viewer-name">{name}</span>
      <button
        type="button"
        ref={closeRef}
        className="viewer-close"
        onClick={onClose}
        aria-label="Close"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

/** A pointer's paging: they appear on hover at the sides, and stop at the ends (§4.3). */
function Arrows({
  index,
  of,
  onGo,
}: {
  readonly index: number;
  readonly of: number;
  readonly onGo: (index: number) => void;
}) {
  return (
    <>
      {index > 0 && (
        <button
          type="button"
          className="viewer-arrow viewer-back"
          onClick={() => onGo(index - 1)}
          aria-label="Older"
        >
          ‹
        </button>
      )}
      {index < of - 1 && (
        <button
          type="button"
          className="viewer-arrow viewer-next"
          onClick={() => onGo(index + 1)}
          aria-label="Newer"
        >
          ›
        </button>
      )}
    </>
  );
}

/**
 * What can be done with what is on the stage, one press or one key away (rule 8). Save is the
 * phone's row: on the desktop a browser's download *is* the save, so it is Download here.
 */
function Actions({
  item,
  files,
  picture,
  canOpenOriginal,
  onOpenOriginal,
  onOpenMessage,
  onDetails,
  onFullscreen,
  onNote,
}: {
  readonly item: DeckItem;
  readonly files: FileService;
  readonly picture: RefObject<HTMLImageElement | null>;
  /** A view that is the photo itself is already open, so it is not offered again. */
  readonly canOpenOriginal: boolean;
  readonly onOpenOriginal: () => void;
  readonly onOpenMessage?: (() => void) | undefined;
  readonly onDetails: () => void;
  readonly onFullscreen: () => void;
  readonly onNote: (said: string) => void;
}) {
  return (
    <div className="viewer-actions">
      <button type="button" onClick={() => void download(files, item.attachment)}>
        Download
      </button>
      {item.kind === "photo" && (
        <button
          type="button"
          onClick={() => void copyImage(picture.current).catch(() => onNote(COPY_REFUSED))}
        >
          Copy image
        </button>
      )}
      {onOpenMessage !== undefined && (
        <button type="button" onClick={onOpenMessage}>
          Open message
        </button>
      )}
      <button type="button" onClick={onDetails}>
        Details
      </button>
      <button type="button" onClick={onFullscreen}>
        Fullscreen
      </button>
      {canOpenOriginal && (
        <button type="button" onClick={onOpenOriginal}>
          Open original
        </button>
      )}
    </div>
  );
}

/** Name, size, shape, length, who and when — rule 8's Details, as a card over the stage. */
function Details({
  item,
  who,
  onDone,
}: {
  readonly item: DeckItem;
  readonly who: string;
  readonly onDone: () => void;
}) {
  const { attachment } = item;
  return (
    <div className="viewer-details" data-testid="viewer-details">
      <h2>{attachment.filename}</h2>
      <dl>
        <dt>Size</dt>
        <dd>{formatBytes(attachment.byteSize)}</dd>
        {attachment.width !== undefined && attachment.height !== undefined && (
          <>
            <dt>Dimensions</dt>
            <dd>{`${attachment.width} × ${attachment.height}`}</dd>
          </>
        )}
        {attachment.durationMs !== undefined && (
          <>
            <dt>Length</dt>
            <dd>{formatDuration(attachment.durationMs)}</dd>
          </>
        )}
        <dt>From</dt>
        <dd>{who}</dd>
        <dt>When</dt>
        <dd>{clockTime(item.ts)}</dd>
        <dt>Kind</dt>
        <dd>{attachment.mimeType}</dd>
      </dl>
      <button type="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/** What `?` shows: the same table the desktop guide carries. */
function KeysCard({ onDone }: { readonly onDone: () => void }) {
  return (
    <div className="viewer-keys" data-testid="viewer-keys">
      <h2>Keys</h2>
      <dl>
        {KEYS.map((row) => (
          <div key={row.key}>
            <dt>{row.key}</dt>
            <dd>{row.does}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
