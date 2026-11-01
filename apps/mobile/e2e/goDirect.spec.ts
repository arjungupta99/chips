/**
 * Go direct (ADR 0211, Phases 2 and 3) on a phone: an owner whose server is on a tailnet opens the
 * guide from Connection while on the relay; it names the tailnet, waits on Tailscale, goes green
 * when the server's own address answers, and goes by itself. A member asks an owner first; the
 * owner shares, and the guide hands them the invite and then waits on Tailscale the same way.
 *
 * The suite's server is given a tailnet name the browser resolves to this machine, so the phone is
 * paired at a `*.ts.net` address, as Arjun's is. The browser refuses the server's door until the
 * spec lets it through: Tailscale off, then on.
 */

import { getJson, postJson } from "@chipschat/core";
import { expect, type Page, test } from "@playwright/test";
import {
  allowAsIssuer,
  payload,
  registerPerson,
  relayStats,
  SERVER_PORT,
  specDevice,
} from "./support.ts";

const TAILNET = `http://chips-e2e.tail0e2e.ts.net:${SERVER_PORT}`;
test.use({
  launchOptions: { args: ["--host-resolver-rules=MAP chips-e2e.tail0e2e.ts.net 127.0.0.1"] },
});

/**
 * The app paired at the tailnet address through the relay, with the server's door shut until the
 * spec says Tailscale is on, and Connection open. Returns the switch.
 */
async function onTheRelay(page: Page, code?: string) {
  await expect.poll(async () => (await relayStats()).servers, { timeout: 20_000 }).toBe(1);
  const tailscale = { on: false };
  await page.routeWebSocket(/\/v1\/tunnel$/, (door) => {
    if (tailscale.on) door.connectToServer();
    else door.close();
  });
  const offer = await payload(TAILNET, code);
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill(offer);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  // The code asks, since it went out with the relay: its maker allows it (ADR 0232).
  await allowAsIssuer(page);
  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: /^Connection, Relay/ }).click({ timeout: 30_000 });
  return tailscale;
}

test("the guide waits on Tailscale, goes green when the server answers, and goes", async ({
  page,
}, testInfo) => {
  const tailscale = await onTheRelay(page);

  await page.getByRole("button", { name: /^Go direct/ }).click();
  const sheet = page.getByTestId("go-direct-sheet");
  await expect(sheet).toContainText("is in tail0e2e. Sign in to the same one.");
  await expect(sheet).toContainText("to answer directly…");
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("go-direct-waiting.png") });

  // Tailscale on: the guide's own checks find the door, and every step goes green.
  tailscale.on = true;
  await expect(sheet).toContainText("answered directly. Moving over…", { timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("go-direct-answered.png") });
  await expect(page.getByTestId("go-direct-step-3")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("connection-path")).toHaveText("Direct");
  await expect(page.getByRole("button", { name: /^Go direct/ })).toHaveCount(0);
  await expect(page.getByTestId("connection-words")).toContainText("over Tailscale");
});

test("a member asks an owner, is handed the invite, and goes direct (Phase 3)", async ({
  page,
}, testInfo) => {
  const dana = await registerPerson("Dana");
  // The owner's other device, which answers as the owner's sheet would.
  const owner = await specDevice();
  // Dana's code pairs the spec's device as Dana, and the payload it mints pairs the app as Dana.
  const tailscale = await onTheRelay(page, dana.code);

  await page.getByRole("button", { name: /^Go direct/ }).click();
  const sheet = page.getByTestId("go-direct-sheet");
  await expect(sheet).toContainText("Chips asks the owners to share");
  await sheet.getByRole("button", { name: "Ask an owner" }).click();
  await expect(page.getByTestId("go-direct-step-1")).toContainText("You'll hear when it's shared.");
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("go-direct-guest-asked.png") });

  // The owner sees it waiting, with Dana's round trip, and shares.
  const waiting = await getJson<{
    asks: { ask_id: string; participant_id: string; trip_ms: number | null }[];
  }>(owner, "/v1/direct-asks");
  const ask = waiting.asks.find((each) => each.participant_id === dana.id);
  expect(ask?.trip_ms).toBeGreaterThan(0);
  const link = "https://login.tailscale.com/admin/invite/e2e";
  await postJson(owner, `/v1/direct-asks/${ask?.ask_id}/share`, { link, keep: false });

  // The guide reads the ask again while it waits: ticked, and the invite to open.
  await expect(page.getByTestId("go-direct-step-1")).toContainText("shared it.", {
    timeout: 10_000,
  });
  await expect(sheet.getByRole("button", { name: "Open the invite" })).toBeVisible();
  await expect(page.getByTestId("go-direct-step-3")).toContainText("to answer directly…");
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("go-direct-guest-shared.png") });

  // Tailscale on, at the owner's name: direct, and the owner's ask says so.
  tailscale.on = true;
  await expect(sheet).toContainText("answered directly. Moving over…", { timeout: 10_000 });
  await expect(page.getByTestId("connection-path")).toHaveText("Direct", { timeout: 10_000 });
  await expect
    .poll(
      async () => (await getJson<{ state: string }>(owner, `/v1/direct-asks/${ask?.ask_id}`)).state,
    )
    .toBe("direct");
});
