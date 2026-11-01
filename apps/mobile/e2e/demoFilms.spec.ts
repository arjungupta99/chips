/**
 * The demo's two short films on the phone's first screen (ADR 0217, FV4; its addendum of 26
 * October), each a video from More walkthroughs on That's Chips, played in the film's frame: Your
 * agents, up close from Watch Chips work's, and Costs and trouble from its. Each plays with a
 * segment a part of it, a tap on its last part's right ends it on its own end card, and that card
 * offers the other films. Nothing leaves the page for `/v1`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chaptersOf, type FilmVideo, videoOf } from "@chipschat/core";
import { expect, type Page, test } from "@playwright/test";

/**
 * How many parts a film's bar has, from the films as `pnpm film` listed them, as the app's own
 * bundle has them. Read from the suite's own directory: `import.meta` is not available here, since
 * this package is CommonJS, which is what Metro wants of it.
 */
function partsOf(key: string): number {
  const listed = resolve(test.info().project.testDir, "../../../assets/film/films.json");
  const rendered = JSON.parse(readFileSync(listed, "utf8")) as {
    readonly films: readonly FilmVideo[];
  };
  const video = videoOf(rendered.films, key);
  if (video === undefined) throw new Error(`no video of ${key}`);
  return chaptersOf(video).length;
}

/** The film playing, then its last part from the bar, then a tap on its right: its end card. */
async function toTheEnd(page: Page, key: string): Promise<void> {
  const segments = page.locator('[data-testid^="film-chapter-"]');
  await expect(segments).toHaveCount(partsOf(key), { timeout: 20_000 });
  const video = page.getByTestId("welcome-film").locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 })
    .toBeGreaterThan(0.5);
  await segments.last().click();
  const film = page.getByTestId("film-taps");
  const box = await film.boundingBox();
  if (box === null) throw new Error("The film is not on the page.");
  await film.click({ position: { x: box.width * 0.8, y: box.height / 2 } });
  await expect(page.getByTestId("demo-end")).toBeVisible({ timeout: 30_000 });
}

test("the short films play in the first screen's frame from More walkthroughs, each to its own end card", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/v1")) asked.push(request.url());
  });
  await page.goto("/pair");
  await toTheEnd(page, "watch");

  // Your agents, up close.
  await page.getByRole("button", { name: /^Your agents, up close, \d:\d\d$/ }).click();
  await toTheEnd(page, "agents");
  await expect(page.getByRole("heading", { name: "That's an agent, up close" })).toBeVisible();

  // Costs and trouble, from its More walkthroughs, which offers the first film too.
  await expect(page.getByTestId("demo-film-watch")).toBeVisible();
  await page.getByTestId("demo-film-trouble").click();
  await toTheEnd(page, "trouble");
  await expect(page.getByRole("heading", { name: "That's costs and trouble" })).toBeVisible();

  expect(asked).toEqual([]);
});
