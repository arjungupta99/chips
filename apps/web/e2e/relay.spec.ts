/**
 * M4.1: a device away from the network reaches the server through the relay, and one on the
 * network never touches it (ADR 0038).
 *
 * The suite's chipsd dials out to a relay beside it (`playwright.config.ts`). The owner issues a
 * code from You — the screen `chips pair --issue` became — and the link the QR would carry names
 * the relay and the server's key. A second browser opens that link with the network address
 * pointed at a port nothing listens on, which is what a phone on cellular sees: the client tries
 * the network, gives up, and goes through the relay; its header says so; a message it sends
 * arrives. A third browser opens the same link with the network address reachable, and the
 * relay's counter shows nothing passed through it.
 */

import { expect, test } from "@playwright/test";
import { allowFrom, pair, RELAY, RELAY_PORT, WEB } from "./support.ts";

async function relayStats(): Promise<{ servers: number; sessions: number }> {
  const response = await fetch(`http://127.0.0.1:${RELAY_PORT}/health`);
  return (await response.json()) as { servers: number; sessions: number };
}

test("a browser away from the network reaches the server through the relay; one at home does not", async ({
  page,
  browser,
}) => {
  await pair(page);
  // The server is dialled in: the relay lists one server.
  await expect.poll(async () => (await relayStats()).servers).toBe(1);

  // A code for the next device, from You, with the QR's address beside it.
  await page.getByTestId("you").click();
  await page.getByTestId("issue-code").click();
  const code = (await page.getByTestId("pairing-code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  const link = (await page.getByTestId("pairing-link").textContent()) ?? "";
  const payload = new URLSearchParams(new URL(link).hash.slice(1));
  expect(payload.get("relay")).toBe(RELAY);
  expect(payload.get("key")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("img", { name: /A QR code/ })).toBeVisible();
  // The code outlives its form's page (ADR 0265's addendum): another row's page takes its place.
  const form = page.getByTestId("pair-form");
  await page.getByTestId("people-row").click();
  await expect(form).toHaveCount(0);

  // Away: the network address is a port nothing listens on. The phone-like browser falls back
  // to the relay on its own, and says so.
  const away = await browser.newContext();
  const phone = await away.newPage();
  try {
    payload.set("lan", "http://127.0.0.1:1");
    // A link's code goes at once (ADR 0121): nobody presses Pair. It asks the owner, whose page
    // made it, and the owner allows it once the codes match (ADR 0232).
    await phone.goto(`${WEB}/#${payload.toString()}`);
    await allowFrom(page, phone, / is asking to pair as you$/);
    const room = phone.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
    await expect(room).toBeVisible({ timeout: 20_000 });
    await room.click();
    await expect(phone.getByTestId("link")).toHaveText("via relay", { timeout: 20_000 });
    await expect.poll(async () => (await relayStats()).sessions).toBe(1);

    // A message sent through the relay lands in the room the owner is looking at.
    await page.getByTestId("you").click();
    await page
      .getByTestId("space-list")
      .getByRole("button", { name: /PO-4471/ })
      .click();
    const text = `From the road, ${Date.now()}`;
    await phone.getByRole("textbox", { name: "Message" }).fill(text);
    await phone.keyboard.press("Enter");
    await expect(phone.getByText(text).last()).toBeVisible();
    await expect(page.getByText(text).last()).toBeVisible({ timeout: 10_000 });

    // Reloaded, it comes back through the relay: the relay and the key were kept with the device.
    await phone.reload();
    await expect(
      phone.getByTestId("space-list").getByRole("button", { name: /PO-4471/ }),
    ).toBeVisible({ timeout: 20_000 });
    await phone
      .getByTestId("space-list")
      .getByRole("button", { name: /PO-4471/ })
      .click();
    await expect(phone.getByTestId("link")).toHaveText("via relay", { timeout: 20_000 });
  } finally {
    await away.close();
  }
  await expect.poll(async () => (await relayStats()).sessions, { timeout: 10_000 }).toBe(0);

  // At home: the same payload with the network address reachable. The relay sees nothing.
  await page.getByTestId("you").click();
  await page.getByTestId("issue-code").click();
  const homeLink = (await page.getByTestId("pairing-link").textContent()) ?? "";
  await page.getByTestId("people-row").click();
  await expect(form).toHaveCount(0);
  const home = await browser.newContext();
  const laptop = await home.newPage();
  try {
    const homePayload = new URLSearchParams(new URL(homeLink).hash.slice(1));
    homePayload.set("lan", WEB);
    await laptop.goto(`${WEB}/#${homePayload.toString()}`);
    // At home too: the server can't tell how a code travelled, so it asks all the same.
    await allowFrom(page, laptop, / is asking to pair as you$/);
    const room = laptop.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
    await expect(room).toBeVisible({ timeout: 20_000 });
    await room.click();
    await expect(laptop.getByTestId("members")).toBeVisible();
    await expect(laptop.getByTestId("link")).toHaveCount(0);
    expect((await relayStats()).sessions).toBe(0);
  } finally {
    await home.close();
  }
});
