/**
 * The room sheet's first page under who is here (ADR 0202, Arjun's B, 18 October 2026: "make the
 * room detail page bottom sheet layout look more cooler and organized"): one card for everything
 * the room holds, Media & files, and the room's settings as tiles, two to a row.
 *
 * - **Media & files** says how many things the room's lines carry and how many files the room has,
 *   and shows the newest five as pictures, a voice note's microphone or a document's mark, beside
 *   a tile for the files. It turns the sheet to the Media & files page (`RoomMedia.tsx`). It was
 *   two rows, Media and Files, each with a count and a line of words.
 * - **The tiles** are what the rows were: Lead, Spend per job, Notifications and Lock changes, each
 *   with its mark, what it is set to, and its name under that. A tile opens what its row opened,
 *   with a chevron; one that opens nothing for you, as Lead for a guest or Spend for a member, has
 *   none and does not press. Spend per job draws how much of the room's ceiling the job has used,
 *   in the colour of where it stands (ADR 0118). Lock changes keeps its switch, and its padlock
 *   shuts in gold while it is on. Hide (ADR 0205) stands beside it on the last row, half the width,
 *   as Arjun asked on 23 October 2026; it was the member list's last row. Each mark has a colour of
 *   its own, as Settings' rows do (`MARK_GROUNDS`).
 *
 * A tile is half the width of a row and about one and a half rows high, so four of them take the
 * height of three rows and leave the room for the members (Arjun: "the scrollable agents should
 * show atleast 3 agents instead of 1.5").
 */

import {
  type Attachment,
  type CarriedFile,
  formatDuration,
  inAlbum,
  kindOf,
  mediaFilesWords,
} from "@chipschat/core";
import { dollars, type JobSpend, type SpaceNotifications, spendStage } from "@chipschat/protocol";
import { Image } from "expo-image";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useFacePaint } from "../ui/faceTheme";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { useLockFlip } from "../ui/LockRow";
import { usePalette } from "../ui/theme";
import { ICON_GROUNDS, RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { FileService } from "./files";
import { LEVEL_WORDS } from "./roomNotify";

/** How many of the newest things the room carries the card shows, beside the files' tile. */
export const CARD_MEDIA = 5;

/**
 * The Media & files card: its name and counts, then the newest things the room's lines carry and a
 * tile for the room's files. With nothing in either, the one line and `None yet`.
 */
export function MediaCard({
  media,
  files,
  fileCount,
  onPress,
}: {
  /** What the room's lines carry, newest first (core's `filesOf`, turned round). */
  readonly media: readonly CarriedFile[];
  readonly files: FileService | undefined;
  /** How many files the room has, once the server has said (ADR 0100). */
  readonly fileCount: number | undefined;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const words = mediaFilesWords(media.length, fileCount);
  const filed = fileCount !== undefined && fileCount > 0;
  const shown = media.slice(0, filed ? CARD_MEDIA : CARD_MEDIA + 1);
  const cells = shown.length + (filed ? 1 : 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Media and files, ${words === "" ? "reading" : words}`}
      onPress={onPress}
      testID="room-sheet-media"
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? on.pressed : on.fill }]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardName, { color: palette.ink }]} numberOfLines={1}>
          Media & files
        </Text>
        <Text style={[styles.count, { color: palette.ink3 }]} numberOfLines={1}>
          {words}
        </Text>
        <Icon name="next" size={18} color={palette.ink4} />
      </View>
      {cells === 0 ? null : (
        <View style={styles.strip} testID="room-sheet-media-strip">
          {shown.map((item) => (
            <View key={item.attachment.id} style={styles.cell}>
              <MediaThumb item={item} files={files} small />
            </View>
          ))}
          {filed ? (
            <View style={styles.cell}>
              <View style={[styles.thumb, styles.filed, { backgroundColor: palette.surface3 }]}>
                <Icon name="doc" size={18} color={palette.ink2} />
                <Text style={[styles.filedWords, { color: palette.ink2 }]}>{fileCount}</Text>
              </View>
            </View>
          ) : null}
          {/* Empty cells keep the ones there at a sixth of the row each. */}
          {Array.from({ length: CARD_MEDIA + 1 - cells }, (_, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: spacers, all alike.
            <View key={`gap-${at}`} style={styles.cell} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

/**
 * One thing a room's line carries, as a square: a photo's thumbnail, a video's poster with its
 * length, a voice note's microphone and length, or a document's mark and kind. The picture is the
 * file service's thumbnail, asked for as a room's tile asks.
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
  const picture = useThumb(files, inAlbum(item.attachment) ? item.attachment.id : undefined);
  return <ThumbOf item={item} picture={picture} small={small} />;
}

/**
 * A square drawn with a thumbnail its caller asked for: the Media & files page's squares open the
 * viewer on the very picture they show, so it flies from them (ADR 0202).
 */
export function ThumbOf({
  item,
  picture,
  small = false,
}: {
  readonly item: CarriedFile;
  readonly picture: string | undefined;
  readonly small?: boolean;
}) {
  const palette = usePalette();
  const { attachment } = item;
  if (!inAlbum(attachment)) {
    return (
      <View style={[styles.thumb, styles.marked, { backgroundColor: palette.surface3 }]}>
        <Icon name={markOf(attachment)} size={small ? 16 : 20} color={palette.ink2} />
        <MarkWords attachment={attachment} />
      </View>
    );
  }
  return (
    <View style={[styles.thumb, { backgroundColor: palette.surface3 }]}>
      {picture === undefined ? null : (
        <Image
          source={{ uri: picture }}
          contentFit="cover"
          recyclingKey={attachment.id}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
        />
      )}
      {kindOf(attachment.mimeType) === "video" ? <Played attachment={attachment} /> : null}
    </View>
  );
}

/** A thumbnail from the file service, for a file that has one. */
export function useThumb(
  files: FileService | undefined,
  id: string | undefined,
): string | undefined {
  const [picture, setPicture] = useState<{ readonly id: string; readonly uri: string }>();
  useEffect(() => {
    if (id === undefined || files === undefined) return;
    let live = true;
    files.thumb(id).then(
      (uri) => {
        if (live) setPicture({ id, uri });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, id]);
  return picture !== undefined && picture.id === id ? picture.uri : undefined;
}

/** A video's length, if the server measured it: `1:05`. */
function lengthOf(attachment: Attachment): string | undefined {
  return attachment.durationMs === undefined ? undefined : formatDuration(attachment.durationMs);
}

/** What a file with no picture is marked with: a voice note's microphone, or a document. */
function markOf(attachment: Attachment): IconName {
  const kind = kindOf(attachment.mimeType);
  return kind === "audio" ? "mic" : kind === "video" ? "play" : "doc";
}

/** Under a mark: a voice note's length, or a document's kind, `PDF`. */
function MarkWords({ attachment }: { readonly attachment: Attachment }) {
  const palette = usePalette();
  const dot = attachment.filename.lastIndexOf(".");
  const under =
    kindOf(attachment.mimeType) === "audio"
      ? lengthOf(attachment)
      : dot === -1
        ? undefined
        : attachment.filename
            .slice(dot + 1)
            .toUpperCase()
            .slice(0, 4);
  if (under === undefined) return null;
  return (
    <Text style={[styles.markWords, { color: palette.ink3 }]} numberOfLines={1}>
      {under}
    </Text>
  );
}

/** A video's play mark and length, at its picture's foot. */
function Played({ attachment }: { readonly attachment: Attachment }) {
  const length = lengthOf(attachment);
  return (
    <View style={styles.played}>
      <Icon name="playFill" size={10} color="#ffffff" />
      {length === undefined ? null : <Text style={styles.playedWords}>{length}</Text>}
    </View>
  );
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
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionName, { color: palette.ink3 }]}>
        {name}
      </Text>
      {count === undefined ? null : (
        <Text style={[styles.sectionCount, { color: palette.ink4 }]}>{count}</Text>
      )}
      <View style={styles.sectionGap} />
      {trailing}
    </View>
  );
}

/**
 * The tiles, two to a row; an odd last one takes its row's width. The foot's tiles, Lock changes
 * and Hide, stand on a row of their own under the rest, whatever their number.
 */
export function Tiles({
  children,
  foot = [],
}: {
  readonly children: readonly ReactNode[];
  readonly foot?: readonly ReactNode[];
}) {
  const rows: { readonly pair: ReactNode[]; readonly foot: boolean }[] = [];
  for (const [group, last] of [
    [children, false],
    [foot, true],
  ] as const) {
    for (let at = 0; at < group.length; at += 2) {
      rows.push({ pair: group.slice(at, at + 2), foot: last });
    }
  }
  return (
    <View style={styles.tiles}>
      {rows.map((row, at) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the tiles are in a fixed order.
          key={at}
          style={styles.tileRow}
          testID={row.foot ? "room-sheet-tiles-foot" : undefined}
        >
          {row.pair}
        </View>
      ))}
    </View>
  );
}

/** One tile: its mark and what stands at its right, what it is set to, and its name. */
function Tile({
  mark,
  value,
  name,
  label,
  onPress,
  trailing,
  testID,
  children,
}: {
  readonly mark: ReactNode;
  readonly value: ReactNode;
  readonly name: string;
  /** What a screen reader says of it. */
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  /** At the mark's right: the chevron where it opens something, or Lock's switch. */
  readonly trailing?: ReactNode;
  readonly testID: string;
  /** Laid over the tile's foot: Spend's bar. */
  readonly children?: ReactNode;
}) {
  const palette = usePalette();
  const on = useGround();
  const body = (
    <>
      <View style={styles.tileTop}>
        {mark}
        {trailing ??
          (onPress === undefined ? null : <Icon name="next" size={18} color={palette.ink4} />)}
      </View>
      <Text style={[styles.value, { color: palette.ink }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.name, { color: palette.ink3 }]} numberOfLines={1}>
        {name}
      </Text>
      {children}
    </>
  );
  if (onPress === undefined) {
    return (
      <View
        accessible={trailing === undefined}
        accessibilityLabel={label}
        style={[styles.tile, { backgroundColor: on.fill }]}
        testID={testID}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? on.pressed : on.fill }]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Each tile's mark in a colour of its own, as Settings' rows have them (Arjun, 23 October 2026:
 * "make these sheet icons colorful"). The colours are grounds a room's face may wear, named by
 * index, so the faces' theme paints them (ADR 0176) and the faces' ink reads on them in either.
 */
const MARK_GROUNDS = {
  project: ICON_GROUNDS[4], // Blue
  lead: ICON_GROUNDS[5], // Violet
  spend: ICON_GROUNDS[7], // Green
  notify: ICON_GROUNDS[12], // Red
  lock: ICON_GROUNDS[3], // Teal
  locked: ICON_GROUNDS[9], // Ochre: the padlock shut in gold
  hide: ICON_GROUNDS[0], // Pink
} as const;

/** A tile's mark: a rounded square in its colour with a line drawing, or Spend's dollar. */
function Mark({
  ground,
  icon,
}: {
  readonly ground: keyof typeof MARK_GROUNDS;
  readonly icon: IconName | "$";
}) {
  const paint = useFacePaint();
  return (
    <View
      style={[styles.mark, { backgroundColor: paint.ground(MARK_GROUNDS[ground]) }]}
      testID={`room-sheet-mark-${ground}`}
    >
      {icon === "$" ? (
        <Text style={[styles.dollar, { color: paint.ink }]}>$</Text>
      ) : (
        <Icon name={icon} size={18} color={paint.ink} weight={2} />
      )}
    </View>
  );
}

/**
 * A tile's colour on the page it opens, at a list row's size (Arjun, 23 October 2026): Lead's
 * No lead and Notifications' levels wear their tile's colour, so the page reads as that tile's.
 */
export function RowMark({
  ground,
  icon,
  testID,
}: {
  readonly ground: keyof typeof MARK_GROUNDS;
  readonly icon: IconName;
  readonly testID?: string;
}) {
  const paint = useFacePaint();
  return (
    <View
      style={[styles.rowMark, { backgroundColor: paint.ground(MARK_GROUNDS[ground]) }]}
      testID={testID}
    >
      <Icon name={icon} size={20} color={paint.ink} weight={2} />
    </View>
  );
}

/** The room's project (ADR 0222), once it has had a change: how many files, and it opens Project. */
export function ProjectTile({
  files,
  onPress,
}: {
  readonly files: number;
  readonly onPress: () => void;
}) {
  const words = `${files} file${files === 1 ? "" : "s"}`;
  return (
    <Tile
      mark={<Mark ground="project" icon="drawers" />}
      value={words}
      name="Project"
      label={`Project, ${words}`}
      onPress={onPress}
      testID="room-sheet-project"
    />
  );
}

/** Who leads the room (ADR 0104), or Nobody; it opens Lead for whoever may choose. */
export function LeadTile({
  leads,
  onPress,
}: {
  /** The lead's name, or undefined for none. */
  readonly leads: string | undefined;
  readonly onPress: (() => void) | undefined;
}) {
  const who = leads ?? "Nobody";
  return (
    <Tile
      mark={<Mark ground="lead" icon="route" />}
      value={who}
      name="Lead"
      label={`Lead, ${who}`}
      onPress={onPress}
      testID="room-sheet-lead"
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
  onPress,
}: {
  readonly ceiling: number;
  readonly spend: JobSpend | undefined;
  /** The row's line, `This job so far: $0.28`, and who sets it for one who doesn't: said aloud. */
  readonly words: string | undefined;
  readonly onPress: (() => void) | undefined;
}) {
  const palette = usePalette();
  return (
    <Tile
      mark={<Mark ground="spend" icon="$" />}
      value={
        spend === undefined ? (
          dollars(ceiling)
        ) : (
          <>
            {dollars(spend.spent_usd)}
            <Text style={[styles.of, { color: palette.ink3 }]}> of {dollars(ceiling)}</Text>
          </>
        )
      }
      name="Spend per job"
      label={`Spend per job, ${dollars(ceiling)}${words === undefined ? "" : `, ${words}`}`}
      onPress={onPress}
      testID="room-sheet-spend"
    >
      {spend === undefined ? null : <SpendBar spend={spend} />}
    </Tile>
  );
}

/** How much of the ceiling the job has used, gold, then amber from most of it, red at it. */
function SpendBar({ spend }: { readonly spend: JobSpend }) {
  const palette = usePalette();
  const stage = spendStage(spend);
  const used = spend.ceiling_usd <= 0 ? 1 : Math.min(1, spend.spent_usd / spend.ceiling_usd);
  // A job that has spent anything shows a sliver of it.
  const width = used > 0 ? Math.max(used * 100, 4) : 0;
  const colour =
    stage === "ceiling" ? palette.red : stage === "most" ? palette.amber : palette.gold;
  return (
    <View style={[styles.bar, { backgroundColor: palette.surface3 }]}>
      <View
        testID="room-sheet-spend-bar"
        style={[styles.barUsed, { width: `${width}%`, backgroundColor: colour }]}
      />
    </View>
  );
}

/**
 * What this room sends this phone (ADR 0198), with its mark; it opens Notifications. A room the
 * reader hid sends nothing (ADR 0205), whatever its word, which is kept for when it is unhidden.
 */
export function NotifyTile({
  level,
  icon,
  hidden = false,
  onPress,
}: {
  readonly level: SpaceNotifications;
  readonly icon: IconName;
  readonly hidden?: boolean;
  readonly onPress: () => void;
}) {
  const name = hidden ? "Off while hidden" : LEVEL_WORDS[level].name;
  return (
    <Tile
      mark={<Mark ground="notify" icon={icon} />}
      value={name}
      name="Notifications"
      label={`Notifications, ${name}`}
      onPress={onPress}
      testID="room-sheet-notify"
    />
  );
}

/**
 * Lock changes (ADR 0156) as a tile: On or Off, the switch, and the padlock shut in gold while it
 * is on. A flip shows at once and holds until the room says the server has it (`useLockFlip`).
 */
export function LockTile({
  locked,
  onLock,
  hint,
}: {
  readonly locked: boolean;
  readonly onLock: (locked: boolean) => Promise<boolean>;
  readonly hint: string;
}) {
  const palette = usePalette();
  const { on, flip } = useLockFlip(locked, onLock);
  return (
    <Tile
      mark={<Mark ground={on ? "locked" : "lock"} icon={on ? "lock" : "unlock"} />}
      value={on ? "On" : "Off"}
      name="Lock changes"
      label="Lock changes"
      trailing={
        <Switch
          value={on}
          onValueChange={flip}
          trackColor={{ true: palette.green, false: palette.surface3 }}
          accessibilityLabel="Lock changes"
          accessibilityHint={hint}
          testID="room-sheet-lock-switch"
        />
      }
      testID="room-sheet-lock"
    />
  );
}

/** What Hide and Unhide do, said to a screen reader. */
const HIDE_UNDER = {
  hide: "Off your list, and quiet. The others here carry on.",
  unhide: "Back on your list, and heard as before.",
} as const;

/**
 * Hide (ADR 0205) as a tile: the room off the reader's own list at once, or Unhide on a hidden
 * room. It opens nothing, so it has no chevron.
 */
export function HideTile({
  title,
  hidden,
  onPress,
}: {
  readonly title: string;
  readonly hidden: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? `Unhide ${title}` : `Hide ${title}`}
      accessibilityHint={hidden ? HIDE_UNDER.unhide : HIDE_UNDER.hide}
      onPress={onPress}
      testID={hidden ? "room-sheet-unhide" : "room-sheet-hide"}
      style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? on.pressed : on.fill }]}
    >
      <View style={styles.tileTop}>
        <Mark ground="hide" icon={hidden ? "unhide" : "hide"} />
      </View>
      <Text style={[styles.value, { color: palette.ink }]} numberOfLines={1}>
        {hidden ? "Unhide" : "Hide"}
      </Text>
      <Text style={[styles.name, { color: palette.ink3 }]} numberOfLines={1}>
        {hidden ? "Back on your list" : "Off your list"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, padding: SPACE.md, gap: SPACE.md - 2 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  cardName: { flex: 1, fontSize: TEXT.body, fontWeight: "500" },
  count: { fontSize: TEXT.md, fontVariant: ["tabular-nums"], flexShrink: 1 },
  strip: { flexDirection: "row", gap: 6 },
  cell: { flex: 1, aspectRatio: 1 },
  thumb: {
    flex: 1,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  filed: { gap: 1 },
  filedWords: { fontSize: TEXT.xs, fontWeight: "600", fontVariant: ["tabular-nums"] },
  marked: { gap: 2, paddingHorizontal: 2 },
  markWords: { fontSize: 10, fontWeight: "600", fontVariant: ["tabular-nums"] },
  played: {
    position: "absolute",
    left: 4,
    bottom: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  playedWords: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 2,
    fontVariant: ["tabular-nums"],
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    marginHorizontal: SPACE.xs,
    marginBottom: 6,
  },
  sectionName: { fontSize: TEXT.sm, fontWeight: "600" },
  sectionCount: { fontSize: TEXT.sm, fontWeight: "500", fontVariant: ["tabular-nums"] },
  sectionGap: { flex: 1 },
  tiles: { gap: SPACE.sm, marginTop: SPACE.sm },
  tileRow: { flexDirection: "row", gap: SPACE.sm },
  tile: {
    flex: 1,
    borderRadius: RADIUS.xl,
    paddingTop: SPACE.md - 1,
    paddingBottom: SPACE.md,
    paddingHorizontal: SPACE.md,
    overflow: "hidden",
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 31,
    marginBottom: SPACE.sm - 1,
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm + 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // A list row's mark, the size of the sheet's other row marks.
  rowMark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dollar: { fontSize: TEXT.md + 1, fontWeight: "600" },
  value: { fontSize: TEXT.md + 1, fontWeight: "600" },
  of: { fontSize: TEXT.sm + 1, fontWeight: "500" },
  name: { fontSize: TEXT.sm, marginTop: 1 },
  bar: {
    position: "absolute",
    left: SPACE.md,
    right: SPACE.md,
    bottom: 7,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  barUsed: { height: 3, borderRadius: 2 },
});
