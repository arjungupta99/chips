import { describe, expect, it } from "vitest";
import {
  hasVoice,
  LONGEST_TRANSCRIPT_MS,
  SPEECH_SAMPLE_RATE,
  transcribeTimeoutMs,
  transcriptOf,
} from "./sound.js";

/** A tone at a level in dB below full scale, for a length, at the speech rate. */
function tone(dbfs: number, seconds: number): Int16Array {
  const amplitude = 32_767 * 10 ** (dbfs / 20);
  const samples = new Int16Array(Math.round(seconds * SPEECH_SAMPLE_RATE));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(
      amplitude * Math.sin((2 * Math.PI * 220 * index) / SPEECH_SAMPLE_RATE),
    );
  }
  return samples;
}

function joined(...parts: Int16Array[]): Int16Array {
  const all = new Int16Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

describe("whether anyone spoke in a voice note (ADR 0054)", () => {
  it("hears a voice at a phone's level, and not silence or a still room", () => {
    expect(hasVoice(tone(-12, 2))).toBe(true);
    expect(hasVoice(new Int16Array(SPEECH_SAMPLE_RATE * 8))).toBe(false);
    expect(hasVoice(tone(-60, 8))).toBe(false);
  });

  it("wants a quarter of a second of it, so a tap in a pocket is not a word", () => {
    expect(hasVoice(joined(tone(-60, 3), tone(-10, 0.1), tone(-60, 3)))).toBe(false);
    expect(hasVoice(joined(tone(-60, 3), tone(-20, 0.3), tone(-60, 3)))).toBe(true);
    expect(hasVoice(new Int16Array(0))).toBe(false);
  });
});

describe("what is kept of what whisper wrote", () => {
  it("joins the segments on single spaces", () => {
    expect(transcriptOf([" Book the train.", "  Then the hotel.\n"])).toBe(
      "Book the train. Then the hotel.",
    );
  });

  it("drops a segment that only names a sound, and keeps words that mention one", () => {
    expect(transcriptOf(["[BLANK_AUDIO]", " Hello Scout.", " (music)", " *laughs*"])).toBe(
      "Hello Scout.",
    );
    expect(transcriptOf([" Play the (quiet) one."])).toBe("Play the (quiet) one.");
  });

  it("is nothing when no word is left", () => {
    expect(transcriptOf([" ."])).toBeUndefined();
    expect(transcriptOf(["[BLANK_AUDIO]"])).toBeUndefined();
    expect(transcriptOf([])).toBeUndefined();
  });

  it("keeps a word in any script", () => {
    expect(transcriptOf([" नमस्ते स्काउट"])).toBe("नमस्ते स्काउट");
    expect(transcriptOf([" 42"])).toBe("42");
  });
});

describe("how long the tools may take", () => {
  it("gives whisper half the note's length, within half a minute and two and a half", () => {
    expect(transcribeTimeoutMs(10_000)).toBe(30_000);
    expect(transcribeTimeoutMs(120_000)).toBe(60_000);
    expect(transcribeTimeoutMs(LONGEST_TRANSCRIPT_MS)).toBe(150_000);
  });
});
