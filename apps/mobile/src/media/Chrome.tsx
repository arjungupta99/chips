/**
 * The viewer's bars (the media viewer proposal, figures 3 and 3b): Close, the counter, Share and
 * the menu along the top; who sent it, when, and what it is along the bottom.
 *
 * One opacity for all of it. It arrives 120 ms after the picture starts to move, so the eye
 * follows one thing; it goes at a tap, at the first movement of a drag, while the picture is
 * zoomed and three seconds into a playing video, and comes back at a tap. The status bar goes with
 * it (`MediaViewer.tsx`). A video adds iOS's own player's controls (`Controls.tsx`): the transport
 * in the middle of the stage, and the capsule with the track under the caption; and a line over the
 * caption while its copy comes, or while the original plays in its place. The bars stand
 * on the safe-area insets, not on a number — all four of them, since a phone on its side puts its
 * island and its corners at the sides, where Close and Play were drawn under them — over a scrim
 * that darkens only the edge they sit on, so white words read over a white photograph.
 *
 * **A scrim is drawn at the window's size, in numbers.** Drawn at `100%`, the gradient kept the
 * width it was first drawn at, and a phone turned onto its side under the viewer had its shade stop
 * a third of the way across the picture, in a hard edge. The one at the foot is as tall as what
 * stands there and a lead above it, measured, so a phone on its side is not shaded halfway up.
 *
 * The marks follow the platform: iOS's square and arrow and `⋯`, Material's joined dots and `⋮`.
 * Where there is a pointer — the web target — arrows page as well, since a mouse cannot swipe, and
 * so they do where the window is wide, where a thumb reaching across a tablet is a stretch
 * (`MediaViewer.tsx` decides which of those it is; this draws what it is given). They rest a little
 * under full and come up to it under a pointer, which is as near as React Native gets to the web's
 * *appear on hover*: there is no asking whether a pointer is there at all, and a tablet held in two
 * hands would be left with nothing (§4.4's departure, 16 September 2026).
 *
 * A wide window also gets the filmstrip, under the caption (`Filmstrip.tsx`), which is where
 * decision 8's *off while zoomed* comes from for nothing: the bars are already gone by then.
 *
 * It is the stage's to be black; this draws only what stands on it. React Native's own `Animated`
 * rather than Reanimated, which stays in `Stage.tsx` alone.
 */

import { type DeckItem, formatBytes, formatDuration } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import type { FileService } from "../spaces/files";
import { Avatar, type AvatarKind } from "../ui/Avatar";
import { TOUCH_TARGET } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { useLayout } from "../ui/layout";
import { BUBBLE, SPACE, TEXT } from "../ui/tokens";
import { Controls, Transport } from "./Controls";
import { Filmstrip, STRIP_ROOM } from "./Filmstrip";
import type { Coming, Video, VideoState } from "./VideoItem";

/** How long the bars take to come and go. */
const CHROME_MS = 200;
/** How far above what stands at the foot its shade begins, at most, so the dark has room to gather. */
const SCRIM_LEAD = 88;
/** And at most this share of the window's height: a phone on its side has 400 points in all. */
const SCRIM_LEAD_SHARE = 0.12;
/** The shade along the top: the bar, and room below it for the dark to fade. */
const TOP_SCRIM = 96;
const NATIVE = Platform.OS !== "web";
const ANDROID = Platform.OS === "android";

export interface Who {
  readonly name: string;
  readonly kind: AvatarKind;
  /** An agent's own face, when it has one (ADR 0089). */
  readonly icon?: SpaceIcon | undefined;
}

/** `Priya · Today 11:02 · 6 of 6 in this message`: who, when, and where in an album. */
export function captionOf(item: DeckItem, who: Who, when: string): string {
  const album =
    item.inMessage.of > 1
      ? ` · ${item.inMessage.index} of ${item.inMessage.of} in this message`
      : "";
  return `${who.name} · ${when}${album}`;
}

/** `Fetching the video · 15 MB of 38 MB`, while it comes. */
function fetchingOf({ received, total }: Coming): string {
  const got = formatBytes(received);
  return `Fetching the video · ${total === undefined ? got : `${got} of ${formatBytes(total)}`}`;
}

/** The line over a video's controls: how much of it has come, or that the original is playing. */
export function videoNoteOf(state: VideoState): string | undefined {
  if (state.coming !== undefined) return fetchingOf(state.coming);
  if (state.ready && state.beingMade && state.failed === undefined) {
    return "Playing the original · the copy that plays everywhere is being made";
  }
  return undefined;
}

/** `receipt.jpg · 3.1 MB · 3024 × 4032`, and a video's length after its name. */
export function factsOf(item: DeckItem): string {
  const { attachment } = item;
  const parts = [attachment.filename];
  if (attachment.durationMs !== undefined) parts.push(formatDuration(attachment.durationMs));
  // A staged photo whose size nobody has said yet says nothing of it, rather than 0 B.
  if (attachment.byteSize > 0) parts.push(formatBytes(attachment.byteSize));
  if (attachment.width !== undefined && attachment.height !== undefined) {
    parts.push(`${attachment.width} × ${attachment.height}`);
  }
  return parts.join(" · ");
}

export function Chrome({
  shown,
  item,
  deck,
  place,
  files,
  who,
  when,
  notice,
  missing,
  video,
  onUsed,
  onClose,
  onShare,
  onMenu,
  onPrevious,
  onNext,
  onGo,
  footRoom = 0,
}: {
  readonly shown: boolean;
  readonly item: DeckItem;
  /** The whole deck, for the filmstrip; a narrow window never draws it. */
  readonly deck: readonly DeckItem[];
  /** Where the item stands in the deck, counted from one; nothing for a staged photo, in no deck. */
  readonly place?: { readonly index: number; readonly count: number } | undefined;
  /** Where the strip's thumbnails come from; without it, no strip. */
  readonly files?: FileService | undefined;
  readonly who: Who;
  /** `Today 11:26`, as the room's separator says it. */
  readonly when: string;
  /** A word after an action — *Saved*, *Copied*, or why not — in place of the facts for a moment. */
  readonly notice?: string | undefined;
  /**
   * The photo's full picture would not come, and its preview stands in (ADR 0179): said over the
   * caption, and a tap on it asks again.
   */
  readonly missing?: (() => void) | undefined;
  /** The item's video, when it is one: its controls stand above the caption. */
  readonly video?: Video | undefined;
  /** One of the video's controls was used. */
  readonly onUsed?: (() => void) | undefined;
  readonly onClose: () => void;
  /** Share and the menu, each drawn where it is given: a staged photo has neither. */
  readonly onShare?: (() => void) | undefined;
  readonly onMenu?: (() => void) | undefined;
  /** Given where a pointer pages: the arrows, where there is somewhere to go. */
  readonly onPrevious?: (() => void) | undefined;
  readonly onNext?: (() => void) | undefined;
  /** Where the filmstrip goes: the deck's index, counted from zero. */
  readonly onGo?: ((at: number) => void) | undefined;
  /** Points the caption leaves clear at its right, for a staged photo's Send standing there. */
  readonly footRoom?: number | undefined;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const opacity = useFade(shown);
  const wide = useLayout().wide;
  const strip = wide && deck.length > 1 && files !== undefined && onGo !== undefined;
  const left = insets.left + SPACE.sm;
  const right = insets.right + SPACE.sm;
  const bottom = insets.bottom + SPACE.lg;
  const used = onUsed ?? nothing;
  const shade = useFootShade(
    insets.bottom + (video === undefined ? 128 : 200) + (strip ? STRIP_ROOM : 0),
    bottom,
    window.height,
  );
  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      style={[StyleSheet.absoluteFill, { opacity }]}
      testID="viewer-chrome"
    >
      <Scrim edge="top" width={window.width} height={insets.top + TOP_SCRIM} />
      <Scrim edge="bottom" width={window.width} height={shade.height} />
      <TopBar
        top={insets.top}
        left={left}
        right={right}
        place={place}
        onClose={onClose}
        onShare={onShare}
        onMenu={onMenu}
      />
      <Arrows left={left} right={right} onPrevious={onPrevious} onNext={onNext} />
      {video === undefined ? null : <Transport video={video} onUsed={used} />}
      <View
        style={[styles.foot, { bottom, left, right: right + footRoom }]}
        pointerEvents="box-none"
        onLayout={shade.onLayout}
        testID="viewer-foot"
      >
        {missing === undefined ? null : <PreviewOnly onRetry={missing} />}
        <Caption
          item={item}
          who={who}
          when={when}
          notice={notice}
          note={video === undefined ? undefined : videoNoteOf(video.state)}
        />
        {video === undefined ? null : <Controls video={video} onUsed={used} />}
        {strip ? (
          <Filmstrip deck={deck} index={(place?.index ?? 1) - 1} files={files} onGo={onGo} />
        ) : null}
      </View>
    </Animated.View>
  );
}

const nothing = (): void => undefined;

/**
 * How tall the shade at the foot is: as tall as what stands there and a lead above it for the dark
 * to gather in, the lead no more than an eighth of the window, since a phone on its side is 400
 * points in all. Until the foot is measured, what it was before it was measured.
 */
function useFootShade(
  unmeasured: number,
  under: number,
  window: number,
): { readonly height: number; readonly onLayout: (event: LayoutChangeEvent) => void } {
  const [foot, setFoot] = useState<number | undefined>(undefined);
  return {
    height:
      foot === undefined
        ? unmeasured
        : under + foot + Math.min(SCRIM_LEAD, window * SCRIM_LEAD_SHARE),
    onLayout: (event) => setFoot(event.nativeEvent.layout.height),
  };
}

/** Who sent it and when, what it is, and over them the line a video's copy says while it comes. */
function Caption({
  item,
  who,
  when,
  notice,
  note,
}: {
  readonly item: DeckItem;
  readonly who: Who;
  readonly when: string;
  readonly notice: string | undefined;
  readonly note: string | undefined;
}) {
  return (
    <>
      {note === undefined ? null : (
        <Text
          style={styles.note}
          numberOfLines={2}
          maxFontSizeMultiplier={BUBBLE.maxScale}
          pointerEvents="none"
          testID="viewer-note"
        >
          {note}
        </Text>
      )}
      <View style={styles.caption} pointerEvents="none" testID="viewer-caption">
        <Avatar name={who.name} kind={who.kind} icon={who.icon} size="sm" decorative />
        <View style={styles.words}>
          <Text style={styles.who} numberOfLines={1} maxFontSizeMultiplier={BUBBLE.maxScale}>
            {captionOf(item, who, when)}
          </Text>
          <Text style={styles.facts} numberOfLines={1} maxFontSizeMultiplier={BUBBLE.maxScale}>
            {notice ?? factsOf(item)}
          </Text>
        </View>
      </View>
    </>
  );
}

/** What the line over a preview says, before its Try again. */
export const PREVIEW_ONLY = "Preview only · couldn't load the full photo";

/**
 * The line over the caption when a photo's full picture would not come and its preview is what is
 * drawn: the picture is there to look at, so this is small and out of its way, and a tap on it
 * asks again (ADR 0179).
 */
function PreviewOnly({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${PREVIEW_ONLY}. Try again`}
      onPress={onRetry}
      hitSlop={SPACE.sm}
      style={({ pressed }) => (pressed ? styles.pressedLine : null)}
      testID="viewer-preview-only"
    >
      <Text style={styles.note} maxFontSizeMultiplier={BUBBLE.maxScale}>
        {`${PREVIEW_ONLY} · `}
        <Text style={styles.retry}>Try again</Text>
      </Text>
    </Pressable>
  );
}

/** Close, where the item stands in the deck, Share and the menu, inside the safe area. */
function TopBar({
  top,
  left,
  right,
  place,
  onClose,
  onShare,
  onMenu,
}: {
  readonly top: number;
  /** Where the bar's ends stand: on a phone on its side, clear of the island and the corners. */
  readonly left: number;
  readonly right: number;
  readonly place: { readonly index: number; readonly count: number } | undefined;
  readonly onClose: () => void;
  readonly onShare: (() => void) | undefined;
  readonly onMenu: (() => void) | undefined;
}) {
  return (
    <View style={[styles.bar, { top, left, right }]} testID="viewer-bar">
      {place === undefined ? null : (
        <Text
          style={styles.counter}
          maxFontSizeMultiplier={BUBBLE.maxScale}
          accessibilityRole="header"
          testID="viewer-counter"
        >
          {place.index} of {place.count}
        </Text>
      )}
      <Mark icon="x" label="Close" onPress={onClose} testID="viewer-close" />
      <View style={styles.side}>
        {onShare === undefined ? null : (
          <Mark
            icon={ANDROID ? "shareAndroid" : "share"}
            label="Share"
            onPress={onShare}
            testID="viewer-share"
          />
        )}
        {onMenu === undefined ? null : (
          <Mark
            icon={ANDROID ? "moreVertical" : "more"}
            label="More"
            onPress={onMenu}
            testID="viewer-more"
          />
        )}
      </View>
    </View>
  );
}

/**
 * The way back and the way on, at the sides, where the viewer was given them: a pointer's, and a
 * wide window's. Each is there only where there is somewhere to go, so the ends of the deck say so
 * by the arrow being absent, as the web's do.
 */
function Arrows({
  left,
  right,
  onPrevious,
  onNext,
}: {
  readonly left: number;
  readonly right: number;
  readonly onPrevious: (() => void) | undefined;
  readonly onNext: (() => void) | undefined;
}) {
  return (
    <>
      {onPrevious === undefined ? null : (
        <View style={[styles.arrow, { left }]} pointerEvents="box-none">
          <Mark
            icon="previous"
            label="Previous"
            dim
            onPress={onPrevious}
            testID="viewer-previous"
          />
        </View>
      )}
      {onNext === undefined ? null : (
        <View style={[styles.arrow, { right }]} pointerEvents="box-none">
          <Mark icon="next" label="Next" dim onPress={onNext} testID="viewer-next" />
        </View>
      )}
    </>
  );
}

/**
 * A 44-point white mark on the stage. `dim` is the arrows': they rest under full so the picture is
 * what is looked at, and a pointer over one brings it up. `onHoverIn` is raised by React Native Web
 * and by a mouse on Android; a finger raises none, and the mark stays where it rests, which is why
 * it rests visible.
 */
function Mark({
  icon,
  label,
  dim = false,
  onPress,
  testID,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly dim?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      testID={testID}
      style={({ pressed }) => [
        styles.mark,
        dim && !hovered && !pressed ? styles.resting : null,
        pressed || hovered ? styles.pressed : null,
      ]}
    >
      <Icon name={icon} color="#ffffff" size={22} />
    </Pressable>
  );
}

/**
 * The shade under a bar: dark at the glass's edge, nothing by the picture's middle. Its size is in
 * numbers, and a turn of the window draws it again at the new one (*A scrim is drawn at the
 * window's size*, at the head of this file).
 */
function Scrim({
  edge,
  width,
  height,
}: {
  readonly edge: "top" | "bottom";
  readonly width: number;
  readonly height: number;
}) {
  const id = `scrim-${edge}`;
  const top = edge === "top";
  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, { width, height }, top ? { top: 0 } : { bottom: 0 }]}
      testID={id}
    >
      <Svg width={width} height={height} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={top ? 0.6 : 0} />
            <Stop offset="1" stopColor="#000" stopOpacity={top ? 0 : 0.65} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The bars' opacity, eased toward shown or hidden on the native driver. */
function useFade(shown: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    const move = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: CHROME_MS,
      useNativeDriver: NATIVE,
    });
    move.start();
    return () => move.stop();
  }, [shown, opacity]);
  return opacity;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", left: 0 },
  bar: {
    position: "absolute",
    height: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  side: { flexDirection: "row", alignItems: "center" },
  counter: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#ffffff",
    fontSize: TEXT.md,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  mark: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TOUCH_TARGET / 2,
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.16)" },
  /** An arrow at rest: there, and not shouting over the picture. */
  resting: { opacity: 0.55 },
  arrow: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  foot: { position: "absolute", gap: SPACE.sm },
  note: {
    color: "rgba(255,255,255,0.86)",
    fontSize: TEXT.sm,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: SPACE.md,
  },
  retry: { color: "#ffffff", fontWeight: "600" },
  pressedLine: { opacity: 0.6 },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SPACE.sm,
  },
  words: { flex: 1, gap: 1 },
  who: { color: "#ffffff", fontSize: TEXT.md, fontWeight: "600", lineHeight: 19 },
  facts: {
    color: "rgba(255,255,255,0.72)",
    fontSize: TEXT.sm,
    lineHeight: 17,
    fontVariant: ["tabular-nums"],
  },
});
