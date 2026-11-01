/**
 * ADR 0240 on the Mac: a person pins a room to the top of their own rail. Pin, at the foot of the
 * room's sheet (the rail has no swipe), puts it first among the open rooms with a pin before its
 * time, and the sheet stays; the pin is the person's, kept on the server, so another browser of
 * theirs lists the room first, pinned, from its first read; and Unpin lets it go, the mark with it.
 */

import { expect, type Page, test } from "@playwright/test";
import { closeSheet, demo, freshCode, pair, pairingPage, roomSheet } from "./support.ts";

/** PO-4471's row among the rail's open rooms. */
function openRow(page: Page) {
  return page.getByTestId("space-list").locator(`[data-space="${demo().space_id}"]`);
}

/** The room standing first in the rail. */
function firstRow(page: Page) {
  return page.getByTestId("space-list").locator("[data-space]").first();
}

test("a room pinned from its sheet stands first, pinned, on every browser of its person, until Unpin", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  await expect(openRow(page)).toBeVisible();
  await expect(openRow(page).getByRole("img", { name: "Pinned" })).toHaveCount(0);

  const sheet = await roomSheet(page);
  const pinned = page.waitForResponse(
    (answer) =>
      /^\/v1\/me\/pinned-spaces\/[^/]+$/.test(new URL(answer.url()).pathname) &&
      answer.request().method() === "PUT",
  );
  await sheet.getByTestId("pin-space").click();
  expect((await pinned).status()).toBe(204);
  // It asks nothing, and the sheet stays, offering Unpin: the room is still in the rail.
  await expect(sheet.getByTestId("unpin-space")).toBeVisible();
  await expect(firstRow(page)).toHaveAttribute("data-space", demo().space_id);
  await expect(openRow(page).getByRole("img", { name: "Pinned" })).toBeVisible();
  await closeSheet(page);

  // Another browser of the same person, with nothing kept: the server's word puts it first, pinned.
  const elsewhere = await browser.newContext();
  try {
    const second = await elsewhere.newPage();
    await pairingPage(second);
    await second.getByLabel("Pairing code").fill(await freshCode());
    await second.getByRole("button", { name: "Pair" }).click();
    await expect(openRow(second).getByRole("img", { name: "Pinned" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(firstRow(second)).toHaveAttribute("data-space", demo().space_id);
  } finally {
    await elsewhere.close();
  }

  // Unpin, from the room's sheet, which stays up and offers Pin again.
  const again = await roomSheet(page);
  await again.getByTestId("unpin-space").click();
  await expect(again.getByTestId("pin-space")).toBeVisible();
  await expect(openRow(page).getByRole("img", { name: "Pinned" })).toHaveCount(0);
  await closeSheet(page);
});
