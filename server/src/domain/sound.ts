/**
 * What the server makes of a voice note (ADR 0054): whether anyone spoke in it, what is kept of
 * what whisper wrote, and how long the tools may take. Pure: the adapter runs the tools, this
 * decides, and the tests need no binary.
 */

import { LONGEST_VOICE_NOTE_MS, MAX_TRANSCRIPT_LENGTH } from "@chipschat/protocol";

/** The rate whisper hears at: mono, sixteen kilohertz, sixteen bits. */
export const SPEECH_SAMPLE_RATE = 16_000;

/** Sound longer than this is kept with its length and no transcript: it is not a voice note. */
export const LONGEST_TRANSCRIPT_MS = LONGEST_VOICE_NOTE_MS;

/** How long ffprobe may take to measure sound, and ffmpeg to turn it into what whisper reads. */
export const HEAR_TIMEOUT_MS = 20_000;

/** Half the note's length, at least half a minute and at most two and a half. */
export function transcribeTimeoutMs(durationMs: number): number {
  return Math.min(Math.max(durationMs / 2, 30_000), 150_000);
}

/** A twentieth of a second, at the speech rate. */
const WINDOW = SPEECH_SAMPLE_RATE / 50;

/** 45 dB below full scale: quieter than anyone talking into a phone, louder than a still room. */
const SPEAKING = 32_768 * 10 ** (-45 / 20);

/** A quarter of a second of it, in windows: less is a cough, a tap, a pocket. */
const ENOUGH_WINDOWS = 13;

/**
 * Whether anyone could have spoken: a quarter of a second, all told, loud enough to be a voice.
 * Whisper given silence writes words anyway — "Thank you." — and a harness would read them as the
 * person's, so silence is never handed to it.
 */
export function hasVoice(samples: Int16Array): boolean {
  let loud = 0;
  for (let start = 0; start + WINDOW <= samples.length; start += WINDOW) {
    let sum = 0;
    for (let index = start; index < start + WINDOW; index += 1) {
      const sample = samples[index] ?? 0;
      sum += sample * sample;
    }
    if (Math.sqrt(sum / WINDOW) >= SPEAKING) loud += 1;
    if (loud >= ENOUGH_WINDOWS) return true;
  }
  return false;
}

/** A segment that is only whisper naming a sound: `[BLANK_AUDIO]`, `(music)`, `*laughs*`. */
const NOT_SPEECH = /^\s*(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*)\s*$/;

/**
 * What was said, from whisper's segments: the ones that name a sound dropped, the rest joined on
 * single spaces. Nothing when no letter or digit is left.
 */
export function transcriptOf(segments: readonly string[]): string | undefined {
  const text = segments
    .filter((segment) => !NOT_SPEECH.test(segment))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return undefined;
  return text.slice(0, MAX_TRANSCRIPT_LENGTH);
}
