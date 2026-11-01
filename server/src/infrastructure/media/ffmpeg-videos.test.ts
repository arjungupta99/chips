/**
 * The real ffmpeg, on videos it makes for itself (ADR 0053). Skipped where ffmpeg is not
 * installed, except on CI, which installs it: there a missing binary fails the file.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processEnvironment } from "@chipschat/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sniffMime } from "../../domain/index.js";
import { makeClip, makeSound } from "../../testing/clips.js";
import { createFfmpegVideos, findMediaTools, type MediaTools } from "./ffmpeg-videos.js";
import { MediaError, runTool } from "./tools.js";

const environment = processEnvironment();
const tools = findMediaTools({ path: environment["PATH"] });
if (tools === undefined && environment["CI"] !== undefined) {
  throw new Error("ffmpeg and ffprobe are installed on CI, and were not found");
}

let directory: string;
const clips: Record<string, Uint8Array> = {};

const HEVC = [
  "-c:v",
  "libx265",
  "-x265-params",
  "log-level=error",
  "-tag:v",
  "hvc1",
  "-c:a",
  "aac",
];

/** Where the clips say they were taken: Westminster, twenty metres up. */
const WHERE = "+51.5007-000.1246+020.000/";

/** What ffprobe says of a kept original: its streams and their rotation, and the file's tags. */
function describeOriginal(found: MediaTools, bytes: Uint8Array) {
  const path = join(directory, "original");
  writeFileSync(path, bytes);
  const probed = JSON.parse(
    execFileSync(found.ffprobe, [
      ...["-v", "error", "-show_entries", "format_tags:stream=codec_type,codec_tag_string"],
      ...["-show_entries", "stream_side_data=rotation", "-of", "json", path],
    ]).toString("utf8"),
  ) as {
    streams: {
      codec_type: string;
      codec_tag_string: string;
      side_data_list?: { rotation?: number }[];
    }[];
    format: { tags?: Record<string, string> };
  };
  return {
    streams: probed.streams.map((stream) => ({
      type: stream.codec_type,
      tag: stream.codec_tag_string,
      rotation: stream.side_data_list?.find((data) => data.rotation !== undefined)?.rotation,
    })),
    tags: Object.keys(probed.format.tags ?? {}),
    // Anywhere in the file, in any box or track ffprobe does not show.
    saysWhere: Buffer.from(bytes).includes("51.5007"),
  };
}

/** What ffprobe says a copy is: its codecs, its size, and whether its index comes first. */
function describeCopy(found: MediaTools, bytes: Uint8Array) {
  const path = join(directory, "copy.mp4");
  writeFileSync(path, bytes);
  const probed = JSON.parse(
    execFileSync(found.ffprobe, [
      ...["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of"],
      ...["json", path],
    ]).toString("utf8"),
  ) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] };
  const text = Buffer.from(bytes).toString("latin1");
  return {
    codecs: probed.streams.map((stream) => `${stream.codec_type}:${stream.codec_name}`),
    size: probed.streams.find((stream) => stream.codec_type === "video"),
    indexFirst: text.indexOf("moov") < text.indexOf("mdat"),
  };
}

describe.skipIf(tools === undefined)("video, with the real ffmpeg (ADR 0053)", () => {
  const found = tools as MediaTools;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "chips-ffmpeg-test-"));
    // An iPhone held upright: HEVC in a QuickTime file, recorded sideways with a rotation.
    clips["sideways.mov"] = makeClip(found.ffmpeg, directory, "sideways.mov", {
      seconds: 3,
      encode: HEVC,
      sideways: true,
    });
    clips["h264.mov"] = makeClip(found.ffmpeg, directory, "h264.mov", {
      seconds: 3,
      encode: ["-c:v", "libx264", "-c:a", "aac", "-f", "mov"],
    });
    clips["h264.mp4"] = makeClip(found.ffmpeg, directory, "h264.mp4", {
      seconds: 3,
      encode: ["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
    });
    // An iPhone held upright, saying where it was taken.
    clips["located.mov"] = makeClip(found.ffmpeg, directory, "located.mov", {
      seconds: 2,
      encode: HEVC,
      sideways: true,
      location: WHERE,
    });
  });
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("measures a sideways HEVC video as it is seen, takes a frame, and says it needs a transcode", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const measured = await videos.measure(clips["sideways.mov"] as Uint8Array, "video/quicktime");
    expect(measured).toMatchObject({
      durationMs: 3000,
      width: 360,
      height: 640,
      playable: "transcode",
    });
    // A JPEG: it starts with the start-of-image marker.
    const poster = measured !== undefined && "poster" in measured ? measured.poster : undefined;
    expect([...(poster ?? []).slice(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it("tells a remux from nothing to do", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    expect(await videos.measure(clips["h264.mov"] as Uint8Array, "video/quicktime")).toMatchObject({
      playable: "remux",
      width: 640,
      height: 360,
    });
    expect(await videos.measure(clips["h264.mp4"] as Uint8Array, "video/mp4")).toMatchObject({
      playable: "as_is",
    });
  });

  it("transcodes to H.264 and AAC in an MP4 with its index first, upright", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const copy = await videos.playable(clips["sideways.mov"] as Uint8Array, "transcode", 3000);
    expect(describeCopy(found, copy)).toEqual({
      codecs: ["video:h264", "audio:aac"],
      size: expect.objectContaining({ width: 360, height: 640 }),
      indexFirst: true,
    });
  });

  it("copies H.264 out of a QuickTime file without encoding it again", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const source = clips["h264.mov"] as Uint8Array;
    const copy = await videos.playable(source, "remux", 3000);
    expect(describeCopy(found, copy)).toMatchObject({
      codecs: ["video:h264", "audio:aac"],
      indexFirst: true,
    });
    // The same pictures, not new ones: a copy is about as big as what it was copied from.
    expect(Math.abs(copy.byteLength - source.byteLength)).toBeLessThan(source.byteLength * 0.1);
  });

  it("drops where a video was taken and keeps how it was held, copying its streams into the same container", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const source = clips["located.mov"] as Uint8Array;
    expect(describeOriginal(found, source)).toMatchObject({
      tags: expect.arrayContaining(["com.apple.quicktime.location.ISO6709", "location"]),
      saysWhere: true,
    });

    const kept = await videos.strip(source, "video/quicktime");
    expect(describeOriginal(found, kept)).toEqual({
      streams: [
        { type: "video", tag: "hvc1", rotation: 90 },
        { type: "audio", tag: "mp4a", rotation: undefined },
      ],
      // The brands are the container's own, not anything written about the video.
      tags: ["major_brand", "minor_version", "compatible_brands"],
      saysWhere: false,
    });
    expect(sniffMime(kept)).toBe("video/quicktime");
    expect(describeCopy(found, kept).indexFirst).toBe(true);
    // Still measured as it is seen, upright.
    expect(await videos.measure(kept, "video/quicktime")).toMatchObject({
      width: 360,
      height: 640,
    });
    // The same pictures, not new ones.
    expect(Math.abs(kept.byteLength - source.byteLength)).toBeLessThan(source.byteLength * 0.05);
  });

  it("writes an MP4 as an MP4 and a WebM as a WebM, and Matroska that WebM cannot hold as Matroska", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const mp4 = makeClip(found.ffmpeg, directory, "located.mp4", {
      seconds: 1,
      encode: ["-c:v", "libx264", "-c:a", "aac"],
      location: WHERE,
    });
    const tagged = ["-metadata", `location=${WHERE}`];
    const webm = makeClip(found.ffmpeg, directory, "located.webm", {
      seconds: 1,
      encode: ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-c:a", "libopus", ...tagged],
    });
    const mkv = makeClip(found.ffmpeg, directory, "located.mkv", {
      seconds: 1,
      encode: ["-c:v", "libx264", "-c:a", "aac", ...tagged],
    });
    const docType = (bytes: Uint8Array) =>
      Buffer.from(bytes.slice(0, 64))
        .toString("latin1")
        .match(/webm|matroska/)?.[0];
    expect([mp4, webm, mkv].map((bytes) => Buffer.from(bytes).includes("51.5007"))).toEqual([
      true,
      true,
      true,
    ]);

    const keptMp4 = await videos.strip(mp4, "video/mp4");
    const keptWebm = await videos.strip(webm, "video/webm");
    const keptMkv = await videos.strip(mkv, "video/webm");
    expect(sniffMime(keptMp4)).toBe("video/mp4");
    expect(describeCopy(found, keptMp4)).toMatchObject({ codecs: ["video:h264", "audio:aac"] });
    expect([docType(keptWebm), docType(keptMkv)]).toEqual(["webm", "matroska"]);
    expect(describeCopy(found, keptMkv).codecs).toEqual(["video:h264", "audio:aac"]);
    for (const kept of [keptMp4, keptWebm, keptMkv]) {
      expect(Buffer.from(kept).includes("51.5007")).toBe(false);
    }
  });

  it("refuses to hand back a copy cut short by the server's ceiling", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 20_000 });
    await expect(
      videos.playable(clips["sideways.mov"] as Uint8Array, "transcode", 3000),
    ).rejects.toThrow(new MediaError("the playable copy would be larger than this server takes"));
  });

  it("says nothing of bytes that are not a video, and fails a copy of them in ffmpeg's words", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const noise = new Uint8Array(4096).fill(7);
    noise.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    expect(await videos.measure(noise, "video/mp4")).toBeUndefined();
    await expect(videos.strip(noise, "video/mp4")).rejects.toThrow(MediaError);
    await expect(videos.strip(noise, "video/x-flv")).rejects.toThrow(
      new MediaError("no container is written for video/x-flv"),
    );
    await expect(videos.playable(noise, "transcode", 1000)).rejects.toThrow(MediaError);
  });

  it("says a video's box that holds sound and no picture is sound (ADR 0054)", async () => {
    const videos = createFfmpegVideos(found, { maxOutputBytes: 50_000_000 });
    const memo = makeSound(found.ffmpeg, directory, "memo.mp4", {
      seconds: 2,
      encode: ["-c:a", "aac", "-f", "mp4"],
    });
    expect(await videos.measure(memo, "video/mp4")).toEqual({ soundOnly: true });
  });

  it("kills a run that outlives its time", async () => {
    const started = Date.now();
    const ran = await runTool(
      found.ffmpeg,
      ["-v", "error", "-f", "lavfi", "-i", "testsrc2", "-f", "null", "-"],
      { cwd: directory, timeoutMs: 300 },
    );
    expect(ran.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("what every run is given", () => {
  it("reads only a file, asks nothing of a terminal, and is given nothing of the server's environment but a PATH", async () => {
    const bench = mkdtempSync(join(tmpdir(), "chips-recording-tool-"));
    try {
      // A tool that writes down how it was started, and fails.
      const tool = join(bench, "tool");
      const record = join(bench, "record");
      writeFileSync(
        tool,
        `#!/bin/sh\nprintf 'ARG %s\\n' "$@" >> '${record}'\nenv | sed 's/^/ENV /' >> '${record}'\nexit 1\n`,
        { mode: 0o755 },
      );
      const videos = createFfmpegVideos(
        { ffmpeg: tool, ffprobe: tool },
        { maxOutputBytes: 1234, path: "/usr/bin:/bin" },
      );
      expect(await videos.measure(new Uint8Array([1, 2, 3]), "video/mp4")).toBeUndefined();
      await expect(videos.strip(new Uint8Array([1, 2, 3]), "video/mp4")).rejects.toThrow(
        MediaError,
      );
      await expect(videos.playable(new Uint8Array([1, 2, 3]), "transcode", 1000)).rejects.toThrow(
        MediaError,
      );
      const lines = readFileSync(record, "utf8").split("\n");
      const args = lines.filter((line) => line.startsWith("ARG ")).map((line) => line.slice(4));
      const env = lines.filter((line) => line.startsWith("ENV ")).map((line) => line.slice(4));
      // Three times: the measure, the original without its metadata, and the copy, each with the
      // whitelist before its input.
      const whitelisted = args.flatMap((arg, i) =>
        arg === "-protocol_whitelist" ? [args[i + 1]] : [],
      );
      expect(whitelisted).toEqual(["file", "file", "file"]);
      expect(args).toContain("-nostdin");
      // Both files ffmpeg writes stop at the ceiling.
      const ceilings = args.flatMap((arg, i) => (arg === "-fs" ? [args[i + 1]] : []));
      expect(ceilings).toEqual(["1234", "1234"]);
      expect(args.slice(args.indexOf("-threads"), args.indexOf("-threads") + 2)).toEqual([
        "-threads",
        "2",
      ]);
      // What `sh` sets for itself, and the PATH it was given: nothing else, from a server whose
      // environment holds its home, its tokens and whatever its launcher put there.
      const names = new Set(env.map((line) => line.slice(0, line.indexOf("="))));
      expect([...names].filter((name) => !["PWD", "SHLVL", "_", "OLDPWD"].includes(name))).toEqual([
        "PATH",
      ]);
      expect(env).toContain("PATH=/usr/bin:/bin");
    } finally {
      rmSync(bench, { recursive: true, force: true });
    }
  });
});

describe("finding the tools", () => {
  it("takes a named tool only when it can be run, and finds nothing where there is nothing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "chips-no-tools-"));
    try {
      expect(
        findMediaTools({ ffmpegPath: join(empty, "ffmpeg"), ffprobePath: join(empty, "ffprobe") }),
      ).toBeUndefined();
      const script = join(empty, "ffmpeg");
      writeFileSync(script, "#!/bin/sh\n", { mode: 0o755 });
      writeFileSync(join(empty, "ffprobe"), "#!/bin/sh\n", { mode: 0o755 });
      expect(findMediaTools({ path: empty })).toEqual({
        ffmpeg: script,
        ffprobe: join(empty, "ffprobe"),
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
