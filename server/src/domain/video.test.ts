import { describe, expect, it } from "vitest";
import {
  displaySize,
  howToPlay,
  LONGEST_TRANSCODE_MS,
  playableTimeoutMs,
  posterAtSeconds,
  stripTimeoutMs,
  type VideoStreams,
} from "./video.js";

const IPHONE: VideoStreams = {
  mime: "video/quicktime",
  videoCodec: "hevc",
  audioCodec: "aac",
  width: 2160,
  height: 3840,
  durationMs: 120_000,
};

describe("what a video needs before it plays everywhere (ADR 0053)", () => {
  it("transcodes an iPhone's HEVC, and anything too big or with sound a browser may not play", () => {
    expect(howToPlay(IPHONE)).toBe("transcode");
    const h264 = { ...IPHONE, videoCodec: "h264", width: 1080, height: 1920 };
    expect(howToPlay({ ...h264, width: 2160, height: 3840 })).toBe("transcode");
    expect(howToPlay({ ...h264, audioCodec: "pcm_s16le" })).toBe("transcode");
    expect(howToPlay({ ...h264, mime: "video/webm", videoCodec: "vp9" })).toBe("transcode");
  });

  it("copies H.264 out of another container, and leaves an MP4 that already plays alone", () => {
    const h264 = { ...IPHONE, videoCodec: "h264", width: 1920, height: 1080 };
    expect(howToPlay(h264)).toBe("remux");
    expect(howToPlay({ ...h264, mime: "video/mp4" })).toBe("as_is");
    expect(howToPlay({ ...h264, mime: "video/mp4", audioCodec: undefined })).toBe("as_is");
  });

  it("keeps a video longer than twenty minutes as it came", () => {
    expect(howToPlay({ ...IPHONE, durationMs: LONGEST_TRANSCODE_MS })).toBe("transcode");
    expect(howToPlay({ ...IPHONE, durationMs: LONGEST_TRANSCODE_MS + 1 })).toBe("too_long");
  });

  it("gives ffmpeg four times the video's length, within a minute and fifteen", () => {
    expect(playableTimeoutMs(3000)).toBe(60_000);
    expect(playableTimeoutMs(120_000)).toBe(480_000);
    expect(playableTimeoutMs(LONGEST_TRANSCODE_MS)).toBe(900_000);
  });

  it("gives a copy with no metadata ten seconds, and a second more for every hundred megabytes", () => {
    expect(stripTimeoutMs(0)).toBe(10_000);
    expect(stripTimeoutMs(38_000_000)).toBe(11_000);
    expect(stripTimeoutMs(104_857_600)).toBe(12_000);
    expect(stripTimeoutMs(2_000_000_000)).toBe(30_000);
  });

  it("takes the poster a second in, or halfway through a shorter clip", () => {
    expect(posterAtSeconds(120_000)).toBe(1);
    expect(posterAtSeconds(1000)).toBe(0.5);
    expect(posterAtSeconds(0)).toBe(0);
  });

  it("turns the size a quarter when the video says it was held the other way", () => {
    expect(displaySize(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(1920, 1080, -90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(displaySize(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
  });
});
