/**
 * Media & files, a page of the room's sheet (ADR 0202, Arjun's B: "We have media and files
 * separate possibly could be combined"). The Media & files card on the first page turns to it.
 *
 * - **Media** first: the newest eight things the room's lines carry, four to a row, photos and
 *   videos as their pictures, a voice note and a document by their marks (core's `filesOf`, what
 *   the space's own Media lists, ADR 0165). A photo or a video opens the viewer over the sheet on
 *   the room's photos and videos, newest first as the page lists them, so the next is the next
 *   square (core's `newestDeckOf`), flying from its square and back to it as the space's own Media
 *   and the room's tiles do (Arjun, 19 October 2026); anything else opens in Quick Look.
 *   *See all*, and the eighth tile when there are more, close the sheet and open the space's own
 *   Media, which has all of them, and Delete.
 * - **Files** under it: the room's files at their current version (ADR 0100), as the Files page
 *   listed them, each opening the same way and unfolding its versions (`RoomFiles.tsx`).
 *
 * One scroll for the page, so a room with many files reaches them under its pictures.
 */

import {
  type CarriedFile,
  type DeckItem,
  type Directory,
  inAlbum,
  indexOfItem,
  type Lane,
  newestDeckOf,
  newestFilesOf,
  type Space,
} from "@chipschat/core";
import { type RefObject, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MediaProvider, useViewerTile } from "../media/MediaViewer";
import { cornersOf, type TileKey } from "../media/tiles";
import { Icon } from "../ui/Icon";
import { PageBack } from "../ui/PageBack";
import { SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { FileService } from "./files";
import { FilesList, type RoomFilesRead } from "./RoomFiles";
import { Section, ThumbOf, useThumb } from "./RoomTiles";

/** How many of the newest things the page shows before See all. */
export const PAGE_MEDIA = 8;
/** Four to a row. */
const ACROSS = 4;
/** A square's corners, each rounded on its own: where the viewer's flight leaves and lands. */
const CORNERS = cornersOf(RADIUS.sm);
/** The page shows the newest eight: a picture the viewer pages to past them has no square to scroll to. */
const stay = (): void => undefined;
/** What a square before the last stands for besides itself. */
const NONE: readonly TileKey[] = [];

export function MediaFilesPage({
  space,
  lanes,
  directory,
  selfId,
  files,
  read,
  onBack,
  onSeeAll,
  onGoTo,
}: {
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService | undefined;
  readonly read: RoomFilesRead;
  readonly onBack: () => void;
  /** The space's own Media, once the sheet has gone (ADR 0165); without it, no See all. */
  readonly onSeeAll: (() => void) | undefined;
  /** *Go to message* from the viewer: the sheet closes onto the line. */
  readonly onGoTo: (lineId: string) => void;
}) {
  const glass = useRef<View>(null);
  return (
    // The viewer's host is the page's own, inside the sheet, so the viewer stands over it: iOS
    // presents a modal only from the one that holds it.
    <MediaProvider
      space={undefined}
      lanes={lanes}
      directory={directory}
      files={files}
      glass={glass}
      onReveal={stay}
      onGoTo={onGoTo}
    >
      <Page
        space={space}
        lanes={lanes}
        directory={directory}
        selfId={selfId}
        files={files}
        read={read}
        glass={glass}
        onBack={onBack}
        onSeeAll={onSeeAll}
        onGoTo={onGoTo}
      />
    </MediaProvider>
  );
}

function Page({
  space,
  lanes,
  directory,
  selfId,
  files,
  read,
  glass,
  onBack,
  onSeeAll,
  onGoTo,
}: {
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService | undefined;
  readonly read: RoomFilesRead;
  /** What the page scrolls in: the viewer's flight is clipped to it, as the squares are. */
  readonly glass: RefObject<View | null>;
  readonly onBack: () => void;
  readonly onSeeAll: (() => void) | undefined;
  readonly onGoTo: (lineId: string) => void;
}) {
  const palette = usePalette();
  const media = newestFilesOf(space, lanes);
  const { failed, open } = useOpening(space, lanes, directory, files);
  return (
    <View style={styles.page}>
      <PageBack title="Media & files" onBack={onBack} testID="room-media-back" />
      <View ref={glass} collapsable={false} style={styles.glass}>
        <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
          <Section
            name="Media"
            count={media.length}
            trailing={
              onSeeAll === undefined || media.length === 0 ? null : <SeeAll onPress={onSeeAll} />
            }
          />
          {media.length === 0 ? (
            <Text style={[styles.none, { color: palette.ink3 }]}>
              Nothing has been sent here yet.
            </Text>
          ) : (
            <MediaGrid media={media} files={files} onOpen={open} onSeeAll={onSeeAll} />
          )}
          {failed === undefined ? null : (
            <Text style={[styles.failed, { color: palette.red }]} testID="room-media-failed">
              {failed}
            </Text>
          )}
          <View style={styles.files}>
            <Section name="Files" count={read.listed?.length} />
            <FilesWait listed={read.listed} />
            <FilesList
              read={read}
              files={files}
              directory={directory}
              selfId={selfId}
              onGoTo={onGoTo}
            />
          </View>
        </SheetScroll>
      </View>
    </View>
  );
}

/** How a square opens the viewer: from itself, on the picture it shows and the deck it is handed. */
type Fly = (thumb: string | undefined, deck: readonly DeckItem[]) => void;

/**
 * Opening a thing the room carries: a photo or a video in the viewer, flown from its square, on
 * the room's every photo and video, newest first as the page has them, so a swipe goes on through
 * the rest in the page's order; anything else in Quick Look, or why it would not.
 */
function useOpening(
  space: Space,
  lanes: readonly Lane[],
  directory: Directory,
  files: FileService | undefined,
) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const open = async (item: CarriedFile, picture: string | undefined, fly: Fly | undefined) => {
    setFailed(undefined);
    if (files === undefined) return;
    const { attachment } = item;
    const deck = inAlbum(attachment) ? newestDeckOf(space, lanes, directory) : [];
    if (fly !== undefined && indexOfItem(deck, attachment.id) !== -1) {
      fly(picture, deck);
      return;
    }
    try {
      await files.preview(attachment);
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return { failed, open };
}

/** *See all ›*, at the Media heading's right. */
function SeeAll({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="See all media"
      onPress={onPress}
      hitSlop={SPACE.sm}
      testID="room-media-all"
      style={({ pressed }) => [styles.all, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.allWords, { color: palette.ink3 }]}>See all</Text>
      <Icon name="next" size={15} color={palette.ink3} />
    </Pressable>
  );
}

/**
 * The newest eight, four to a row; the eighth says how many more and opens See all, and is where
 * the viewer flies the ones past it home to.
 */
function MediaGrid({
  media,
  files,
  onOpen,
  onSeeAll,
}: {
  readonly media: readonly CarriedFile[];
  readonly files: FileService | undefined;
  readonly onOpen: (item: CarriedFile, picture: string | undefined, fly: Fly | undefined) => void;
  readonly onSeeAll: (() => void) | undefined;
}) {
  const shown = media.slice(0, PAGE_MEDIA);
  const more = onSeeAll === undefined ? 0 : media.length - shown.length;
  const rows: (CarriedFile | undefined)[][] = [];
  for (let at = 0; at < shown.length; at += ACROSS) {
    const row: (CarriedFile | undefined)[] = shown.slice(at, at + ACROSS);
    while (row.length < ACROSS) row.push(undefined);
    rows.push(row);
  }
  // The square that says how many more, when there are.
  const last = more > 0 ? shown.at(-1)?.attachment.id : undefined;
  const past =
    more > 0
      ? media
          .slice(PAGE_MEDIA)
          .map((each) => ({ lineId: each.lineId, attachmentId: each.attachment.id }))
      : NONE;
  return (
    <View style={styles.grid} testID="room-media">
      {rows.map((row, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows of a fixed grid.
        <View key={at} style={styles.gridRow}>
          {row.map((item, across) =>
            item === undefined ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: spacers, all alike.
              <View key={`gap-${across}`} style={styles.cell} />
            ) : (
              <Cell
                key={item.attachment.id}
                item={item}
                files={files}
                more={item.attachment.id === last ? more : undefined}
                beyond={item.attachment.id === last ? past : NONE}
                onOpen={onOpen}
                onSeeAll={onSeeAll}
              />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * One of the grid's squares; the last, when there are more, with how many over it. A square is a
 * tile to the viewer, as the space's own Media's are: measured to fly from and back to, and hidden
 * while its picture is up on the stage. The one that says how many more opens See all, and is
 * where its own picture and every one past it land, since they have no square of their own (Foodie,
 * 24 October 2026).
 */
function Cell({
  item,
  files,
  more,
  beyond,
  onOpen,
  onSeeAll,
}: {
  readonly item: CarriedFile;
  readonly files: FileService | undefined;
  readonly more: number | undefined;
  /** The ones past the page's eight, on the square that says how many. */
  readonly beyond: readonly TileKey[];
  readonly onOpen: (item: CarriedFile, picture: string | undefined, fly: Fly | undefined) => void;
  readonly onSeeAll: (() => void) | undefined;
}) {
  const { attachment } = item;
  const picture = useThumb(files, inAlbum(attachment) ? attachment.id : undefined);
  const tile = useViewerTile(item.lineId, attachment.id, CORNERS, beyond);
  return (
    <Pressable
      ref={tile.ref}
      accessibilityRole="button"
      accessibilityLabel={
        more === undefined ? `Open ${attachment.filename}` : `See all media, ${more} more`
      }
      onPress={() => (more === undefined ? onOpen(item, picture, tile.open) : onSeeAll?.())}
      testID={more === undefined ? `room-media-${attachment.id}` : "room-media-more"}
      style={({ pressed }) => [
        styles.cell,
        pressed ? styles.pressed : null,
        tile.hidden ? styles.away : null,
      ]}
    >
      <ThumbOf item={item} picture={picture} />
      {more === undefined ? null : <More more={more} over={inAlbum(item.attachment)} />}
    </Pressable>
  );
}

/**
 * How many more there are, over the last square: dimming its picture, or standing in for a mark,
 * which the count would only muddle.
 */
function More({ more, over }: { readonly more: number; readonly over: boolean }) {
  const palette = usePalette();
  return (
    <View style={[styles.more, over ? styles.dim : { backgroundColor: palette.surface3 }]}>
      <Text style={[styles.moreWords, { color: over ? "#ffffff" : palette.ink2 }]}>+{more}</Text>
    </View>
  );
}

/** Under Files, while the server is asked, or when the room has none. */
function FilesWait({ listed }: { readonly listed: readonly unknown[] | undefined }) {
  const palette = usePalette();
  if (listed !== undefined && listed.length > 0) return null;
  return (
    <Text style={[styles.none, { color: palette.ink3 }]}>
      {listed === undefined ? "Reading the space's files…" : "No files yet."}
    </Text>
  );
}

const styles = StyleSheet.create({
  // A page of the room sheet: its list gives, scrolling in what the sheet leaves it.
  page: { flexShrink: 1, minHeight: 0 },
  glass: { flexShrink: 1, minHeight: 0, marginTop: SPACE.sm },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: { paddingBottom: SPACE.xs },
  // Each square rounded on its own, so a short last row ends cleanly.
  grid: { gap: 4 },
  gridRow: { flexDirection: "row", gap: 4 },
  cell: { flex: 1, aspectRatio: 1 },
  pressed: { opacity: 0.7 },
  // Its picture is up on the viewer's stage, which lands back here.
  away: { opacity: 0 },
  more: {
    borderRadius: RADIUS.sm,
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { backgroundColor: "rgba(0,0,0,0.45)" },
  moreWords: { fontSize: TEXT.lg, fontWeight: "600" },
  all: { flexDirection: "row", alignItems: "center", gap: 1 },
  allWords: { fontSize: TEXT.md, fontWeight: "500" },
  none: { fontSize: TEXT.md, marginHorizontal: SPACE.xs, marginBottom: SPACE.sm },
  files: { marginTop: SPACE.md },
  failed: { fontSize: TEXT.sm, marginTop: SPACE.sm, marginHorizontal: SPACE.xs },
});
