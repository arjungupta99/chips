/**
 * The room's files, in the room's sheet (ADR 0100, Arjun's B, 3 October 2026), under the Media &
 * files page's pictures since ADR 0202 (`RoomMedia.tsx`): the current version of each, newest first, read from the server as the sheet opens and again when a line
 * carrying a file lands or is taken back. A tap on a file opens what is current; the `v3` at its
 * end unfolds its versions under it, newest first, the current one marked, each opening the same
 * way.
 *
 * Opening is by kind: a page in the page sheet (ADR 0059), a photo or a video in the viewer on a
 * deck of that file's versions (ADR 0057), anything else through the share sheet, as a file's row
 * in the room opens. Each is drawn inside the sheet, so it stands over it: iOS presents a modal
 * only from the one that holds it. A voice note and a photo a picker named are not here (core's
 * `inFiles`); they are in the room.
 *
 * The versions unfold on the platform's own layout animation, which moves the sheet's foot with
 * them, and arrive 40 ms apart; the chevron turns on the native driver.
 */

import {
  type Directory,
  deckOfVersions,
  fileLinesKey,
  inAlbum,
  inFiles,
  isPage,
  kindOf,
  postedBy,
  type RoomFileOf,
  type Space,
  type Store,
} from "@chipschat/core";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { DeckViewer } from "../media/MediaViewer";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { FileService } from "./files";
import { PageSheet } from "./PageSheet";
import { hasPageView } from "./pages";
import { clockOrDay } from "./when";

/** How long the versions take to unfold, and how far apart they arrive. */
const UNFOLD_MS = 320;
const STAGGER_MS = 40;

/** `by Oc2 · 11:52 PM`: who posted a version, and when. */
export function byWhen(file: RoomFileOf, directory: Directory, selfId: string): string {
  return `by ${postedBy(file, directory, selfId)} · ${clockOrDay(file.at, Date.now())}`;
}

/** The room's files and their versions, as the sheet reads them. */
export interface RoomFilesRead {
  /** The ones Files shows, newest first; nothing until the server has answered. */
  readonly listed: readonly RoomFileOf[] | undefined;
  /** A name's versions, newest first, when read and still the current one's. */
  readonly fresh: (name: string) => readonly RoomFileOf[] | undefined;
  readonly versionsOf: (name: string) => Promise<readonly RoomFileOf[]>;
}

/**
 * The room's files while the sheet is open: read as it opens, and again when a line carrying a
 * file comes or goes. A name's versions are read when they are wanted and kept while its current
 * version is the one they were read with.
 */
export function useRoomFiles(store: Store, space: Space, open: boolean): RoomFilesRead {
  const [listed, setListed] = useState<readonly RoomFileOf[] | undefined>(undefined);
  const [versions, setVersions] = useState<ReadonlyMap<string, readonly RoomFileOf[]>>(new Map());
  const key = fileLinesKey(space);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the room's file lines change.
  useEffect(() => {
    if (!open) return;
    let live = true;
    store.roomFiles(space.id).then(
      (files) => {
        if (live) setListed(files.filter((file) => inFiles(file.name, file.attachment.mimeType)));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, space.id, open, key]);
  const fresh = (name: string) => {
    const known = versions.get(name);
    const current = listed?.find((file) => file.name === name)?.attachment.id;
    return known?.[0]?.attachment.id === current ? known : undefined;
  };
  const versionsOf = async (name: string) => {
    const known = fresh(name);
    if (known !== undefined) return known;
    const read = await store.fileVersions(space.id, name);
    setVersions((now) => new Map(now).set(name, read));
    return read;
  };
  return { listed, fresh, versionsOf };
}

/** What the Files row on the sheet's first page says under its name. */
export function filesUnder(listed: readonly RoomFileOf[] | undefined): string | undefined {
  if (listed === undefined) return undefined;
  const newest = listed[0];
  if (newest === undefined) return "None yet";
  return `${newest.name} · v${newest.version} · ${clockOrDay(newest.at, Date.now())}`;
}

type Opened =
  | { readonly kind: "page"; readonly file: RoomFileOf }
  | { readonly kind: "viewer"; readonly file: RoomFileOf; readonly versions: RoomFileOf[] };

/** Opening a version by its kind, and what is open over the sheet now. */
function useOpening(read: RoomFilesRead, files: FileService | undefined) {
  const [opened, setOpened] = useState<Opened | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const open = async (file: RoomFileOf) => {
    setFailed(undefined);
    if (files === undefined) return;
    try {
      if (isPage(file.attachment.mimeType) && hasPageView()) setOpened({ kind: "page", file });
      else if (inAlbum(file.attachment)) {
        setOpened({ kind: "viewer", file, versions: [...(await read.versionsOf(file.name))] });
      } else await files.preview(file.attachment);
    } catch (failure) {
      setFailed(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return { opened, failed, open, close: () => setOpened(undefined) };
}

/**
 * The room's files as a card of rows, each opening over the sheet, with why one did not open under
 * it. Nothing at all until there is a file: the page around it says so.
 */
export function FilesList({
  read,
  files,
  directory,
  selfId,
  onGoTo,
}: {
  readonly read: RoomFilesRead;
  readonly files: FileService | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  /** *Go to message* from the viewer: the sheet closes onto the line. */
  readonly onGoTo: (lineId: string) => void;
}) {
  const palette = usePalette();
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const { opened, failed, open, close } = useOpening(read, files);
  const toggle = async (name: string) => {
    if (!unfolded.has(name)) await read.versionsOf(name).catch(() => undefined);
    LayoutAnimation.configureNext({
      duration: UNFOLD_MS,
      update: { type: "spring", springDamping: 0.86 },
      create: { type: "easeInEaseOut", property: "opacity", duration: UNFOLD_MS / 2 },
      delete: { type: "easeInEaseOut", property: "opacity", duration: UNFOLD_MS / 2 },
    });
    setUnfolded((now) => {
      const next = new Set(now);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  };
  const on = useGround();
  const listed = read.listed ?? [];
  return (
    <>
      {listed.length === 0 ? null : (
        <View style={[styles.card, { backgroundColor: on.fill }]} testID="room-files">
          {listed.map((file, at) => (
            <FileItem
              key={file.name}
              file={file}
              first={at === 0}
              files={files}
              said={byWhen(file, directory, selfId)}
              unfolded={unfolded.has(file.name)}
              versions={(read.fresh(file.name) ?? []).map((each) => ({
                file: each,
                said: byWhen(each, directory, selfId),
              }))}
              onOpen={(which) => void open(which)}
              onToggle={() => void toggle(file.name)}
            />
          ))}
        </View>
      )}
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.red }]} testID="room-files-failed">
          {failed}
        </Text>
      )}
      {opened?.kind === "page" && files !== undefined ? (
        <PageSheet
          attachment={opened.file.attachment}
          files={files}
          version={`v${opened.file.version} · ${byWhen(opened.file, directory, selfId)}`}
          onClose={close}
        />
      ) : null}
      {opened?.kind === "viewer" && files !== undefined ? (
        <DeckViewer
          deck={deckOfVersions(opened.versions)}
          attachmentId={opened.file.attachment.id}
          directory={directory}
          files={files}
          onGoTo={onGoTo}
          onGone={close}
        />
      ) : null}
    </>
  );
}

/** One file: its mark, its name, who posted the current version and when, and its versions. */
function FileItem({
  file,
  first,
  files,
  said,
  unfolded,
  versions,
  onOpen,
  onToggle,
}: {
  readonly file: RoomFileOf;
  readonly first: boolean;
  readonly files: FileService | undefined;
  readonly said: string;
  readonly unfolded: boolean;
  readonly versions: readonly { readonly file: RoomFileOf; readonly said: string }[];
  readonly onOpen: (file: RoomFileOf) => void;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={first ? undefined : [styles.part, { borderTopColor: palette.line }]}
      testID="room-file"
    >
      {/* The file and its versions' chip side by side, not one inside the other: a button in a
          button is one element to VoiceOver, which would never reach the chip. */}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${file.name}, version ${file.version}`}
          onPress={() => onOpen(file)}
          style={({ pressed }) => [
            styles.opens,
            pressed ? { backgroundColor: palette.surface3 } : null,
          ]}
          testID={`room-file-${file.name}`}
        >
          <Mark file={file} files={files} />
          <View style={styles.words}>
            <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
              {said}
            </Text>
          </View>
        </Pressable>
        <View style={styles.end}>
          {file.version > 1 ? (
            <Chip version={file.version} unfolded={unfolded} name={file.name} onPress={onToggle} />
          ) : (
            <Text style={[styles.one, { color: palette.ink3 }]}>v1</Text>
          )}
        </View>
      </View>
      {unfolded
        ? versions.map(({ file: version, said: versionSaid }, at) => (
            <Version
              key={version.attachment.id}
              file={version}
              said={versionSaid}
              current={at === 0}
              at={at}
              onPress={() => onOpen(version)}
            />
          ))
        : null}
    </View>
  );
}

/** `v3 ⌄`: what unfolds a file's versions, its chevron turning as they do. */
function Chip({
  version,
  unfolded,
  name,
  onPress,
}: {
  readonly version: number;
  readonly unfolded: boolean;
  readonly name: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const turn = useRef(new Animated.Value(unfolded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, {
      toValue: unfolded ? 1 : 0,
      duration: UNFOLD_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [turn, unfolded]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Versions of ${name}`}
      accessibilityState={{ expanded: unfolded }}
      onPress={onPress}
      hitSlop={SPACE.xs}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: pressed ? palette.line2 : palette.surface3 },
      ]}
      testID={`room-file-versions-${name}`}
    >
      <Text style={[styles.chipWords, { color: palette.ink2 }]}>v{version}</Text>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Icon name="down" size={12} color={palette.ink2} />
      </Animated.View>
    </Pressable>
  );
}

/** One older version under its file, arriving a little after the one above it. */
function Version({
  file,
  said,
  current,
  at,
  onPress,
}: {
  readonly file: RoomFileOf;
  readonly said: string;
  readonly current: boolean;
  readonly at: number;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const arrive = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(arrive, {
      toValue: 1,
      duration: UNFOLD_MS,
      delay: at * STAGGER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [arrive, at]);
  const motion = {
    opacity: arrive,
    transform: [{ translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
  };
  return (
    <Animated.View style={motion}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${file.name}, version ${file.version}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.version,
          { borderTopColor: palette.line },
          pressed ? { backgroundColor: palette.surface3 } : null,
        ]}
        testID="room-file-version"
      >
        <Text style={[styles.versionNumber, { color: palette.ink }]}>v{file.version}</Text>
        <Text style={[styles.versionSaid, { color: palette.ink2 }]} numberOfLines={1}>
          {said}
        </Text>
        {current ? (
          <View style={styles.current}>
            <View style={[styles.dot, { backgroundColor: palette.gold }]} />
            <Text style={[styles.currentWords, { color: palette.goldDeep }]}>Current</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** A photo's thumbnail, or the mark of what it is. */
function Mark({
  file,
  files,
}: {
  readonly file: RoomFileOf;
  readonly files: FileService | undefined;
}) {
  const palette = usePalette();
  const [thumb, setThumb] = useState<string | undefined>(undefined);
  const kind = kindOf(file.attachment.mimeType);
  const photo = kind === "image" && inAlbum(file.attachment);
  const id = file.attachment.id;
  useEffect(() => {
    if (!photo || files === undefined) return;
    let live = true;
    files.thumb(id).then(
      (uri) => {
        if (live) setThumb(uri);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, id, photo]);
  return (
    <View style={[styles.mark, { backgroundColor: palette.surface3 }]}>
      {thumb === undefined ? (
        <Icon
          name={kind === "video" ? "play" : kind === "image" ? "image" : "doc"}
          size={20}
          color={palette.ink3}
        />
      ) : (
        <Image
          source={{ uri: thumb }}
          contentFit="cover"
          recyclingKey={id}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, overflow: "hidden" },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "stretch" },
  opens: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 58,
    paddingVertical: SPACE.sm,
    paddingLeft: SPACE.md,
  },
  end: { justifyContent: "center", paddingHorizontal: SPACE.md },
  mark: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.body, fontWeight: "500" },
  under: { fontSize: TEXT.sm },
  one: { fontSize: TEXT.md, paddingHorizontal: SPACE.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 30,
    paddingHorizontal: SPACE.md - 2,
    borderRadius: RADIUS.pill,
  },
  chipWords: { fontSize: TEXT.sm + 1, fontWeight: "600" },
  version: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    minHeight: 46,
    paddingVertical: SPACE.xs,
    paddingLeft: 64,
    paddingRight: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  versionNumber: { width: 26, fontSize: TEXT.md, fontWeight: "700" },
  versionSaid: { flex: 1, fontSize: TEXT.md },
  current: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  currentWords: { fontSize: TEXT.sm - 1, fontWeight: "600" },
  failed: { fontSize: TEXT.sm, marginTop: SPACE.sm },
});
