/**
 * The faces chosen for rooms are kept on the device and read again (16 October 2026). His iPhone,
 * after a fresh install through the relay: the app read them once, as the list first drew, that
 * read failed, and every room's picture stood as its letters until the app was closed. Now a
 * relaunch draws the face it kept even when every read of them fails, and the reads come back at
 * the next connect.
 */

import { expect, test } from "@playwright/test";
import { pair } from "./support.ts";

test("a room's picture survives a relaunch whose reads of the faces all fail", async ({
  page,
}, testInfo) => {
  await pair(page);
  await page.getByRole("tab", { name: "Spaces" }).click();
  const row = page.getByRole("button", { name: /PO-4471/ }).first();
  await row.click({ delay: 900 });
  await expect(page.getByTestId("icon-sheet")).toBeVisible();
  const picked = page.waitForResponse(
    (answer) => answer.url().includes("/v1/me/space-icons/") && answer.request().method() === "PUT",
  );
  const lighthouse = page.getByTestId("mark-lighthouse");
  await lighthouse.scrollIntoViewIfNeeded();
  await lighthouse.click();
  expect((await picked).status()).toBe(200);
  await page.getByTestId("icon-sheet-close").click();
  await expect(row.locator("linearGradient")).toHaveCount(1);

  // Every read of the faces refused from here: the launch's, the hello's, the store's own tries.
  let refused = 0;
  await page.route("**/v1/me/space-icons", async (route) => {
    refused += 1;
    await route.abort();
  });
  await page.reload();
  await page.getByRole("tab", { name: "Spaces" }).click();
  // Still the picture, from what the device kept, not the room's letters.
  await expect(row.locator("linearGradient")).toHaveCount(1);
  expect(await row.locator("path").count()).toBeGreaterThan(3);
  expect(refused).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("kept.png") });

  // Back to the default, for the specs after this one, which share the room.
  await page.unroute("**/v1/me/space-icons");
  await row.click({ delay: 900 });
  const reset = page.waitForResponse(
    (answer) =>
      answer.url().includes("/v1/me/space-icons/") && answer.request().method() === "DELETE",
  );
  const fallback = page.getByRole("button", { name: "Use the default" });
  await fallback.scrollIntoViewIfNeeded();
  await fallback.click();
  expect((await reset).status()).toBe(204);
  await page.getByTestId("icon-sheet-close").click();
  await expect(row.locator("linearGradient")).toHaveCount(0);
});
