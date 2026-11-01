/**
 * The faces' theme (ADR 0176), end to end on the phone's web target. Arjun opens You, finds the
 * two themes in the Appearance group under the light/dark switch, and picks Bright: the agent's
 * face on Agents now wears its Bright ground with dark letters. Back to Soothing, and the letters
 * are white again. Nothing goes to the server: the theme is this phone's.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { pair, registerSpecialist } from "./support.ts";

test.use({ colorScheme: "dark" });

test("the faces turn Bright from You, with dark letters, and back to Soothing", async ({
  page,
}, testInfo) => {
  await registerSpecialist("Lark", undefined, [HARNESS_CAPABILITIES.agents]);
  await pair(page);
  const told: string[] = [];
  page.on("request", (request) => {
    if (/face|theme/i.test(new URL(request.url()).pathname)) told.push(request.url());
  });

  await page.getByRole("tab", { name: "You" }).click();
  const group = page.getByTestId("appearance");
  await group.scrollIntoViewIfNeeded();
  await expect(group.getByRole("radio", { name: "Dark" })).toBeVisible();
  await expect(group.getByRole("radio", { name: "Soothing" })).toBeChecked();
  await expect(page.getByText(/System follows/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("you-soothing.png") });

  await group.getByRole("radio", { name: "Bright" }).click();
  await expect(group.getByRole("radio", { name: "Bright" })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("you-bright.png") });

  await page.getByRole("tab", { name: "Agents" }).click();
  const row = page.getByRole("button", { name: /^Lark, Lark · with you/ });
  await expect(row.getByText("L", { exact: true })).toHaveCSS("color", "rgb(22, 23, 27)");
  await page.screenshot({ path: testInfo.outputPath("agents-bright.png") });

  await page.getByRole("tab", { name: "You" }).click();
  await group.getByRole("radio", { name: "Soothing" }).click();
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(row.getByText("L", { exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  expect(told).toEqual([]);
});
