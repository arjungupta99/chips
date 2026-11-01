/**
 * Video, with `ffprobe` and `ffmpeg` (ADR 0053), each run under the limits in `tools.ts`: a child
 * with no shell and nothing of the server's environment, in a private directory, reaching no
 * protocol but `file`, killed when its time is up, and writing no more than the server's
 * attachment ceiling. ffmpeg writes a file in three ways: the original without its metadata, and
 * the copy that plays everywhere, by copying the streams or by encoding them again.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MeasuredVideo, SoundOnly, Videos } from "../../application/ports/attachments.js";
import {
  displaySize,
  howToPlay,
  MEASURE_TIMEOUT_MS,
  PLAYABLE_EDGE,
  POSTER_TIMEOUT_MS,
  playableTimeoutMs,
  posterAtSeconds,
  stripTimeoutMs,
} from "../../domain/index.js";
import {
  findTool,
  inScratch,
  MediaError,
  type Ran,
  readOnlyFile,
  runTool,
  succeeded,
} from "./tools.js";

export interface MediaTools {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

/**
 * The tools, where they were named, else on `PATH`, else where Homebrew puts them. Nothing when
 * either cannot be found: a video is then kept as it came. Once, as the server starts.
 */
export function findMediaTools(options: {
  readonly ffmpegPath?: string | undefined;
  readonly ffprobePath?: string | undefined;
  readonly path?: string | undefined;
}): MediaTools | undefined {
  const ffmpeg = findTool("ffmpeg", { named: options.ffmpegPath, path: options.path });
  const ffprobe = findTool("ffprobe", { named: options.ffprobePath, path: options.path });
  return ffmpeg === undefined || ffprobe === undefined ? undefined : { ffmpeg, ffprobe };
}

interface ProbedStream {
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly side_data_list?: readonly { readonly rotation?: number }[];
  readonly disposition?: { readonly attached_pic?: number };
}

interface Probed {
  readonly streams?: readonly ProbedStream[];
  readonly format?: { readonly duration?: string };
}

/** A picture that moves: not the cover art a song or a voice memo can carry as a "video" stream. */
const moving = (stream: ProbedStream) =>
  stream.codec_type === "video" && stream.disposition?.attached_pic !== 1;

/**
 * What ffprobe's JSON says about the first video stream and the first sound, if any; or that there
 * is sound and no picture, which is a voice note in a video's box (ADR 0054).
 */
function streamsOf(stdout: Buffer, mime: string) {
  let probed: Probed;
  try {
    probed = JSON.parse(stdout.toString("utf8")) as Probed;
  } catch {
    return undefined;
  }
  const video = probed.streams?.find(moving);
  const audio = probed.streams?.find((stream) => stream.codec_type === "audio");
  if (video === undefined && audio !== undefined) return { soundOnly: true } as const;
  if (video?.codec_name === undefined || video.width === undefined || video.height === undefined) {
    return undefined;
  }
  const rotation = video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation;
  const seconds = Number(probed.format?.duration);
  return {
    mime,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name,
    ...displaySize(video.width, video.height, rotation ?? 0),
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0,
  };
}

/** Fit the longer side within the playable edge, never enlarged, both sides even for H.264. */
const FIT = `scale=w='if(gte(iw,ih),trunc(min(${PLAYABLE_EDGE},iw)/2)*2,-2)':h='if(gte(iw,ih),-2,trunc(min(${PLAYABLE_EDGE},ih)/2)*2)'`;

/**
 * Every file ffmpeg makes drops the metadata, a phone's recorded location with it, and the
 * chapters, and keeps one picture and one sound: no track of timed metadata, where a camera can
 * write where it was frame by frame, and no subtitles. The rotation is not metadata to ffmpeg, and
 * stays.
 */
const STREAMS = ["-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1"];

const REMUX = [...STREAMS, "-c", "copy"];

/** The original without its metadata: its streams copied, and nothing of ffmpeg's own written. */
const STRIP = [...REMUX, "-fflags", "+bitexact"];

/**
 * The container a kept original is written in, by the type sniffed from it, with each muxer tried
 * in turn. An MP4 or a QuickTime file gets its index at the front. A WebM stays one, and Matroska
 * holding what WebM does not allow is refused by that muxer and written as Matroska.
 */
const CONTAINERS: Readonly<Record<string, readonly (readonly string[])[]>> = {
  "video/mp4": [["-movflags", "+faststart", "-f", "mp4"]],
  "video/quicktime": [["-movflags", "+faststart", "-f", "mov"]],
  "video/webm": [
    ["-f", "webm"],
    ["-f", "matroska"],
  ],
};

const TRANSCODE = [
  ...STREAMS,
  "-vf",
  FIT,
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-profile:v",
  "high",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-threads",
  "2",
];

/** The file a run made, or why there is none: out of time, failed, or cut short at the ceiling. */
async function copyMade(
  ran: Ran,
  path: string,
  limits: { readonly what: string; readonly timeoutMs: number; readonly maxOutputBytes: number },
) {
  if (ran.timedOut) {
    throw new MediaError(`ffmpeg took longer than ${Math.round(limits.timeoutMs / 1000)} s`);
  }
  if (ran.code !== 0) throw new MediaError(ran.stderr || `ffmpeg exited with ${ran.code}`);
  const out = await readFile(path);
  // `-fs` stops the writing, not the run: a copy that reached the limit is cut short.
  if (out.byteLength >= limits.maxOutputBytes) {
    throw new MediaError(`${limits.what} would be larger than this server takes`);
  }
  return new Uint8Array(out);
}

export function createFfmpegVideos(
  tools: MediaTools,
  options: {
    readonly maxOutputBytes: number;
    /** The `PATH` a run is given, and nothing else of the server's environment. */
    readonly path?: string | undefined;
  },
): Videos {
  const run = (tool: string, args: readonly string[], cwd: string, timeoutMs: number) =>
    runTool(tool, args, { cwd, timeoutMs, path: options.path });

  async function poster(
    directory: string,
    input: string,
    durationMs: number,
  ): Promise<Uint8Array | undefined> {
    const args = [
      ...readOnlyFile(input, ["-ss", String(posterAtSeconds(durationMs))]),
      "-frames:v",
      "1",
      "-threads",
      "2",
      "-c:v",
      "mjpeg",
      "-q:v",
      "3",
      "-f",
      "image2",
      "-y",
      "poster.jpg",
    ];
    const ran = await run(tools.ffmpeg, args, directory, POSTER_TIMEOUT_MS).catch(() => undefined);
    if (!succeeded(ran)) return undefined;
    const bytes = await readFile(join(directory, "poster.jpg")).catch(() => undefined);
    return bytes === undefined || bytes.byteLength === 0 ? undefined : new Uint8Array(bytes);
  }

  /** One container's try at the original without its metadata: the file, or why there is none. */
  async function stripInto(
    directory: string,
    input: string,
    container: readonly string[],
    timeoutMs: number,
  ) {
    const args = [
      ...readOnlyFile(input),
      ...STRIP,
      "-fs",
      String(options.maxOutputBytes),
      ...container,
      "-y",
      "stripped",
    ];
    const ran = await run(tools.ffmpeg, args, directory, timeoutMs);
    return copyMade(ran, join(directory, "stripped"), {
      what: "the video without its metadata",
      timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
    });
  }

  /** What ffprobe reads of the file, or nothing when it cannot in time. */
  async function probe(directory: string, input: string, mime: string) {
    const args = [
      "-hide_banner",
      "-v",
      "error",
      "-protocol_whitelist",
      "file",
      "-show_entries",
      "stream=codec_type,codec_name,width,height:stream_side_data=rotation:stream_disposition=attached_pic:format=duration",
      "-of",
      "json",
      input,
    ];
    const ran = await run(tools.ffprobe, args, directory, MEASURE_TIMEOUT_MS).catch(
      () => undefined,
    );
    if (!succeeded(ran)) return undefined;
    return streamsOf(ran.stdout, mime);
  }

  return {
    async measure(bytes, mime): Promise<MeasuredVideo | SoundOnly | undefined> {
      return inScratch(bytes, async (directory, input) => {
        const streams = await probe(directory, input, mime);
        if (streams === undefined) return undefined;
        if (streams.soundOnly === true) return { soundOnly: true };
        return {
          durationMs: streams.durationMs,
          width: streams.width,
          height: streams.height,
          playable: howToPlay(streams),
          poster: await poster(directory, input, streams.durationMs),
        };
      });
    },

    async strip(bytes, mime) {
      const containers = CONTAINERS[mime];
      if (containers === undefined) throw new MediaError(`no container is written for ${mime}`);
      return inScratch(bytes, async (directory, input) => {
        const timeoutMs = stripTimeoutMs(bytes.byteLength);
        let failure: unknown;
        for (const container of containers) {
          try {
            return await stripInto(directory, input, container, timeoutMs);
          } catch (error) {
            failure = error;
          }
        }
        throw failure;
      });
    },

    async playable(bytes, how, durationMs) {
      return inScratch(bytes, async (directory, input) => {
        const args = [
          ...readOnlyFile(input),
          ...(how === "remux" ? REMUX : TRANSCODE),
          "-fs",
          String(options.maxOutputBytes),
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
          "-y",
          "playable.mp4",
        ];
        const timeoutMs = playableTimeoutMs(durationMs);
        const ran = await run(tools.ffmpeg, args, directory, timeoutMs);
        return copyMade(ran, join(directory, "playable.mp4"), {
          what: "the playable copy",
          timeoutMs,
          maxOutputBytes: options.maxOutputBytes,
        });
      });
    },
  };
}
