/**
 * The film on the phone's first screen (ADR 0217, its addendum of 26 October): the Chips mark, and
 * Watch Chips work playing in a frame under it, with a segment of the green bar a part. A tap on
 * the film's right goes on a part, on its left back to the part's start and then the part before; a
 * finger held keeps it waiting; a tap on the last part, or Skip, puts That's Chips in its place.
 * Look around makes the made-up workspace there and opens it, with a Demo tag on its name. Have a
 * pairing code? opens the pairing code page, and Back comes back to That's Chips as it was.
 *
 * The video comes from the app itself: no request leaves the page for `/v1` while it plays.
 */

import { expect, type Locator, type Page, test } from "@playwright/test";

/** The film to its last part and Look around after it. */
const FILM_MS = 120_000;

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
  await expect(video).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  return video;
}

/** A tap on the film, a fraction of its width from its left. */
async function tap(page: Page, across: number): Promise<void> {
  const film = page.getByTestId("film-taps").first();
  const box = await film.boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await film.click({ position: { x: box.width * across, y: box.height / 2 } });
}

test("the first screen plays Watch Chips work, a tap moves through it, and Look around keeps the made-up workspace", async ({
  page,
}) => {
  test.setTimeout(FILM_MS);
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/v1")) asked.push(request.url());
  });
  const video = await firstScreen(page);
  await expect(page.getByRole("button", { name: "Scan a QR code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(page.getByTestId("film-chapter-7")).toBeVisible();
  await expect(page.getByTestId("film-chapter-8")).toHaveCount(0);

  // The right: on to Harnesses, at 6.8 s.
  await tap(page, 0.8);
  await expect.poll(() => timeOf(video)).toBeGreaterThan(6.7);
  // The left, a moment into Harnesses: the part before, Your computer, from its start.
  await tap(page, 0.15);
  await expect.poll(() => timeOf(video)).toBeLessThan(2);
  // Into Spaces and well on, then the left: Spaces from its start, at 12.6 s.
  await page.getByTestId("film-chapter-2").click();
  await expect.poll(() => timeOf(video)).toBeGreaterThan(15);
  await tap(page, 0.15);
  await expect.poll(() => timeOf(video)).toBeLessThan(14);

  // A finger held keeps it waiting, and it plays on when it lifts.
  const box = await page.getByTestId("film-taps").first().boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => pausedOf(video)).toBe(true);
  await page.mouse.up();
  await expect.poll(() => pausedOf(video)).toBe(false);

  // The last part, Search, from its segment; a tap on its right is That's Chips.
  await page.getByTestId("film-chapter-7").click();
  await expect.poll(() => timeOf(video)).toBeGreaterThan(63);
  await tap(page, 0.8);
  await expect(page.getByTestId("demo-end")).toBeVisible();
  await expect(page.getByRole("heading", { name: "That's Chips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);

  // Look around: in the made-up workspace, named so.
  await page.getByRole("button", { name: "Look around" }).click();
  await expect(page.getByTestId("workspace-title-tag").first()).toHaveText("Demo", {
    timeout: 20_000,
  });

  expect(asked).toEqual([]);
});

test("Skip puts That's Chips in the film's place, and the pairing code page comes back to it", async ({
  page,
}) => {
  await firstScreen(page);
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: "That's Chips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan a QR code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paste an invite link" })).toBeVisible();

  await page.getByRole("button", { name: "Type a pairing code" }).click();
  await expect(page).toHaveURL(/code=1/);
  await expect(page.getByRole("heading", { name: "Pair this phone" })).toBeVisible();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "That's Chips" })).toBeVisible();
});

test("the full-screen film skips to That's Chips over it, and Leave goes to the first screen", async ({
  page,
}) => {
  await page.goto("/film");
  await expect(page.getByTestId("film-player")).toBeVisible({ timeout: 20_000 });
  const video = page.locator("video");
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByTestId("demo-end")).toBeVisible();
  await expect(page.getByRole("heading", { name: "That's Chips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);

  await page.getByTestId("film-leave").click();
  await expect(page.getByTestId("film-player")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chips", exact: true })).toBeVisible({
    timeout: 20_000,
  });
});
