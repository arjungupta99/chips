/**
 * A room hidden from the reader's own list (ADR 0205), end to end on the phone's web target. Hide
 * Foodie stands in who is here on the room's sheet; pressed, the server keeps it, the sheet goes and
 * the room goes back to Spaces, where it stands under a Hidden heading, opened by its chevron. The
 * room's name then says Hidden, its Notifications tile says Off while hidden, and Unhide on the same
 * row puts it back, the sheet staying. The swipe that offers the same is the simulator's to walk.
 */

import { expect, type Page, test } from "@playwright/test";
import { openRoom, pair } from "./support.ts";

/** The next PUT or DELETE of a room hidden. */
const told = (page: Page, method: string) =>
  page.waitForResponse(
    (answer) =>
      /^\/v1\/me\/hidden-spaces\/[^/]+$/.test(new URL(answer.url()).pathname) &&
      answer.request().method() === method,
  );

test("a room is hidden from its sheet, stands under Hidden, says so, and Unhide puts it back", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await pair(page);
  await openRoom(page);
  await page.getByTestId("room-capsule").click();
  const sheet = page.getByTestId("room-sheet");
  await expect(sheet).toBeVisible();

  const hidden = told(page, "PUT");
  await sheet.getByTestId("room-sheet-hide").click();
  expect((await hidden).status()).toBe(204);
  // The sheet goes and the room goes back to Spaces, where the room has gone under Hidden.
  await expect(sheet).toBeHidden();
  const heading = page.getByTestId("hidden-toggle");
  await expect(heading).toHaveAccessibleName("Hidden, 1");
  await expect(page.getByRole("button", { name: /^PO-4471/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("hidden.png") });

  await heading.click();
  const row = page.getByRole("button", { name: "PO-4471, hidden" });
  await expect(row).toBeVisible();
  await expect(page.getByTestId("hidden-mark")).toBeVisible();
  // Once the chevron has turned down.
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("shown.png") });

  // Opened from there, its name says Hidden, and its sheet offers Unhide.
  await row.click();
  await expect(page.getByTestId("room-capsule")).toContainText("Hidden");
  await page.getByTestId("room-capsule").click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("room-sheet-notify")).toContainText("Off while hidden");
  const shown = told(page, "DELETE");
  await sheet.getByTestId("room-sheet-unhide").click();
  expect((await shown).status()).toBe(204);
  // The sheet stays, turned back.
  await expect(sheet.getByTestId("room-sheet-hide")).toBeVisible();
  await expect(sheet.getByTestId("room-sheet-notify")).not.toContainText("Off while hidden");
  await expect(page.getByTestId("room-capsule")).not.toContainText("Hidden");
});
