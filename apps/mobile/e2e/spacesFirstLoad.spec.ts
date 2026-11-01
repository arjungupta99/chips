/**
 * Spaces on a launch whose socket misses its first tries (14 October 2026), as a launch through
 * the relay can before it has a way to the server. With no room kept, the list said "Can't reach
 * your server" at once, for the second or two until the socket was through. Now that is the
 * server being reached, and trouble is said once it has lasted (`patientEmpty`, ADR 0166).
 */

import { expect, test } from "@playwright/test";
import { pair } from "./support.ts";

test("a launch whose socket misses its first tries says the server is being reached, and lists the rooms", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Everything the page ever says is watched, from before the app loads.
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    new MutationObserver(() => {
      const words = document.body?.innerText ?? "";
      for (const each of ["Reaching your server", "Can't reach your server"]) {
        if (words.includes(each) && !said.includes(each)) said.push(each);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  // The first two tries for a socket fail, a second and then two apart: three seconds of a
  // socket that is not through, which said "Can't reach your server" for all of them.
  let tickets = 0;
  await page.route("**/v1/socket-tickets*", async (route) => {
    tickets += 1;
    if (tickets <= 2) return route.abort("connectionrefused");
    return route.continue();
  });
  await pair(page);
  await expect(page.getByText(/PO-4471/).first()).toBeVisible({ timeout: 20_000 });
  expect(tickets).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => (window as unknown as { said: string[] }).said)).toEqual([
    "Reaching your server",
  ]);
});
