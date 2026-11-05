/**
 * The files a message carried, under its bubble (M4.4). Its photos and the videos the server
 * measured are one album, in the order the message listed them (decision 7, 16 September 2026):
 * the desktop's shapes — one alone, two side by side, one tall beside two, two by two — with `+N`
 * on the fourth where there are more, all of which are in the viewer's deck all the same (figure
 * 1). A photo alone keeps its own shape and stops at 200 points tall, so a portrait receipt does
 * not take the screen; a video alone does the same. A video's tile is its poster, a play mark and
 * how long it runs.
 *
 * Every tile opens the media viewer from where it stands (`media/`, ADR 0057): it measures itself
 * as it is pressed, so the picture grows out of it, and stays registered while it is mounted, so
 * the viewer can fly back into it. The tiles draw with `expo-image`, as the stage does, so the
 * picture the flight starts from is the bitmap the tile already decoded rather than a second copy
 * of it. A video the server did not measure is a row whose Play opens the viewer on that video
 * alone (the media viewer, Phase 2). What plays is the copy that plays everywhere once the server
 * has made it (ADR 0053). An HTML file is a row that opens the page over the room, drawn where it
 * can reach nothing of the app's (ADR 0059, `PageSheet`), on a build that can; so is a Markdown
 * file, made into a page as it opens (ADR 0123). Anything else is a row that opens on a tap — in
 * Quick Look on an iPhone, which has Share in its bar (ADR 0124); the share sheet where there is no
 * Quick Look or it cannot draw the file; a download on the web target. A voice note is a card of
 * its own (ADR 0054): a round Play, how long it runs, and under them what was said, as the server wrote
 * it down — the words are what a glance at a room wants, and the sound is a tap away. The bytes
 * come through the device's signature and are kept on the phone once (`files.ts`), so a room
 * redrawn a hundred times fetches each thumbnail once.
 *
 * Without a file service — a phone not yet paired, or a test that gave none — the rows say what
 * is attached and how big, and open nothing.
 */

import type { Attachment } from "@chipschat/core";
import {
  ALONE_TILE_HEIGHT,
  ALONE_TILE_WIDTH,
  aloneTile,
  formatBytes,
  formatDuration,
  inAlbum,
  isVoiceNoteName,
  kindOf,
  tileShape,
} from "@chipschat/core";
import { Image } from "expo-image";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useViewerRow, useViewerTile } from "../media/MediaViewer";
import { PlayDisc } from "../media/PlayDisc";
import type { TileKey } from "../media/tiles";
import { IconButton } from "../ui/Button";
import { usePalette } from "../ui/theme";
import { BUBBLE, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { hasAudio } from "./audio";
import { BubbleWatch } from "./BubbleWatch";
import type { FileService } from "./files";
import { PageSheet } from "./PageSheet";
import { isPage } from "./page";
import { hasPageView } from "./pages";
import { ReplyGrip } from "./ReplySwipe";
import { useTileLanding } from "./sendLanding";

// Required only when a note is played, for the reason `AttachSheet` gives for the recorder.
const VoicePlayer = lazy(async () => ({
  default: (require("./VoicePlayer") as typeof import("./VoicePlayer")).VoicePlayer,
}));

export const GRID_MAX = 4;
/** What a tile before the album's last stands for besides itself. */
const NONE: readonly TileKey[] = [];
/** The tallest a tile alone is drawn, at its own shape (figure 1): core's, the Mac's too. */
export const ALONE_HEIGHT = ALONE_TILE_HEIGHT;
/** An album is as wide as a bubble may be, and no wider than the desktop's grid (420 pixels). */
const ALBUM_MAX = 420;
/** A video tile's play disc: the viewer's, at the size Messages gives one in a bubble (ADR 0163). */
const TILE_PLAY = 44;

/**
 * How wide a single picture is drawn, and how tall a portrait one may stand. A thumbnail is
 * something to glance at and tap, not the picture itself: at the full width of a bubble a portrait
 * stood taller than half the screen, which is a scroll rather than a glance (Arjun, 20 September
 * 2026). The picture itself is a tap away, at the size it deserves.
 */
export const TILE_MAX = ALONE_TILE_WIDTH;

/**
 * A picture's own shape, within reason: no taller than 3:4, no wider than 1.8:1 (core's, which the
 * Mac and the web draw by too). The pictures a message draws in its words (`Markdown`) keep to the
 * same shapes.
 */
export { tileShape };

/** A URI once it is loaded, or nothing while it is on its way, and why if it failed. */
function useUri(load: (() => Promise<string>) | undefined): {
  readonly uri: string | undefined;
  readonly error: string | undefined;
} {
  const [uri, setUri] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (load === undefined) return;
    let live = true;
    load().then(
      (loaded) => {
        if (live) setUri(loaded);
      },
      (failure: unknown) => {
        if (live) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      live = false;
    };
  }, [load]);
  return { uri, error };
}

const MARK: Readonly<Record<string, string>> = {
  image: "🖼",
  video: "🎬",
  audio: "🔊",
  file: "📄",
};

export function Attachments({
  attachments,
  files,
  lineId,
  lineKey,
  mine = false,
}: {
  readonly attachments: readonly Attachment[];
  readonly files?: FileService | undefined;
  /** The line the files hang under, which is where the viewer opens from and goes back to. */
  readonly lineId?: string | undefined;
  /**
   * The line by its send's key, for a line of your own whose photos may still be on their way
   * from the composer's strip to their tiles (`sendLanding.ts`).
   */
  readonly lineKey?: string | undefined;
  /** Sent from this screen: the album takes the bubble's side. */
  readonly mine?: boolean | undefined;
}) {
  if (attachments.length === 0) return null;
  const media = files === undefined ? [] : attachments.filter(inAlbum);
  const voices = attachments.filter((each) => kindOf(each.mimeType) === "audio");
  const others = attachments.filter((each) => !media.includes(each) && !voices.includes(each));
  return (
    <View style={styles.list} testID="attachments">
      {media.length > 0 && files !== undefined ? (
        <Album media={media} files={files} lineId={lineId} lineKey={lineKey} mine={mine} />
      ) : null}
      {voices.map((each) => (
        <VoiceNote key={each.id} attachment={each} files={files} />
      ))}
      {others.map((each) => (
        <FileRow key={each.id} attachment={each} files={files} lineId={lineId} />
      ))}
    </View>
  );
}

/**
 * Up to four tiles, in the desktop's shapes. The ones past the fourth are not drawn, and are in the
 * viewer's deck all the same (figure 1), so a swipe reaches them without a grid of six.
 */
function Album({
  media,
  files,
  lineId,
  lineKey,
  mine,
}: {
  readonly media: readonly Attachment[];
  readonly files: FileService;
  readonly lineId: string | undefined;
  readonly lineKey: string | undefined;
  readonly mine: boolean;
}) {
  const shown = media.slice(0, GRID_MAX);
  const more = media.length - shown.length;
  const past =
    lineId === undefined || more <= 0
      ? NONE
      : media.slice(GRID_MAX).map((each) => ({ lineId, attachmentId: each.id }));
  const tile = (index: number, shape: StyleProp<ViewStyle>) => {
    const attachment = shown[index];
    if (attachment === undefined) return null;
    return (
      <Tile
        key={attachment.id}
        attachment={attachment}
        files={files}
        lineId={lineId}
        lineKey={lineKey}
        shape={shape}
        more={index === GRID_MAX - 1 ? more : 0}
        beyond={index === GRID_MAX - 1 ? past : NONE}
      />
    );
  };
  return (
    <View style={[styles.album, mine ? styles.albumMine : null]} testID="photo-grid">
      {shapes(shown, mine, tile)}
    </View>
  );
}

/**
 * Where each tile goes: alone at its own shape, two side by side, the first tall beside the other
 * two, or two by two — the desktop's `.photo-grid`, with square tiles as figure 1 draws them.
 */
function shapes(
  shown: readonly Attachment[],
  mine: boolean,
  tile: (index: number, shape: StyleProp<ViewStyle>) => ReactNode,
): ReactNode {
  switch (shown.length) {
    case 1:
      return tile(0, [aloneShape(shown[0] as Attachment), mine ? styles.albumMine : null]);
    case 2:
      return (
        <View style={styles.albumRow}>{[tile(0, styles.square), tile(1, styles.square)]}</View>
      );
    case 3:
      return (
        <View style={styles.albumRow}>
          {tile(0, styles.tall)}
          <View style={styles.albumColumn}>
            {[tile(1, styles.stacked), tile(2, styles.stacked)]}
          </View>
        </View>
      );
    default:
      return (
        <>
          <View style={styles.albumRow}>{[tile(0, styles.square), tile(1, styles.square)]}</View>
          <View style={styles.albumRow}>{[tile(2, styles.square), tile(3, styles.square)]}</View>
        </>
      );
  }
}

/**
 * A tile alone: its own shape, within reason (`tileShape`), 200 points tall and no wider than
 * `TILE_MAX` — a thumbnail is a glance (20 September 2026), so a landscape stops at 240 wide and a
 * portrait at 200 tall. The size is said outright rather than as an aspect ratio under a
 * `maxWidth`: Yoga takes an aspect ratio's height from the width before the maximum clamps it, so
 * a portrait receipt stood 150 points wide and 395 tall on the Android emulator, where Jest, which
 * lays nothing out, had passed it.
 */
function aloneShape(attachment: Attachment): ViewStyle {
  // Core's sum (`aloneTile`), so the Mac and the web hold a lone tile at the same size.
  return { ...aloneTile(attachment), maxWidth: "100%" };
}

/**
 * One tile of the album: a photo's thumbnail, or a measured video's poster with a play mark and
 * how long it runs, opening the viewer on it from where it stands. A picture that will not come
 * leaves the tile its ground, and a video its mark and its length.
 */
function Tile({
  attachment,
  files,
  lineId,
  lineKey,
  shape,
  more,
  beyond,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
  readonly lineId: string | undefined;
  readonly lineKey: string | undefined;
  readonly shape: StyleProp<ViewStyle>;
  /** How many more there are than the album shows, on the last tile. */
  readonly more: number;
  /** The ones past what the album shows, on its last tile: flown home to it, having no tile of their own. */
  readonly beyond: readonly TileKey[];
}) {
  const palette = usePalette();
  const [load] = useState(() => () => files.thumb(attachment.id));
  const { uri } = useUri(load);
  const tile = useViewerTile(lineId, attachment.id, undefined, beyond);
  // Kept out of sight while its picture flies to it from the strip, and watched for the picture
  // meanwhile (`SendFlight.tsx`), as a bubble is for its words: by the send's key, which a line
  // of yours goes by until the server has it, and its id after (`useHeld`, in `Line.tsx`).
  const flight = useTileLanding(lineKey ?? lineId, attachment.id);
  const video = kindOf(attachment.mimeType) === "video";
  // Swiped, a tile replies to its message, as the bubble does (`ReplySwipe.tsx`).
  return (
    <ReplyGrip>
      <Pressable
        ref={tile.ref}
        accessibilityRole={video ? "button" : "imagebutton"}
        accessibilityLabel={`${video ? "Play" : "Open"} ${attachment.filename}`}
        testID={`${video ? "video" : "photo"}-${attachment.id}`}
        onPress={() => tile.open?.(uri)}
        style={[
          styles.tile,
          { backgroundColor: palette.surface3 },
          shape,
          tile.hidden || flight.held ? styles.away : null,
        ]}
      >
        <BubbleWatch told={flight.told} eager />
        {uri === undefined ? null : (
          <Image
            source={{ uri }}
            contentFit="cover"
            recyclingKey={attachment.id}
            accessibilityLabel={attachment.filename}
            accessibilityIgnoresInvertColors
            style={StyleSheet.absoluteFill}
            testID={`${video ? "poster" : "thumb"}-${attachment.id}`}
          />
        )}
        {video ? (
          <>
            <View style={styles.playMark} pointerEvents="none">
              <PlayDisc size={TILE_PLAY} />
            </View>
            <Text style={styles.duration}>{formatDuration(attachment.durationMs ?? 0)}</Text>
          </>
        ) : null}
        {more > 0 ? (
          <View style={styles.more}>
            <Text style={styles.moreWords}>+{more}</Text>
          </View>
        ) : null}
      </Pressable>
    </ReplyGrip>
  );
}

/**
 * A voice note: Play, what it is and how long it runs, and what was said. A tap fetches the sound
 * once and plays it here, on a build that can; an older build hands it to the share sheet. Without
 * a file service the words are still there to read.
 */
function VoiceNote({
  attachment,
  files,
}: {
  readonly attachment: Attachment;
  readonly files: FileService | undefined;
}) {
  const palette = usePalette();
  const [asked, setAsked] = useState(false);
  const [at, setAt] = useState(0);
  const [load] = useState(() => () => (files as FileService).file(attachment));
  const { uri, error } = useUri(asked && files !== undefined ? load : undefined);
  const { opening, open } = useOpen(files, attachment);
  const title = isVoiceNoteName(attachment.filename) ? "Voice note" : attachment.filename;
  const length =
    attachment.durationMs === undefined ? undefined : formatDuration(attachment.durationMs);
  const playsHere = hasAudio();
  const button = (
    <IconButton
      icon="play"
      label={`Play ${title}`}
      tone="quiet"
      disabled={files === undefined}
      onPress={() => (playsHere ? setAsked(true) : void open())}
      testID={`voice-play-${attachment.id}`}
    />
  );
  const second = secondLine(opening, attachment.byteSize);
  const said = (() => {
    if (error !== undefined) return { words: error, failed: true };
    if (asked && uri === undefined) return { words: "Fetching…", failed: false };
    if (uri !== undefined && at > 0 && length !== undefined) {
      return { words: `${formatDuration(at)} of ${length}`, failed: false };
    }
    return opening === "idle" ? { words: length ?? second.words, failed: false } : second;
  })();
  return (
    <ReplyGrip>
      <View
        style={[styles.voice, { borderColor: palette.line, backgroundColor: palette.surface2 }]}
        testID={`voice-${attachment.id}`}
      >
        <View style={styles.voiceTop}>
          {uri !== undefined && playsHere ? (
            <Suspense fallback={button}>
              <VoicePlayer uri={uri} label={title} onTime={setAt} />
            </Suspense>
          ) : (
            button
          )}
          <View style={styles.rowWords}>
            <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.size, { color: said.failed ? palette.red : palette.ink3 }]}>
              {said.words}
            </Text>
          </View>
        </View>
        {attachment.transcript === undefined ? null : (
          <Text
            selectable
            style={[styles.transcript, { color: palette.ink2 }]}
            testID={`transcript-${attachment.id}`}
          >
            {attachment.transcript}
          </Text>
        )}
      </View>
    </ReplyGrip>
  );
}

type Opening = "idle" | "opening" | { readonly failed: string };

/** Showing a file through the platform — Quick Look, or the share sheet — and where that has got to. */
function useOpen(
  files: FileService | undefined,
  attachment: Attachment,
): { readonly opening: Opening; readonly open: () => Promise<void> } {
  const [opening, setOpening] = useState<Opening>("idle");
  const open = async () => {
    if (files === undefined) return;
    setOpening("opening");
    try {
      await files.preview(attachment);
      setOpening("idle");
    } catch (failure) {
      setOpening({ failed: failure instanceof Error ? failure.message : String(failure) });
    }
  };
  return { opening, open };
}

/** The row's second line: how big the file is, that it is opening, or why it would not. */
function secondLine(opening: Opening, byteSize: number): { words: string; failed: boolean } {
  if (opening === "opening") return { words: "Opening…", failed: false };
  if (opening === "idle") return { words: formatBytes(byteSize), failed: false };
  return { words: opening.failed, failed: true };
}

/**
 * What a tap on the row does: a video opens the viewer on it, a page opens over the room where the
 * build can draw one, anything else opens through the platform; nothing without a service, or for
 * a video outside a room's viewer.
 */
function actionFor(
  attachment: Attachment,
  files: FileService | undefined,
  open: () => Promise<void>,
  play: (() => void) | undefined,
  read: () => void,
): { readonly verb: "Play" | "Open"; readonly run: () => void } | undefined {
  if (files === undefined) return undefined;
  if (kindOf(attachment.mimeType) === "video") {
    return play === undefined ? undefined : { verb: "Play", run: play };
  }
  if (isPage(attachment.mimeType) && hasPageView()) return { verb: "Open", run: read };
  return { verb: "Open", run: () => void open() };
}

/** A video the server never measured, or any other file: a row, opening on a tap. */
function FileRow({
  attachment,
  files,
  lineId,
}: {
  readonly attachment: Attachment;
  readonly files: FileService | undefined;
  readonly lineId: string | undefined;
}) {
  const palette = usePalette();
  const kind = kindOf(attachment.mimeType);
  const { opening, open } = useOpen(files, attachment);
  const play = useViewerRow(lineId, attachment.id);
  const [reading, setReading] = useState(false);
  const action = actionFor(attachment, files, open, play, () => setReading(true));
  const second = secondLine(opening, attachment.byteSize);
  return (
    <>
      {reading && files !== undefined ? (
        <PageSheet attachment={attachment} files={files} onClose={() => setReading(false)} />
      ) : null}
      <ReplyGrip>
        <Pressable
          accessibilityRole={action === undefined ? undefined : "button"}
          accessibilityLabel={
            action === undefined ? undefined : `${action.verb} ${attachment.filename}`
          }
          disabled={action === undefined}
          // Whatever the row opens stands over the room, so the keys go the way they go for the
          // media viewer, and for the same reason: a field still holding the caret would be handed
          // it back as the page or the share sheet left (Arjun, 20 September 2026).
          onPress={() => {
            Keyboard.dismiss();
            action?.run();
          }}
          testID={`file-${attachment.id}`}
          style={({ pressed }) => [
            styles.row,
            {
              borderColor: palette.line,
              backgroundColor: pressed ? palette.surface3 : palette.surface2,
            },
          ]}
        >
          <Text style={styles.mark}>{MARK[kind] ?? MARK["file"]}</Text>
          <View style={styles.rowWords}>
            <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
              {attachment.filename}
            </Text>
            <Text style={[styles.size, { color: second.failed ? palette.red : palette.ink3 }]}>
              {second.words}
            </Text>
          </View>
          {action === undefined ? null : (
            <Text style={[styles.verb, { color: palette.blueInk }]}>{action.verb}</Text>
          )}
        </Pressable>
      </ReplyGrip>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.xs },
  album: { width: BUBBLE.maxWidth, maxWidth: ALBUM_MAX, gap: SPACE.xs },
  albumMine: { alignSelf: "flex-end" },
  albumRow: { flexDirection: "row", gap: SPACE.xs },
  albumColumn: { flex: 1, gap: SPACE.xs },
  // Across a row, each takes its share and is as tall as it is wide; the tall one of three takes
  // two shares and the height of the two stacked beside it.
  square: { flex: 1, aspectRatio: 1 },
  tall: { flex: 2 },
  stacked: { aspectRatio: 1 },
  tile: { borderRadius: RADIUS.md, overflow: "hidden" },
  playMark: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  duration: {
    position: "absolute",
    right: SPACE.xs,
    bottom: SPACE.xs,
    color: "#fff",
    fontSize: TEXT.xs,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  more: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  moreWords: { color: "#fff", fontSize: TEXT.xl, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  rowWords: { flex: 1, gap: 2 },
  voice: {
    gap: SPACE.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    maxWidth: 480,
  },
  voiceTop: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  transcript: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  mark: { fontSize: TEXT.md },
  name: { fontSize: TEXT.sm },
  size: { fontSize: TEXT.xs },
  verb: { fontSize: TEXT.sm, fontWeight: "600" },
  // A tile whose picture is up on the viewer's stage: the stage draws it, so the room does not.
  away: { opacity: 0 },
});
