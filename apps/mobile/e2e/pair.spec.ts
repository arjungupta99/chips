/**
 * The way in. A phone that cannot pair is a phone with nothing on it, and the pairing screen is
 * the one screen every other spec here has to get past.
 */

import { expect, test } from "@playwright/test";
import { freshCode, pair, THROUGH } from "./support.ts";

test("a typed code and an address bring the app up on Spaces", async ({ page }) => {
  await pair(page);
  await expect(page.getByTestId("workspace-title")).toBeVisible();
  // There is no For you to land on (ADR 0065).
  await expect(page.getByRole("tab", { name: "For you" })).toHaveCount(0);
  // Reloaded, it is still paired: the key and the record went to storage, not to memory.
  await page.reload();
  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 20_000 });
});

test("a code the server has never issued is refused, in words", async ({ page }) => {
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill("ZZZ-999");
  await page.getByLabel("Server address").fill(THROUGH);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(page.getByText(/not valid|did not work/i)).toBeVisible({ timeout: 20_000 });
});

test("a code with no address says which half is missing", async ({ page }) => {
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill(await freshCode());
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(page.getByText(/Add the server's address/)).toBeVisible();
});

test("a code is single use: the second phone is told so rather than left guessing", async ({
  page,
  browser,
}) => {
  const code = await freshCode();
  await pair(page, code);

  const second = await browser.newContext();
  const other = await second.newPage();
  try {
    await other.goto("/pair?code=1");
    await other.getByLabel("Pairing code", { exact: true }).fill(code);
    await other.getByLabel("Server address").fill(THROUGH);
    await other.getByRole("button", { name: "Pair", exact: true }).click();
    await expect(other.getByText(/not valid|did not work/i)).toBeVisible({ timeout: 20_000 });
  } finally {
    await second.close();
  }
});
