/**
 * Reconnect a phone (ADR 0236), on the phone. 26 October 2026: Chips deleted from Natalie's phone
 * and put back, Pair a new phone… brought her back, and her page listed two iPhone 17s. Arjun:
 * "we need to provide a 'reconnect' option or something".
 *
 * The owner opens her page from People and taps her old device; a fresh phone that uses the code
 * asks, the owner allows it over the sheet that is up, and the fresh phone is her in the old one's
 * place: her page lists it alone, and the old device's key is refused. The swipe that signs a
 * device out is the simulator's to walk; the web suite's N5 signs one out from a browser.
 */

import { getJson } from "@chipschat/core";
import { expect, test } from "@playwright/test";
import { pair, registerPerson, specDevice } from "./support.ts";

test("R1: a device tapped on somebody's page reconnects a fresh phone in its place, and the old one is signed out", async ({
  page,
  browser,
}) => {
  const priya = await registerPerson(`Priya ${Math.random().toString(36).slice(2, 6)}`);
  // Her old phone, paired as her from Node: the key that went with the app.
  const old = await specDevice(priya.code);
  await pair(page);
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByTestId("people-row").click();
  await page.getByTestId(`person-row-${priya.id}`).click();
  const row = page.getByTestId(`person-device-${old.deviceId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  const sheet = page.getByTestId("reconnect-sheet");
  await expect(sheet.getByText("Reconnect A spec")).toBeVisible();
  await expect(sheet.getByText(/It takes this A spec's place/)).toBeVisible();
  const code = sheet.getByTestId("new-phone-code");
  await expect(code).toHaveText(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/, { timeout: 20_000 });
  const typed = (await code.textContent()) ?? "";

  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    const paired = pair(fresh, typed);
    // The code asks the owner, whose Allow rises over the reconnect sheet (ADR 0232's addendum).
    const asks = page.getByTestId("join-sheet");
    await expect(asks.getByText(`is asking to pair as ${priya.name}`)).toBeVisible({
      timeout: 30_000,
    });
    await asks.getByRole("button", { name: "Allow", exact: true }).click();
    await paired;

    // The old key is refused from the moment the new one is in.
    await expect(getJson(old, "/v1/devices")).rejects.toThrow();
  } finally {
    await context.close();
  }
});
