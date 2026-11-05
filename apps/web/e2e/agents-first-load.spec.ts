/**
 * The Agents page on a cold start (14 October 2026), as the phone's tab. The browser did not keep
 * who is who, so until `GET /v1/participants` answered the page said "No harnesses yet." and
 * "No agents yet". Now the store keeps the server's last answer in IndexedDB and lists it at once;
 * before the first answer this browser ever had, the page stands blank agents.
 *
 * The read is held here, as a slow server or a long way round the relay holds it.
 */

import { expect, type Page, type Route, test } from "@playwright/test";
import { pair } from "./support.ts";

const SHOTS = process.env["CHIPS_E2E_SHOTS"];

/** Hold every read of the directory until `release` is called; the store's own reads too. */
async function holdDirectory(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let open = false;
  await page.route("**/v1/participants*", async (route) => {
    if (open) return route.continue();
    held.push(route);
  });
  return async () => {
    open = true;
    for (const route of held.splice(0)) await route.continue();
  };
}

async function shoot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/web-${name}.png` });
}

test("stands blank agents until the first list, then lists what it kept at once on a reload", async ({
  page,
}) => {
  const release = await holdDirectory(page);
  await pair(page);
  await page.getByRole("button", { name: /^Agents/ }).click();

  const main = page.getByRole("main", { name: "Agents" });
  await expect(main.getByTestId("agents-fetching")).toBeVisible();
  await expect(main.getByRole("status")).toContainText("Loading your agents");
  await expect(main).not.toContainText("No agents yet");
  await expect(main).not.toContainText("No harnesses yet");
  await expect(main.getByRole("button", { name: "Connect a harness" })).toHaveCount(0);
  // Nor does the rail, which lists no harnesses since 3 November 2026 (ADR 0261's addendum).
  await expect(page.getByRole("complementary", { name: "Workspace" })).not.toContainText(
    "No harnesses yet",
  );
  await shoot(page, "1-first-load");

  await release();
  await expect(main.getByTestId("agents-fetching")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: /^Agents · \d+$/ })).toBeVisible();
  // Scout's tile on the shelf at the page's head (ADR 0185); its card is under View all.
  const scout = main.getByTestId(/^harness-tile-/).filter({ hasText: "Scout" });
  await expect(scout).toBeVisible();
  await shoot(page, "2-listed");

  // A cold start with the server slow to answer again: the kept list is there at once.
  await page.unroute("**/v1/participants*");
  const releaseAgain = await holdDirectory(page);
  await page.reload();
  await page.getByRole("button", { name: /^Agents/ }).click();
  await expect(scout).toBeVisible({ timeout: 20_000 });
  await expect(main.getByTestId("agents-fetching")).toHaveCount(0);
  await shoot(page, "3-kept");
  await releaseAgain();
});
