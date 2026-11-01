/**
 * The connection's mark comes into the Select capsule on a launch (ADR 0131's addendum of 31
 * October 2026). Arjun twice saw the capsule jump open as a launch began: once because the mark's
 * room was drawn only with the mark, once because the room ran on JavaScript, which a launch keeps
 * busy. A slow connection keeps this launch connecting, and the capsule is measured on every frame
 * from the reload: it opens leftwards by the mark's room, a little each frame, and the word in it
 * does not move.
 */

import { expect, test } from "@playwright/test";
import { pair } from "./support.ts";

/** A frame: when, the capsule's row's left edge and width, and the word's right edge. */
type Frame = readonly [number, number, number, number];

test("on a slow launch the Select capsule opens for the mark a little each frame", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await pair(page);
  await page.getByRole("tab", { name: "Spaces" }).click();
  await expect(page.getByTestId("select-spaces")).toBeVisible({ timeout: 30_000 });
  // The ticket takes three seconds, so the launch is connecting for longer than the mark waits.
  await page.route(/\/v1\/socket-tickets/, async (route) => {
    await new Promise((done) => setTimeout(done, 3000));
    await route.continue();
  });
  await page.addInitScript(() => {
    const frames: Frame[] = [];
    (window as unknown as { frames_: Frame[] }).frames_ = frames;
    const start = performance.now();
    const tick = () => {
      const word = document.querySelector('[data-testid="select-spaces"]');
      const row = word?.parentElement?.getBoundingClientRect();
      const at = word?.getBoundingClientRect();
      if (row !== undefined && at !== undefined) {
        frames.push([performance.now() - start, row.left, row.width, at.right]);
      }
      if (performance.now() - start < 2500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.reload();
  await expect(page.getByTestId("connection-mark")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => (window as unknown as { frames_: Frame[] }).frames_);
  const widths = frames.map((frame) => frame[2]);
  const grew = Math.max(...widths) - widths[0];
  // The mark's room: its 20 points, 7 before the word, less the 5 the lead gives back.
  expect(grew).toBeGreaterThan(20);
  let step = 0;
  for (let at = 1; at < frames.length; at += 1) {
    step = Math.max(step, Math.abs(widths[at] - widths[at - 1]));
  }
  // A quarter of a second over 22 points is about 1.5 a frame at its steepest; 6 is a frame or two
  // dropped, and the jump this guards against was 20.
  expect(step).toBeLessThan(6);
  const rights = frames.map((frame) => frame[3]);
  expect(Math.max(...rights) - Math.min(...rights)).toBeLessThan(0.5);
});
