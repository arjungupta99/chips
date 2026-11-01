/**
 * A video's controls in the viewer's bars, drawn as iOS's own player draws them (AVKit, which is
 * what *System player* shows; Arjun, 14 October 2026: "can we match them to look like iPhone's
 * native?"). Two pieces, and both fade with the bars (`Chrome.tsx`), which hide three seconds into a
 * playing video:
 *
 * - **The transport**, in the middle of the stage: ten seconds back, play or pause, ten seconds on,
 *   each a disc of glass, the middle one larger. While a stream starts or a copy comes, the middle is
 *   left to the spinner or the ring the stage draws there (`VideoItem.tsx`), and a video that would
 *   not play has no transport at all: the card saying why stands there instead.
 * - **The capsule**, at the foot: the time gone, the track, the time left as `−0:27`, and sound,
 *   and Picture in Picture where the platform has it. The track has no knob, as AVKit's has none:
 *   it thickens under a thumb.
 *
 * The glass is the system's (`expo-glass-effect`) where the phone has it, always dark, since it
 * stands over a film and not over the app's page; elsewhere — Reduce Transparency, Android, the
 * web target — a flat dark wash in the same shapes.
 *
 * **The scrubber is React Native's `PanResponder` on the track**, not a gesture handler pan. The
 * bars stand outside the stage's gesture root, so a drag that begins on the track is never the
 * stage's to page or dismiss with, and Reanimated stays in `Stage.tsx` alone. The track takes the
 * touch as it lands and keeps it, as the sheet's handle does inside a modal: asked only once a touch
 * has moved, a responder in a modal is not granted it. The fill follows the thumb, and the player
 * seeks as it goes — no more often than a tenth of a second, and once more where the thumb lets go.
 */

import { formatDuration } from "@chipschat/core";
import { GlassView } from "expo-glass-effect";
import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useLiquid } from "../ui/Glass";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { BUBBLE, TEXT } from "../ui/tokens";
import { WASH } from "./PlayDisc";
import type { Video } from "./VideoItem";

/** The player seeks at most this often while a thumb moves on the track. */
const SEEK_EVERY_MS = 100;
/** A screen reader's swipe on the scrubber moves this many seconds. */
const STEP_S = 5;
/** What the transport's outer discs skip, as AVKit's do. */
export const SKIP_S = 10;
/** The capsule's height, which is the track's touch, and the discs' sizes: AVKit's, measured. */
const CAPSULE = 44;
const PLAY = 72;
const SKIP = 52;
const TRACK = 5;
const TRACK_HELD = 9;
const SCRUB_ACTIONS = [{ name: "increment" }, { name: "decrement" }];

/** `0:12`, the time gone. */
export function elapsedOf(seconds: number): string {
  return formatDuration(Math.max(0, seconds) * 1000);
}

/** `−0:31`, the time left, with a real minus, as AVKit writes it. */
export function remainingOf(seconds: number, duration: number): string {
  return `−${formatDuration(Math.max(0, duration - seconds) * 1000)}`;
}

const clamp = (share: number) => Math.min(1, Math.max(0, share));

/**
 * A piece of the system's glass, dark whatever the app's theme, or the flat wash where there is
 * none. Not interactive glass: the marks inside it answer a thumb by dimming, and the disc stays.
 */
function Glass({
  style,
  children,
  testID,
}: {
  readonly style: StyleProp<ViewStyle>;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const liquid = useLiquid();
  if (liquid) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" style={style} testID={testID}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, styles.wash]} testID={testID}>
      {children}
    </View>
  );
}

/** The middle of the stage: ten seconds back, play or pause, ten seconds on. */
export function Transport({
  video,
  onUsed,
}: {
  readonly video: Video;
  /** A control was used: the bars stay a while longer. */
  readonly onUsed: () => void;
}) {
  const { state } = video;
  if (state.failed !== undefined) return null;
  // Nothing to play or move through until it is on the player.
  const inert = !state.ready;
  // The spinner or the ring is drawn where the middle disc would be.
  const busy = state.waiting || state.coming !== undefined;
  const used = (then: () => void) => () => {
    onUsed();
    then();
  };
  const skip = (by: number) =>
    used(() => video.seek(Math.min(state.duration, Math.max(0, state.time + by))));
  return (
    <View style={styles.transport} pointerEvents="box-none" testID="viewer-transport">
      <Disc
        size={SKIP}
        label={`Back ${SKIP_S} seconds`}
        disabled={inert}
        onPress={skip(-SKIP_S)}
        testID="viewer-back"
      >
        <Skip icon="back10" size={30} />
      </Disc>
      {busy ? (
        <View style={styles.playRoom} />
      ) : (
        <Disc
          size={PLAY}
          label={state.playing ? "Pause" : "Play"}
          disabled={inert}
          onPress={used(video.toggle)}
          testID="viewer-play"
        >
          <View style={state.playing ? null : styles.playNudge}>
            <Icon name={state.playing ? "pauseFill" : "playFill"} color="#ffffff" size={34} />
          </View>
        </Disc>
      )}
      <Disc
        size={SKIP}
        label={`Forward ${SKIP_S} seconds`}
        disabled={inert}
        onPress={skip(SKIP_S)}
        testID="viewer-forward"
      >
        <Skip icon="forward10" size={30} />
      </Disc>
    </View>
  );
}

/** A disc of glass with a mark in it, which dims under a thumb. */
function Disc({
  size,
  label,
  disabled,
  onPress,
  testID,
  children,
}: {
  readonly size: number;
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={round}
    >
      {({ pressed }) => (
        <Glass style={[round, styles.middle]}>
          <View style={pressed ? styles.pressed : disabled ? styles.dim : null}>{children}</View>
        </Glass>
      )}
    </Pressable>
  );
}

/** Ten seconds back or on: the arrow round its ring, and `10` written inside it. */
function Skip({ icon, size }: { readonly icon: IconName; readonly size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Icon name={icon} color="#ffffff" size={size} weight={2} />
      <View style={[StyleSheet.absoluteFill, styles.middle, { paddingTop: size / 12 }]}>
        <Text
          style={[styles.ten, { fontSize: size * 0.32 }]}
          maxFontSizeMultiplier={1}
          allowFontScaling={false}
        >
          {SKIP_S}
        </Text>
      </View>
    </View>
  );
}

/** The foot: the time gone, the track, the time left, sound, and Picture in Picture. */
export function Controls({
  video,
  onUsed,
}: {
  readonly video: Video;
  /** A control was used: the bars stay a while longer. */
  readonly onUsed: () => void;
}) {
  const { state } = video;
  // Nothing to move through until it is on the player, nor once it would not play.
  const inert = !state.ready || state.failed !== undefined;
  const used = (then: () => void) => () => {
    onUsed();
    then();
  };
  return (
    <Glass style={styles.capsule} testID="viewer-controls">
      <Text
        style={[styles.time, styles.gone]}
        maxFontSizeMultiplier={BUBBLE.maxScale}
        numberOfLines={1}
        testID="viewer-time"
      >
        {elapsedOf(state.time)}
      </Text>
      <Scrubber
        time={state.time}
        duration={state.duration}
        buffered={state.buffered}
        disabled={inert}
        onScrub={(active) => {
          onUsed();
          video.scrub(active);
        }}
        onSeek={video.seek}
      />
      <Text
        style={[styles.time, styles.left]}
        maxFontSizeMultiplier={BUBBLE.maxScale}
        numberOfLines={1}
        testID="viewer-remaining"
      >
        {remainingOf(state.time, state.duration)}
      </Text>
      <Mark
        icon={state.muted ? "mute" : "sound"}
        label={state.muted ? "Unmute" : "Mute"}
        onPress={used(video.mute)}
        testID="viewer-mute"
      />
      {video.pictureInPicture === undefined ? null : (
        <Mark
          icon="pictureInPicture"
          label="Picture in Picture"
          onPress={used(video.pictureInPicture)}
          testID="viewer-pip"
        />
      )}
    </Glass>
  );
}

/** A mark in the capsule: sound, or Picture in Picture. */
function Mark({
  icon,
  label,
  onPress,
  testID,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={styles.mark}
    >
      {({ pressed }) => (
        <View style={pressed ? styles.pressed : null}>
          <Icon name={icon} color="#ffffff" size={20} />
        </View>
      )}
    </Pressable>
  );
}

interface ScrubberProps {
  readonly time: number;
  readonly duration: number;
  readonly buffered: number;
  readonly disabled: boolean;
  readonly onScrub: (active: boolean) => void;
  readonly onSeek: (seconds: number) => void;
}

/** Where the thumb is on the track as a share of it, and the seeks it asks for as it moves. */
function useScrub(props: ScrubberProps) {
  const latest = useRef(props);
  latest.current = props;
  const track = useRef({ origin: 0, width: 0 });
  const lastSeek = useRef(0);
  const holding = useRef<number | undefined>(undefined);
  const [held, setHeld] = useState<number | undefined>(undefined);
  const pan = useMemo(() => {
    const shareAt = (pageX: number) =>
      track.current.width <= 0 ? 0 : clamp((pageX - track.current.origin) / track.current.width);
    const seekTo = (share: number, now: boolean) => {
      holding.current = share;
      setHeld(share);
      const at = Date.now();
      if (!now && at - lastSeek.current < SEEK_EVERY_MS) return;
      lastSeek.current = at;
      latest.current.onSeek(share * latest.current.duration);
    };
    const letGo = () => {
      const share = holding.current;
      holding.current = undefined;
      setHeld(undefined);
      if (share !== undefined) latest.current.onSeek(share * latest.current.duration);
      latest.current.onScrub(false);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        const { pageX, locationX } = event.nativeEvent;
        track.current = { ...track.current, origin: pageX - locationX };
        latest.current.onScrub(true);
        seekTo(shareAt(pageX), true);
      },
      onPanResponderMove: (event: GestureResponderEvent) =>
        seekTo(shareAt(event.nativeEvent.pageX), false),
      onPanResponderRelease: letGo,
      onPanResponderTerminate: letGo,
    });
  }, []);
  return { pan, held, track };
}

/** The track: what has played in white, what has come in half-white, thicker under a thumb. */
function Scrubber(props: ScrubberProps) {
  const { time, duration, buffered, disabled, onSeek } = props;
  const { pan, held, track } = useScrub(props);
  const played = held ?? (duration > 0 ? clamp(time / duration) : 0);
  const loaded = duration > 0 ? clamp(buffered / duration) : 0;
  const thick = held === undefined ? TRACK : TRACK_HELD;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const by = event.nativeEvent.actionName === "increment" ? STEP_S : -STEP_S;
    onSeek(Math.min(duration, Math.max(0, time + by)));
  };
  return (
    <View
      style={styles.track}
      onLayout={(event) => {
        track.current = { ...track.current, width: event.nativeEvent.layout.width };
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Position"
      accessibilityValue={{
        text: `${formatDuration(time * 1000)} of ${formatDuration(duration * 1000)}`,
      }}
      accessibilityState={{ disabled }}
      accessibilityActions={SCRUB_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
      testID="viewer-scrubber"
      {...pan.panHandlers}
    >
      <View style={[styles.rail, { height: thick, borderRadius: thick / 2 }]} pointerEvents="none">
        <View style={[styles.fill, styles.buffered, { width: `${loaded * 100}%` }]} />
        <View
          style={[styles.fill, styles.played, { width: `${played * 100}%` }]}
          testID="viewer-played"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wash: { backgroundColor: WASH },
  middle: { alignItems: "center", justifyContent: "center" },
  transport: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  playRoom: { width: PLAY, height: PLAY },
  // A triangle's weight is left of its box's middle: AVKit's sits a little right to look centred.
  playNudge: { marginLeft: 3 },
  ten: {
    color: "#ffffff",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  pressed: { opacity: 0.5 },
  dim: { opacity: 0.4 },
  capsule: {
    height: CAPSULE,
    borderRadius: CAPSULE / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
  },
  time: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    color: "rgba(255,255,255,0.72)",
  },
  gone: { minWidth: 34 },
  left: { minWidth: 40, textAlign: "right" },
  track: { flex: 1, height: CAPSULE, justifyContent: "center", marginHorizontal: 10 },
  rail: { backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0 },
  buffered: { backgroundColor: "rgba(255,255,255,0.4)" },
  played: { backgroundColor: "#ffffff" },
  mark: { width: 40, height: CAPSULE, alignItems: "center", justifyContent: "center" },
});
