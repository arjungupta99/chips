/**
 * The film's player on the phone (ADR 0217): the video `pnpm film` rendered, dark in both
 * appearances, as a video player is. It plays in two places: full screen (`FilmPlayer`, fitted to
 * the screen and letterboxed where it is wider, an iPad), and in a frame on the first screen
 * (`useFilm` and `FilmFace`, ADR 0217's addendum of 26 October). Around it, Chips' own chrome: the
 * green chapter bar, a segment a part, filled from the video's time, where a tap goes to that part;
 * Skip, which goes to the end card at once; and, full screen, Leave (✕). When the video ends, or is
 * skipped, the app's own end card stands over its last frame, with its ways on.
 *
 * A tap on the film moves through its parts, as a story does: the right two-thirds on to the next
 * part, and the last part on to the end card; the left third back to this part's start, or to the
 * part before when this one began a moment ago, so a second tap goes back one. Where a tap lands is
 * core's (`nextPartAt`, `backPartAt`), as on the web and the Mac. A finger held keeps the film
 * waiting until it lifts. The side tapped flashes with which way it went.
 *
 * The segment playing fills between the player's time updates on the UI thread (`SegmentFill`),
 * and one just finished gives its little jump. VoiceOver hears the film as the words the picture
 * shows for the part playing, and moves it as an adjustable: up for the next part, down for this
 * one again, and a double-tap to pause. Each segment is a button named by its part. With Reduce
 * Motion, no jump, no flash, and the end card comes without a fade.
 */

import {
  BACK_SIDE,
  backPartAt,
  chapterAt,
  chaptersOf,
  type FilmBeat,
  type FilmVideo,
  fillOf,
  filmOf,
  lengthWords,
  nextPartAt,
  spokenOf,
} from "@chipschat/core";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, type VideoPlayer, VideoView } from "expo-video";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PasteInvite } from "../pairing/usePasteInvite";
import { GOLD_PRESSED, ON_GOLD } from "../ui/Button";
import { alpha } from "../ui/glassDial";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { usePalette, useScheme } from "../ui/theme";
import { dark, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { EndCard, type EndWays, type OfferedFilm } from "./EndCard";
import { Fades, Flash, SegmentFill } from "./FilmMotion";
import { VIDEOS } from "./videos";

/** The videos, by film: Metro bundles each one named here. */
export const SOURCES: Readonly<Record<string, number>> = {
  watch: require("../../../../assets/film/watch.mp4") as number,
  agents: require("../../../../assets/film/agents.mp4") as number,
  trouble: require("../../../../assets/film/trouble.mp4") as number,
};

/** How often the player says where it is, in seconds: the bar runs on between. */
const TICK = 0.25;

/** The player's ground and its chrome's ink, in light and dark alike. */
const NIGHT = "#000000";
const CHROME = "#ffffff";

/** The gap between segments, and how far a segment's target reaches over and under its track. */
const GAP = 5;
const REACH = 7;

/** How long a finger stays down before it holds the film rather than taps it. */
const HOLD_MS = 280;

/** What the full-screen player does with a tap on its chrome; Watch again is its own. */
export interface FilmWays extends Omit<EndWays, "onWatchAgain"> {
  readonly onLeave: () => void;
}

/** A film playing: where its video stands, and the ways to move it. */
export interface Film {
  readonly video: FilmVideo;
  readonly player: VideoPlayer;
  readonly time: number;
  readonly playing: boolean;
  /** Played to the end, or skipped there: the end card stands. */
  readonly ended: boolean;
  /** The video sent to `time` and played from there: a segment, a tap, or Watch again. */
  readonly goTo: (time: number) => void;
  /** Paused, or played again; not once it has ended. */
  readonly toggle: () => void;
  /** A finger down on the film, or lifted: the film waits while it is held. */
  readonly hold: (held: boolean) => void;
  /** On to the next part, or to the end card from the last. */
  readonly next: () => void;
  /** Back to this part's start, or the part before when this one has only just begun. */
  readonly back: () => void;
  /** Straight to the end card. */
  readonly skip: () => void;
}

/**
 * A film's player and where it stands. Played once its view is up (on the web, the player plays
 * only the views it has), unless it opens on its end card (`ended`), as the first screen does when
 * it is opened on its ways in.
 */
export function useFilm(video: FilmVideo, options: { readonly ended?: boolean } = {}): Film {
  const opensEnded = options.ended === true;
  const player = useVideoPlayer(SOURCES[video.key] ?? null, (made) => {
    made.loop = false;
    made.muted = true;
    // The film has no sound: it leaves whatever else is playing alone.
    made.audioMixingMode = "mixWithOthers";
    made.timeUpdateEventInterval = TICK;
  });
  const [time, setTime] = useState(opensEnded ? video.seconds : 0);
  const [playing, setPlaying] = useState(() => player.playing);
  const [ended, setEnded] = useState(opensEnded);
  const { seconds } = video;
  useEffect(() => {
    const heard = [
      player.addListener("timeUpdate", ({ currentTime }) => setTime(currentTime)),
      player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener("playToEnd", () => {
        setTime(seconds);
        setEnded(true);
      }),
    ];
    return () => {
      for (const each of heard) each.remove();
    };
  }, [player, seconds]);
  useEffect(() => {
    if (!opensEnded) player.play();
  }, [player, opensEnded]);
  const goTo = (to: number) => {
    player.currentTime = to;
    setTime(to);
    setEnded(false);
    player.play();
  };
  const skip = () => {
    player.pause();
    setTime(seconds);
    setEnded(true);
  };
  return {
    video,
    player,
    time,
    playing,
    ended,
    goTo,
    toggle: () => {
      if (ended) return;
      if (player.playing) player.pause();
      else player.play();
    },
    hold: (held) => {
      if (ended) return;
      if (held) player.pause();
      else player.play();
    },
    next: () => {
      const to = nextPartAt(video, time);
      if (to === undefined) skip();
      else goTo(to);
    },
    back: () => goTo(backPartAt(video, time)),
    skip,
  };
}

/** The films to offer after this one: every other there is a video of. */
export function moreThan(video: FilmVideo): readonly OfferedFilm[] {
  return VIDEOS.filter((each) => each.key !== video.key).map((each) => ({
    key: each.key,
    title: each.title,
    length: lengthWords(each.seconds),
  }));
}

/** The side of the film a tap went to, and which way, numbered so each tap lights it again. */
interface Flashed {
  readonly side: "left" | "right";
  readonly icon: IconName;
  readonly at: number;
}

/**
 * The film's picture and what a finger does on it: its video, filling what holds it, and over it
 * the taps, the hold, the flash and the paused mark. `children` draws over the lot: the frame's
 * own chapter bar on the first screen.
 */
export function FilmFace({
  film,
  reduced,
  children,
}: {
  readonly film: Film;
  readonly reduced: boolean;
  readonly children?: ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const held = useRef(false);
  const [flashed, setFlashed] = useState<Flashed | undefined>(undefined);
  const { video } = film;
  const chapters = chaptersOf(video);
  const at = chapterAt(video, film.time);
  const beat = chapters[at];
  const flash = (side: Flashed["side"], icon: IconName) =>
    setFlashed((was) => ({ side, icon, at: (was?.at ?? 0) + 1 }));
  const back = () => {
    const part = chapters[Math.min(at, chapters.length - 1)];
    const before = backPartAt(video, film.time) < (part?.start ?? 0);
    flash("left", before ? "previous" : "again");
    film.back();
  };
  const next = () => {
    flash("right", "next");
    film.next();
  };
  const part = `Part ${Math.min(at + 1, chapters.length)} of ${chapters.length}`;
  const moves = "Swipe up for the next part, down for this part again.";
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      testID="film-face"
    >
      <VideoView
        player={film.player}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={false}
        // No Live Text button on a paused frame: the words in it are the film's own.
        allowsVideoFrameAnalysis={false}
        style={StyleSheet.absoluteFill}
        testID="film-video"
      />
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={spokenOf(beat)}
        accessibilityValue={{ text: part }}
        accessibilityHint={`${film.playing ? "Double-tap to pause." : "Double-tap to play."} ${moves}`}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "increment") next();
          else if (nativeEvent.actionName === "decrement") back();
          else film.toggle();
        }}
        onPress={({ nativeEvent }) => {
          if (film.ended) return;
          const across = acrossOf(nativeEvent);
          if (width > 0 && across !== undefined && across < width * BACK_SIDE) back();
          else next();
        }}
        delayLongPress={HOLD_MS}
        onLongPress={() => {
          held.current = true;
          film.hold(true);
        }}
        onPressOut={() => {
          if (!held.current) return;
          held.current = false;
          film.hold(false);
        }}
        style={StyleSheet.absoluteFill}
        testID="film-taps"
      >
        {/* Not before it has begun: the player says it plays a moment after it is made. */}
        {film.playing || film.ended || film.time === 0 ? null : <Paused />}
      </Pressable>
      {flashed === undefined ? null : (
        <Flash side={flashed.side} icon={flashed.icon} at={flashed.at} reduced={reduced} />
      )}
      {children}
    </View>
  );
}

/**
 * How far across the film a tap landed. The phone's press says so itself; on the web, React Native
 * hands the press the browser's click, which says it as `offsetX`.
 */
function acrossOf(event: GestureResponderEvent["nativeEvent"]): number | undefined {
  const across: unknown = event.locationX ?? (event as { readonly offsetX?: unknown }).offsetX;
  return typeof across === "number" ? across : undefined;
}

/** Paused: a play mark in the middle of the film. */
function Paused() {
  return (
    <View style={styles.paused} pointerEvents="none" testID="film-paused">
      <View style={styles.pausedDisc}>
        <Icon name="play" size={28} color={CHROME} />
      </View>
    </View>
  );
}

/**
 * The film full screen: the workspace switcher's Watch Chips work, on a phone that holds a
 * workspace. Its end card's Paste goes through `invites`.
 */
export function FilmPlayer({
  video,
  ways,
  invites,
}: {
  readonly video: FilmVideo;
  readonly ways: FilmWays;
  readonly invites: PasteInvite;
}) {
  const film = useFilm(video);
  const reduced = useReduceMotion();
  const scheme = useScheme();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // The end card is the app's own, in the app's appearance; the film is dark in both.
  const light = film.ended && scheme === "light";
  return (
    <View style={styles.page} testID="film-player">
      <StatusBar style={light ? "dark" : "light"} />
      <FilmFace film={film} reduced={reduced} />
      {!film.ended ? null : (
        <Fades reduced={reduced} style={StyleSheet.absoluteFill}>
          <EndCard
            words={filmOf(video.key).end}
            more={moreThan(video)}
            invites={invites}
            ways={{ ...ways, onWatchAgain: () => film.goTo(0) }}
          />
        </Fades>
      )}
      <View style={[styles.top, { top: insets.top + SPACE.xs }]} pointerEvents="box-none">
        <FilmBar film={film} light={light} reduced={reduced} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave"
          onPress={ways.onLeave}
          hitSlop={SPACE.sm}
          style={styles.leave}
          testID="film-leave"
        >
          <Icon name="x" size={18} color={light ? palette.ink : CHROME} />
        </Pressable>
      </View>
      {film.ended ? null : (
        <View style={[styles.skipAt, { bottom: insets.bottom + SPACE.md }]}>
          <Skip onPress={film.skip} />
        </View>
      )}
    </View>
  );
}

/** The chapter bar: a segment a part, done once the film is past it, filling while it plays. */
export function FilmBar({
  film,
  light = false,
  reduced,
}: {
  readonly film: Film;
  /** Over the end card, in light: drawn in the app's own ink. */
  readonly light?: boolean;
  readonly reduced: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={styles.bar} testID="film-bar">
      {chaptersOf(film.video).map((beat, index) => (
        <Segment
          key={beat.key}
          beat={beat}
          index={index}
          film={film}
          reduced={reduced}
          track={light ? alpha(palette.ink, 0.13) : alpha(CHROME, 0.24)}
          color={light ? palette.green : dark.green}
        />
      ))}
    </View>
  );
}

/** A part's segment: done once the film is past it, filling while it plays. */
function Segment({
  beat,
  index,
  film,
  reduced,
  track,
  color,
}: {
  readonly beat: FilmBeat;
  readonly index: number;
  readonly film: Film;
  readonly reduced: boolean;
  readonly track: string;
  readonly color: string;
}) {
  const fill = fillOf(beat, film.time);
  const done = film.ended || film.time >= beat.end;
  const playing = !done && film.time >= beat.start;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={beat.eyebrow ?? beat.line}
      accessibilityHint="Plays this part of the film"
      accessibilityState={{ selected: playing }}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100) }}
      onPress={() => film.goTo(beat.start)}
      hitSlop={{ top: REACH, bottom: REACH }}
      style={styles.segment}
      testID={`film-chapter-${index}`}
    >
      <SegmentFill
        fill={fill}
        running={playing && film.playing}
        ms={playing ? (beat.end - film.time) * 1000 : 0}
        glow={playing}
        done={done}
        reduced={reduced}
        track={track}
        color={color}
      />
    </Pressable>
  );
}

/** Skip: the end card, now. Gold, at the bottom right, under a thumb. */
export function Skip({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip"
      accessibilityHint="Goes to the end of the film"
      onPress={onPress}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [
        styles.skip,
        { backgroundColor: pressed ? GOLD_PRESSED : palette.gold },
      ]}
      testID="film-skip"
    >
      <Text style={styles.skipWord}>Skip</Text>
      <Icon name="next" size={16} color={ON_GOLD} weight={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: NIGHT },
  paused: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  pausedDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
    backgroundColor: alpha(NIGHT, 0.45),
  },
  top: {
    position: "absolute",
    left: SPACE.xl,
    right: SPACE.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
  },
  bar: { flex: 1, flexDirection: "row", alignItems: "center", gap: GAP, height: 4 + REACH * 2 },
  segment: { flex: 1, height: 4, flexDirection: "row" },
  leave: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  skipAt: { position: "absolute", right: SPACE.lg },
  skip: {
    height: 44,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 20,
    paddingRight: 16,
  },
  skipWord: { fontSize: TEXT.body, fontWeight: "600", color: ON_GOLD },
});
