/**
 * A video on the viewer's stage (the media viewer proposal, §4.2's *Video*; figures 7 and 9).
 *
 * **One player for the viewer, made when a video is first landed on.** `useVideo` holds a single
 * `expo-video` player and puts on it the video that is current. Landed on, it plays from the
 * start; paged away from, it pauses and keeps its place; landed on again, it goes on from there,
 * or from the start if it had finished. Only the current item draws the player's view — a
 * neighbour is its poster with a play mark (`Stage.tsx`) — so one view shows the player at a
 * time. A viewer opened on a photo makes no player until it is paged onto a video: the player is
 * an AVPlayer, and making one took 40 to 80 ms of the first open's JavaScript on the simulator,
 * before the picture could so much as move (23 September 2026).
 *
 * **Streamed where it can be** (ADR 0058). On the server's network what plays is `files.streamUrl`:
 * a grant's URL, handed to the player, which asks for the runs it needs as it plays, so a clip
 * starts in about a second and scrubs to anywhere in it. While it starts, or catches up after a
 * scrub, the poster or the frame carries a spinner: there is no telling how much has come.
 *
 * **On the download path** otherwise: through the relay, or from a server from before grants. What
 * plays is `files.play`: the copy that plays everywhere, fetched whole to the phone first. While it
 * comes the poster carries a ring saying how much has arrived, read from the response's body as it
 * comes, through the relay too, and the caption says how many megabytes of how many. Until the
 * server has made the copy the original plays, and the caption says that instead, on either path.
 *
 * **Its controls are the viewer's** (`Controls.tsx`): play and pause, the scrubber, the time, mute
 * and Picture in Picture. *System player* in the menu puts the video in a full-screen modal of its
 * own with the platform's controls, where AirPlay and captions are, since `expo-video` has no
 * picker for either; the player is handed across with its time and whether it was playing. (Not
 * the view's `enterFullscreen`: inside the viewer's modal it resolved and presented nothing, on the
 * simulator, 14 September 2026.) A drag to dismiss pauses the video, and springing back puts it
 * back as it was.
 */

import { type Attachment, formatBytes } from "@chipschat/core";
import {
  createVideoPlayer,
  isPictureInPictureSupported,
  type VideoPlayer,
  VideoView,
} from "expo-video";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Circle, Svg } from "react-native-svg";
import type { FileService, Played } from "../spaces/files";
import { TOUCH_TARGET } from "../ui/Button";
import { SPACE, TEXT } from "../ui/tokens";

/** How often the player says where it is, in seconds: often enough for a thumb on the scrubber. */
const TIME_EVERY_S = 0.25;
/** A view taking the player over seeks to where the other left it only when it is further than this. */
const HANDOVER_SLACK_S = 0.5;
/** Within this of the end a video counts as finished, and plays from the start next time. */
const END_SLACK_S = 0.25;
/** A paused video's frame is drawn again no nearer its end than this: at the end there is none to draw. */
const LAST_FRAME_S = 0.05;
/** A download of unknown length redraws its ring at most once per this many bytes. */
const UNSIZED_STEP_BYTES = 256 * 1024;
const RING_SIZE = 72;
const RING_STROKE = 4;

/** A download on its way: how many bytes have come, and how many there are when the server said. */
export interface Coming {
  readonly received: number;
  readonly total: number | undefined;
}

export interface VideoState {
  /** The copy while it downloads; nothing once it is here, or before it is asked for. */
  readonly coming: Coming | undefined;
  /** Why it would not come, or would not play. */
  readonly failed: string | undefined;
  /** On the player, and drawn. */
  readonly ready: boolean;
  /** A stream starting, or catching up after a scrub: nothing to say how far, so a spinner. */
  readonly waiting: boolean;
  readonly playing: boolean;
  /** Seconds. */
  readonly time: number;
  readonly duration: number;
  readonly buffered: number;
  readonly muted: boolean;
  /** The original is playing, while the copy that plays everywhere is being made. */
  readonly beingMade: boolean;
  /** The platform's own player is up. */
  readonly system: boolean;
  /** How many times it has played to its end, so the bars can come back when it does. */
  readonly ended: number;
  /**
   * The original would not play here, and the copy that plays everywhere is still being made: an
   * iPhone's HEVC on an Android phone that cannot decode it, or an Android phone's WebM on an iPhone.
   */
  readonly waitingForCopy: boolean;
}

export interface Video {
  readonly state: VideoState;
  /** Nothing until a video has been landed on. */
  readonly player: VideoPlayer | undefined;
  readonly view: RefObject<VideoView | null>;
  /** Play, from the start again if it had finished, or pause. */
  readonly toggle: () => void;
  readonly pause: () => void;
  /** A drag to dismiss took hold (pause) or let go short of the line (as it was). */
  readonly hold: (held: boolean) => void;
  /** A thumb on the scrubber (pause while it moves) or off it (as it was). */
  readonly scrub: (active: boolean) => void;
  readonly seek: (seconds: number) => void;
  readonly mute: () => void;
  /** Where the platform has Picture in Picture. */
  readonly pictureInPicture: (() => void) | undefined;
  /** The view came back from Picture in Picture. */
  readonly unpinned: () => void;
  readonly systemPlayer: () => void;
  readonly leftSystemPlayer: () => void;
  /** Ask again: for the copy, when the original would not play while it was being made. */
  readonly retry: () => void;
  /** A view of it is up: a landing's, from where it was and playing, or a handover's, as it was. */
  readonly start: () => void;
}

let pictureInPictureHere: boolean | undefined;

/**
 * Whether this platform has Picture in Picture. Asked once. On the web target `expo-video`'s module
 * has no such function behind the export, and asking throws, which took the viewer down with it;
 * the iPhone simulator answers no (14 September 2026), so the button is for a phone.
 */
function hasPictureInPicture(): boolean {
  if (pictureInPictureHere === undefined) {
    try {
      pictureInPictureHere = isPictureInPictureSupported();
    } catch {
      pictureInPictureHere = false;
    }
  }
  return pictureInPictureHere;
}

/** Picture in Picture, for a video on the player that plays, where the platform has it. */
function pictureInPictureOf(
  state: VideoState,
  view: RefObject<VideoView | null>,
): (() => void) | undefined {
  if (!state.ready || state.failed !== undefined || !hasPictureInPicture()) return undefined;
  return () => void view.current?.startPictureInPicture();
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/** How far a download has got, in the steps a ring is redrawn at. */
function stepOf({ received, total }: Coming): number {
  return total === undefined || total === 0
    ? Math.floor(received / UNSIZED_STEP_BYTES)
    : Math.floor((received / total) * 100);
}

/**
 * The current video: streamed from a grant where it can be, and otherwise fetched to the phone once,
 * with how much has come while it comes.
 */
function useDownload(attachment: Attachment | undefined, files: FileService) {
  const [source, setSource] = useState<{ readonly id: string; readonly played: Played }>();
  const [coming, setComing] = useState<Coming | undefined>(undefined);
  const [failed, setFailed] = useState<{ readonly id: string; readonly words: string }>();
  const [tries, setTries] = useState(0);
  const latest = useRef(attachment);
  latest.current = attachment;
  /** The video whose copy Try again asks for, since its original would not play. */
  const again = useRef<string | undefined>(undefined);
  /** The video Try again was pressed for: its stream is asked for afresh, not the grant kept. */
  const retried = useRef<string | undefined>(undefined);
  const id = attachment?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: it follows the video by its id; `tries` is how Try again asks once more.
  useEffect(() => {
    const asked = latest.current;
    if (asked === undefined) return;
    let live = true;
    let shown = -1;
    // Closed or paged on, the viewer lets go: a download nobody else wants stops (ADR 0153).
    const letGo = new AbortController();
    const forCopy = again.current === asked.id;
    const fresh = retried.current === asked.id;
    again.current = undefined;
    retried.current = undefined;
    const download = () =>
      files.play(
        asked,
        (received, total) => {
          const now = { received, total };
          if (!live || stepOf(now) === shown) return;
          shown = stepOf(now);
          setComing(now);
        },
        forCopy,
        letGo.signal,
      );
    files
      .streamUrl(asked, fresh)
      .then((streamed) => streamed ?? download())
      .then(
        (played) => {
          if (!live) return;
          setComing(undefined);
          // The same copy again, as a return to a video already fetched gives: the same source, so
          // what is on the player is not taken off and put back.
          setSource((now) =>
            now?.id === asked.id &&
            now.played.uri === played.uri &&
            now.played.beingMade === played.beingMade
              ? now
              : { id: asked.id, played },
          );
        },
        (failure: unknown) => {
          if (!live) return;
          setComing(undefined);
          setFailed({ id: asked.id, words: messageOf(failure) });
        },
      );
    return () => {
      live = false;
      letGo.abort();
      setComing(undefined);
    };
  }, [id, files, tries]);
  return {
    source: source?.id === id ? source : undefined,
    coming: id === undefined ? undefined : coming,
    failed: failed !== undefined && failed.id === id ? failed.words : undefined,
    retry: (forCopy: boolean) => {
      if (forCopy) again.current = id;
      retried.current = id;
      setFailed(undefined);
      setTries((now) => now + 1);
    },
  };
}

/**
 * The viewer's player, made the first time a video is landed on and kept until the viewer goes.
 * Released here, before the effects declared after this one are cleaned up, which is the order
 * `useVideoPlayer` released it in and what `useLanding`'s cleanup guards against.
 */
function usePlayerWhen(wanted: boolean): VideoPlayer | undefined {
  const [player, setPlayer] = useState<VideoPlayer | undefined>(undefined);
  useEffect(() => {
    if (!wanted || player !== undefined) return;
    const made = createVideoPlayer(null);
    made.timeUpdateEventInterval = TIME_EVERY_S;
    made.loop = false;
    setPlayer(made);
  }, [wanted, player]);
  useEffect(() => () => player?.release(), [player]);
  return player;
}

/** What the player says of itself, as it says it; nothing yet, with no player. */
function usePlayerState(player: VideoPlayer | undefined) {
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState({ time: 0, buffered: 0, duration: 0 });
  const [muted, setMuted] = useState(false);
  const [broken, setBroken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(0);
  useEffect(() => {
    if (player === undefined) return;
    // A player says where it is every quarter of a second, on the web even with nothing on it:
    // only a clock that moved redraws the viewer.
    const tick = (time: number, buffered: number) =>
      setClock((now) =>
        now.time === time && now.buffered === buffered && now.duration === player.duration
          ? now
          : { time, buffered, duration: player.duration },
      );
    const heard = [
      player.addListener("playToEnd", () => setEnded((now) => now + 1)),
      player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener("mutedChange", ({ muted: now }) => setMuted(now)),
      player.addListener("timeUpdate", ({ currentTime, bufferedPosition }) =>
        tick(currentTime, bufferedPosition),
      ),
      player.addListener("statusChange", ({ status, error }) => {
        setBroken(status === "error" ? (error?.message ?? "It would not play.") : undefined);
        setLoading(status === "loading");
        if (status === "readyToPlay") tick(player.currentTime, player.bufferedPosition);
      }),
    ];
    return () => {
      for (const each of heard) each.remove();
    };
  }, [player]);
  return { playing, clock, setClock, muted, broken, loading, ended };
}

/**
 * The current video onto the player once it is here, and, once its view is up (`start`), from
 * where it was left, or the start, playing. Paged away from, it pauses and keeps its place. The
 * start waits for the view because the web's player is the `<video>` its view mounts: told to seek
 * and play before there is one, it does neither (the phone's web target, 14 September 2026).
 */
function useLanding(
  player: VideoPlayer | undefined,
  id: string | undefined,
  source: { readonly id: string; readonly played: Played } | undefined,
) {
  const places = useRef(new Map<string, number>());
  const loaded = useRef<string | undefined>(undefined);
  const [readyId, setReadyId] = useState<string | undefined>(undefined);
  const [unloadable, setUnloadable] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (id === undefined || source === undefined || player === undefined) return;
    let live = true;
    const { uri } = source.played;
    const land = async () => {
      if (loaded.current !== uri) {
        await player.replaceAsync({ uri });
        loaded.current = uri;
      }
      if (live) setReadyId(id);
    };
    land().catch((failure: unknown) => {
      if (live) setUnloadable(messageOf(failure));
    });
    return () => {
      live = false;
      try {
        const at = player.currentTime;
        const finished = player.duration > 0 && at >= player.duration - END_SLACK_S;
        places.current.set(id, finished ? 0 : at);
        player.pause();
      } catch {
        // The viewer is going, and `useVideoPlayer` released the player before this ran: there is
        // no place to keep and nothing left to pause (the simulator's red box, 14 September 2026).
      }
      setReadyId(undefined);
      setUnloadable(undefined);
    };
  }, [id, source, player]);
  const ready = id !== undefined && readyId === id;
  const start = () => {
    if (!ready || id === undefined || player === undefined) return;
    player.currentTime = places.current.get(id) ?? 0;
    player.play();
  };
  return { ready, unloadable, start };
}

/**
 * A view taking the player over from another — the stage's from the system player's, or back from
 * Picture in Picture — as the other had it. Playing, it plays on from where it was. Paused, its frame
 * is drawn into the new view, which has none of its own until the player draws one, and a seek
 * draws it; at the very end an Android player has none left to draw, and the stage was black with a
 * play mark until it played (Phase 2's walk), so the last frame is drawn from just before it.
 */
function takeOver(
  player: VideoPlayer,
  had: { readonly time: number; readonly playing: boolean },
): void {
  if (!had.playing) {
    const end = player.duration;
    player.currentTime = end > 0 ? Math.min(had.time, end - LAST_FRAME_S) : had.time;
    return;
  }
  // The web's new <video> starts at nothing; a phone's player never left where it was.
  if (Math.abs(player.currentTime - had.time) > HANDOVER_SLACK_S) player.currentTime = had.time;
  player.play();
}

/** Where the player is, as the viewer draws it: nothing of it until the video is on the player. */
function playerStateOf(
  said: ReturnType<typeof usePlayerState>,
  ready: boolean,
  attachment: Attachment | undefined,
): Pick<VideoState, "playing" | "time" | "duration" | "buffered"> {
  const known = attachment?.durationMs === undefined ? 0 : attachment.durationMs / 1000;
  return {
    playing: ready && said.playing,
    time: ready ? said.clock.time : 0,
    duration: said.clock.duration > 0 && ready ? said.clock.duration : known,
    buffered: ready ? said.clock.buffered : 0,
  };
}

/**
 * Why it would not come or would not play, and whether that is only the original while its copy is
 * still being made, which Try again asks for.
 */
function failureOf(
  download: ReturnType<typeof useDownload>,
  wouldNotPlay: string | undefined,
): Pick<VideoState, "failed" | "beingMade" | "waitingForCopy"> {
  const beingMade = download.source?.played.beingMade ?? false;
  return {
    failed: download.failed ?? wouldNotPlay,
    beingMade,
    waitingForCopy: download.failed === undefined && wouldNotPlay !== undefined && beingMade,
  };
}

/** The viewer's one video player, following the item on the stage. */
export function useVideo(
  attachment: Attachment | undefined,
  files: FileService,
  view: RefObject<VideoView | null>,
): Video {
  const player = usePlayerWhen(attachment !== undefined);
  const download = useDownload(attachment, files);
  const said = usePlayerState(player);
  const landing = useLanding(player, attachment?.id, download.source);
  const { ready, unloadable } = landing;
  const [system, setSystem] = useState(false);
  const resume = useRef(false);
  // The stage's view and the system player's are one player shown in two places, one at a time:
  // what the one had is what the other starts with.
  const handover = useRef<{ readonly time: number; readonly playing: boolean } | undefined>(
    undefined,
  );
  const switchTo = (next: boolean) => {
    if (player === undefined) return;
    handover.current = { time: player.currentTime, playing: player.playing };
    setSystem(next);
  };
  const start = () => {
    const handed = handover.current;
    handover.current = undefined;
    if (handed === undefined || player === undefined) landing.start();
    else takeOver(player, handed);
  };

  const failure = failureOf(download, ready ? (unloadable ?? said.broken) : unloadable);
  const state: VideoState = {
    ...playerStateOf(said, ready, attachment),
    ...failure,
    coming: download.coming,
    ready,
    waiting:
      ready &&
      download.source?.played.streamed === true &&
      said.loading &&
      failure.failed === undefined,
    muted: said.muted,
    system,
    ended: said.ended,
  };
  const set = (seconds: number) => {
    if (player === undefined) return;
    player.currentTime = seconds;
    said.setClock((now) => ({ ...now, time: seconds }));
  };
  const pause = useCallback(() => player?.pause(), [player]);
  const letGo = (active: boolean) => {
    if (player === undefined) return;
    if (active) {
      resume.current = player.playing;
      player.pause();
    } else if (resume.current) {
      resume.current = false;
      player.play();
    }
  };
  return {
    state,
    player,
    view,
    toggle: () => {
      if (!ready || player === undefined) return;
      if (player.playing) {
        player.pause();
        return;
      }
      if (state.duration > 0 && state.time >= state.duration - END_SLACK_S) set(0);
      player.play();
    },
    pause,
    hold: letGo,
    scrub: letGo,
    seek: set,
    mute: () => {
      if (player !== undefined) player.muted = !player.muted;
    },
    pictureInPicture: pictureInPictureOf(state, view),
    // Back from the pinned window the player's view is put back in place, and a paused one needs
    // its frame drawn again. (On Android, `ViewerWindow` keeps the viewer out of the pinned window.)
    unpinned: () => {
      if (ready && player !== undefined && !player.playing) {
        takeOver(player, { time: player.currentTime, playing: false });
      }
    },
    systemPlayer: () => {
      if (ready && !system) switchTo(true);
    },
    leftSystemPlayer: () => {
      if (system) switchTo(false);
    },
    retry: () => download.retry(state.waitingForCopy),
    start,
  };
}

/**
 * What stands on a video on the stage: the player's view once it is on the player, and the ring
 * over the poster while it comes, or the spinner while a stream starts, in the middle, where the
 * transport's play disc gives way to them (`Controls.tsx`). It moves with the picture, since the
 * stage draws it in the clip. A paused video wears no mark of its own: the transport says so, as
 * iOS's own player does.
 */
export function VideoItem({ video }: { readonly video: Video }) {
  const { state } = video;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {state.ready && !state.system ? <PlayerView video={video} /> : null}
      {state.coming === undefined ? null : <Ring coming={state.coming} />}
      {state.waiting && !state.system ? (
        <View style={styles.middle} testID="viewer-waiting">
          <ActivityIndicator size="large" color="#ffffff" accessibilityLabel="Starting the video" />
        </View>
      ) : null}
    </View>
  );
}

/** Once, as a view of the player mounts, the video starts: its view's own effects have run by now. */
function useStartOnMount(video: Video) {
  const latest = useRef(video);
  latest.current = video;
  useEffect(() => latest.current.start(), []);
}

/** The player's view on the stage, with the viewer's controls and none of the platform's. */
function PlayerView({ video }: { readonly video: Video }) {
  useStartOnMount(video);
  if (video.player === undefined) return null;
  return (
    <VideoView
      ref={video.view}
      player={video.player}
      nativeControls={false}
      contentFit="contain"
      allowsPictureInPicture
      onPictureInPictureStop={video.unpinned}
      style={styles.film}
      testID="viewer-video"
    />
  );
}

/**
 * *System player*: the video full screen in a modal of its own, with the platform's controls —
 * AirPlay and captions on a phone, the browser's own on the web — and a Close that hands it back
 * to the stage as it is. The back gesture closes it too.
 */
export function SystemPlayer({ video }: { readonly video: Video }) {
  const insets = useSafeAreaInsets();
  useStartOnMount(video);
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={video.leftSystemPlayer}
      testID="viewer-system-player"
    >
      <View style={styles.system}>
        {video.player === undefined ? null : (
          <VideoView
            ref={video.view}
            player={video.player}
            nativeControls
            contentFit="contain"
            allowsPictureInPicture
            style={styles.film}
            testID="viewer-system-video"
          />
        )}
        {/* At the top's middle: the platform's own controls hold both of its corners. */}
        <View style={[styles.systemTop, { top: insets.top + SPACE.xs }]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the system player"
            onPress={video.leftSystemPlayer}
            style={({ pressed }) => [styles.systemDone, pressed ? styles.systemPressed : null]}
            testID="viewer-system-close"
          >
            <Text style={styles.systemWords} maxFontSizeMultiplier={1.4}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** `40 %` in a ring that fills as the copy comes; a download of no known length says its size. */
function Ring({ coming }: { readonly coming: Coming }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const around = 2 * Math.PI * radius;
  const share =
    coming.total === undefined || coming.total === 0
      ? undefined
      : Math.min(1, coming.received / coming.total);
  const words = share === undefined ? formatBytes(coming.received) : `${Math.floor(share * 100)} %`;
  return (
    <View
      style={styles.middle}
      accessibilityRole="progressbar"
      accessibilityLabel="Fetching the video"
      accessibilityValue={
        share === undefined ? { text: words } : { min: 0, max: 100, now: Math.floor(share * 100) }
      }
      testID="viewer-ring"
    >
      <View style={styles.ring}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={RING_STROKE}
            fill="rgba(0,0,0,0.35)"
          />
          {share === undefined ? null : (
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radius}
              stroke="#ffffff"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${around * share} ${around}`}
              fill="none"
              // From twelve o'clock, going round the way a clock does.
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          )}
        </Svg>
        <Text style={styles.ringWords} maxFontSizeMultiplier={1.2}>
          {words}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The whole of its box, and said in a width and a height as well as the four edges: on the web
  // the view is a `<video>`, which pinned to its edges keeps its own size (a replaced element does
  // not stretch), and a 320-wide clip stood in the corner of a 393-wide stage (14 October 2026).
  film: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  system: { flex: 1, backgroundColor: "#000" },
  systemTop: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  systemDone: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: SPACE.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  systemPressed: { backgroundColor: "rgba(255,255,255,0.2)" },
  systemWords: { color: "#ffffff", fontSize: TEXT.md, fontWeight: "600" },
  middle: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringWords: {
    color: "#ffffff",
    fontSize: TEXT.xs,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
