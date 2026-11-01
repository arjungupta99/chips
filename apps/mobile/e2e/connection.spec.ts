/**
 * Connection (ADR 0211) on a phone: You's Connection row opens a page that says which way the
 * phone reaches its server, times a round trip, and, when the server's own address starts to
 * answer, moves off the relay without dropping the socket and says so.
 *
 * For the move, the payload names the server's real address, and the browser refuses its door
 * (`/v1/tunnel`) until the spec lets it through: a phone away from home, then home. The network
 * coming back (`online`) is what has the transport try the door again; it would also try on its
 * own every two minutes.
 */

import { expect, test } from "@playwright/test";
import { allowAsIssuer, pair, payload, relayStats, SERVER } from "./support.ts";

test("a phone on the relay says so on Connection, and goes direct when the door answers", async ({
  page,
}, testInfo) => {
  await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(1);
  let home = false;
  await page.routeWebSocket(/\/v1\/tunnel$/, (door) => {
    if (home) door.connectToServer();
    else door.close();
  });

  const offer = await payload(SERVER);
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill(offer);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  // The code asks, since it went out with the relay: its maker allows it (ADR 0232).
  await allowAsIssuer(page);
  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });

  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: /^Connection, Relay/ }).click({ timeout: 30_000 });
  await expect(page.getByTestId("connection-path")).toHaveText("Through the relay");
  await expect(page.getByTestId("connection-words")).toContainText("never what's said");
  await expect(page.getByTestId("connection-trip")).toHaveText(/^\d+ ms$/, { timeout: 15_000 });
  await expect(page.getByTestId("connection-history")).toContainText(/Since\s*\d{1,2}:\d\d/);
  await page.screenshot({ path: testInfo.outputPath("connection-relay.png") });

  // Home: the door answers, and the network coming back has the transport try it.
  home = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("connection-toast")).toContainText("Direct now", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("connection-path")).toHaveText("Direct");
  await expect(page.getByTestId("connection-history")).toContainText(/Before that\s*Relay, /);
  await page.screenshot({ path: testInfo.outputPath("connection-direct-now.png") });

  // The page never went through Connecting: the relay's socket carried everything until the
  // door's was open.
  await expect(page.getByTestId("connection-toast")).toHaveCount(0, { timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("connection-direct.png") });
});

test("Only direct keeps a phone off the relay, says why it is not connected, and lets go (Phase 2)", async ({
  page,
}, testInfo) => {
  await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(1);
  let home = false;
  await page.routeWebSocket(/\/v1\/tunnel$/, (door) => {
    if (home) door.connectToServer();
    else door.close();
  });
  const offer = await payload(SERVER);
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill(offer);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  // The code asks, since it went out with the relay: its maker allows it (ADR 0232).
  await allowAsIssuer(page);
  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: /^Connection, Relay/ }).click({ timeout: 30_000 });

  // Not offered until the phone has reached its server directly once.
  const only = page.getByRole("switch", { name: "Only direct" });
  await expect(only).toBeDisabled();
  await expect(page.getByTestId("only-direct-foot")).toHaveText(
    "Connect directly once to turn this on.",
  );
  home = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("connection-path")).toHaveText("Direct", { timeout: 15_000 });
  await expect(only).toBeEnabled();
  await only.click();
  await expect(only).toBeChecked();

  // Away from home with Only direct on: the relay is not tried, and the page says why.
  home = false;
  const relayed = (await relayStats()).sessions;
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(page.getByTestId("connection-words")).toContainText(
    "Only direct is on, so this phone won't use the relay",
    { timeout: 20_000 },
  );
  expect((await relayStats()).sessions).toBeLessThanOrEqual(relayed);
  // "Direct now" is not said of a phone that is not, even inside its few seconds.
  await expect(page.getByTestId("connection-toast")).toHaveCount(0);
  // The line's change takes 0.7 s; the picture is of where it rests.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath("only-direct-lost.png") });

  // Off again: through the relay at once.
  await only.click();
  await expect(page.getByTestId("connection-path")).toHaveText("Through the relay", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("connection-toast")).toHaveCount(0);
  // The line's change takes 0.7 s; the picture is of where it rests.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath("only-direct-off.png") });
});

test("a phone on the server's network says Connection is direct, and names no relay", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: /^Connection, Direct/ }).click();
  await expect(page.getByTestId("connection-path")).toHaveText("Direct");
  await expect(page.getByTestId("connection-words")).toContainText("on its own network");
  await expect(page.getByTestId("connection-trip")).toHaveText(/^\d+ ms$/, { timeout: 15_000 });
  await expect(page.getByTestId("connection-route")).toHaveAttribute(
    "aria-label",
    /^This phone straight to /,
  );
});
