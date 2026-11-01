/**
 * Sound, heard (ADR 0054): `ffprobe` measures it, `ffmpeg` turns it into sixteen-kilohertz speech,
 * and `whisper-cli` writes down what was said. Each is a run under the limits in `tools.ts`. Whisper
 * never reads the file somebody sent: it reads a WAV this adapter wrote around samples ffmpeg
 * decoded, so the one parser that meets the untrusted bytes is the one already under the video
 * rules. One whisper runs at a time, since two on one GPU each take as long as both.
 */

import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { HeardSound, Sounds } from "../../application/ports/attachments.js";
import {
  HEAR_TIMEOUT_MS,
  hasVoice,
  LONGEST_TRANSCRIPT_MS,
  SPEECH_SAMPLE_RATE,
  transcribeTimeoutMs,
  transcriptOf,
} from "../../domain/index.js";
import type { MediaTools } from "./ffmpeg-videos.js";
import { findTool, inScratch, type Ran, readOnlyFile, runTool, succeeded } from "./tools.js";

export interface Whisper {
  readonly cli: string;
  readonly model: string;
}

/** The models looked for in the models directory, best first. Any other is named outright. */
const MODELS = [
  "ggml-large-v3-turbo-q5_0.bin",
  "ggml-large-v3-turbo-q8_0.bin",
  "ggml-large-v3-turbo.bin",
  "ggml-large-v3.bin",
  "ggml-medium.bin",
  "ggml-small.bin",
  "ggml-base.bin",
  "ggml-base.en.bin",
  "ggml-tiny.bin",
  "ggml-tiny.en.bin",
];

/**
 * Whisper and a model for it: the ones named, else `whisper-cli` where a tool is looked for and the
 * best known model in the server's models directory. Nothing when either is missing, and a voice
 * note is then kept with its length and no transcript. Once, as the server starts.
 */
export function findWhisper(options: {
  readonly whisperPath?: string | undefined;
  readonly modelPath?: string | undefined;
  readonly modelsDirectory?: string | undefined;
  readonly path?: string | undefined;
}): Whisper | undefined {
  const cli = findTool("whisper-cli", { named: options.whisperPath, path: options.path });
  const model =
    options.modelPath === undefined
      ? modelIn(options.modelsDirectory)
      : existsSync(options.modelPath)
        ? options.modelPath
        : undefined;
  // Absolute, because whisper starts in a private directory: the data directory's default,
  // `./.chips`, named a model there that whisper could not open (13 September 2026).
  return cli === undefined || model === undefined ? undefined : { cli, model: resolve(model) };
}

function modelIn(directory: string | undefined): string | undefined {
  if (directory === undefined) return undefined;
  let present: readonly string[];
  try {
    present = readdirSync(directory);
  } catch {
    return undefined;
  }
  const name = MODELS.find((model) => present.includes(model));
  return name === undefined ? undefined : join(directory, name);
}

/** What whisper writes with `-oj`, as far as it is read here: what was said, a segment at a time. */
interface Written {
  readonly transcription?: readonly { readonly text?: string }[];
}

/** No more PCM than a voice note and a second over it: sixteen bits, one channel. */
const MOST_SPEECH_BYTES = ((LONGEST_TRANSCRIPT_MS + 1000) / 1000) * SPEECH_SAMPLE_RATE * 2;

export function createWhisperSounds(
  tools: MediaTools,
  options: {
    /** Absent, sound is measured and not transcribed. */
    readonly whisper?: Whisper | undefined;
    /** The `PATH` a run is given, and nothing else of the server's environment. */
    readonly path?: string | undefined;
  },
): Sounds {
  const run = (tool: string, args: readonly string[], cwd: string, timeoutMs: number) =>
    runTool(tool, args, { cwd, timeoutMs, path: options.path }).catch(() => undefined);

  /** Its length, when there is sound in it at all; `null` when its box does not say how long. */
  async function measure(directory: string, input: string): Promise<number | null | undefined> {
    const args = [
      "-hide_banner",
      "-v",
      "error",
      "-protocol_whitelist",
      "file",
      "-show_entries",
      "stream=codec_type:format=duration",
      "-of",
      "json",
      input,
    ];
    const ran = await run(tools.ffprobe, args, directory, HEAR_TIMEOUT_MS);
    if (!succeeded(ran)) return undefined;
    let probed: { streams?: { codec_type?: string }[]; format?: { duration?: string } };
    try {
      probed = JSON.parse(ran.stdout.toString("utf8")) as typeof probed;
    } catch {
      return undefined;
    }
    if (!probed.streams?.some((stream) => stream.codec_type === "audio")) return undefined;
    const seconds = Number(probed.format?.duration);
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  }

  /** The first sound as mono sixteen-kilohertz samples, no longer than a voice note and a second. */
  async function decode(directory: string, input: string): Promise<Int16Array | undefined> {
    const args = [
      ...readOnlyFile(input),
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(SPEECH_SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      "-t",
      String((LONGEST_TRANSCRIPT_MS + 1000) / 1000),
      "-fs",
      String(MOST_SPEECH_BYTES),
      "-threads",
      "2",
      "-f",
      "s16le",
      "-y",
      "speech.pcm",
    ];
    const ran = await run(tools.ffmpeg, args, directory, HEAR_TIMEOUT_MS);
    if (!succeeded(ran)) return undefined;
    const pcm = await readFile(join(directory, "speech.pcm")).catch(() => undefined);
    if (pcm === undefined) return undefined;
    // Copied so the samples start on a boundary of their own; little-endian, as every Mac is.
    return new Int16Array(new Uint8Array(pcm).buffer, 0, Math.floor(pcm.byteLength / 2));
  }

  async function transcribe(
    whisper: Whisper,
    directory: string,
    samples: Int16Array,
    durationMs: number,
  ): Promise<Pick<HeardSound, "transcript" | "note">> {
    await writeFile(join(directory, "speech.wav"), wav(samples), { mode: 0o600 });
    const timeoutMs = transcribeTimeoutMs(durationMs);
    const args = [
      "-m",
      whisper.model,
      "-f",
      "speech.wav",
      // An English-only model is told so; any other listens for the language.
      "-l",
      basename(whisper.model).includes(".en.") ? "en" : "auto",
      "-oj",
      "-of",
      "transcript",
      "-np",
      "-t",
      "4",
    ];
    const ran = await run(whisper.cli, args, directory, timeoutMs);
    const failed = whyNot(ran, timeoutMs);
    return failed === undefined ? written(directory) : { note: failed };
  }

  let turn: Promise<unknown> = Promise.resolve();
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const next = turn.then(work, work);
    turn = next.catch(() => undefined);
    return next;
  }

  /** What was said, when whisper is here, the note is short enough to be one, and somebody spoke. */
  async function words(
    directory: string,
    samples: Int16Array,
    durationMs: number,
  ): Promise<Pick<HeardSound, "transcript" | "note">> {
    const whisper = options.whisper;
    if (whisper === undefined) return { note: "no whisper here" };
    if (durationMs > LONGEST_TRANSCRIPT_MS) return { note: TOO_LONG };
    if (!hasVoice(samples)) return { note: "nobody spoke" };
    return inTurn(() => transcribe(whisper, directory, samples, durationMs));
  }

  /** Measured, decoded, and heard, in that order, each stopping at what it could not do. */
  async function listen(directory: string, input: string): Promise<HeardSound | undefined> {
    const measured = await measure(directory, input);
    if (measured === undefined) return undefined;
    if (measured !== null && measured > LONGEST_TRANSCRIPT_MS) {
      return { durationMs: measured, note: TOO_LONG };
    }
    const samples = await decode(directory, input);
    if (samples === undefined) {
      return measured === null ? undefined : { durationMs: measured, note: "not decoded" };
    }
    const durationMs = measured ?? Math.round((samples.length / SPEECH_SAMPLE_RATE) * 1000);
    return { durationMs, ...(await words(directory, samples, durationMs)) };
  }

  return {
    hear: (bytes) => inScratch(bytes, listen),
  };
}

const TOO_LONG = "longer than a voice note";

/** Why a whisper run wrote nothing to read, or nothing when it finished and said it succeeded. */
function whyNot(ran: Ran | undefined, timeoutMs: number): string | undefined {
  if (ran === undefined) return "whisper did not start";
  if (ran.timedOut) return `whisper took longer than ${Math.round(timeoutMs / 1000)} s`;
  if (ran.code !== 0) return ran.stderr || `whisper exited with ${ran.code}`;
  return undefined;
}

/** What whisper wrote down, from the JSON it left in the run's directory. */
async function written(directory: string): Promise<Pick<HeardSound, "transcript" | "note">> {
  const text = await readFile(join(directory, "transcript.json"), "utf8").catch(() => "");
  let parsed: Written;
  try {
    parsed = JSON.parse(text) as Written;
  } catch {
    return { note: "whisper wrote nothing that could be read" };
  }
  const transcript = transcriptOf((parsed.transcription ?? []).map((part) => part.text ?? ""));
  return transcript === undefined ? { note: "whisper heard no words" } : { transcript };
}

/** Samples as a WAV: the plainest header there is, around nothing but what ffmpeg decoded. */
function wav(samples: Int16Array): Uint8Array {
  const data = new Uint8Array(samples.buffer, samples.byteOffset, samples.length * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.byteLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // one channel
  header.writeUInt32LE(SPEECH_SAMPLE_RATE, 24);
  header.writeUInt32LE(SPEECH_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([header, data]);
}
