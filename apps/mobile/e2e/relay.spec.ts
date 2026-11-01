/**
 * M4.1 on a phone: away from the network, it reaches the server through the relay, and it says
 * so (ADR 0038).
 *
 * The suite's `chipsd` dials out to a relay beside it. The payload here names an address nothing
 * listens on — which is what a phone on cellular sees of a home network — so the client tries
 * the network, gives up, and goes through the relay on its own. Nobody chose the relay; there
 * is no setting for it, and that is the point.
 */

import { expect, test } from "@playwright/test";
import { allowAsIssuer, payload, relayStats } from "./support.ts";

/** A network address nothing is listening on: port 1, which no server binds. */
const NOWHERE = "http://127.0.0.1:1";

test("a phone away from the network goes through the relay, and You says so", async ({ page }) => {
  // The server is dialled in.
  await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(1);

  // The whole payload goes in the code field: the pairing screen parses a scanned line and a
  // typed one the same way, which is the only reason a spec with no camera can offer one.
  const offer = await payload(NOWHERE);
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill(offer);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  // The code asks, since it went out with the relay: its maker allows it (ADR 0232).
  await allowAsIssuer(page);

  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });
  // Connected is connected: the header's mark stays away (`ui/Connection.tsx`), and You → This phone
  // says which way (`you/About.tsx`).
  await page.getByRole("tab", { name: "You", exact: true }).click();
  const relayed = page.getByTestId("about-connection");
  await expect(relayed).toContainText("Relay", { timeout: 30_000 });
  await expect(page.getByTestId("connection-mark")).toHaveCount(0);
  await expect
    .poll(async () => (await relayStats()).sessions, { timeout: 20_000 })
    .toBeGreaterThan(0);

  // Reloaded, it comes back the same way: the relay and the key were kept with the device.
  await page.reload();
  await expect(relayed).toContainText("Relay", { timeout: 40_000 });
});
