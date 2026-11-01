/**
 * What this phone keeps, sorted into the spaces it came from, for Media on this phone (ADR 0159).
 *
 * Every attachment the phone has opened or drawn is kept under the app's cache, a file at a time,
 * each named for the attachment's id and what it is (`keepLocally` in `spaces/local.ts`): the file
 * itself, its thumbnail, the viewer's copy of a photo, the copy of a video that plays everywhere.
 * Nothing on disk says which room it came from, so the store does: each room's lines name the
 * files they carry (core's `filesOf`). A file the store cannot place — its room erased or left,
 * a thread's or a lane's from somewhere this phone holds no line of, a message it has not loaded —
 * goes in one last section, Other, so that everything kept can still be seen and let go.
 *
 * One tile per attachment, whatever the phone holds of it, and its size all of that together:
 * a photo scrolled past in a room is here too, since its thumbnail is kept. Spaces stand biggest
 * first, since the page is for making room, and Other last; a space's files newest first.
 */

import {
  type Attachment,
  type DeckItem,
  type Directory,
  deckOf,
  deckOfOne,
  filesOf,
  kindOf,
  type Lane,
  type Space,
} from "@chipschat/core";
import type { Corners } from "../media/tiles";
import { partOf } from "../spaces/keptNames";
import type { KeptFile } from "../spaces/local";

/** What a tile is: how it is drawn, and what a tap on it opens. */
export type KeptKind = "photo" | "video" | "voice" | "file";

/** One attachment as this phone keeps it. */
export interface KeptItem {
  readonly id: string;
  /** Everything kept of it, together. */
  readonly bytes: number;
  /** A picture to draw it with, kept here: the thumbnail, the viewer's copy, or the photo itself. */
  readonly picture: string | undefined;
  /** The file itself, where it is kept: what Quick Look opens when there is no viewer for it. */
  readonly file: string | undefined;
  readonly kind: KeptKind;
  /** Its name as it was sent, or as it is named on disk when no line says. */
  readonly name: string;
  /** As its line describes it, where the store holds that line. */
  readonly attachment: Attachment | undefined;
  readonly lineId: string | undefined;
  /** When its line was said. */
  readonly ts: string | undefined;
}

/** The key of the section for what no room on this phone carries. */
export const OTHER = "other";

export interface KeptSection {
  /** The space's id, or `OTHER`. */
  readonly key: string;
  readonly space: Space | undefined;
  /** Newest first. */
  readonly items: readonly KeptItem[];
  readonly bytes: number;
}

interface Parts {
  bytes: number;
  thumb?: string;
  view?: string;
  play?: string;
  file?: string;
  /** The file's own name, after the id: what it was sent as, made safe for a disk. */
  fileName?: string;
}

function gather(files: readonly KeptFile[]): Map<string, Parts> {
  const byId = new Map<string, Parts>();
  for (const kept of files) {
    const { id, part, rest } = partOf(kept.name);
    const parts = byId.get(id) ?? { bytes: 0 };
    parts.bytes += kept.size;
    parts[part] = kept.uri;
    if (part === "file") parts.fileName = rest;
    byId.set(id, parts);
  }
  return byId;
}

const PHOTO = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
const SOUND = /\.(m4a|mp3|aac|wav|caf|ogg)$/i;

/** What each kind of attachment the server names is drawn as here. */
const KINDS: Readonly<Record<ReturnType<typeof kindOf>, KeptKind>> = {
  image: "photo",
  video: "video",
  audio: "voice",
  file: "file",
};

/** The kind of a file, from its line where there is one, or else from what the phone has of it. */
function kindFor(attachment: Attachment | undefined, parts: Parts): KeptKind {
  if (attachment !== undefined) return KINDS[kindOf(attachment.mimeType)];
  const name = parts.fileName ?? "";
  if (parts.play !== undefined || VIDEO.test(name)) return "video";
  if (SOUND.test(name)) return "voice";
  if (parts.thumb !== undefined || parts.view !== undefined || PHOTO.test(name)) return "photo";
  return "file";
}

/** The picture a tile draws: the thumbnail, else the viewer's copy, else a photo's own file. */
function pictureFor(kind: KeptKind, parts: Parts): string | undefined {
  return parts.thumb ?? parts.view ?? (kind === "photo" ? parts.file : undefined);
}

/** Where each attachment the store knows of hangs: the first room whose lines carry it. */
function placesOf(
  spaces: readonly Space[],
  lanes: readonly Lane[],
): Map<
  string,
  { readonly space: Space; readonly attachment: Attachment; lineId: string; ts: string }
> {
  const places = new Map<
    string,
    { readonly space: Space; readonly attachment: Attachment; lineId: string; ts: string }
  >();
  for (const space of spaces) {
    for (const carried of filesOf(space, lanes)) {
      if (!places.has(carried.attachment.id))
        places.set(carried.attachment.id, { space, ...carried });
    }
  }
  return places;
}

const newestFirst = (a: KeptItem, b: KeptItem) =>
  (b.ts ?? "").localeCompare(a.ts ?? "") || b.bytes - a.bytes;

/** Everything kept, by the space it came from: biggest space first, Other last. */
export function keptSections(
  files: readonly KeptFile[],
  spaces: readonly Space[],
  lanes: readonly Lane[],
): readonly KeptSection[] {
  const places = placesOf(spaces, lanes);
  const sections = new Map<string, { space: Space | undefined; items: KeptItem[] }>();
  for (const [id, parts] of gather(files)) {
    const place = places.get(id);
    const kind = kindFor(place?.attachment, parts);
    const item: KeptItem = {
      id,
      bytes: parts.bytes,
      picture: pictureFor(kind, parts),
      file: parts.file,
      kind,
      name: place?.attachment.filename ?? parts.fileName ?? id,
      attachment: place?.attachment,
      lineId: place?.lineId,
      ts: place?.ts,
    };
    const key = place?.space.id ?? OTHER;
    const section = sections.get(key) ?? { space: place?.space, items: [] };
    section.items.push(item);
    sections.set(key, section);
  }
  return [...sections.entries()]
    .map(([key, { space, items }]) => ({
      key,
      space,
      items: items.sort(newestFirst),
      bytes: items.reduce((sum, item) => sum + item.bytes, 0),
    }))
    .sort((a, b) => Number(a.key === OTHER) - Number(b.key === OTHER) || b.bytes - a.bytes);
}

/**
 * A space's own Media (ADR 0165): every file its lines carry, photos and videos, voice notes and
 * documents (core's `filesOf`), newest first, each with whatever this phone keeps of it. What the
 * phone has nothing of yet stands at nothing: a photo's or a measured video's tile draws the
 * thumbnail as a room's would, and anything else is marked by what it is.
 */
export function spaceMedia(
  space: Space,
  lanes: readonly Lane[],
  files: readonly KeptFile[],
): KeptSection {
  const held = gather(files);
  const items = filesOf(space, lanes)
    .map(({ attachment, lineId, ts }): KeptItem => {
      const parts = held.get(attachment.id) ?? { bytes: 0 };
      const kind = KINDS[kindOf(attachment.mimeType)];
      return {
        id: attachment.id,
        bytes: parts.bytes,
        picture: pictureFor(kind, parts),
        file: parts.file,
        kind,
        name: attachment.filename,
        attachment,
        lineId,
        ts,
      };
    })
    .sort(newestFirst);
  return {
    key: space.id,
    space,
    items,
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  };
}

/** How much is kept in all, and of how many files. */
export function keptTotal(sections: readonly KeptSection[]): {
  readonly bytes: number;
  readonly count: number;
} {
  return sections.reduce(
    (total, section) => ({
      bytes: total.bytes + section.bytes,
      count: total.count + section.items.length,
    }),
    { bytes: 0, count: 0 },
  );
}

/**
 * The viewer's deck for a section: its photos and videos, as the room's own deck describes them
 * (who sent each, when, where it stands in its message), in the order the section shows them, so a
 * swipe goes to the next tile. A video the server never measured, which no room's deck holds, is
 * the one-video deck a room opens it on from its row (core's `deckOfOne`), in its place. What none
 * of that holds — a photo of a line taken back — opens in Quick Look instead.
 */
export function keptDeck(
  section: KeptSection,
  lanes: readonly Lane[],
  directory: Directory,
): readonly DeckItem[] {
  if (section.space === undefined) return [];
  const room = deckOf(
    section.space,
    lanes,
    { around: "", messages: section.space.lines.length },
    directory,
  );
  const byId = new Map(room.map((item) => [item.attachment.id, item]));
  const space = section.space;
  return section.items.flatMap((item) => {
    const found = byId.get(item.id);
    if (found !== undefined) return [found];
    if (item.kind !== "video" || item.lineId === undefined) return [];
    return deckOfOne(space, lanes, { lineId: item.lineId, attachmentId: item.id }, directory);
  });
}

/** A row of the page's list: a space's head, or a row of its tiles. */
export type KeptRow =
  | { readonly kind: "head"; readonly key: string; readonly section: KeptSection }
  | {
      readonly kind: "tiles";
      readonly key: string;
      readonly section: KeptSection;
      readonly items: readonly KeptItem[];
      /**
       * Each tile's corners, beside it: square, but for the section's four outer ones, which are
       * `radius` round. The tile draws them, and the viewer flies out of and back into them.
       */
      readonly corners: readonly Corners[];
    };

/**
 * The sections as the list draws them: each space's head, then its tiles, `columns` to a row, the
 * section's outer corners `radius` round.
 */
export function rowsOf(
  sections: readonly KeptSection[],
  columns: number,
  radius: number,
): readonly KeptRow[] {
  const across = Math.max(1, Math.floor(columns));
  return sections.flatMap((section): KeptRow[] => {
    const count = Math.ceil(section.items.length / across);
    const tiles = Array.from({ length: count }, (_, at): KeptRow => {
      const items = section.items.slice(at * across, (at + 1) * across);
      const ends = { first: at === 0, last: at === count - 1, across, radius };
      return {
        kind: "tiles",
        key: `${section.key}:${at}`,
        section,
        items,
        corners: items.map((_, column) => cornersAt(column, ends)),
      };
    });
    return [{ kind: "head", key: section.key, section }, ...tiles];
  });
}

/** A tile's corners: round where it is at one of its section's four outer corners. */
function cornersAt(
  column: number,
  row: {
    readonly first: boolean;
    readonly last: boolean;
    readonly across: number;
    readonly radius: number;
  },
): Corners {
  const left = column === 0;
  const right = column === row.across - 1;
  return {
    topLeft: row.first && left ? row.radius : 0,
    topRight: row.first && right ? row.radius : 0,
    bottomRight: row.last && right ? row.radius : 0,
    bottomLeft: row.last && left ? row.radius : 0,
  };
}

/** The ids of every file in these sections: what a section's Delete, or Select all, takes. */
export function idsOf(sections: readonly KeptSection[]): readonly string[] {
  return sections.flatMap((section) => section.items.map((item) => item.id));
}
