/**
 * The owner's relay switch on a phone (ADR 0211, Phase 4): You's Relay row opens the page that
 * lists the devices by the way they go, and turning the relay off asks first, with who would lose
 * the server. Turned off from this phone, itself on the relay, the phone is answered, hears who
 * turned it off before the relay goes, and its Connection page says so once it cannot connect.
 *
 * The phone pairs through the relay with the server's door refused, as `connection.spec.ts` does:
 * a phone away from home. The relay goes back on at the end, from Node as the owner, for the
 * specs after this one.
 */

import { putJson } from "@chipschat/core";
import { expect, test } from "@playwright/test";
import { allowAsIssuer, payload, relayStats, SERVER, specDevice } from "./support.ts";

test("an owner turns the relay off from Relay: the phone on it hears who, and why it cannot connect", async ({
  page,
}, testInfo) => {
  await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(1);
  await page.routeWebSocket(/\/v1\/tunnel$/, (door) => door.close());
  const owner = await specDevice();
  try {
    const offer = await payload(SERVER);
    await page.goto("/pair?code=1");
    await page.getByLabel("Pairing code", { exact: true }).fill(offer);
    await page.getByRole("button", { name: "Pair", exact: true }).click();
    // The code asks, since it went out with the relay: its maker allows it (ADR 0232).
    await allowAsIssuer(page);
    await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });

    await page.getByRole("tab", { name: "You", exact: true }).click();
    await page.getByRole("button", { name: "Relay, On" }).click({ timeout: 30_000 });
    // This phone is through the relay now, and says when it was last direct: never.
    await expect(page.getByTestId("relay-relayed")).toContainText("never direct", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("relay-foot")).toContainText(
      "With it off, Chips is reachable only on its own network.",
    );
    await page.screenshot({ path: testInfo.outputPath("relay-page.png") });

    await page.getByRole("switch", { name: "Use the relay" }).click();
    await expect(page.getByTestId("relay-off-lead")).toContainText(
      /last reached Chips through the relay/,
    );
    // This phone is among the ones that would lose the server.
    await expect(page.getByTestId("relay-off-sheet")).toContainText("This phone");
    await expect(page.getByRole("button", { name: "Turn off now" })).toBeInViewport();
    await page.waitForTimeout(500); // the sheet's rise, for the picture only
    await page.screenshot({ path: testInfo.outputPath("relay-off-sheet.png") });
    await page.getByRole("button", { name: "Turn off now" }).click();

    // Answered before the relay goes: the switch says off.
    await expect(page.getByRole("switch", { name: "Use the relay" })).not.toBeChecked({
      timeout: 15_000,
    });
    await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(0);

    // Connection says who turned it off, and that the server is reached on its network alone; the
    // machine by the name the server gave it while it could be asked.
    await page.goBack();
    await page.getByRole("button", { name: /^Connection/ }).click();
    const why =
      /turned the relay off at \d{1,2}:\d\d\s?(AM|PM)?, so Chips reaches Arjun's Mac mini only on its own network now\. What you send waits here and goes once it is connected\./;
    await expect(page.getByTestId("connection-words")).toHaveText(why, { timeout: 30_000 });
    // And still while it tries again, which it does every few seconds.
    await page.waitForTimeout(4000);
    await expect(page.getByTestId("connection-words")).toHaveText(why);
    await page.screenshot({ path: testInfo.outputPath("connection-relay-off.png") });
  } finally {
    await putJson(owner, "/v1/relay", { on: true });
    await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(1);
  }
});
