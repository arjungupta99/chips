/**
 * The filmstrip under the caption, where the window is wide (the media viewer proposal, §4.4 and
 * figure 10; Arjun, decision 8, 16 September 2026: on where there is room, off while zoomed).
 *
 * The web's strip is this one in the other language (`apps/web/src/app/viewer/Filmstrip.tsx`), and
 * they are meant to agree: 56-point thumbnails of the deck, the current one ringed in the brand's
 * gold — as a selection, the way `Flash` uses it, and never a status — scrolled to keep that one in
 * the middle, and each thumb a button a screen reader hears as a place to go rather than a picture,
 * in the same words. What differs is only what draws it: a `ScrollView` of `Pressable`s here, a
 * scrolling `<ul>` of `<button>`s there.
 *
 * It stands inside `Chrome`, which is what makes decision 8's *off while zoomed* true with nothing
 * written for it: the bars already go at the first movement of a pinch and come back when the
 * picture settles fitted (`Stage.tsx`'s `bare` and `chrome`), and the strip goes with them — as it
 * does at a tap, at the first movement of a drag, and three seconds into a playing video.
 *
 * A deck of one has nothing to strip: it draws nothing.
 */

import type { DeckItem } from "@chipschat/core";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { FileService } from "../spaces/files";
import { light, RADIUS, SPACE } from "../ui/tokens";
import { PlayMark } from "./PlayDisc";

/** 56 points, as §4.6 says, and the design system's smallest gap between them. */
const THUMB = 56;
/** A video's play mark on its thumbnail: the disc's triangle, bare (`PlayDisc.tsx`). */
const MARK = 20;
const GAP = SPACE.sm;
const STEP = THUMB + GAP;
const PAD = SPACE.xs;

/**
 * How much room the strip asks of the stage, so the scrim under the bars covers it: the thumb, its
 * padding either side, and the gap the caption leaves above it.
 */
export const STRIP_ROOM = THUMB + PAD * 2 + SPACE.xs;

export function Filmstrip({
  deck,
  index,
  files,
  onGo,
}: {
  readonly deck: readonly DeckItem[];
  readonly index: number;
  readonly files: FileService;
  readonly onGo: (at: number) => void;
}) {
  const strip = useRef<ScrollView>(null);
  const [room, setRoom] = useState(0);

  // Keep the current one in the middle as the deck is paged, and stop at either end rather than
  // scrolling into the padding.
  useEffect(() => {
    if (room === 0) return;
    const middle = index * STEP + THUMB / 2 - room / 2;
    const end = Math.max(0, deck.length * STEP - GAP + PAD * 2 - room);
    strip.current?.scrollTo({ x: Math.min(Math.max(0, middle), end), animated: true });
  }, [index, room, deck.length]);

  const onLayout = (event: LayoutChangeEvent) => setRoom(event.nativeEvent.layout.width);
  if (deck.length < 2) return null;
  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.strip}
      onLayout={onLayout}
      testID="viewer-filmstrip"
    >
      {deck.map((item, at) => (
        <Thumb
          key={item.attachment.id}
          item={item}
          files={files}
          at={at}
          of={deck.length}
          current={at === index}
          onGo={onGo}
        />
      ))}
    </ScrollView>
  );
}

function Thumb({
  item,
  files,
  at,
  of,
  current,
  onGo,
}: {
  readonly item: DeckItem;
  readonly files: FileService;
  readonly at: number;
  readonly of: number;
  readonly current: boolean;
  readonly onGo: (at: number) => void;
}) {
  const uri = useThumb(files, item.attachment.id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.kind === "video" ? "Video" : "Photo"} ${at + 1} of ${of}, ${item.attachment.filename}`}
      // The `aria-` spelling, as the space list uses it: React Native maps it to the native state,
      // and the web target, which dropped `accessibilityState`, renders the attribute a spec reads.
      aria-selected={current}
      onPress={() => onGo(at)}
      style={[styles.thumb, current ? styles.current : null]}
      testID={`viewer-thumb-${item.attachment.id}`}
    >
      {uri === undefined ? null : (
        <Image
          source={{ uri }}
          contentFit="cover"
          recyclingKey={item.attachment.id}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
        />
      )}
      {item.kind === "video" ? (
        <View style={styles.mark} pointerEvents="none">
          <PlayMark size={MARK} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A thumbnail's URI, once it is there. The file service fetches each one once and keeps it for the
 * app's life, so a strip of twenty asks for each once however many times the viewer redraws, and
 * the one already on the stage costs nothing.
 */
function useThumb(files: FileService, id: string): string | undefined {
  const [uri, setUri] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    files.thumb(id).then(
      (found) => {
        if (live) setUri(found);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [files, id]);
  return uri;
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0 },
  strip: { gap: GAP, paddingHorizontal: PAD, paddingVertical: PAD },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  /** Both palettes hold the same gold, and the stage is black whatever the theme. */
  current: { borderWidth: 2, borderColor: light.gold },
  mark: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
