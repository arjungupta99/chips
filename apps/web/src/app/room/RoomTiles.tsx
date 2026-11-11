/**
 * The room sheet's first page under who is here, as the phone's (ADR 0202, and its addendum for
 * the desktop: Arjun's 2, 18 October 2026): one card for everything the room holds, Media & files,
 * and the room's settings as tiles.
 *
 * - **Media & files** says how many things the room's lines carry and how many files the room has
 *   (core's `mediaFilesWords`), and shows the newest five as pictures, a voice note's microphone or
 *   a document's kind, beside a square for the files. It turns the sheet to the Media & files page
 *   (`RoomMedia.tsx`). It was the Files row.
 * - **The tiles** are what the rows were: Project, Lead, Spend per job and Lock changes, each with
 *   its mark, what it is set to, and its name under that. The desktop has no Notifications (ADR
 *   0198 sends them to the phone alone). They go two to a row, an odd last one taking its row, and
 *   Lock changes and Hide share a row of their own under the rest, as the phone's and the iPad's
 *   do: the sheet is the iPad's 420 across (`--third-w`), and four in one row cut every value short
 *   (Arjun, 10 November 2026). A tile opens what its row opened, with a chevron; one that opens
 *   nothing for you, as Lead for a guest or Spend for a member, has none and does not press. Spend
 *   per job draws how much of the room's ceiling the job has used, in the colour of where it stands
 *   (ADR 0118), and says the row's words to a hover and to a screen reader. Lock changes keeps its
 *   switch, and its padlock shuts while it is on. Each mark wears the phone's colour for it (core's
 *   `ROOM_TILE_GROUNDS`), the padlock's turning ochre while shut.
 */

import {
  type Attachment,
  type CarriedFile,
  ceilingWords,
  formatDuration,
  inAlbum,
  kindOf,
  mediaFilesWords,
  ROOM_TILE_GROUNDS,
  type RoomTileGround,
} from "@chipschat/core";
import {
  cappedSpend,
  dollars,
  type JobSpend,
  type NO_SPEND_CEILING,
  type RoomJob,
  spendStage,
} from "@chipschat/protocol";
import { groundVar, Icon, type IconName } from "@chipschat/ui";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import type { FileService } from "../files.ts";
import { useLockFlip } from "../LockRow.tsx";
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

/**
 * The tiles, two to a row, an odd last one taking its row's width; the foot's, Lock changes and
 * Hide, on a row of their own under the rest, whatever their number, as the phone's `Tiles`.
 */
export function Tiles({
  children,
  foot = [],
}: {
  readonly children: readonly ReactNode[];
  readonly foot?: readonly ReactNode[];
}) {
  return (
    <div className="sheet-tiles">
      {children.length > 0 && <div className="sheet-tiles-grid">{children}</div>}
      {foot.length > 0 && (
        <div className="sheet-tiles-grid" data-testid="room-sheet-tiles-foot">
          {foot}
        </div>
      )}
    </div>
  );
}

/**
 * One tile: its mark and what stands at its right, what it is set to, and its name. A tile that
 * presses is a button named by `label`; one that doesn't is read as it stands. Its `hint` is said
 * to a hover and, unseen, to a screen reader.
 */
function Tile(props: {
  readonly mark: ReactNode;
  readonly value: ReactNode;
  /** A line under the value: Spend's last job (ADR 0282). */
  readonly under?: string | undefined;
  readonly name: string;
  /** What a screen reader says of it, where it presses. */
  readonly label: string;
  /** More than it shows: Spend's line, and who sets it for one who doesn't. */
  readonly hint?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  /** At the mark's right: the chevron where it opens something, or Lock's switch. */
  readonly trailing?: ReactNode;
  /** Whether a press opens a page, which its chevron says: not Hide's, which acts at once. */
  readonly opens?: boolean;
  readonly testId: string;
  /** Over the tile's foot: Spend's bar. */
  readonly children?: ReactNode;
}) {
  const body = (
    <>
      <span className="sheet-box-top">
        {props.mark}
        {props.trailing ?? (props.onClick !== undefined && props.opens !== false && <Chev />)}
      </span>
      <span className="sheet-box-value">{props.value}</span>
      {props.under !== undefined && <span className="sheet-box-under">{props.under}</span>}
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

/**
 * A tile's mark: a rounded square in its colour, a ground a face may wear, with a line drawing or
 * Spend's dollar in the faces' ink, as the phone's.
 */
function Mark({
  ground,
  children,
}: {
  readonly ground: RoomTileGround;
  readonly children: ReactNode;
}) {
  return (
    <span
      className="sheet-box-mark"
      style={{ "--mark-ground": groundVar(ROOM_TILE_GROUNDS[ground]) } as CSSProperties}
      data-ground={ground}
      aria-hidden="true"
      data-testid={`room-sheet-mark-${ground}`}
    >
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
        <Mark ground="project">
          <Icon name="drawers" size={18} />
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
        <Mark ground="lead">
          <Icon name="route" size={18} />
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
 * until the server has said; the bar under it in the colour of where the job stands (ADR 0118). A
 * room with no cap draws what the job has spent, and no bar (ADR 0292).
 */
export function SpendTile({
  ceiling,
  spend,
  words,
  last,
  onClick,
}: {
  readonly ceiling: number | typeof NO_SPEND_CEILING;
  readonly spend: RoomJob | undefined;
  /** The row's line, `This job so far: $0.28`, and who sets it for one who doesn't. */
  readonly words: string | undefined;
  /** `Last job $3.10`, once a job before this one spent (ADR 0282). */
  readonly last?: string | undefined;
  readonly onClick: (() => void) | undefined;
}) {
  const bar = spend === undefined ? undefined : cappedSpend(spend);
  return (
    <Tile
      mark={
        <Mark ground="spend">
          <span className="sheet-dollar">$</span>
        </Mark>
      }
      value={
        spend === undefined ? (
          ceilingWords(ceiling)
        ) : (
          <>
            {dollars(spend.spent_usd)}
            <span className="sheet-box-of">
              {typeof ceiling === "number" ? ` of ${dollars(ceiling)}` : " · no cap"}
            </span>
          </>
        )
      }
      under={last}
      name="Spend per job"
      label={`Spend per job, ${ceilingWords(ceiling)}${words === undefined ? "" : `, ${words}`}${last === undefined ? "" : `, ${last}`}`}
      hint={words}
      onClick={onClick}
      testId="room-sheet-spend"
    >
      {bar !== undefined && <SpendBar spend={bar} />}
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
 * Lock changes (ADR 0156) as a tile: On or Off, the switch, and the padlock shut on ochre while it
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
        <Mark ground={on ? "locked" : "lock"}>
          <Icon name={on ? "lock" : "unlock"} size={18} />
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

/** What Hide and Unhide do, said to a hover and to a screen reader, in the phone's words. */
const HIDE_UNDER = {
  hide: "Off your list, and quiet. The others here carry on.",
  unhide: "Back on your list, and heard as before.",
} as const;

/**
 * Hide (ADR 0205) as a tile beside Lock changes, as the phone's: the room off the reader's own list
 * at once, or Unhide on a hidden room. It opens nothing, so it has no chevron.
 */
export function HideTile({
  hidden,
  onHide,
}: {
  readonly hidden: boolean;
  readonly onHide: (hidden: boolean) => void;
}) {
  return (
    <Tile
      mark={
        <Mark ground="hide">
          <Icon name={hidden ? "unhide" : "hide"} size={18} />
        </Mark>
      }
      value={hidden ? "Unhide" : "Hide"}
      name={hidden ? "Back on your list" : "Off your list"}
      label={hidden ? "Unhide" : "Hide"}
      hint={hidden ? HIDE_UNDER.unhide : HIDE_UNDER.hide}
      onClick={() => onHide(!hidden)}
      opens={false}
      testId={hidden ? "unhide-space" : "hide-space"}
    />
  );
}
