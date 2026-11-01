/**
 * Media on this phone (ADR 0159): everything this phone keeps, in one section per space, and a way
 * to let some of it go.
 *
 * The row on You says how much is kept and opens this page. At its head, the total and Clear all,
 * which is what that row's Clear used to do. Then each space that has files here — biggest first,
 * since the page is for making room — under its own face and name, with its files as tiles,
 * newest first (`kept.ts`); what no room on the phone carries comes last, as Other.
 *
 * **Opening is a room's** (ADR 0161). The page hosts the media viewer as a room does, and each tile
 * registers with it: a photo or a video flies out of its tile on the tile's own pixels, which are
 * on the phone, and back into it on the way out, over the section's own deck, newest first. The
 * picture behind the thumbnail is looked for on the phone before the server is asked, and so is a
 * video's copy that plays. A swipe onto a file whose tile is off the page scrolls the page to it,
 * so the way out still lands on its tile; Go to message lands in its room. Any other file opens in
 * Quick Look.
 *
 * **Delete** takes files off this phone and nowhere else: they stay in their space, and the next
 * look fetches them again (`forgetKept`, which also tells the file service to forget their URIs).
 * Nothing in Chips deletes a file from a space for everyone. A section's Delete asks first and
 * takes the space's files; **Select** in the bar, or a long press on a tile, puts a circle on every
 * tile, and the picked ones go from the bar at the foot, which says how many and how much, having
 * asked. While selecting, each section's Delete is Select all. The rows below close up on the
 * phone's own transition (`GROWS`).
 *
 * **A space's own Media** (ADR 0165) is this page for one space, from the Media row of the space's
 * details: every file the space's lines carry, photos, videos, voice notes and documents, newest
 * first (`spaceMedia`), not only what the phone keeps. Its head says how much of it is on this
 * phone, with Delete, which takes the space's files off this phone, as a section's Delete does
 * here; Select, the circles and the bar are the same. A photo's or a measured video's tile the
 * phone has nothing of draws its thumbnail as a room's tile does; a voice note or a document is
 * marked by what it is, and opens in Quick Look from the server. Go to message goes back to the
 * room, at the line.
 */

import {
  type DeckItem,
  formatDuration,
  inAlbum,
  type Snapshot,
  type Store,
  spaceTitle,
} from "@chipschat/core";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  type FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { thisDevice } from "../device/word";
import { MediaProvider, useViewerTile } from "../media/MediaViewer";
import type { Corners } from "../media/tiles";
import type { FileService } from "../spaces/files";
import { clearKept, forgetKept, type KeptFile, keptFiles, previewLocally } from "../spaces/local";
import { RowAvatar } from "../spaces/RowAvatar";
import { useSnapshot } from "../store/provider";
import { ON_GOLD } from "../ui/Button";
import { Capsule } from "../ui/Glass";
import { GROWS, GrowingList } from "../ui/growing";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { COLUMN } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import {
  idsOf,
  type KeptItem,
  type KeptRow,
  type KeptSection,
  keptDeck,
  keptSections,
  keptTotal,
  OTHER,
  rowsOf,
  spaceMedia,
} from "./kept";
import {
  keptWords,
  pickedAsk,
  pickedWords,
  sectionAsk,
  sizeWords,
  spaceMediaAsk,
  spaceMediaWords,
} from "./words";

/** The gap between tiles, as a room's album has it. */
const GAP = 2;
/** The smallest a tile may be: four across on any phone, more on an iPad. */
const MIN_TILE = 84;
/** How far up the select bar comes from, and the room the list leaves it at its foot. */
const BAR = 64;

/** The words a tile, a head and a summary are drawn with, and what a press on each does. */
interface Page {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly files: FileService;
  /**
   * A space's own Media: a tile the phone keeps nothing of fetches its thumbnail, again after each
   * Delete, which counts here (ADR 0165).
   */
  readonly fetches: number | undefined;
  readonly side: number;
  readonly selecting: boolean;
  readonly picked: ReadonlySet<string>;
  readonly titleOf: (section: KeptSection) => string;
  /** The section's photos and videos for the viewer, cut when a tile is tapped. */
  readonly deckFor: (section: KeptSection) => readonly DeckItem[];
  readonly toggle: (id: string) => void;
  /** A file with no viewer to open in: Quick Look. */
  readonly show: (item: KeptItem) => void;
  readonly onHold: (item: KeptItem) => void;
  readonly onSection: (section: KeptSection) => void;
}

export function MediaPage({
  store,
  files,
  selfId,
  spaceId,
}: {
  readonly store: Store;
  readonly files: FileService;
  readonly selfId: string;
  /** A space's own Media (ADR 0165): every photo and video of this space. */
  readonly spaceId?: string | undefined;
}) {
  const snapshot = useSnapshot(store);
  const insets = useSafeAreaInsets();
  const { kept, reload, loads } = useKept();
  const { lanes } = snapshot.model;
  const one = spaceId !== undefined;
  const side = useTileSide();
  const { sections, rows } = useSections(kept, snapshot, spaceId, side.columns);
  const picking = usePicking(sections);
  const glass = useRef<View>(null);
  const list = useRef<FlatList<KeptRow>>(null);
  const titleOf = useCallback(
    (section: KeptSection) =>
      section.space === undefined ? "Other" : spaceTitle(section.space, snapshot.directory, selfId),
    [snapshot.directory, selfId],
  );
  const total = keptTotal(sections);

  const letGo = (ids: readonly string[]) =>
    void forgetKept(ids).finally(() => {
      picking.stop();
      reload();
    });
  const page: Page = {
    snapshot,
    selfId,
    files,
    fetches: one ? loads : undefined,
    side: side.tile,
    selecting: picking.selecting,
    picked: picking.picked,
    titleOf,
    deckFor: (section) => keptDeck(section, lanes, snapshot.directory),
    toggle: picking.toggle,
    show: (item) =>
      void show(item, files).catch((failure: unknown) =>
        Alert.alert(
          "Couldn't open it",
          failure instanceof Error ? failure.message : String(failure),
        ),
      ),
    onHold: (item) => {
      if (picking.selecting) return;
      feel.lift();
      picking.start(item.id);
    },
    onSection: (section) => {
      const ids = idsOf([section]);
      if (picking.selecting)
        return picking.pickAll(ids, !ids.every((id) => picking.picked.has(id)));
      const words = sectionWords(section, one, titleOf);
      ask(words.title, words.message, () => letGo(ids));
    },
  };
  const deletePicked = () => {
    const chosen = sections.filter((section) =>
      section.items.some((item) => picking.picked.has(item.id)),
    );
    const named = chosen.filter((section) => section.key !== OTHER).map(titleOf);
    const words = pickedAsk(picking.picked.size, named, thisDevice());
    ask(words.title, words.message, () => letGo([...picking.picked]));
  };
  const clearAll = () =>
    Alert.alert(
      `Clear ${sizeWords(total.bytes)}?`,
      `Photos, videos and files opened on ${thisDevice()} are let go. They come back from the server the next time they're opened.`,
      [
        { text: "Keep them", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void Promise.all([clearKept(), Image.clearDiskCache()]).finally(() => {
              picking.stop();
              reload();
            });
          },
        },
      ],
    );

  const pickedBytes = sections
    .flatMap((section) => section.items)
    .filter((item) => picking.picked.has(item.id))
    .reduce((sum, item) => sum + item.bytes, 0);
  const host = useHost(sections, rows, list, one);
  const head = headOf(sections, one, page, clearAll);
  return (
    <MediaProvider
      space={undefined}
      lanes={lanes}
      directory={snapshot.directory}
      files={files}
      glass={glass}
      onReveal={host.reveal}
      onGoTo={host.goTo}
    >
      <BarItem
        shown={total.count > 0}
        selecting={picking.selecting}
        onPress={picking.selecting ? picking.stop : () => picking.start()}
      />
      <View ref={glass} style={styles.glass} collapsable={false}>
        <GrowingList
          ref={list}
          data={rows}
          keyExtractor={(row: KeptRow) => row.key}
          renderItem={({ item: row }: { item: KeptRow }) => <RowOf row={row} page={page} />}
          itemLayoutAnimation={GROWS}
          extraData={page}
          onScrollToIndexFailed={host.missed}
          ListHeaderComponent={
            kept === undefined || total.count === 0 ? null : (
              <Summary bytes={total.bytes} words={head.words} act={head.act} />
            )
          }
          ListEmptyComponent={kept === undefined ? null : <Nothing one={one} />}
          ListFooterComponent={total.count === 0 ? null : <Foot one={one} />}
          contentContainerStyle={[
            styles.list,
            side.wide ? styles.column : null,
            { paddingBottom: insets.bottom + (picking.selecting ? BAR + SPACE.xl : SPACE.xxl) },
          ]}
          testID="media-list"
        />
      </View>
      <PickBar
        shown={picking.selecting && picking.picked.size > 0}
        words={pickedWords(picking.picked.size, pickedBytes)}
        bottom={insets.bottom + SPACE.sm}
        onDelete={deletePicked}
      />
    </MediaProvider>
  );
}

/**
 * What the viewer asks of the page: to scroll to a tile it has come to rest on off the page, so
 * the way out lands on it, as a room scrolls to the line; and, for Go to message, the room.
 */
function useHost(
  sections: readonly KeptSection[],
  rows: readonly KeptRow[],
  list: RefObject<FlatList<KeptRow> | null>,
  one: boolean,
) {
  const router = useRouter();
  const holds = (row: KeptRow, lineId: string) =>
    row.kind === "tiles" && row.items.some((item) => item.lineId === lineId);
  const to = (index: number) =>
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
  return {
    reveal: (lineId: string) => {
      const index = rows.findIndex((row) => holds(row, lineId));
      if (index >= 0) to(index);
    },
    /** A row not drawn yet: near it by the rows' average height, then onto it once it is. */
    missed: ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
      requestAnimationFrame(() => to(index));
    },
    goTo: (lineId: string) => {
      const space = sections.find((section) =>
        section.items.some((item) => item.lineId === lineId),
      )?.space;
      if (space === undefined) return;
      // From a space's own Media, back to its room, which is under this page, at the line.
      const room = `/spaces/${space.id}?at=line:${lineId}`;
      if (one) router.dismissTo(room);
      else router.push(room);
    },
  };
}

/** What is kept, read from the disk when the page opens and again after anything is let go. */
function useKept(): {
  readonly kept: readonly KeptFile[] | undefined;
  readonly reload: () => void;
  /** How many times it has been read: a tile fetches its thumbnail again after each. */
  readonly loads: number;
} {
  const [kept, setKept] = useState<readonly KeptFile[] | undefined>(undefined);
  const [loads, setLoads] = useState(0);
  const reload = useCallback(() => {
    const read = (files: readonly KeptFile[]) => {
      setKept(files);
      setLoads((now) => now + 1);
    };
    keptFiles().then(read, () => read([]));
  }, []);
  useEffect(reload, [reload]);
  return { kept, reload, loads };
}

/**
 * The picture a tile draws: what the phone keeps, or, on a space's own Media, the thumbnail the
 * file service fetches for a tile the phone keeps nothing of, as a room's tile asks for it.
 */
function usePicture(item: KeptItem, page: Page): string | undefined {
  // Only what the server made a thumbnail or a poster of has one to ask for.
  const drawn = item.attachment !== undefined && inAlbum(item.attachment);
  const wanted = page.fetches !== undefined && item.picture === undefined && drawn;
  const fetched = useThumb(page.files, wanted ? item.id : undefined, page.fetches ?? 0);
  return item.picture ?? fetched;
}

/** A thumbnail from the file service, asked again at each load: a Delete lets go of the last one. */
function useThumb(files: FileService, id: string | undefined, load: number): string | undefined {
  const [got, setGot] = useState<{ readonly key: string; readonly uri: string } | undefined>();
  const key = `${id}:${load}`;
  useEffect(() => {
    if (id === undefined) return;
    let live = true;
    files.thumb(id).then(
      (uri) => {
        if (live) setGot({ key, uri });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, id, key]);
  return id !== undefined && got?.key === key ? got.uri : undefined;
}

/** Whether the page is selecting, and which files are picked: only ones still kept. */
function usePicking(sections: readonly KeptSection[]) {
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const present = useMemo(() => new Set(idsOf(sections)), [sections]);
  const picked = useMemo(
    () => new Set([...chosen].filter((id) => present.has(id))),
    [chosen, present],
  );
  const pickAll = (ids: readonly string[], on: boolean) =>
    setChosen((now) => {
      const next = new Set(now);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  return {
    selecting,
    picked,
    toggle: (id: string) => pickAll([id], !picked.has(id)),
    pickAll,
    start: (first?: string) => {
      setSelecting(true);
      setChosen(new Set(first === undefined ? [] : [first]));
    },
    stop: () => {
      setSelecting(false);
      setChosen(new Set());
    },
  };
}

/** How wide a tile is: as many across as fit at the smallest, the column's width shared out. */
function useTileSide(): {
  readonly tile: number;
  readonly columns: number;
  readonly wide: boolean;
} {
  const { width } = useWindowDimensions();
  const wide = width > COLUMN;
  const inner = Math.min(width, COLUMN) - SPACE.lg * 2;
  const columns = Math.max(4, Math.floor((inner + GAP) / (MIN_TILE + GAP)));
  return { tile: (inner - GAP * (columns - 1)) / columns, columns, wide };
}

/** A file with no viewer to open in, or none on this page's deck: Quick Look, as a room opens it. */
async function show(item: KeptItem, files: FileService): Promise<void> {
  const type = item.attachment?.mimeType ?? "application/octet-stream";
  if (item.file !== undefined) return previewLocally(item.file, item.name, type);
  if (item.attachment !== undefined) return files.preview(item.attachment);
  if (item.picture !== undefined) return previewLocally(item.picture, item.name, "image/webp");
}

/** What a section's Delete asks: a space's own Media's words, or a section's here (ADR 0165). */
function sectionWords(
  section: KeptSection,
  one: boolean,
  titleOf: (section: KeptSection) => string,
): { readonly title: string; readonly message: string } {
  if (one) return spaceMediaAsk(titleOf(section), section.bytes, thisDevice());
  const title = section.key === OTHER ? undefined : titleOf(section);
  return sectionAsk(title, section.items.length, section.bytes, thisDevice());
}

function ask(title: string, message: string, onDelete: () => void): void {
  Alert.alert(title, message, [
    { text: "Keep them", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onDelete },
  ]);
}

function RowOf({ row, page }: { readonly row: KeptRow; readonly page: Page }) {
  if (row.kind === "head") return <Head section={row.section} page={page} />;
  return (
    <View style={styles.tiles}>
      {row.items.map((item, at) => (
        <Tile
          key={item.id}
          item={item}
          corners={row.corners[at]}
          section={row.section}
          page={page}
        />
      ))}
    </View>
  );
}

/** A space's face and name, how much it keeps, and its Delete — Select all, while selecting. */
function Head({ section, page }: { readonly section: KeptSection; readonly page: Page }) {
  const palette = usePalette();
  const title = page.titleOf(section);
  const all = section.items.every((item) => page.picked.has(item.id));
  const act = page.selecting ? (all ? "Deselect all" : "Select all") : "Delete";
  return (
    <View style={styles.head} testID={`media-section-${section.key}`}>
      {section.space === undefined ? (
        <View style={[styles.otherMark, { backgroundColor: palette.surface3 }]}>
          <Icon name="drawers" size={17} color={palette.ink2} />
        </View>
      ) : (
        <RowAvatar
          space={section.space}
          directory={page.snapshot.directory}
          title={title}
          icon={page.snapshot.spaceIcons.get(section.space.id)}
          size="sm"
        />
      )}
      <View style={styles.headWords}>
        <Text style={[styles.headName, { color: palette.ink }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.headSub, { color: palette.ink3 }]}>
          {`${sizeWords(section.bytes)} · ${section.items.length}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${act}, ${title}`}
        hitSlop={SPACE.sm}
        onPress={() => page.onSection(section)}
        testID={`media-section-act-${section.key}`}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: palette.surface2 },
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.pillWord, { color: page.selecting ? palette.ink : palette.red }]}>
          {act}
        </Text>
      </Pressable>
    </View>
  );
}

/** One file: its picture where the phone has one, or what it is; a circle while selecting. */
function Tile({
  item,
  corners,
  section,
  page,
}: {
  readonly item: KeptItem;
  /** Square, but for a section's outer four: the tile draws them, and the viewer lands on them. */
  readonly corners: Corners | undefined;
  readonly section: KeptSection;
  readonly page: Page;
}) {
  const palette = usePalette();
  const picked = page.picked.has(item.id);
  const verb = item.kind === "video" ? "Play" : "Open";
  // Its part in the viewer: measured to fly from, hidden while its picture is up on the stage.
  const tile = useViewerTile(item.lineId, item.id, corners);
  const picture = usePicture(item, page);
  const press = () => {
    if (page.selecting) return page.toggle(item.id);
    const deck = page.deckFor(section);
    if (tile.open !== undefined && deck.some((each) => each.attachment.id === item.id)) {
      return tile.open(picture, deck);
    }
    page.show(item);
  };
  return (
    <Pressable
      ref={tile.ref}
      accessibilityRole="button"
      accessibilityLabel={page.selecting ? item.name : `${verb} ${item.name}`}
      accessibilityState={page.selecting ? { selected: picked } : {}}
      onPress={press}
      onLongPress={() => page.onHold(item)}
      testID={`kept-${item.id}`}
      style={[
        styles.tile,
        { width: page.side, height: page.side, backgroundColor: palette.surface2 },
        corners === undefined ? null : roundedAt(corners),
        tile.hidden ? styles.away : null,
      ]}
    >
      {picture === undefined ? (
        <Kind item={item} />
      ) : (
        <Image
          source={{ uri: picture }}
          contentFit="cover"
          recyclingKey={item.id}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
        />
      )}
      {item.kind === "video" && item.attachment?.durationMs !== undefined ? (
        <View style={styles.length} pointerEvents="none" testID={`kept-length-${item.id}`}>
          <Icon name="playFill" color="#fff" size={9} />
          <Text style={styles.lengthWords}>{formatDuration(item.attachment.durationMs)}</Text>
        </View>
      ) : null}
      {page.selecting ? <Pick picked={picked} /> : null}
    </Pressable>
  );
}

/** A tile's corners as a style. */
function roundedAt(corners: Corners) {
  return {
    borderTopLeftRadius: corners.topLeft,
    borderTopRightRadius: corners.topRight,
    borderBottomRightRadius: corners.bottomRight,
    borderBottomLeftRadius: corners.bottomLeft,
  };
}

/** What a tile with no picture is marked with. */
const KIND_MARK = { photo: "image", video: "play", voice: "mic", file: "doc" } as const;

/** A file with no picture: a voice note's length, or a document's kind and name. */
function Kind({ item }: { readonly item: KeptItem }) {
  const palette = usePalette();
  if (item.kind === "voice") {
    const length = item.attachment?.durationMs;
    return (
      <View style={styles.kind}>
        <Icon name="mic" size={22} color={palette.ink3} />
        {length === undefined ? null : (
          <Text style={[styles.kindName, { color: palette.ink2 }]}>{formatDuration(length)}</Text>
        )}
      </View>
    );
  }
  const dot = item.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : item.name.slice(dot + 1).toUpperCase();
  return (
    <View style={styles.kind}>
      <Icon name={KIND_MARK[item.kind]} size={20} color={palette.ink3} />
      {extension === "" ? null : (
        <Text style={[styles.kindExt, { color: palette.ink2 }]}>{extension.slice(0, 5)}</Text>
      )}
      <Text style={[styles.kindName, { color: palette.ink3 }]} numberOfLines={1}>
        {item.name}
      </Text>
    </View>
  );
}

/** The circle at a tile's corner while selecting: empty, or gold with a tick, the tile dimmed. */
function Pick({ picked }: { readonly picked: boolean }) {
  const palette = usePalette();
  return (
    <>
      {picked ? <View style={styles.dim} pointerEvents="none" /> : null}
      <View
        pointerEvents="none"
        style={[styles.circle, picked ? { backgroundColor: palette.gold } : styles.empty]}
      >
        {picked ? <Icon name="check" size={13} color={ON_GOLD} weight={2.5} /> : null}
      </View>
    </>
  );
}

/**
 * What the page's head says under its size, and offers: on Media on this phone, how many files from
 * how many spaces, and Clear all; on a space's own Media, how many files, and what its
 * one section's head would offer (ADR 0165).
 */
function headOf(
  sections: readonly KeptSection[],
  one: boolean,
  page: Page,
  clearAll: () => void,
): { readonly words: string; readonly act: Act | undefined } {
  const { count } = keptTotal(sections);
  const only = one ? sections[0] : undefined;
  if (only === undefined) {
    const spaces = sections.filter((section) => section.key !== OTHER).length;
    return { words: keptWords(count, spaces), act: clearAllAct(page.selecting, clearAll) };
  }
  return {
    words: spaceMediaWords(count, thisDevice()),
    act: spaceAct(only, page, page.titleOf(only)),
  };
}

/** Media on this phone's head offers Clear all, but not while selecting. */
function clearAllAct(selecting: boolean, onPress: () => void): Act | undefined {
  if (selecting) return undefined;
  const label = `Clear all media on ${thisDevice()}`;
  return { word: "Clear all", tone: "amber", label, id: "media-clear-all", onPress };
}

/**
 * A space's own Media's head offers what a section's head does (ADR 0165): Delete, where the phone
 * keeps any of it, and Select all, or Deselect all, while selecting.
 */
function spaceAct(section: KeptSection, page: Page, title: string): Act | undefined {
  const onPress = () => page.onSection(section);
  const id = "media-space-act";
  if (page.selecting) {
    const word = section.items.every((item) => page.picked.has(item.id))
      ? "Deselect all"
      : "Select all";
    return { word, tone: "ink", label: word, id, onPress };
  }
  if (section.bytes === 0) return undefined;
  const label = `Delete ${title}'s files from ${thisDevice()}`;
  return { word: "Delete", tone: "red", label, id, onPress };
}

/**
 * The sections the page draws, and their rows: everything kept, by space; or, for a space's own
 * Media, that space's one section, whose head is the page's (ADR 0165).
 */
function useSections(
  kept: readonly KeptFile[] | undefined,
  snapshot: Snapshot,
  spaceId: string | undefined,
  columns: number,
): { readonly sections: readonly KeptSection[]; readonly rows: readonly KeptRow[] } {
  const { spaces, lanes } = snapshot.model;
  const space = spaceId === undefined ? undefined : spaces.find((each) => each.id === spaceId);
  return useMemo(() => {
    if (kept === undefined) return { sections: [], rows: [] };
    if (spaceId === undefined) {
      const sections = keptSections(kept, spaces, lanes);
      return { sections, rows: rowsOf(sections, columns, RADIUS.lg) };
    }
    const sections = space === undefined ? [] : [spaceMedia(space, lanes, kept)];
    const rows = rowsOf(sections, columns, RADIUS.lg).filter((row) => row.kind !== "head");
    return { sections, rows };
  }, [kept, spaces, lanes, spaceId, space, columns]);
}

/** What the head of the page offers, at its right: Clear all, Delete, or Select all. */
interface Act {
  readonly word: string;
  readonly tone: "amber" | "red" | "ink";
  readonly label: string;
  readonly id: string;
  readonly onPress: () => void;
}

/** The total at the head of the page, and what it offers. */
function Summary({
  bytes,
  words,
  act,
}: {
  readonly bytes: number;
  readonly words: string;
  readonly act: Act | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.summary, { backgroundColor: palette.surface }]} testID="media-summary">
      <View style={styles.headWords}>
        <Text style={[styles.total, { color: palette.ink }]}>{sizeWords(bytes)}</Text>
        <Text style={[styles.headSub, { color: palette.ink3 }]}>{words}</Text>
      </View>
      {act === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={act.label}
          hitSlop={SPACE.sm}
          onPress={act.onPress}
          testID={act.id}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: palette.surface2 },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.pillWord, { color: palette[act.tone] }]}>{act.word}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Foot({ one }: { readonly one: boolean }) {
  const palette = usePalette();
  return (
    <Text style={[styles.foot, { color: palette.ink3 }]}>
      {one
        ? `Deleting here takes photos, videos and files off ${thisDevice()} only: they stay in the space, for everyone in it, and come back from the server when they're opened again.`
        : `What was opened or shown here is kept, so a second look costs nothing. Deleting it here takes it off ${thisDevice()} only: it stays in its space and comes back from the server when it's opened again.`}
    </Text>
  );
}

function Nothing({ one }: { readonly one: boolean }) {
  const palette = usePalette();
  return (
    <Text style={[styles.nothing, { color: palette.ink3 }]} testID="media-nothing">
      {one
        ? "No photos, videos or files in this space yet."
        : `Nothing is kept on ${thisDevice()}. Photos, videos and files are kept here once they're opened or shown in a space.`}
    </Text>
  );
}

/** Select, or Cancel while selecting, at the bar's right; nothing when nothing is kept. */
function BarItem({
  shown,
  selecting,
  onPress,
}: {
  readonly shown: boolean;
  readonly selecting: boolean;
  readonly onPress: () => void;
}) {
  const word = <BarWord word={selecting ? "Cancel" : "Select"} onPress={onPress} />;
  return (
    <Stack.Screen
      options={{
        // On iOS the bar's own item, its glass hidden so the word draws its own; elsewhere, the
        // bar's right-hand slot, which the items replace on iOS (as the context editor's Save).
        unstable_headerRightItems: () =>
          shown ? [{ type: "custom", element: word, hidesSharedBackground: true }] : [],
        headerRight: () => (shown ? word : null),
      }}
    />
  );
}

function BarWord({ word, onPress }: { readonly word: string; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={word}
      hitSlop={SPACE.sm}
      onPress={onPress}
      testID={`media-${word.toLowerCase()}`}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <Capsule style={styles.barPill}>
        <Text style={[styles.barWord, { color: palette.ink }]}>{word}</Text>
      </Capsule>
    </Pressable>
  );
}

/** The bar at the foot while files are picked: how many and how much, and Delete. */
function PickBar({
  shown,
  words,
  bottom,
  onDelete,
}: {
  readonly shown: boolean;
  readonly words: string;
  readonly bottom: number;
  readonly onDelete: () => void;
}) {
  const palette = usePalette();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, {
      toValue: shown ? 1 : 0,
      useNativeDriver: true,
      stiffness: 260,
      damping: 26,
      mass: 1,
    }).start();
  }, [rise, shown]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [bottom + BAR * 2, 0] });
  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      style={[styles.barSlot, { bottom, transform: [{ translateY }] }]}
      testID={shown ? "media-pick-bar" : undefined}
    >
      <Capsule style={styles.pickBar}>
        <Text style={[styles.pickWords, { color: palette.ink }]} numberOfLines={1}>
          {words}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete the picked files from ${thisDevice()}`}
          onPress={onDelete}
          testID="media-delete-picked"
          style={({ pressed }) => [
            styles.deletePill,
            { backgroundColor: palette.red },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.deleteWord}>Delete</Text>
        </Pressable>
      </Capsule>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm },
  column: { width: COLUMN, alignSelf: "center" },
  summary: {
    borderRadius: RADIUS.xxl,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    marginBottom: SPACE.sm,
  },
  total: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4, fontVariant: ["tabular-nums"] },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm + 2,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  otherMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  headWords: { flex: 1, minWidth: 0 },
  headName: { fontSize: TEXT.md, fontWeight: "600" },
  headSub: { fontSize: TEXT.sm, fontVariant: ["tabular-nums"] },
  pill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs },
  pillWord: { fontSize: TEXT.sm, fontWeight: "600" },
  pressed: { opacity: 0.6 },
  tiles: { flexDirection: "row", gap: GAP, marginBottom: GAP },
  tile: { overflow: "hidden" },
  away: { opacity: 0 },
  glass: { flex: 1 },
  // A video's length, after the viewer's triangle (`playFill`), on the pill its glyph stood on.
  length: {
    position: "absolute",
    left: SPACE.xs,
    bottom: SPACE.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  lengthWords: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  kind: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: SPACE.xs,
  },
  kindExt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  kindName: { fontSize: 10, maxWidth: "100%" },
  dim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  circle: {
    position: "absolute",
    right: SPACE.xs,
    bottom: SPACE.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { backgroundColor: "rgba(0,0,0,0.2)" },
  foot: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingHorizontal: SPACE.xs,
    paddingTop: SPACE.lg,
  },
  nothing: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    textAlign: "center",
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.xxl * 2,
  },
  barPill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md + 2, paddingVertical: 7 },
  barWord: { fontSize: TEXT.md, fontWeight: "600" },
  barSlot: { position: "absolute", left: SPACE.md, right: SPACE.md },
  pickBar: {
    borderRadius: RADIUS.pill,
    height: BAR - 8,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingLeft: SPACE.xl,
    paddingRight: SPACE.sm,
  },
  pickWords: { flex: 1, fontSize: TEXT.md, fontWeight: "600" },
  deletePill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.lg, paddingVertical: 9 },
  deleteWord: { color: "#fff", fontSize: TEXT.md, fontWeight: "600" },
});
