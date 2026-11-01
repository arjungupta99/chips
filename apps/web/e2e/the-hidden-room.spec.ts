/**
 * ADR 0205 on the Mac: a person hides a room from their own list. Hide, at the foot of the room's
 * sheet, takes it out of the rail's open rooms into a Hidden heading over Archived, the sheet going
 * as it does; the hide is the person's, kept on the server, so another browser of theirs lists the
 * room under Hidden from its first read; and Unhide puts it back. The row slides off the rail and
 * its place folds (ADR 0205's addendum) once the sheet has gone, which the waits below allow for.
 */

import { expect, type Page, test } from "@playwright/test";
import { closeSheet, demo, freshCode, pair, pairingPage, roomSheet } from "./support.ts";

/** PO-4471's row among the rail's open rooms. */
function openRow(page: Page) {
  return page.getByTestId("space-list").locator(`[data-space="${demo().space_id}"]`);
}

test("a room hidden from its sheet stands under Hidden, on every browser of its person, until Unhide", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  await expect(page.getByTestId("hidden-toggle")).toHaveCount(0);

  const sheet = await roomSheet(page);
  await sheet.getByTestId("hide-space").click();
  // It asks nothing, and the sheet goes: the room has gone from the rail.
  await expect(page.getByTestId("room-sheet")).toHaveCount(0);
  await expect(openRow(page)).toHaveCount(0);
  const toggle = page.getByTestId("hidden-toggle");
  await expect(toggle).toHaveText(/Hidden · 1/);
  // Open while it is the room on screen, as Archived is, the row wearing the shut eye.
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const row = page.getByTestId("hidden-list").locator(`[data-space="${demo().space_id}"]`);
  await expect(row).toHaveAttribute("data-hidden", "true");
  await expect(row.getByRole("img", { name: "Hidden" })).toBeVisible();
  // The chevron puts it out of sight, and back.
  await toggle.click();
  await expect(page.getByTestId("hidden-list")).toHaveCount(0);
  await toggle.click();
  await expect(row).toBeVisible();

  // Another browser of the same person, with nothing kept: the server's word puts it under Hidden.
  const elsewhere = await browser.newContext();
  try {
    const second = await elsewhere.newPage();
    await pairingPage(second);
    await second.getByLabel("Pairing code").fill(await freshCode());
    await second.getByRole("button", { name: "Pair" }).click();
    await expect(second.getByTestId("hidden-toggle")).toHaveText(/Hidden · 1/, {
      timeout: 20_000,
    });
    await expect(openRow(second)).toHaveCount(0);
  } finally {
    await elsewhere.close();
  }

  // Unhide, from the room's sheet, which stays up. The rail moves the room once the sheet is out of
  // the way, so it is seen going (ADR 0205's addendum): back among the open ones.
  await row.click();
  const again = await roomSheet(page);
  await again.getByTestId("unhide-space").click();
  await expect(again.getByTestId("hide-space")).toBeVisible();
  await expect(page.getByTestId("hidden-toggle")).toHaveCount(1);
  await closeSheet(page);
  await expect(page.getByTestId("hidden-toggle")).toHaveCount(0);
  await expect(openRow(page)).toBeVisible();
  await expect(openRow(page).locator("xpath=..")).not.toHaveAttribute("data-move", /./);
});
