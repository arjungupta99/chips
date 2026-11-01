/**
 * The Agents tab on a cold start (14 October 2026). The phone did not keep who is who, so until
 * `GET /v1/participants` answered the tab said "Agents · 0", "No agents yet" and "No harnesses
 * yet", on every launch. Now the store keeps the server's last answer in the cache and lists it at
 * once; before the first answer this phone ever had, the tab stands blank agents (`Arriving`).
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
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("stands blank agents until the first list, then lists what it kept at once on a reload", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const release = await holdDirectory(page);
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();

  // Before the first answer: blank agents where the list will be, and no claim that there are none.
  await expect(page.getByLabel("Loading your agents")).toBeVisible();
  await expect(page.getByText(/No agents yet/)).toHaveCount(0);
  await expect(page.getByText(/No harnesses yet/)).toHaveCount(0);
  await expect(page.getByText(/^Agents · /)).toHaveCount(0);
  await shoot(page, "1-first-load");

  // The answer comes, and the list comes in over the blank rows.
  await release();
  await expect(page.getByText(/^Agents · \d+$/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Loading your agents")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Scout" })).toBeVisible();
  await shoot(page, "2-listed");

  // A cold start with the server slow to answer again: the kept list is there at once.
  await page.unroute("**/v1/participants*");
  const releaseAgain = await holdDirectory(page);
  await page.reload();
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(page.getByRole("button", { name: "Scout" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^Agents · \d+$/)).toBeVisible();
  await expect(page.getByLabel("Loading your agents")).toHaveCount(0);
  await shoot(page, "3-kept");
  await releaseAgain();
});

test("a launch whose first read of the list fails says nothing went wrong, and lists them", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // His iPhone through the relay (14 October 2026): the launch's read went out before the socket
  // had a way to the server, failed, and the tab said "Couldn't load your agents" for a second.
  // Everything the page ever says is watched, from before the app loads.
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    new MutationObserver(() => {
      const words = document.body?.innerText ?? "";
      for (const wrong of ["Couldn't load your agents", "Can't reach your server"]) {
        if (words.includes(wrong) && !said.includes(wrong)) said.push(wrong);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  // The first read fails; the next takes five seconds, as a slow way round through the relay
  // does, so the tab is on screen, the socket open, while the list is still on its way.
  let reads = 0;
  await page.route("**/v1/participants*", async (route) => {
    reads += 1;
    if (reads === 1) return route.abort("connectionrefused");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return route.continue();
  });
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(page.getByLabel("Loading your agents")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scout" })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { said: string[] }).said)).toEqual([]);
});
