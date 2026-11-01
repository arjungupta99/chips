/**
 * The phone's first screen, end to end (ADR 0217's addendum of 26 October), against the spec's
 * server and relay: every way in that the first screen and That's Chips offer.
 *
 * Scan a QR code reads a real code: Chromium's camera here is a video file, and the spec draws the
 * QR code of what it wants read into it, a computer's pairing payload or an invite link, before the
 * camera opens. A pairing code pairs the phone once its maker allows it (ADR 0232); an invite closes
 * the camera and opens its join card. Paired from the pairing code page, nothing of the first
 * screen is left under the app. The camera keeps the film waiting, and Close plays it on.
 * Paste on That's Chips takes what was copied: an invite opens its card, anything else says so.
 * A pairing link that did not work lands on the pairing code page, saying why. Watch again plays
 * the film from its start. The demo's Set up my own Chips opens the first screen on That's Chips.
 * The full-screen film moves on a tap, and its end card's Type opens the pairing code page.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postJson } from "@chipschat/core";
import { inviteUrl } from "@chipschat/protocol";
import { expect, type Locator, type Page, test } from "@playwright/test";
import QRCode from "qrcode";
import { allowAsIssuer, pair, payload, SERVER, specDevice, THROUGH, WEB_PORT } from "./support.ts";

/** The camera's picture, as Chromium plays it: a raw video the spec writes before each scan. */
const CAMERA = join(tmpdir(), `chips-e2e-camera-${WEB_PORT}.y4m`);
const WIDTH = 640;
const HEIGHT = 480;

/** `text` as a QR code drawn dark into `luma`, a white frame, in its middle. */
function drawCode(luma: Buffer, text: string): void {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const scale = Math.floor((HEIGHT - 40) / (modules.size + 8));
  const left = Math.floor((WIDTH - modules.size * scale) / 2);
  const top = Math.floor((HEIGHT - modules.size * scale) / 2);
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (!modules.get(row, col)) continue;
      for (let y = 0; y < scale; y += 1) {
        const at = (top + row * scale + y) * WIDTH + left + col * scale;
        luma.fill(16, at, at + scale);
      }
    }
  }
}

/**
 * The camera's picture: `text` as a QR code in the middle of a white frame, as a few frames of
 * YUV4MPEG2, which Chromium's fake camera loops. With no text, the frame is white: a camera
 * pointed at nothing yet.
 */
function filmCamera(text?: string): void {
  const luma = Buffer.alloc(WIDTH * HEIGHT, 235);
  if (text !== undefined) drawCode(luma, text);
  const chroma = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(CAMERA, Buffer.concat([header, frame, frame, frame, frame]));
}
// Chromium opens the camera's file as it starts, so there is one before the browser is launched.
filmCamera();

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${CAMERA}`,
    ],
  },
  permissions: ["camera", "clipboard-read", "clipboard-write"],
});

/** Where the video stands, and whether it is paused, as the page's own player says. */
const timeOf = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.currentTime);
const pausedOf = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.paused);

/** The first screen, its film playing. */
async function firstScreen(page: Page): Promise<Locator> {
  await page.goto("/pair");
  await expect(page.getByRole("heading", { name: "Chips", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const video = page.getByTestId("welcome-film").locator("video");
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  return video;
}

/** That's Chips, from Skip. */
async function thatsChips(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Skip" }).click();
  const end = page.getByTestId("demo-end");
  await expect(end.getByRole("heading", { name: "That's Chips" })).toBeVisible();
  return end;
}

/** A member invite of the spec's owner's making, as a link to this phone's server. */
async function inviteLink(): Promise<string> {
  const owner = await specDevice();
  const made = await postJson<{ token: string }>(owner, "/v1/invites", { role: "member" });
  return inviteUrl(THROUGH, made.token);
}

/** A tap on the film, a fraction of its width from its left. */
async function tap(page: Page, across: number): Promise<void> {
  const film = page.getByTestId("film-taps").first();
  const box = await film.boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await film.click({ position: { x: box.width * across, y: box.height / 2 } });
}

test("Scan a QR code reads a computer's pairing code from the camera and pairs the phone", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const offer = await payload(SERVER);
  filmCamera(offer);
  const video = await firstScreen(page);
  await page.getByTestId("welcome-scan").click();
  await expect(page.getByTestId("scan-sheet")).toBeVisible();
  await expect.poll(() => pausedOf(video)).toBe(true);
  // The code asks, since it went out with the relay: six digits, and its maker allows it.
  await allowAsIssuer(page);
  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });
});

test("Scan on That's Chips reads an invite, closes the camera and opens the invite's card", async ({
  page,
}) => {
  filmCamera(await inviteLink());
  await firstScreen(page);
  const end = await thatsChips(page);
  await end.getByTestId("demo-scan").click();
  await expect(page.getByTestId("join-card")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/join/);
  await expect(page.getByTestId("scan-sheet")).toHaveCount(0);
  await expect(page.getByTestId("join-role")).toContainText(/member/i);
});

test("the camera keeps the film waiting, Close plays it on, and Type a pairing code instead opens the code page", async ({
  page,
}) => {
  filmCamera();
  const video = await firstScreen(page);
  await page.getByTestId("welcome-scan").click();
  const sheet = page.getByTestId("scan-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Point the camera at the code.")).toBeVisible();
  await expect(
    sheet.getByText("You → Devices → Pair another device", { exact: false }),
  ).toBeVisible();
  await expect.poll(() => pausedOf(video)).toBe(true);
  await page.getByTestId("scan-close").click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => pausedOf(video)).toBe(false);

  await page.getByTestId("welcome-scan").click();
  await page.getByTestId("scan-type").click();
  await expect(page).toHaveURL(/code=1/);
  await expect(page.getByRole("heading", { name: "Pair this phone" })).toBeVisible();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Server address")).toBeVisible();
});

test("paired from the pairing code page, the phone keeps nothing of the first screen under the app", async ({
  page,
}) => {
  // Skip, Type, a typed code: the code page stood over the first screen, and both go.
  await pair(page);
  await expect(page.getByTestId("welcome-film")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByTestId("demo-end")).toHaveCount(0);
});

test("Paste on That's Chips says what it can't use, and opens a copied invite's card", async ({
  page,
}) => {
  const link = await inviteLink();
  await firstScreen(page);
  const end = await thatsChips(page);
  const paste = end.getByRole("button", { name: "Paste an invite link" });

  await page.evaluate(() => navigator.clipboard.writeText("see you at 7"));
  await paste.click();
  await expect(page.getByTestId("paste-problem")).toBeVisible();

  await page.evaluate((text) => navigator.clipboard.writeText(text), link);
  await paste.click();
  await expect(page.getByTestId("join-card")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/join/);
});

test("a pairing link that did not work lands on the pairing code page, saying why", async ({
  page,
}) => {
  const link = new URLSearchParams({ pair: "ZZZ-999", lan: THROUGH, v: "1" });
  await page.goto(`/#${link.toString()}`);
  await expect(page.getByRole("heading", { name: "Pair this phone" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/problem=/);
  await expect(page.getByTestId("pair-failure")).toBeVisible();
  // Back, with nothing under it: the first screen.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Chips", exact: true })).toBeVisible();
});

test("Watch again plays the film from its start, with Skip at its foot again", async ({ page }) => {
  const video = await firstScreen(page);
  await tap(page, 0.8);
  await tap(page, 0.8);
  const end = await thatsChips(page);
  await end.getByRole("button", { name: "Watch again" }).click();
  await expect(page.getByTestId("demo-end")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect.poll(() => pausedOf(video)).toBe(false);
  expect(await timeOf(video)).toBeLessThan(5);
  // On the first part, a tap on the left is that part's start: there is none before it.
  await tap(page, 0.15);
  await expect.poll(() => timeOf(video)).toBeLessThan(1.5);
});

test("the demo's Set up my own Chips opens the first screen on That's Chips", async ({ page }) => {
  await firstScreen(page);
  const end = await thatsChips(page);
  await end.getByRole("button", { name: "Look around" }).click();
  await expect(page.getByTestId("workspace-title-tag").first()).toHaveText("Demo", {
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByTestId("pair-computer").click();
  await page.getByTestId("not-in-demo-set-up").click();
  await expect(page).toHaveURL(/ways=1/);
  await expect(
    page.getByTestId("demo-end").getByRole("heading", { name: "That's Chips" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
});

test("the full-screen film moves on a tap, and its end card's Type opens the pairing code page", async ({
  page,
}) => {
  await page.goto("/film");
  await expect(page.getByTestId("film-player")).toBeVisible({ timeout: 20_000 });
  const video = page.locator("video");
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  await tap(page, 0.8);
  await expect.poll(() => timeOf(video)).toBeGreaterThan(6.7);
  await tap(page, 0.15);
  await expect.poll(() => timeOf(video)).toBeLessThan(2);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByTestId("demo-type").click();
  await expect(page).toHaveURL(/code=1/);
  await expect(page.getByRole("heading", { name: "Pair this phone" })).toBeVisible();
});
