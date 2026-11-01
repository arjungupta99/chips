/**
 * Sound (ADR 0054), with the real ffmpeg and a whisper that writes down how it was run, and with the
 * real whisper where it and a model are installed. The ffmpeg half runs on CI, which installs
 * ffmpeg: there a missing binary fails the file. The real whisper is skipped anywhere without it.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { processEnvironment } from "@chipschat/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSound, makeSpeech } from "../../testing/clips.js";
import { findMediaTools, type MediaTools } from "./ffmpeg-videos.js";
import { createWhisperSounds, findWhisper } from "./whisper-sounds.js";

const environment = processEnvironment();
const tools = findMediaTools({ path: environment["PATH"] });
if (tools === undefined && environment["CI"] !== undefined) {
  throw new Error("ffmpeg and ffprobe are installed on CI, and were not found");
}

/** The whisper the server here would use: named, or the best model in this checkout's data. */
const realWhisper = findWhisper({
  modelPath: environment["CHIPS_WHISPER_MODEL"],
  modelsDirectory: fileURLToPath(new URL("../../../../.chips/models", import.meta.url)),
  path: environment["PATH"],
});

let bench: string;
const sounds: Record<string, Uint8Array> = {};

/**
 * A whisper that writes down its arguments, its environment and the WAV it was handed, notices a
 * second of itself running at once, and writes `said` as its transcript — or fails with `fails`.
 */
function fakeWhisper(
  directory: string,
  options: {
    readonly said?: readonly string[];
    readonly fails?: string;
    readonly seconds?: number;
  },
) {
  const tool = join(directory, "whisper-cli");
  const record = join(directory, "record");
  const json = JSON.stringify({
    result: { language: "en" },
    transcription: (options.said ?? []).map((text) => ({ text })),
  });
  const ending =
    options.fails === undefined
      ? `cat > transcript.json <<'JSON'\n${json}\nJSON\n`
      : `echo '${options.fails}' >&2\nexit 1\n`;
  writeFileSync(
    tool,
    [
      "#!/bin/sh",
      `mkdir '${directory}/running' 2>/dev/null || echo OVERLAP >> '${record}'`,
      `printf 'ARG %s\\n' "$@" >> '${record}'`,
      `env | sed 's/^/ENV /' >> '${record}'`,
      `cp speech.wav '${directory}/given.wav'`,
      `sleep ${options.seconds ?? 0}`,
      `rmdir '${directory}/running'`,
      ending,
    ].join("\n"),
    { mode: 0o755 },
  );
  const lines = () => {
    try {
      return readFileSync(record, "utf8").split("\n");
    } catch {
      return [];
    }
  };
  return {
    tool,
    args: () =>
      lines()
        .filter((line) => line.startsWith("ARG "))
        .map((line) => line.slice(4)),
    env: () =>
      lines()
        .filter((line) => line.startsWith("ENV "))
        .map((line) => line.slice(4)),
    runs: () => lines().filter((line) => line === "ARG -m").length,
    overlapped: () => lines().includes("OVERLAP"),
    given: () => readFileSync(join(directory, "given.wav")),
  };
}

function inBench<T>(work: (directory: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(bench, "whisper-"));
  return work(directory);
}

describe.skipIf(tools === undefined)("sound, with the real ffmpeg (ADR 0054)", () => {
  const found = tools as MediaTools;

  beforeAll(() => {
    bench = mkdtempSync(join(tmpdir(), "chips-sound-test-"));
    // A phone's voice memo: AAC in an M4A. Anyone speaking is a tone as loud as a voice.
    sounds["tone.m4a"] = makeSound(found.ffmpeg, bench, "tone.m4a", {
      seconds: 3,
      encode: ["-c:a", "aac", "-f", "ipod"],
    });
    sounds["silence.m4a"] = makeSound(found.ffmpeg, bench, "silence.m4a", {
      seconds: 4,
      silent: true,
      encode: ["-c:a", "aac", "-f", "ipod"],
    });
    // A browser's: Opus in a WebM.
    sounds["tone.webm"] = makeSound(found.ffmpeg, bench, "tone.webm", {
      seconds: 2,
      encode: ["-c:a", "libopus", "-f", "webm"],
    });
  });
  afterAll(() => {
    rmSync(bench, { recursive: true, force: true });
  });

  it("measures a voice note and hands whisper speech it decoded itself, with nothing of the server's environment", async () => {
    await inBench(async (directory) => {
      const whisper = fakeWhisper(directory, { said: [" Book the train.", "[BLANK_AUDIO]"] });
      const heard = await createWhisperSounds(found, {
        whisper: { cli: whisper.tool, model: "/models/ggml-large-v3-turbo-q5_0.bin" },
        path: "/usr/bin:/bin",
      }).hear(sounds["tone.m4a"] as Uint8Array);

      expect(heard?.transcript).toBe("Book the train.");
      expect(heard?.durationMs).toBeGreaterThan(2900);
      expect(heard?.durationMs).toBeLessThan(3200);
      expect(whisper.args()).toEqual([
        ...["-m", "/models/ggml-large-v3-turbo-q5_0.bin", "-f", "speech.wav", "-l", "auto"],
        ...["-oj", "-of", "transcript", "-np", "-t", "4"],
      ]);
      const names = new Set(whisper.env().map((line) => line.slice(0, line.indexOf("="))));
      expect([...names].filter((name) => !["PWD", "SHLVL", "_", "OLDPWD"].includes(name))).toEqual([
        "PATH",
      ]);
      // The WAV this adapter wrote: PCM, one channel, sixteen kilohertz, sixteen bits.
      const wav = whisper.given();
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
      expect([wav.readUInt16LE(20), wav.readUInt16LE(22), wav.readUInt32LE(24)]).toEqual([
        1, 1, 16_000,
      ]);
      expect(wav.readUInt16LE(34)).toBe(16);
      expect(Math.abs(wav.readUInt32LE(40) - 3 * 32_000)).toBeLessThan(3200);
    });
  });

  it("tells an English-only model the language, and hears a browser's WebM", async () => {
    await inBench(async (directory) => {
      const whisper = fakeWhisper(directory, { said: [" Hello."] });
      const heard = await createWhisperSounds(found, {
        whisper: { cli: whisper.tool, model: "/models/ggml-base.en.bin" },
      }).hear(sounds["tone.webm"] as Uint8Array);
      expect(heard?.transcript).toBe("Hello.");
      expect(heard?.durationMs).toBeGreaterThan(1900);
      expect(whisper.args().slice(4, 6)).toEqual(["-l", "en"]);
    });
  });

  it("never hands whisper a note nobody spoke in", async () => {
    await inBench(async (directory) => {
      const whisper = fakeWhisper(directory, { said: [" Thank you."] });
      const heard = await createWhisperSounds(found, {
        whisper: { cli: whisper.tool, model: "/models/ggml-small.bin" },
      }).hear(sounds["silence.m4a"] as Uint8Array);
      expect(heard).toMatchObject({ note: "nobody spoke" });
      expect(heard?.transcript).toBeUndefined();
      expect(heard?.durationMs).toBeGreaterThan(3900);
      expect(whisper.runs()).toBe(0);
    });
  });

  it("keeps sound longer than a voice note with its length, and hands whisper none of it", async () => {
    await inBench(async (directory) => {
      const whisper = fakeWhisper(directory, { said: [" Hello."] });
      const long = makeSound(found.ffmpeg, directory, "long.m4a", {
        seconds: 301,
        encode: ["-c:a", "aac", "-b:a", "16k", "-f", "ipod"],
      });
      const heard = await createWhisperSounds(found, {
        whisper: { cli: whisper.tool, model: "/models/ggml-small.bin" },
      }).hear(long);
      expect(heard).toMatchObject({ note: "longer than a voice note" });
      expect(heard?.durationMs).toBeGreaterThan(300_000);
      expect(whisper.runs()).toBe(0);
    });
  });

  it("says why a whisper that failed wrote nothing, and keeps the note's length", async () => {
    await inBench(async (directory) => {
      const whisper = fakeWhisper(directory, { fails: "model is corrupt" });
      const heard = await createWhisperSounds(found, {
        whisper: { cli: whisper.tool, model: "/models/ggml-small.bin" },
      }).hear(sounds["tone.m4a"] as Uint8Array);
      expect(heard).toMatchObject({ note: "model is corrupt" });
      expect(heard?.transcript).toBeUndefined();
      expect(heard?.durationMs).toBeGreaterThan(2900);
    });
  });

  it("runs one whisper at a time", async () => {
    await inBench(async (directory) => {
      const whisper = fakeWhisper(directory, { said: [" Hello."], seconds: 0.3 });
      const heard = createWhisperSounds(found, {
        whisper: { cli: whisper.tool, model: "/models/ggml-small.bin" },
      });
      const both = await Promise.all([
        heard.hear(sounds["tone.m4a"] as Uint8Array),
        heard.hear(sounds["tone.webm"] as Uint8Array),
      ]);
      expect(both.map((each) => each?.transcript)).toEqual(["Hello.", "Hello."]);
      expect(whisper.runs()).toBe(2);
      expect(whisper.overlapped()).toBe(false);
    });
  });

  it("measures sound where nothing transcribes, and is nothing for bytes that are not sound", async () => {
    const measuring = createWhisperSounds(found, {});
    expect(await measuring.hear(sounds["tone.m4a"] as Uint8Array)).toMatchObject({
      note: "no whisper here",
    });
    const noise = new Uint8Array(4096).map((_, index) => (index * 7919) % 251);
    expect(await measuring.hear(noise)).toBeUndefined();
  });
});

describe.skipIf(tools === undefined || realWhisper === undefined)(
  "a voice note, with the real whisper",
  () => {
    it("writes down what was said", async () => {
      const found = tools as MediaTools;
      const directory = mkdtempSync(join(tmpdir(), "chips-real-whisper-"));
      try {
        const speech = makeSpeech(
          found.ffmpeg,
          directory,
          "receipt.m4a",
          "The receipt from the hardware store was forty two dollars.",
          ["-c:a", "aac", "-f", "ipod"],
        );
        if (speech === undefined) return;
        const heard = await createWhisperSounds(found, { whisper: realWhisper }).hear(speech);
        expect(heard?.transcript).toMatch(/receipt/i);
        expect(heard?.transcript).toMatch(/42/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }, 60_000);
  },
);

describe("finding whisper", () => {
  it("takes the best model it knows in the models directory, and nothing without a model", () => {
    const empty = mkdtempSync(join(tmpdir(), "chips-no-whisper-"));
    try {
      const cli = join(empty, "whisper-cli");
      writeFileSync(cli, "#!/bin/sh\n", { mode: 0o755 });
      expect(findWhisper({ path: empty, modelsDirectory: empty })).toBeUndefined();
      writeFileSync(join(empty, "ggml-base.en.bin"), "");
      writeFileSync(join(empty, "ggml-small.bin"), "");
      expect(findWhisper({ path: empty, modelsDirectory: empty })).toEqual({
        cli,
        model: join(empty, "ggml-small.bin"),
      });
      expect(
        findWhisper({ path: empty, modelPath: join(empty, "ggml-medium.bin") }),
      ).toBeUndefined();
      expect(
        findWhisper({ whisperPath: join(empty, "nothing"), modelsDirectory: empty }),
      ).toBeUndefined();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("names the model and the tool absolutely, since whisper runs in a directory of its own", () => {
    const empty = mkdtempSync(join(tmpdir(), "chips-relative-whisper-"));
    try {
      const cli = join(empty, "whisper-cli");
      writeFileSync(cli, "#!/bin/sh\n", { mode: 0o755 });
      writeFileSync(join(empty, "ggml-large-v3-turbo-q5_0.bin"), "");
      // As the server's default data directory, `./.chips`, names them: relative to where it started.
      const here = relative(process.cwd(), empty);
      expect(isAbsolute(here)).toBe(false);
      const expected = { cli, model: join(empty, "ggml-large-v3-turbo-q5_0.bin") };
      expect(findWhisper({ path: here, modelsDirectory: here })).toEqual(expected);
      expect(
        findWhisper({
          whisperPath: join(here, "whisper-cli"),
          modelPath: join(here, "ggml-large-v3-turbo-q5_0.bin"),
        }),
      ).toEqual(expected);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
