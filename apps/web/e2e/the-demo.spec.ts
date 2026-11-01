/**
 * ADR 0213 and ADR 0217 (FV3; its addendum of 26 October): a newcomer watches Chips work before
 * setting anything up.
 *
 * The unpaired page is the first screen: the Chips mark, and Watch Chips work playing under it, a
 * video fetched whole and played from memory, with the green bar along its top, a segment a part.
 * A click on its right goes on a part and on its left back, → the same, a press held keeps it
 * waiting, and a segment goes to its part. That's Chips takes the film's place at its end and
 * offers Look around, which makes the demo and keeps it in the switcher as Chips demo across a
 * reload; Remove takes it away again, leaving nothing in IndexedDB. Skip goes to That's Chips at
 * once, and its Set up my own Chips opens the ways in. The switcher plays the film full screen over
 * the demo, where Skip ends it and Escape leaves.
 *
 * And the whole of it with nothing leaving the page but the page's own files: every request is
 * recorded, and none goes to `/v1`, to a socket, or anywhere but the page's origin. Against the
 * production build, as a newcomer gets it, whose page opens no development socket of its own.
 */

import { readFileSync } from "node:fs";
import { chaptersOf, DEMO_DEVICE_ID, type FilmVideo, videoOf } from "@chipschat/core";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { BUILD } from "./support.ts";

test.use({ baseURL: BUILD });

/** The films as `pnpm film` listed them, as the page's own build has them. */
const RENDERED = JSON.parse(
  readFileSync(new URL("../../../assets/film/films.json", import.meta.url), "utf8"),
) as { readonly films: readonly FilmVideo[] };
const VIDEO = videoOf(RENDERED.films, "watch");
if (VIDEO === undefined) throw new Error("Watch Chips work has no video");
const LAST_PART = chaptersOf(VIDEO).at(-1);
if (LAST_PART === undefined) throw new Error("Watch Chips work has no parts");

const PARTS = chaptersOf(VIDEO);

/** Where the video stands, and whether it is paused, as the page's own element says. */
const timeOf = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.currentTime);
const pausedOf = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.paused);

/** A click on the film, a fraction of its width from its left. */
async function clickAcross(page: Page, across: number): Promise<void> {
  const taps = page.getByTestId("film-taps");
  const box = await taps.boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await taps.click({ position: { x: box.width * across, y: box.height / 2 } });
}

/** Every request and socket the page opens that is not one of its own files. */
function recordLeaving(page: Page): string[] {
  const origin = new URL(BUILD).origin;
  const left: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.origin !== origin || url.pathname.startsWith("/v1")) {
      left.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("websocket", (socket) => left.push(`socket ${socket.url()}`));
  return left;
}

/** The keys IndexedDB holds for this page's devices: where the demo must never be. */
async function keptDevices(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const opened = indexedDB.open("chips");
        opened.onupgradeneeded = () => opened.result.createObjectStore("device");
        opened.onsuccess = () => {
          const db = opened.result;
          if (!db.objectStoreNames.contains("device")) return resolve([]);
          const keys = db.transaction("device", "readonly").objectStore("device").getAllKeys();
          keys.onsuccess = () => resolve((keys.result as IDBValidKey[]).map(String));
          keys.onerror = () => resolve([]);
        };
        opened.onerror = () => resolve([]);
      }),
  );
}

test("a newcomer watches Chips work, looks around, and removes the demo, all on the page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const left = recordLeaving(page);

  // The first screen: the mark, the film under it, the ways in folded away.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Chips" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Watch Chips work \d:\d\d$/ })).toBeVisible();
  await expect(page.getByLabel("Pairing code", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Paste an invite link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

  // The video, from memory, playing, with a segment a part of it.
  const video = page.getByTestId("welcome-film").getByTestId("film-video");
  await expect(video).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  const segments = page.getByTestId("film-seg");
  await expect(segments).toHaveCount(PARTS.length);
  await expect(segments.first()).toHaveAttribute("data-state", "now");

  // A click on its right: the next part. On its left, the part only just begun: the one before.
  await clickAcross(page, 0.8);
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(PARTS[1]?.start ?? 0);
  await clickAcross(page, 0.15);
  await expect.poll(() => timeOf(video)).toBeLessThan(PARTS[1]?.start ?? 0);
  // → as the right.
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(PARTS[1]?.start ?? 0);

  // A press held keeps it waiting, and it plays on as it lifts.
  const box = await page.getByTestId("film-taps").boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => pausedOf(video)).toBe(true);
  await page.mouse.up();
  await expect.poll(() => pausedOf(video)).toBe(false);

  // The last part from its segment: those before it solid.
  await segments.last().click();
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(LAST_PART.start);
  await expect(segments.nth(-2)).toHaveAttribute("data-state", "done");

  // That's Chips, in the film's place after the video: the ways on.
  const end = page.getByTestId("demo-end");
  await expect(end).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("welcome-film")).toBeHidden();
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's Chips");
  await expect(end.getByRole("button", { name: "Set up my own Chips" })).toBeVisible();
  await expect(end.getByRole("button", { name: "I have an invite" })).toBeVisible();
  await expect(end.getByRole("button", { name: /^Your agents, up close, \d:\d\d$/ })).toBeVisible();
  await expect(end.getByRole("button", { name: "Watch again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await end.getByRole("button", { name: "Look around" }).click();

  // Looking around: in the demo, kept in the switcher as Chips demo.
  const switcher = page.getByRole("combobox", { name: "Workspace" });
  await expect(switcher).toBeVisible();
  await expect(switcher.locator("option:checked")).toHaveText("Chips demo");
  await expect(page.getByTestId("demo-tag").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByTestId("space-list")).toContainText("Birthday dinner");

  // A reload builds it again from the script, played to its end; IndexedDB never held it.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Workspace" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Workspace" }).locator("option:checked"),
  ).toHaveText("Chips demo");
  await expect(page.getByTestId("space-list")).toContainText("Birthday dinner");
  expect((await keptDevices(page)).filter((key) => key.includes(DEMO_DEVICE_ID))).toEqual([]);

  // Remove: gone from the switcher, and the page is the first screen again.
  await page
    .getByRole("combobox", { name: "Workspace" })
    .selectOption({ label: "Remove Chips demo" });
  await expect(page.getByRole("heading", { level: 1, name: "Chips" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Chips" })).toBeVisible();
  expect((await keptDevices(page)).filter((key) => key.includes(DEMO_DEVICE_ID))).toEqual([]);

  // Nothing left the page but its own files, from the first screen to the end.
  expect(left).toEqual([]);
});

test("Skip puts That's Chips in the film's place, and Set up my own Chips opens the ways in", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  const end = page.getByTestId("demo-end");
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's Chips");
  await end.getByRole("button", { name: "Set up my own Chips" }).click();
  await expect(page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();
  expect((await keptDevices(page)).filter((key) => key.includes(DEMO_DEVICE_ID))).toEqual([]);
});

test("the switcher plays the film full screen over the demo: Skip ends it, Escape leaves", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByTestId("demo-end").getByRole("button", { name: "Look around" }).click();
  const switcher = page.getByRole("combobox", { name: "Workspace" });
  await expect(switcher).toBeVisible();
  await switcher.selectOption({ label: "Watch Chips work…" });

  const player = page.getByTestId("film-player");
  await expect(player).toBeVisible();
  const video = player.getByTestId("film-video");
  await expect.poll(() => timeOf(video), { timeout: 20_000 }).toBeGreaterThan(0.5);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => timeOf(video)).toBeGreaterThanOrEqual(PARTS[1]?.start ?? 0);
  await player.getByRole("button", { name: "Skip" }).click();
  await expect(player.getByTestId("demo-end")).toBeVisible();
  await expect(player.getByRole("button", { name: "Skip" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(player).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Workspace" })).toBeVisible();
});
