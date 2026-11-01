/**
 * ADR 0217 (FV4; its addendum of 26 October): the demo's two short films on the web and in the Mac
 * app, each a video from More walkthroughs on the end card before it, played in the first screen's
 * frame: Your agents, up close from Watch Chips work's, and Costs and trouble from its. Each plays
 * from memory with a segment a part, a click on its last part's right ends it on its own end card,
 * and that card offers the other films. Nothing leaves the page but its own files, against the
 * production build.
 */

import { readFileSync } from "node:fs";
import { chaptersOf, type FilmVideo, videoOf } from "@chipschat/core";
import { expect, type Page, test } from "@playwright/test";
import { BUILD } from "./support.ts";

test.use({ baseURL: BUILD });

/** The films as `pnpm film` listed them, as the page's own build has them. */
const RENDERED = JSON.parse(
  readFileSync(new URL("../../../assets/film/films.json", import.meta.url), "utf8"),
) as { readonly films: readonly FilmVideo[] };

/** How many parts a film's bar has. */
function partsOf(key: string): number {
  const video = videoOf(RENDERED.films, key);
  if (video === undefined) throw new Error(`no video of ${key}`);
  return chaptersOf(video).length;
}

/** The film playing from memory, then its last part from the bar, then a click on its right. */
async function toTheEnd(page: Page, key: string): Promise<void> {
  const segments = page.getByTestId("film-seg");
  await expect(segments).toHaveCount(partsOf(key), { timeout: 20_000 });
  const video = page.getByTestId("film-video");
  await expect(video).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 })
    .toBeGreaterThan(0.5);
  await segments.last().click();
  const taps = page.getByTestId("film-taps");
  const box = await taps.boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await taps.click({ position: { x: box.width * 0.8, y: box.height / 2 } });
  await expect(page.getByTestId("demo-end")).toBeVisible({ timeout: 30_000 });
}

test("the short films play from More walkthroughs, each to its own end card", async ({ page }) => {
  test.setTimeout(120_000);
  const origin = new URL(BUILD).origin;
  const left: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.origin !== origin || url.pathname.startsWith("/v1")) left.push(request.url());
  });

  await page.goto("/");
  await toTheEnd(page, "watch");

  // Your agents, up close.
  await page
    .getByTestId("demo-end")
    .getByRole("button", { name: /Your agents, up close/ })
    .click();
  await toTheEnd(page, "agents");
  const end = page.getByTestId("demo-end");
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's an agent, up close");

  // Costs and trouble, from its More walkthroughs, which offers the first film too.
  await expect(end.getByRole("button", { name: /Watch Chips work/ })).toBeVisible();
  await end.getByRole("button", { name: /Costs and trouble/ }).click();
  await toTheEnd(page, "trouble");
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's costs and trouble");

  expect(left).toEqual([]);
});
