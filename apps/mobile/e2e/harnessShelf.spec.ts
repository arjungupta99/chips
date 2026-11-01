/**
 * The harnesses' shelf at the head of the Agents tab (ADR 0185; Arjun, 17 October 2026: "Let's do B
 * shelf of harness. I also want a mini view all option under it"). The harnesses stood under every
 * agent until then, three screens down on his server. Here the shelf is on the first screen, a tile
 * opens its harness's page, and View all pushes every harness's card in a list of its own.
 */

import { expect, type Locator, test } from "@playwright/test";
import { pair } from "./support.ts";

test("the harnesses stand on a shelf over the agents, and View all lists their cards", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  const shelf = page.getByTestId("harness-shelf");
  // On the first screen, over the Main agents and the rest: no scrolling down to find it. Scout
  // stands wherever its rooms' last words put it among the harnesses the specs before this made.
  await expect(shelf).toBeInViewport();
  await expect(page.getByLabel("View all harnesses")).toBeInViewport();
  const scout = shelf.getByRole("button", { name: "Scout", exact: true });
  await page.screenshot({ path: test.info().outputPath("shelf.png") });

  const id = await harnessId(scout);
  await scout.click();
  await expect(page.getByTestId("harness-asks-row")).toBeVisible();
  // When it asks you is a page of its own (ADR 0254), with the dial for a harness that takes one.
  await page.getByTestId("harness-asks-row").click();
  await expect(page.getByText("How far it is trusted")).toBeVisible();
  await page.goBack();
  await page.goBack();

  await page.getByLabel("View all harnesses").click();
  const list = page.getByTestId("harnesses-list");
  await expect(list.getByTestId(`rollup-${id}`)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("view-all.png") });
  await list.getByRole("button", { name: "Scout", exact: true }).click();
  await expect(page.getByTestId("harness-asks-row")).toBeVisible();
});

/** A tile's harness, from its test id: `harness-tile-<id>`. */
async function harnessId(tile: Locator): Promise<string> {
  return String(await tile.getAttribute("data-testid")).replace(/^harness-tile-/, "");
}
