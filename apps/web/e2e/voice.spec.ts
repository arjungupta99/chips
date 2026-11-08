/**
 * A voice note recorded in the browser (ADR 0055), end to end: the microphone in the composer,
 * the browser's own `MediaRecorder`, the upload the server hears before it answers (ADR 0054), the
 * room's card playing the sound in place, and the harness hearing its sound and its words together.
 *
 * The microphone is the one thing stood in for. Chromium's own fake device waits on macOS's
 * microphone permission, which a test has no business granting, so `getUserMedia` is answered
 * with a Web Audio stream instead. On a Mac it plays a sentence the Mac says; anywhere else, a
 * tone. Where the server has whisper and a model (`CHIPS_WHISPER_MODEL`, handed to `chipsd` by the
 * config), the words are checked too. The page is `127.0.0.1`, which a browser counts as secure.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { demo, Harness, newRunId, pair, SERVER } from "./support.ts";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

/** The sentence, as a sixteen-kilohertz WAV in base64, or nothing where there is no voice. */
function spoken(): string | undefined {
  if (!existsSync("/usr/bin/say")) return undefined;
  const directory = mkdtempSync(join(tmpdir(), "chips-web-voice-e2e-"));
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
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a voice note recorded in the browser reaches the harness as its sound and its words", async ({
  page,
}) => {
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
    // The microphone is in the composer's +, as the iPad's is (ADR 0284).
    await page.getByRole("button", { name: "Add to the message" }).click();
    await page.getByRole("menuitem", { name: "Voice note" }).click();
    const recorder = page.getByTestId("voice-recorder");
    await expect(recorder.getByTestId("voice-line")).toHaveText(/^Recording/, { timeout: 10_000 });
    // Long enough for the sentence, which starts as the recording does.
    await expect(recorder.getByTestId("voice-elapsed")).toHaveText("0:04", { timeout: 15_000 });
    await recorder.getByRole("button", { name: "Stop and add" }).click();
    await expect(recorder).toHaveCount(0);

    const chips = page.getByRole("list", { name: "Attachments" });
    await expect(chips).toContainText(/voice-note-\d{4}-\d{4}\.webm/, { timeout: 10_000 });
    await expect(chips).not.toContainText("uploading", { timeout: 60_000 });
    // In, the chip says how long the note runs, as the server measured it.
    await expect(chips).toContainText(/0:0\d$/);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    const heard = await harness.next("message.new");
    const [note] = heard["attachments"] as {
      url: string;
      mime_type: string;
      duration_ms?: number;
      transcript?: string;
    }[];
    expect(note?.mime_type).toBe("audio/webm");
    // The sentence's length: the stand-in microphone sends silence once the sentence is over.
    expect(note?.duration_ms).toBeGreaterThan(2000);
    const sound = await fetch(note?.url ?? "", {
      headers: { authorization: `Bearer ${demo().harness.token}` },
    });
    expect(sound.status).toBe(200);
    expect(sound.headers.get("content-type")).toBe("audio/webm");

    // The room's card plays it in place, from the bytes the device fetched.
    const card = page.getByTestId("voice-card").last();
    await expect(card).toContainText("Voice note", { timeout: 30_000 });
    await card.getByRole("button", { name: "Play Voice note" }).click();
    const player = card.getByTestId("voice-player");
    await expect(player).toHaveAttribute("src", /^blob:/);
    await expect
      .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect(card.getByRole("alert")).toHaveCount(0);

    if (said !== undefined && process.env["CHIPS_WHISPER_MODEL"] !== undefined) {
      expect(note?.transcript).toMatch(/receipt/i);
      await expect(card.getByTestId("voice-transcript")).toContainText(/receipt/i);
    }
  } finally {
    harness.close();
  }
});

/**
 * The page as `chipsd` serves it carries a content policy (`routes/web.ts`), and the dev server's
 * does not. A room plays a voice note or a video, and previews a PDF, from a `blob:` address it
 * made of the bytes it fetched. A policy that does not name that address refuses it: with no
 * `media-src`, `default-src 'self'` did, and `object-src 'none'` did. The test above passed against
 * the dev server while the page Arjun used could play nothing (13 September 2026). So this plays
 * sound, and shows a PDF, from `blob:` addresses on the served page.
 */
test("the page chipsd serves lets a room play sound and show a PDF from the addresses it makes", async ({
  page,
}) => {
  const served = await page.goto(`${SERVER}/`);
  expect(served?.headers()["content-security-policy"]).toContain("default-src 'self'");
  const shown = await page.evaluate(async () => {
    const refused: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      refused.push(`${event.effectiveDirective} ${event.blockedURI}`),
    );
    // A tenth of a second of a tone, as the plainest WAV there is.
    const rate = 8000;
    const samples = rate / 10;
    const wav = new DataView(new ArrayBuffer(44 + samples));
    const text = (at: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) wav.setUint8(at + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    wav.setUint32(4, 36 + samples, true);
    text(8, "WAVEfmt ");
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, 1, true);
    wav.setUint32(24, rate, true);
    wav.setUint32(28, rate, true);
    wav.setUint16(32, 1, true);
    wav.setUint16(34, 8, true);
    text(36, "data");
    wav.setUint32(40, samples, true);
    for (let i = 0; i < samples; i += 1) wav.setUint8(44 + i, 128 + Math.round(60 * Math.sin(i)));
    const audio = new Audio();
    const sound = new Promise<string>((resolve) => {
      audio.addEventListener("loadedmetadata", () => resolve("loaded"));
      audio.addEventListener("error", () => resolve("error"));
      setTimeout(() => resolve("nothing"), 5000);
    });
    audio.src = URL.createObjectURL(new Blob([wav.buffer], { type: "audio/wav" }));

    const pdf = new Blob(["%PDF-1.1\n%%EOF\n"], { type: "application/pdf" });
    const preview = document.createElement("object");
    preview.type = "application/pdf";
    preview.data = URL.createObjectURL(pdf);
    document.body.append(preview);
    // A refusal is reported as the element tries to load; a second is plenty.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    preview.remove();
    return { sound: await sound, refused };
  });
  expect(shown).toEqual({ sound: "loaded", refused: [] });
});
