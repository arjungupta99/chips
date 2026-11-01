/**
 * A voice note, end to end on the web target (ADR 0054): recorded on the attach sheet by
 * `expo-audio`'s web recorder, uploaded, heard by the server before the upload answers, shown in
 * the room, and heard by the harness as its sound and its words together — the acceptance M4.4
 * names, *a voice note reaches the agent with audio and text*.
 *
 * The microphone is the one thing stood in for. Chromium's own fake device waits on macOS's
 * microphone permission, which a test has no business granting, so `getUserMedia` is answered
 * with a Web Audio stream instead. On a Mac it plays a sentence the Mac says; anywhere else, a
 * tone. The `MediaRecorder` that records it, and everything after, is real. Where the server has
 * whisper and a model (`CHIPS_WHISPER_MODEL`, handed to `chipsd` by the config), the words are
 * checked too.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { demo, Harness, newRunId, pair } from "./support.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

/** The sentence, as a sixteen-kilohertz WAV in base64, or nothing where there is no voice. */
function spoken(): string | undefined {
  if (!existsSync("/usr/bin/say")) return undefined;
  const directory = mkdtempSync(join(tmpdir(), "chips-voice-e2e-"));
  try {
    const aiff = join(directory, "said.aiff");
    const wav = join(directory, "said.wav");
    execFileSync("/usr/bin/say", ["-o", aiff, "Scout, add the receipt to the March expenses."]);
    execFileSync("ffmpeg", [
      ...["-hide_banner", "-v", "error", "-i", aiff, "-ar", "16000", "-ac", "1"],
      ...["-c:a", "pcm_s16le", "-y", wav],
    ]);
    return readFileSync(wav).toString("base64");
  } catch {
    return undefined;
  }
}

test("a voice note reaches the harness as its sound and its words", async ({ page }) => {
  test.setTimeout(120_000);
  const said = spoken();
  await page.addInitScript((wav) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const microphone = context.createMediaStreamDestination();
      if (wav === undefined) {
        const tone = context.createOscillator();
        tone.frequency.value = 330;
        tone.connect(microphone);
        tone.start();
      } else {
        const bytes = Uint8Array.from(atob(wav), (letter) => letter.charCodeAt(0));
        const voice = context.createBufferSource();
        voice.buffer = await context.decodeAudioData(bytes.buffer);
        voice.connect(microphone);
        voice.start();
      }
      return microphone.stream;
    };
  }, said);

  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await page.getByRole("tab", { name: "Spaces" }).click();
    await page
      .getByText(/PO-4471/)
      .first()
      .click();
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Attach" }).click();
    await page.getByRole("button", { name: "Voice note" }).click();
    await expect(page.getByTestId("voice-line")).toContainText("Tap to record");
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByTestId("voice-line")).toContainText("Recording", { timeout: 10_000 });
    // Long enough for the sentence, which starts as the recording does.
    await expect(page.getByTestId("voice-elapsed")).toHaveText("0:04", { timeout: 15_000 });
    await page.getByRole("button", { name: "Stop and add" }).click();

    const staged = page.getByTestId("staged");
    await expect(staged).toContainText(/voice-note-\d{4}-\d{4}\.webm/, { timeout: 10_000 });
    await expect(staged).not.toContainText("uploading", { timeout: 60_000 });
    await page.getByRole("button", { name: "Send", exact: true }).click();

    const heard = await harness.next("message.new");
    const [note] = heard["attachments"] as {
      url: string;
      mime_type: string;
      duration_ms?: number;
      transcript?: string;
    }[];
    expect(note?.mime_type).toBe("audio/webm");
    // The sentence's length: the stand-in microphone sends nothing once the sentence is over.
    expect(note?.duration_ms).toBeGreaterThan(2000);
    const sound = await fetch(note?.url ?? "", {
      headers: { authorization: `Bearer ${demo().harness.token}` },
    });
    expect(sound.status).toBe(200);
    expect(sound.headers.get("content-type")).toBe("audio/webm");

    const card = page.locator('[data-testid^="voice-att_"]').last();
    await expect(card).toContainText("Voice note", { timeout: 30_000 });
    if (said !== undefined && process.env["CHIPS_WHISPER_MODEL"] !== undefined) {
      expect(note?.transcript).toMatch(/receipt/i);
      await expect(card).toContainText(/receipt/i);
    }
  } finally {
    harness.close();
  }
});
