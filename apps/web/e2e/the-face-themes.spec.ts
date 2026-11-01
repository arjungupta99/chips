/**
 * The faces' theme on the desktop (ADR 0176). Arjun opens You and finds the two themes in the
 * Appearance card under the light/dark row, each preview showing its own; he picks Bright, and
 * the faces down the side wear their Bright grounds with dark letters. The choice is this
 * computer's: back to Soothing, and the faces are as they were.
 */

import { expect, test } from "@playwright/test";
import { pair } from "./support.ts";

test.use({ colorScheme: "dark" });

test("the faces turn Bright from You on the desktop, and back", async ({ page }, testInfo) => {
  await pair(page);
  await page.getByTestId("you").click();
  const card = page.getByTestId("appearance");
  await card.scrollIntoViewIfNeeded();
  const themes = card.getByRole("radiogroup", { name: "Theme" });
  await expect(themes.getByRole("radio", { name: "Soothing" })).toBeChecked();
  await expect(card.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  // Each preview holds its own theme, whatever the page's.
  await expect(card.locator('[data-faces="bright"] .ui-avatar').first()).toBeVisible();
  await card.screenshot({ path: testInfo.outputPath("appearance-soothing.png") });

  await themes.getByRole("radio", { name: "Bright" }).click();
  await expect(themes.getByRole("radio", { name: "Bright" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-faces", "bright");
  await card.screenshot({ path: testInfo.outputPath("appearance-bright.png") });
  await page.screenshot({ path: testInfo.outputPath("page-bright.png") });

  await themes.getByRole("radio", { name: "Soothing" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-faces", /./);
});
