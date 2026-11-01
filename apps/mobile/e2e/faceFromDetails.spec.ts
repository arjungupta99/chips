/**
 * A face chosen from where a space or an agent is described (ADR 0174), end to end on the phone's
 * web target. The room's sheet has the room's face beside its title (ADR 0202), named for what the
 * room wears, which turns to the picker; the agent's card has an Icon section that opens the picker
 * sheet. Each pick saves at once, the face's name or the row says it in words, and the room is put
 * back to its default at the end, as the other specs found it.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
import { openRoom, pair, registerSpecialist } from "./support.ts";

/** The next PUT or DELETE of a face, mine for a room or an agent's. */
const saved = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse(
    (answer) => path.test(new URL(answer.url()).pathname) && answer.request().method() === method,
  );

test("a room's face is chosen from the face at the head of its sheet, and said in words there", async ({
  page,
}, testInfo) => {
  await pair(page);
  await openRoom(page);
  await page.getByTestId("room-capsule").click();
  const sheet = page.getByTestId("room-sheet");
  await expect(sheet).toBeVisible();
  const row = page.getByTestId("room-sheet-icon");
  await expect(row).toHaveAccessibleName("Icon, Default");
  await page.screenshot({ path: testInfo.outputPath("sheet.png") });

  await row.click();
  await expect(sheet.getByRole("heading", { name: "Icon" })).toBeVisible();
  const mine = /^\/v1\/me\/space-icons\/[^/]+$/;
  const teal = saved(page, "PUT", mine);
  await page.getByRole("radio", { name: "Teal", exact: true }).click();
  expect((await teal).status()).toBe(200);
  const cup = saved(page, "PUT", mine);
  await page.getByTestId("mark-cup").click();
  expect((await cup).status()).toBe(200);
  await expect(page.getByTestId("mark-cup").locator("linearGradient")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("page.png") });

  await page.getByTestId("room-sheet-icon-back").click();
  await expect(row).toHaveAccessibleName("Icon, Cup on Teal");
  await expect(row.locator("linearGradient")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("after.png") });

  // And back to the default, from the same page.
  await row.click();
  const reset = saved(page, "DELETE", mine);
  const fallback = page.getByRole("button", { name: "Use the default" });
  await fallback.scrollIntoViewIfNeeded();
  await fallback.click();
  expect((await reset).status()).toBe(204);
  // The page's name goes back as well as its arrow.
  await sheet.getByRole("heading", { name: "Icon" }).click();
  await expect(row).toHaveAccessibleName("Icon, Default");
  await expect(page.getByTestId("icon-failed")).toHaveCount(0);
});

test("an agent's face is chosen from the Icon section of its card", async ({ page }, testInfo) => {
  await registerSpecialist("Heron", undefined, [HARNESS_CAPABILITIES.agents]);
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  await page.getByRole("button", { name: /^Heron, Heron · with you/ }).click();
  await expect(page.getByTestId("agent-card")).toBeVisible();
  const row = page.getByTestId("agent-icon");
  await expect(row).toContainText("Default");

  await row.click();
  const picker = page.getByTestId("icon-sheet");
  await expect(picker).toBeVisible();
  const navy = saved(page, "PUT", /^\/v1\/agents\/agt_[^/]+\/face$/);
  await page.getByRole("radio", { name: "Navy" }).click();
  expect((await navy).status()).toBe(200);
  await page.getByTestId("icon-sheet-close").click();
  await expect(picker).toBeHidden();
  await expect(row).toContainText("Navy");
  await page.screenshot({ path: testInfo.outputPath("card.png") });
});
