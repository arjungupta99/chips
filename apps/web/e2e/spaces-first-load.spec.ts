/**
 * The space pane and the rail on a launch whose socket misses its first tries (14 October 2026),
 * as the phone's Spaces. With no room kept, both said "Can't reach your server" at once, for the
 * second or two until the socket was through. Now that is the server being reached, and trouble
 * is said once it has lasted (`patientEmpty`, ADR 0166).
 */

import { expect, test } from "@playwright/test";
import { pair } from "./support.ts";

test("a launch whose socket misses its first tries says the server is being reached, and lists the rooms", async ({
  page,
}) => {
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
  // The first two tries for a socket fail, a second and then two apart.
  let tickets = 0;
  await page.route("**/v1/socket-tickets*", async (route) => {
    tickets += 1;
    if (tickets <= 2) return route.abort("connectionrefused");
    return route.continue();
  });
  await pair(page);
  expect(tickets).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => (window as unknown as { said: string[] }).said)).toEqual([
    "Reaching your server",
  ]);
});
