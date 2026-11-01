/**
 * A new phone for somebody already here (ADR 0206), against a real server and real browsers.
 *
 * 19 October 2026: Natalie deleted Chips from her phone and put it back. No passkey, no other
 * device to make a code with, and the invite Arjun sent was refused by her own name. These are the
 * three ways back, as an owner and the person on a new device meet them:
 *
 * - N1, from People: the owner's New phone… makes a code for her; a fresh browser pairs with it and
 *   is her, with her name, not a new person.
 * - N2, from the Wi-Fi: a device asks to join; the owner picks her under Pair it as, types the code
 *   it shows, and the device collects a key that is hers.
 * - N3, the invite: her own name refused says what to do instead.
 *
 * 26 October 2026: N1 put her back, and her page listed two iPhone 17s, the first holding a key
 * that had gone with the old app (ADR 0236). So:
 *
 * - N4, Reconnect…: the owner's code names her old device; the browser that uses it is her in its
 *   place, and the old one is signed out once the owner allows it.
 * - N5, Sign out: the owner signs a device of hers out from her row, and it is turned away.
 */

import { type Browser, expect, type Page, test } from "@playwright/test";
import { openInvite, pair, pairWith, registerPerson, SERVER } from "./support.ts";

/** A name nobody in the shared demo workspace has: other specs register people of their own. */
const someone = (who: string) => `${who} ${Math.random().toString(36).slice(2, 6)}`;

test("N1: an owner's New phone… pairs a fresh browser as the person, not as somebody new", async ({
  page,
  browser,
}) => {
  const noor = await registerPerson(someone("Noor"));
  await pair(page);
  await page.getByTestId("you").click();
  const row = page.locator(`[data-testid=person-row][data-participant="${noor.id}"]`);
  // Their row opens under itself, with New phone… there (ADR 0209).
  await row.getByTestId("person-open").click();
  await row.getByRole("button", { name: `A new phone for ${noor.name}…` }).click();
  const panel = page.getByTestId("new-phone-panel");
  await expect(panel.getByRole("heading", { name: `A new phone for ${noor.name}` })).toBeVisible();
  const code = (await panel.getByTestId("pairing-code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  await expect(panel.getByTestId("new-phone-link")).toContainText(`chips://pair?pair=${code}`);

  const context = await browser.newContext();
  const fresh = await context.newPage();
  try {
    // Made on the owner's page with the relay on, the code asks them first (ADR 0232).
    await pairWith(fresh, code, {
      from: page,
      title: new RegExp(` is asking to pair as ${noor.name}$`),
    });
    await fresh.getByTestId("you").click();
    await expect(fresh.getByLabel("Your name")).toHaveValue(noor.name);
    await expect(fresh.getByTestId("my-role")).toHaveText(/^Member/);
  } finally {
    await context.close();
  }
});

test("N2: a device that asks is allowed as somebody already here, and its key is theirs", async ({
  page,
}) => {
  const noor = await registerPerson(someone("Noor"));
  await pair(page);
  // An Ed25519 public key in SPKI DER: the fixed prefix, then 32 random bytes.
  const key = `MCowBQYDK2VwAyEA${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")}`;
  const asked = await fetch(`${SERVER}/v1/join`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.20.1.7" },
    body: JSON.stringify({ kind: "device", name: "iPhone 16", public_key: key }),
  });
  expect(asked.status).toBe(201);
  const { request_id, secret, code } = (await asked.json()) as Record<string, string>;

  const dialog = page.getByTestId("join-request-dialog");
  await expect(dialog.getByText("iPhone 16 wants to pair")).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("radio", { name: noor.name }).check();
  await expect(dialog.getByTestId("join-paired-words")).toHaveText(
    `It is paired as ${noor.name}, with their spaces and everything they said: for ${noor.name}'s new phone.`,
  );
  await dialog.getByTestId("join-code-field").fill(code ?? "");
  await dialog.getByTestId("join-allow").click();

  const redeemed = await fetch(`${SERVER}/v1/join/${request_id}/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  expect(redeemed.status).toBe(200);
  expect(await redeemed.json()).toMatchObject({
    kind: "device",
    participant_id: noor.id,
    display_name: noor.name,
  });
  await expect(dialog.getByTestId("join-device-state")).toHaveText(`Paired as ${noor.name}.`);
});

test("N3: an invite refused by somebody's own name says the way back", async ({
  page,
  browser,
}) => {
  const noor = await registerPerson(someone("Noor"));
  await pair(page);
  await page.getByTestId("you").click();
  await page.getByRole("combobox", { name: "Invite role" }).selectOption("member");
  await page.getByTestId("make-invite").click();
  const url = (await page.getByTestId("invite-url").textContent()) ?? "";

  const context = await browser.newContext();
  const fresh = await context.newPage();
  try {
    await openInvite(fresh, url);
    await fresh.getByLabel("Your name").fill(noor.name);
    await fresh.getByRole("button", { name: "Join" }).click();
    await expect(fresh.getByRole("alert")).toContainText(
      `Somebody here goes by ${noor.name} already. If that's you on a new phone, ask`,
    );
    await expect(fresh.getByRole("alert")).toContainText(
      "to choose Pair a new phone on your page in People.",
    );
  } finally {
    await context.close();
  }
});

/** What a browser whose device was signed out says, the next time it asks the server. */
const TURNED_AWAY = "This server does not know this browser. Pair it again.";

/**
 * Somebody with a device of their own already, a browser paired as them, and the owner's page open
 * on their row in People; the page that is their device comes back, to be signed out.
 */
async function personWithADevice(page: Page, browser: Browser) {
  const noor = await registerPerson(someone("Noor"));
  const context = await browser.newContext();
  const theirs = await context.newPage();
  await pairWith(theirs, noor.code);
  await pair(page);
  await page.getByTestId("you").click();
  const row = page.locator(`[data-testid=person-row][data-participant="${noor.id}"]`);
  await row.getByTestId("person-open").click();
  const device = row.getByTestId("person-device");
  await expect(device).toHaveCount(1);
  const id = (await device.getAttribute("data-device")) ?? "";
  expect(id).toMatch(/^dev_/);
  const name = (await device.locator(".person-device-name").textContent()) ?? "";
  return { noor, row, device, id, name, theirs, context };
}

/** The page of a device that was signed out, asked again: back to pairing, and why. */
async function turnedAway(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByText(TURNED_AWAY)).toBeVisible({ timeout: 20_000 });
}

test("N4: Reconnect… pairs a fresh browser in the place of a device of theirs, which is signed out", async ({
  page,
  browser,
}) => {
  const { noor, row, device, id, name, theirs, context } = await personWithADevice(page, browser);
  const later = await browser.newContext();
  try {
    await device.getByRole("button", { name: `Reconnect ${name}…` }).click();
    const panel = row.getByTestId("reconnect-panel");
    await expect(panel.getByRole("heading", { name: `Reconnect ${name}` })).toBeVisible();
    await expect(panel).toContainText(
      `everything ${noor.name} said, and the old one is signed out.`,
    );
    const code = (await panel.getByTestId("pairing-code").textContent()) ?? "";
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    // Until the owner allows it, the old device is still theirs.
    const fresh = await later.newPage();
    await pairWith(fresh, code, {
      from: page,
      title: new RegExp(` is asking to pair as ${noor.name}$`),
    });
    await fresh.getByTestId("you").click();
    await expect(fresh.getByLabel("Your name")).toHaveValue(noor.name);
    await expect(fresh.getByTestId("my-role")).toHaveText(/^Member/);

    // Done reads the list again: one device, the new one, and the old turned away.
    await panel.getByRole("button", { name: "Done" }).click();
    await expect(panel).toHaveCount(0);
    await expect(device).toHaveCount(1);
    await expect(device).not.toHaveAttribute("data-device", id);
    await turnedAway(theirs);
  } finally {
    await later.close();
    await context.close();
  }
});

test("N5: Sign out on a device of theirs signs it out, and it is turned away", async ({
  page,
  browser,
}) => {
  const { row, device, name, theirs, context } = await personWithADevice(page, browser);
  try {
    await device.getByRole("button", { name: `Sign out ${name}` }).click();
    await expect(row.getByTestId("person-no-devices")).toHaveText("No device signed in.");
    await turnedAway(theirs);
  } finally {
    await context.close();
  }
});
