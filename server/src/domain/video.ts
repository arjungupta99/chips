/**
 * What a video needs before it plays everywhere (ADR 0053), and how long ffmpeg may take over
 * it. Pure: the adapter measures, this decides, and the tests need no binary.
 */

/** What ffprobe found, with the type the server sniffed from the bytes. */
export interface VideoStreams {
  /** Sniffed from the bytes: `video/mp4`, `video/quicktime`, `video/webm`. */
  readonly mime: string;
  readonly videoCodec: string;
  /** Nothing when the video has no sound. */
  readonly audioCodec: string | undefined;
  /** As displayed, its rotation applied. */
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
}

/**
 * Nothing to do; the same streams copied into an MP4; a new encoding; or longer than the server
 * will spend a transcode on, and kept as it came.
 */
export type Playable = "as_is" | "remux" | "transcode" | "too_long";

/** The longer side of a playable copy, in pixels. */
export const PLAYABLE_EDGE = 1920;

/** A video longer than this is not transcoded. */
export const LONGEST_TRANSCODE_MS = 20 * 60 * 1000;

/** How long ffprobe may take to measure a video, and ffmpeg to take one frame of it. */
export const MEASURE_TIMEOUT_MS = 10_000;
export const POSTER_TIMEOUT_MS = 15_000;

/**
 * How long ffmpeg may take to copy a video's streams into a file with no metadata: ten seconds,
 * and one more for every hundred megabytes. Nothing is encoded, so the time is the disk's; this
 * Mac copies 75 MB in a fifth of a second.
 */
export function stripTimeoutMs(byteSize: number): number {
  return 10_000 + Math.ceil(byteSize / 100_000_000) * 1000;
}

/** H.264 with AAC, or no sound, at most this big, is what every browser and phone plays. */
export function howToPlay(video: VideoStreams): Playable {
  if (video.durationMs > LONGEST_TRANSCODE_MS) return "too_long";
  const everywhere =
    video.videoCodec === "h264" &&
    (video.audioCodec === undefined || video.audioCodec === "aac") &&
    Math.max(video.width, video.height) <= PLAYABLE_EDGE;
  if (!everywhere) return "transcode";
  return video.mime === "video/mp4" ? "as_is" : "remux";
}

/** Four times the video's length, at least a minute and at most fifteen. */
export function playableTimeoutMs(durationMs: number): number {
  return Math.min(Math.max(durationMs * 4, 60_000), 15 * 60_000);
}

/** Where the poster is taken: a second in, or halfway through a shorter clip. */
export function posterAtSeconds(durationMs: number): number {
  return Math.min(1, durationMs / 2000);
}

/** The size a viewer sees: a phone held upright records sideways and says so with a rotation. */
export function displaySize(
  width: number,
  height: number,
  rotation: number,
): { readonly width: number; readonly height: number } {
  const quarterTurns = Math.round(Math.abs(rotation) / 90) % 2;
  return quarterTurns === 1 ? { width: height, height: width } : { width, height };
}
