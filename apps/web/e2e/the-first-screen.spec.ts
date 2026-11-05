/**
 * The first screen on the web and in the Mac app, end to end (ADR 0217's addendum of 26 October),
 * against the spec's server: every way in that the first screen and That's Chips offer.
 *
 * Paste an invite link at the film's foot takes this server's invite to its card, and says what it
 * can't use. That's Chips' I have an invite opens the field under it, and points another server's
 * invite at its own. → and ← move the film as the clicks do, and a field's arrows stay the field's.
 * Watch again plays the film from its start and folds the ways in away. With less motion a click
 * still moves the film, with no flash. A film that cannot load says so, and Skip still reaches
 * That's Chips. Not in the demo's Set up my own Chips opens That's Chips with the ways in, with the
 * way back to the demo; the switcher's film's I have an invite opens it with the invite field.
 */

import { readFileSync } from "node:fs";
import {
  chaptersOf,
  type Device,
  type DeviceStorage,
  type FilmVideo,
  pairDevice,
  postJson,
  videoOf,
} from "@chipschat/core";
import { inviteUrl } from "@chipschat/protocol";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { freshCode, SERVER, WEB } from "./support.ts";

/** The films as `pnpm film` listed them, as the page's own build has them. */
const RENDERED = JSON.parse(
  readFileSync(new URL("../../../assets/film/films.json", import.meta.url), "utf8"),
) as { readonly films: readonly FilmVideo[] };
const WATCH = videoOf(RENDERED.films, "watch");
if (WATCH === undefined) throw new Error("Watch Chips work has no video");
const PARTS = chaptersOf(WATCH);
const start = (part: number) => PARTS[part]?.start ?? Number.NaN;

/** Where the video stands, as the page's own element says. */
const timeOf = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.currentTime);

/** The first screen, its film playing. */
async function firstScreen(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Chips" })).toBeVisible();
  const video = page.getByTestId("welcome-film").getByTestId("film-video");
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  return video;
}

/** That's Chips, from Skip. */
async function thatsChips(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Skip" }).click();
  const end = page.getByTestId("demo-end");
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's Chips");
  return end;
}

/** A click on the film, a fraction of its width from its left. */
async function clickAcross(page: Page, across: number): Promise<void> {
  const taps = page.getByTestId("film-taps");
  const box = await taps.boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await taps.click({ position: { x: box.width * across, y: box.height / 2 } });
}

/** A member invite of an owner's device's making, as a link to this page's server. */
async function inviteLink(): Promise<string> {
  const held = new Map<string, unknown>();
  const storage: DeviceStorage = {
    entries: async () => [...held.entries()],
    put: async (key, value) => void held.set(key, value),
    remove: async (key) => void held.delete(key),
  };
  const owner: Device = await pairDevice(await freshCode(), "A spec", SERVER, undefined, storage);
  const made = await postJson<{ token: string }>(owner, "/v1/invites", { role: "member" });
  return inviteUrl(WEB, made.token);
}

/** Look around from That's Chips: the demo, in front, its name at the rail's top. */
async function lookAround(page: Page): Promise<Locator> {
  const end = await thatsChips(page);
  await end.getByRole("button", { name: "Look around" }).click();
  const switcher = page.getByTestId("workspace-switcher");
  await expect(page.getByTestId("workspace-name")).toHaveText("Chips demo", { timeout: 20_000 });
  return switcher;
}

test("Paste an invite link at the film's foot says what it can't use, and takes this server's invite to its card", async ({
  page,
}) => {
  const link = await inviteLink();
  await firstScreen(page);
  await page.getByRole("button", { name: "Paste an invite link" }).click();
  const field = page.getByLabel("Invite link");
  await expect(field).toBeFocused();
  await field.fill("see you at 7");
  await expect(page.getByRole("status")).toContainText("isn't an invite link");
  await field.fill(link);
  await expect(page.getByTestId("join")).toBeVisible({ timeout: 20_000 });
});

test("That's Chips' I have an invite opens the field under it, and points another server's invite at its own", async ({
  page,
}) => {
  await firstScreen(page);
  const end = await thatsChips(page);
  const invite = end.getByRole("button", { name: "I have an invite" });
  await invite.click();
  await expect(invite).toHaveAttribute("aria-expanded", "true");
  const elsewhere = inviteUrl("https://chips.example.org", "chips_inv_far");
  await end.getByLabel("Invite link").fill(elsewhere);
  await expect(end.getByRole("status")).toContainText("chips.example.org");
  await expect(end.getByTestId("welcome-invite-open")).toHaveAttribute("href", elsewhere);
  await invite.click();
  await expect(end.getByLabel("Invite link")).toHaveCount(0);
});

test("→ and ← move the film as the clicks do, each side lit, and a field's arrows stay the field's", async ({
  page,
}) => {
  const video = await firstScreen(page);
  await page.getByTestId("film-seg").nth(2).click();
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(start(2));
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(start(3));
  await expect(page.getByTestId("film-flash-right-next")).toBeAttached();
  // Only just begun: the part before.
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => timeOf(video)).toBeLessThan(start(3));
  await expect(page.getByTestId("film-flash-left-previous")).toBeAttached();

  await page.getByRole("button", { name: "Paste an invite link" }).click();
  await expect(page.getByLabel("Invite link")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await timeOf(video)).toBeLessThan(start(3));
});

test("Watch again plays the film from its start, with the ways in folded away", async ({
  page,
}) => {
  const video = await firstScreen(page);
  const end = await thatsChips(page);
  await end.getByRole("button", { name: "Set up my own Chips" }).click();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();
  await end.getByRole("button", { name: "Watch again" }).click();
  await expect(page.getByTestId("demo-end")).toHaveCount(0);
  await expect(page.getByLabel("Pairing code", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  expect(await timeOf(video)).toBeLessThan(5);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
});

test("with less motion a click still moves the film, with no flash and a still mark", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const video = await firstScreen(page);
  await expect(page.locator(".welcome-brand .ui-mark")).not.toHaveAttribute(
    "data-state",
    "working",
  );
  await clickAcross(page, 0.8);
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(start(1));
  await expect(page.locator(".film-flash")).toHaveCount(0);
});

test("a film that cannot load says so, and Skip still reaches That's Chips", async ({ page }) => {
  await page.route("**/*.mp4", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText("The film did not load.", { timeout: 20_000 });
  const end = await thatsChips(page);
  await expect(end.getByRole("button", { name: "Set up my own Chips" })).toBeVisible();
});

test("Not in the demo's Set up my own Chips opens That's Chips with the ways in, and Back returns to the demo", async ({
  page,
}) => {
  await firstScreen(page);
  await lookAround(page);
  await page.getByTestId("you").first().click();
  await page.getByTestId("devices").getByTestId("not-in-demo-set-up").click();
  const end = page.getByTestId("demo-end");
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's Chips");
  await expect(end.getByRole("button", { name: "Set up my own Chips" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();
  await page.getByTestId("pair-cancel").click();
  await expect(page.getByTestId("workspace-name")).toHaveText("Chips demo");
});

test("the switcher's film's I have an invite opens the first screen on That's Chips, the field open", async ({
  page,
}) => {
  await firstScreen(page);
  const switcher = await lookAround(page);
  await switcher.click();
  await page.getByRole("menu", { name: "Workspaces" }).getByTestId("workspace-watch-demo").click();
  const player = page.getByTestId("film-player");
  await expect(player).toBeVisible();
  await player.getByRole("button", { name: "Skip" }).click();
  await player.getByRole("button", { name: "I have an invite" }).click();
  await expect(player).toHaveCount(0);
  const end = page.getByTestId("demo-end");
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's Chips");
  await expect(end.getByLabel("Invite link")).toBeVisible();
  await expect(page.getByTestId("pair-cancel")).toBeVisible();
});
