/**
 * Pair a computer by a link (ADR 0210), against a real server, a real relay and real browsers.
 *
 * 20 October 2026: You → Pair a computer on Arjun's phone said to "choose adas-mac-mini.tail…",
 * a tailnet name the Mac's list of servers never shows, and a code typed by hand carries no relay.
 * Now a code comes with a link to the relay's `/pair` page, which opens on any network:
 *
 * - P1: the link from You → Devices opens at the relay's page in a fresh browser, shows the same
 *   code, and Pair in this browser asks: the computer waits with six digits, and the page that
 *   made the code allows it with the same six (ADR 0232), without anybody typing.
 * - P2: a link whose code has run out says so at the relay, before anyone presses anything.
 * - P3: the link tapped on a phone says it is for a computer, and offers to copy it.
 */

import { expect, test } from "@playwright/test";
import { allowFrom, pair, RELAY_PORT } from "./support.ts";

/** A code for the next device, from You → Devices: its code and the computer's link. */
async function issue(
  page: import("@playwright/test").Page,
): Promise<{ code: string; link: string }> {
  await page.getByTestId("you").click();
  await page.getByTestId("issue-code").click();
  const code = (await page.getByTestId("pairing-code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  const link = (await page.getByTestId("pair-link").textContent()) ?? "";
  return { code, link };
}

test("P1: the link opens at the relay's page, shows the code, and pairs a fresh browser", async ({
  page,
  browser,
}) => {
  await pair(page);
  const { code, link } = await issue(page);
  expect(link.startsWith(`http://127.0.0.1:${RELAY_PORT}/pair#pair=${code}&v=1&lan=`)).toBe(true);
  await expect(page.getByTestId("pair-computer-link")).toContainText("It opens on any network.");
  const before = await page.getByTestId("device-row").count();

  const elsewhere = await browser.newContext();
  const computer = await elsewhere.newPage();
  try {
    await computer.goto(link);
    await expect(computer.getByRole("heading", { name: "Pair this computer" })).toBeVisible();
    // The code the phone shows, so the person can see the two match.
    await expect(computer.locator("#code")).toHaveText(code);
    await expect(computer.locator("#life")).toHaveText(/^1[45] more minutes, once$/);
    await expect(computer.getByRole("link", { name: "Open in Chips" })).toHaveAttribute(
      "href",
      new RegExp(`^chips://pair\\?pair=${code}&v=1&lan=`),
    );
    await computer.getByRole("link", { name: "Pair in this browser" }).click();
    // The server's own page uses the code in its address at once (ADR 0121), and the code asks
    // its maker, since it went out as the relay's page (ADR 0232).
    await expect(
      computer.getByRole("heading", { name: "Waiting for your other device" }),
    ).toBeVisible({ timeout: 20_000 });
    await allowFrom(page, computer, / is asking to pair as you$/);
    await expect(computer.getByTestId("space-list")).toBeVisible({ timeout: 20_000 });
  } finally {
    await elsewhere.close();
  }

  // The owner's list has the new device the next time it is read.
  await page.reload();
  await page.getByTestId("you").click();
  await expect(page.getByTestId("device-row")).toHaveCount(before + 1, { timeout: 20_000 });
});

test("P2: a link whose code has run out says so at the relay", async ({ page, browser }) => {
  await pair(page);
  const { link } = await issue(page);
  const ranOut = new URL(link);
  const fields = new URLSearchParams(ranOut.hash.slice(1));
  fields.set("until", String(Math.floor(Date.now() / 1000) - 60));
  ranOut.hash = fields.toString();

  const elsewhere = await browser.newContext();
  const computer = await elsewhere.newPage();
  try {
    await computer.goto(ranOut.toString());
    await expect(computer.getByRole("heading", { name: "This code has run out" })).toBeVisible();
    await expect(computer.getByText(/send a new link/)).toBeVisible();
    await expect(computer.getByRole("link", { name: "Open in Chips" })).toBeHidden();
  } finally {
    await elsewhere.close();
  }
});

test("P3: the link tapped on a phone says it is for a computer", async ({ page, browser }) => {
  await pair(page);
  const { code, link } = await issue(page);
  const phoneContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  });
  const phone = await phoneContext.newPage();
  try {
    await phone.goto(link);
    await expect(phone.getByText("This link is for a computer.")).toBeVisible();
    await expect(phone.locator("#code")).toHaveText(code);
    await expect(phone.getByRole("button", { name: "Copy the link" })).toBeVisible();
    await expect(phone.getByRole("link", { name: "Pair in this browser" })).toBeHidden();
  } finally {
    await phoneContext.close();
  }
});
