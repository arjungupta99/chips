/**
 * M5.1's acceptance, end to end (ADR 0034): the owner makes an invite link from the app; a
 * second browser opens it, names itself (Priya) and joins as a member with a paired device;
 * the owner makes her an admin and her screen says so; she adds a passkey, signs out of that
 * browser, and comes back with the passkey alone — no code from anywhere.
 *
 * The passkey is a virtual authenticator over the Chrome DevTools Protocol, which is what
 * WebAuthn's own tests use: a real credential, a real signature, no hardware. Dana's browser is
 * at `localhost` rather than `127.0.0.1`: a passkey's relying-party id is a domain, and Chromium
 * refuses an IP address as one ("This is an invalid domain"), which is also what a person on the
 * server's own machine sees at `http://127.0.0.1` — the docs say to use `localhost` there.
 */

import { type CDPSession, expect, type Page, test } from "@playwright/test";
import { allowFrom, openInvite, pair, waysIn } from "./support.ts";

/** A platform authenticator that keeps a discoverable credential and says the person is there. */
async function virtualAuthenticator(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

test("an invite, a role, a passkey, and a way back", async ({ page, browser }) => {
  await pair(page);

  // The owner makes a single-use member invite from You.
  await page.getByTestId("you").click();
  await expect(page.getByTestId("my-role")).toHaveText(/^Owner/);
  // At 127.0.0.1 no passkey can work, so You does not offer one (ADR 0085); at localhost it does.
  await expect(page.getByTestId("devices")).toBeVisible();
  await expect(page.getByTestId("passkeys")).toHaveCount(0);
  await page.getByTestId("invite-someone").click();
  await page.getByRole("combobox", { name: "Invite role" }).selectOption("member");
  await page.getByTestId("make-invite").click();
  const url = (await page.getByTestId("invite-url").textContent()) ?? "";
  // The relay's page, since this server has a relay (ADR 0207).
  expect(url).toMatch(/\/join#invite=chips_inv_/);

  // Priya, not Dana: other specs register a Dana of their own in the same demo workspace.
  const danaContext = await browser.newContext();
  const danaPage = await danaContext.newPage();
  try {
    // Priya opens the link: it says where she is going and as what, and asks her name.
    await openInvite(danaPage, url.replaceAll("127.0.0.1", "localhost"));
    await expect(danaPage.getByRole("heading", { name: "Join Demo" })).toBeVisible();
    await expect(danaPage.getByTestId("join-role")).toContainText("as a member");
    await danaPage.getByLabel("Your name").fill("Priya Nair");
    await danaPage.getByRole("button", { name: "Join" }).click();
    // The link went out as the relay's page, so it asks (ADR 0232): Priya's page waits with six
    // digits, and the owner's asks with the same six until Allow.
    await expect(danaPage.getByRole("heading", { name: /^Waiting for / })).toBeVisible({
      timeout: 20_000,
    });
    await expect(danaPage.getByTestId("space-list")).toHaveCount(0);
    await allowFrom(page, danaPage, /^Priya Nair is asking to join /);
    await expect(danaPage.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
    await danaPage.getByTestId("you").click();
    await expect(danaPage.getByTestId("my-role")).toHaveText(/^Member/);
    // The name is the heading and the field at once (ADR 0085).
    await expect(danaPage.getByRole("textbox", { name: "Your name" })).toHaveValue("Priya Nair");

    // A single-use link is spent: the same link, opened in a browser that has no device yet, is
    // turned away. (Dana's own browser already has one, and goes straight to her spaces.)
    const stranger = await browser.newContext();
    try {
      const again = await stranger.newPage();
      await openInvite(again, url);
      // One answer for spent, withdrawn and expired, and what to do (JR-3).
      await expect(again.getByTestId("join-dead")).toContainText("This invite can't be used");
    } finally {
      await stranger.close();
    }

    // The owner sees her, and makes her an admin; her screen follows, and offers the admin's view.
    await page.getByTestId("people-row").click();
    const priya = page.getByTestId("person-row").filter({ hasText: "Priya Nair" });
    await expect(priya).toHaveAttribute("data-role", "member");
    await priya.click();
    await page
      .getByTestId("person-details")
      .getByRole("combobox", { name: "Priya Nair's role" })
      .selectOption("admin");
    // It asks first, saying what an admin may do (people review, Phase 1).
    const asking = page.getByTestId("confirm-dialog");
    await expect(asking.getByRole("heading")).toHaveText("Make Priya Nair an admin?");
    await asking.getByTestId("confirm-go").click();
    await page.getByRole("button", { name: "‹ People" }).click();
    await expect(priya).toHaveAttribute("data-role", "admin");
    await expect(danaPage.getByTestId("my-role")).toHaveText(/^Admin/);
    await expect(danaPage.getByTestId("people-row")).toBeVisible();
    // Only an owner invites (ADR 0034's addendum of 14 October 2026).
    await expect(danaPage.getByTestId("invite-someone")).toHaveCount(0);

    // Priya adds a passkey, signs out of this browser, and comes back with the passkey alone.
    await virtualAuthenticator(danaPage);
    await danaPage.getByTestId("add-passkey").click();
    await expect(danaPage.getByTestId("passkey-row")).toHaveCount(1, { timeout: 10_000 });
    await danaPage.getByTestId("sign-out").click();
    // Signed out of the only workspace here: the first screen, and the ways in from That's Chips.
    await waysIn(danaPage);
    await expect(danaPage.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
    await danaPage.getByTestId("sign-in-passkey").click();
    await expect(danaPage.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
    await danaPage.getByTestId("you").click();
    // The name is the heading and the field at once (ADR 0085).
    await expect(danaPage.getByRole("textbox", { name: "Your name" })).toHaveValue("Priya Nair");
    await expect(danaPage.getByTestId("my-role")).toHaveText(/^Admin/);
    // Two devices now: the one that signed out is gone, and the one the passkey paired is here.
    const devices = danaPage.getByTestId("device-row");
    await expect(devices).toHaveCount(1);
    await expect(devices.first()).toHaveAttribute("data-current", "true");
  } finally {
    await danaContext.close();
  }
});
