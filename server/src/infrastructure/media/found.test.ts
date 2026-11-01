import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@chipschat/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mediaFound } from "./found.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-media-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A program that runs, at `bin/<name>`. */
function tool(name: string): string {
  mkdirSync(join(dir, "bin"), { recursive: true });
  const path = join(dir, "bin", name);
  writeFileSync(path, "#!/bin/sh\n");
  chmodSync(path, 0o755);
  return path;
}

describe("what this machine has for video and voice notes", () => {
  it("finds the tools and a model in the workspace's models folder, as the server does", () => {
    for (const name of ["ffmpeg", "ffprobe", "whisper-cli"]) tool(name);
    const data = join(dir, "data");
    mkdirSync(join(data, "models"), { recursive: true });
    writeFileSync(join(data, "models", "ggml-base.bin"), "");
    const config = { ...defaultConfig(), data: { dir: data, databaseUrl: "sqlite::memory:" } };
    expect(mediaFound(config, join(dir, "bin"))).toEqual({
      video: { ffmpeg: join(dir, "bin", "ffmpeg"), ffprobe: join(dir, "bin", "ffprobe") },
      voice: { cli: join(dir, "bin", "whisper-cli"), model: join(data, "models", "ggml-base.bin") },
      models: join(data, "models"),
    });
  });

  it("finds nothing named that isn't there", () => {
    const base = defaultConfig();
    const config = {
      ...base,
      data: { dir, databaseUrl: "sqlite::memory:" },
      media: {
        ...base.media,
        ffmpegPath: join(dir, "none", "ffmpeg"),
        ffprobePath: join(dir, "none", "ffprobe"),
        whisperPath: join(dir, "none", "whisper-cli"),
      },
    };
    const found = mediaFound(config, join(dir, "bin"));
    expect(found.video).toBeUndefined();
    expect(found.voice).toBeUndefined();
  });
});
