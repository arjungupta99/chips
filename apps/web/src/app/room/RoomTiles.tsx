/**
 * The room sheet's first page under who is here, as the phone's (ADR 0202, and its addendum for
 * the desktop: Arjun's 2, 18 October 2026): one card for everything the room holds, Media & files,
 * and the room's settings as tiles.
 *
 * - **Media & files** says how many things the room's lines carry and how many files the room has
 *   (core's `mediaFilesWords`), and shows the newest five as pictures, a voice note's microphone or
 *   a document's kind, beside a square for the files. It turns the sheet to the Media & files page
 *   (`RoomMedia.tsx`). It was the Files row.
 * - **The tiles** are what the rows were: Lead, Spend per job and Lock changes, each with its mark,
 *   what it is set to, and its name under that. The desktop has no Notifications (ADR 0198 sends
 *   them to the phone alone), so there are three at most, and they share one row while the sheet
 *   is its own width; at a phone's width they go two to a row, an odd last one taking its row, as
 *   the phone's do. A tile opens what its row opened, with a chevron; one that opens nothing for
 *   you, as Lead for a guest or Spend for a member, has none and does not press. Spend per job
 *   draws how much of the room's ceiling the job has used, in the colour of where it stands (ADR
 *   0118), and says the row's words to a hover and to a screen reader. Lock changes keeps its
 *   switch, and its padlock shuts in gold while it is on.
 */

import {
  type Attachment,
  type CarriedFile,
  formatDuration,
  inAlbum,
  kindOf,
  mediaFilesWords,
} from "@chipschat/core";
import { dollars, type JobSpend, spendStage } from "@chipschat/protocol";
import { Icon, type IconName } from "@chipschat/ui";
import { type ReactNode, useEffect, useState } from "react";
import type { FileService } from "../files.ts";
import { Padlock, useLockFlip } from "../LockRow.tsx";
import { Switch } from "../you/controls.tsx";
import { Chev } from "./parts.tsx";

/** How many of the newest things the room carries the card shows, beside the files' square. */
export const CARD_MEDIA = 5;

/**
 * The Media & files card: its name and counts, then the newest things the room's lines carry and a
 * square for the room's files. With nothing in either, the one line and `None yet`.
 */
export function MediaCard({
  media,
  files,
  fileCount,
  onOpen,
}: {
  /** What the room's lines carry, newest first (core's `newestFilesOf`). */
  readonly media: readonly CarriedFile[];
  readonly files: FileService | undefined;
  /** How many files the room has, once the server has said (ADR 0100). */
  readonly fileCount: number | undefined;
  readonly onOpen: () => void;
}) {
  const words = mediaFilesWords(media.length, fileCount);
  const filed = fileCount !== undefined && fileCount > 0;
  const shown = media.slice(0, filed ? CARD_MEDIA : CARD_MEDIA + 1);
  return (
    <button
      type="button"
      className="sheet-media"
      onClick={onOpen}
      aria-label={`Media and files, ${words === "" ? "reading" : words}`}
      data-testid="room-sheet-media"
    >
      <span className="sheet-media-head">
        <span className="sheet-media-name">Media &amp; files</span>
        <span className="sheet-media-count">{words}</span>
        <Chev />
      </span>
      {shown.length + (filed ? 1 : 0) > 0 && (
        <span className="sheet-media-strip" data-testid="room-sheet-media-strip">
          {shown.map((item) => (
            <MediaThumb key={item.attachment.id} item={item} files={files} small />
          ))}
          {filed && (
            <span className="sheet-thumb sheet-thumb-mark">
              <Icon name="doc" size={16} />
              <b>{fileCount}</b>
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/**
 * One thing a room's line carries, as a square: a photo's thumbnail, a video's poster with its
 * length, a voice note's microphone and length, or a document's mark and kind.
 */
export function MediaThumb({
  item,
  files,
  small = false,
}: {
  readonly item: CarriedFile;
  readonly files: FileService | undefined;
  /** The card's, a sixth of a row: a smaller mark. */
  readonly small?: boolean;
}) {
  const { attachment } = item;
  const drawn = inAlbum(attachment);
  const picture = useThumbOf(files, drawn ? attachment.id : undefined);
  if (!drawn) {
    const under = markWords(attachment);
    return (
      <span className="sheet-thumb sheet-thumb-mark">
        <Icon name={markOf(attachment)} size={small ? 16 : 20} />
        {under !== undefined && <small>{under}</small>}
      </span>
    );
  }
  const length = lengthOf(attachment);
  return (
    <span className="sheet-thumb">
      {picture !== undefined && <img src={picture} alt="" />}
      {kindOf(attachment.mimeType) === "video" && (
        <span className="sheet-thumb-played">
          <Icon name="play" size={9} />
          {length}
        </span>
      )}
    </span>
  );
}

/** A thumbnail from the file service, for a file that has one; nothing without the service. */
function useThumbOf(files: FileService | undefined, id: string | undefined): string | undefined {
  const [picture, setPicture] = useState<{ readonly id: string; readonly url: string }>();
  useEffect(() => {
    if (id === undefined || files === undefined) return;
    let live = true;
    files.thumb(id).then(
      (url) => {
        if (live) setPicture({ id, url });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, id]);
  return picture !== undefined && picture.id === id ? picture.url : undefined;
}

/** A video's or a voice note's length, if the server measured it: `1:05`. */
function lengthOf(attachment: Attachment): string | undefined {
  return attachment.durationMs === undefined ? undefined : formatDuration(attachment.durationMs);
}

/** What a file with no picture is marked with: a voice note's microphone, or a document. */
function markOf(attachment: Attachment): IconName {
  const kind = kindOf(attachment.mimeType);
  return kind === "audio" ? "mic" : kind === "video" ? "play" : "doc";
}

/** Under a mark: a voice note's length, or a document's kind, `PDF`. */
function markWords(attachment: Attachment): string | undefined {
  if (kindOf(attachment.mimeType) === "audio") return lengthOf(attachment);
  const dot = attachment.filename.lastIndexOf(".");
  return dot === -1
    ? undefined
    : attachment.filename
        .slice(dot + 1)
        .toUpperCase()
        .slice(0, 4);
}

/**
 * A heading over a card on the sheet: its name, how many, and what stands at its right, as Add
 * does over who is here.
 */
export function Section({
  name,
  count,
  trailing,
}: {
  readonly name: string;
  readonly count?: number | undefined;
  readonly trailing?: ReactNode;
}) {
  return (
    <div className="sheet-section">
      <h3>{name}</h3>
      {count !== undefined && <span className="sheet-section-count">{count}</span>}
      {trailing}
    </div>
  );
}

/** The tiles: in one row at the sheet's own width, two to a row at a phone's. */
export function Tiles({ children }: { readonly children: ReactNode }) {
  return <div className="sheet-tiles">{children}</div>;
}

/**
 * One tile: its mark and what stands at its right, what it is set to, and its name. A tile that
 * presses is a button named by `label`; one that doesn't is read as it stands. Its `hint` is said
 * to a hover and, unseen, to a screen reader.
 */
function Tile(props: {
  readonly mark: ReactNode;
  readonly value: ReactNode;
  readonly name: string;
  /** What a screen reader says of it, where it presses. */
  readonly label: string;
  /** More than it shows: Spend's line, and who sets it for one who doesn't. */
  readonly hint?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  /** At the mark's right: the chevron where it opens something, or Lock's switch. */
  readonly trailing?: ReactNode;
  readonly testId: string;
  /** Over the tile's foot: Spend's bar. */
  readonly children?: ReactNode;
}) {
  const body = (
    <>
      <span className="sheet-box-top">
        {props.mark}
        {props.trailing ?? (props.onClick !== undefined && <Chev />)}
      </span>
      <span className="sheet-box-value">{props.value}</span>
      <span className="sheet-box-name">{props.name}</span>
      {props.hint !== undefined && <span className="ui-visually-hidden">{props.hint}</span>}
      {props.children}
    </>
  );
  if (props.onClick === undefined) {
    return (
      <div className="sheet-box" title={props.hint} data-testid={props.testId}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="sheet-box"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.hint}
      data-testid={props.testId}
    >
      {body}
    </button>
  );
}

/** A tile's mark: a rounded square with a line drawing, or Spend's dollar. */
function Mark({ children, lit = false }: { readonly children: ReactNode; readonly lit?: boolean }) {
  return (
    <span className="sheet-box-mark" data-lit={lit ? "true" : undefined} aria-hidden="true">
      {children}
    </span>
  );
}

/** The room's project (ADR 0222): how many files it has; it opens the Project page. */
export function ProjectTile({
  files,
  onClick,
}: {
  readonly files: number;
  readonly onClick: () => void;
}) {
  const words = `${files} file${files === 1 ? "" : "s"}`;
  return (
    <Tile
      mark={
        <Mark>
          <Icon name="drawers" size={16} />
        </Mark>
      }
      value={words}
      name="Project"
      label={`Project, ${words}`}
      onClick={onClick}
      testId="room-sheet-project"
    />
  );
}

/** Who leads the room (ADR 0104), or Nobody; it opens Lead for whoever may choose. */
export function LeadTile({
  leads,
  onClick,
}: {
  /** The lead's name, or undefined for none. */
  readonly leads: string | undefined;
  readonly onClick: (() => void) | undefined;
}) {
  const who = leads ?? "Nobody";
  return (
    <Tile
      mark={
        <Mark>
          <Icon name="route" size={16} />
        </Mark>
      }
      value={who}
      name="Lead"
      label={`Lead, ${who}`}
      onClick={onClick}
      testId="room-sheet-lead"
    />
  );
}

/**
 * What the room's job has spent of what the room allows a job (ADR 0117), or only what it allows
 * until the server has said; the bar under it in the colour of where the job stands (ADR 0118).
 */
export function SpendTile({
  ceiling,
  spend,
  words,
  onClick,
}: {
  readonly ceiling: number;
  readonly spend: JobSpend | undefined;
  /** The row's line, `This job so far: $0.28`, and who sets it for one who doesn't. */
  readonly words: string | undefined;
  readonly onClick: (() => void) | undefined;
}) {
  return (
    <Tile
      mark={
        <Mark>
          <span className="sheet-dollar">$</span>
        </Mark>
      }
      value={
        spend === undefined ? (
          dollars(ceiling)
        ) : (
          <>
            {dollars(spend.spent_usd)}
            <span className="sheet-box-of"> of {dollars(ceiling)}</span>
          </>
        )
      }
      name="Spend per job"
      label={`Spend per job, ${dollars(ceiling)}${words === undefined ? "" : `, ${words}`}`}
      hint={words}
      onClick={onClick}
      testId="room-sheet-spend"
    >
      {spend !== undefined && <SpendBar spend={spend} />}
    </Tile>
  );
}

/** How much of the ceiling the job has used, gold, then amber from most of it, red at it. */
function SpendBar({ spend }: { readonly spend: JobSpend }) {
  const used = spend.ceiling_usd <= 0 ? 1 : Math.min(1, spend.spent_usd / spend.ceiling_usd);
  // A job that has spent anything shows a sliver of it.
  const width = used > 0 ? Math.max(used * 100, 4) : 0;
  return (
    <span className="sheet-box-bar" aria-hidden="true">
      <i
        data-testid="room-sheet-spend-bar"
        data-stage={spendStage(spend)}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/**
 * Lock changes (ADR 0156) as a tile: On or Off, the switch, and the padlock shut in gold while it
 * is on. A flip shows at once and holds until the room says the server has it (`useLockFlip`).
 */
export function LockTile({
  locked,
  busy,
  onLock,
}: {
  readonly locked: boolean;
  /** Something asked of the server and not yet answered. */
  readonly busy: boolean;
  readonly onLock: (locked: boolean) => Promise<boolean>;
}) {
  const { on, flip } = useLockFlip(locked, onLock);
  return (
    <Tile
      mark={
        <Mark lit={on}>
          <Padlock on={on} />
        </Mark>
      }
      value={on ? "On" : "Off"}
      name="Lock changes"
      label="Lock changes"
      hint="Stops the space being renamed, archived or deleted"
      trailing={
        <Switch
          label="Lock changes"
          checked={on}
          disabled={busy}
          onChange={flip}
          testId="room-sheet-lock-switch"
        />
      }
      testId="room-sheet-lock"
    />
  );
}
