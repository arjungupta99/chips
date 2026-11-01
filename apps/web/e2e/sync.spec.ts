/**
 * M1.2's acceptance criteria for the core: two tabs stay in sync under a burst, and a reload
 * with the server unreachable shows cached history.
 *
 * Both tabs share one browser context — one paired device, one IndexedDB — the way two tabs of
 * one app do. The burst is 500 real messages from the harness over HTTP; both tabs subscribe to
 * the same workspace and must both catch up. Then the API is cut off and the page reloaded: the
 * app still loads, and the store folds what the cache holds, so the history is there without a
 * server.
 *
 * Each test pairs with a fresh code from the dev-mode endpoint, because a pairing code is
 * single use. The demo space is shared across tests, so assertions scope to the message
 * list and match message text exactly.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { pairingPage } from "./support.ts";

const DATA_DIR = process.env["CHIPS_E2E_DATA_DIR"];
if (DATA_DIR === undefined) throw new Error("run this through playwright.config.ts");
const DEMO_FILE = join(DATA_DIR, "demo.json");
const SERVER = `http://127.0.0.1:${process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432"}`;

interface Demo {
  workspace_id: string;
  space_id: string;
  harness: { id: string; token: string };
}

function demo(): Demo {
  return JSON.parse(readFileSync(DEMO_FILE, "utf8")) as Demo;
}

async function freshCode(): Promise<string> {
  const response = await fetch(`${SERVER}/v1/dev/pairing-code`, { method: "POST" });
  if (!response.ok) throw new Error(`pairing-code endpoint answered ${response.status}`);
  return ((await response.json()) as { code: string }).code;
}

/** Posts as the demo harness, and returns the `seq` the server gave the message. */
async function postMessage(text: string, key: string): Promise<number> {
  const { harness, space_id } = demo();
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${harness.token}`,
      "idempotency-key": key,
    },
    body: JSON.stringify({ type: "message.post", space_id, text }),
  });
  if (!response.ok) throw new Error(`post failed: ${response.status}`);
  return ((await response.json()) as { seq: number }).seq;
}

/** A burst of `count` messages, in chunks so the server is busy but not flooded with sockets. */
async function burst(count: number, tag: string): Promise<void> {
  for (let start = 0; start < count; start += 50) {
    const chunk = [];
    for (let i = start; i < Math.min(start + 50, count); i += 1) {
      chunk.push(postMessage(`${tag} message ${i}`, `${tag}-${i}`));
    }
    await Promise.all(chunk);
  }
}

async function pair(page: Page, timeout = 20_000): Promise<void> {
  await pairingPage(page);
  await page.getByLabel("Pairing code").fill(await freshCode());
  await page.getByRole("button", { name: "Pair" }).click();
  // A fresh pair replays the whole space, which the burst test grows to five hundred
  // messages. One render per frame keeps that well under a second; the timeout is a ceiling.
  const room = page.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
  await expect(room).toBeVisible({ timeout });
  await room.click();
}

/**
 * The path the interim review found slow: a fresh device pairing against a log the burst has
 * grown, which replays one socket message per event. With one render per frame it takes well
 * under a second; five seconds is a ceiling with room for a loaded machine, not the expectation.
 * Returns the time from Pair to the last message on screen, so a run records the number
 * (technical-plan 4.4).
 */
async function timeFreshPairing(browser: Browser, lastMessage: string): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await pairingPage(page);
  await page.getByLabel("Pairing code").fill(await freshCode());
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Pair" }).click();
  // PO-4471 by name, like `support.ts`'s own pairing helper: the shell opens the most recent
  // space, and which one that is depends on how far the replay has got when it first
  // renders — a Custom harness's direct room is a plausible answer for a moment.
  const room = page.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
  await expect(room).toBeVisible({ timeout: 5000 });
  await room.click();
  await expect(messageList(page).getByText(lastMessage, { exact: true })).toBeVisible({
    timeout: 5000,
  });
  const elapsed = Date.now() - startedAt;
  await context.close();
  return elapsed;
}

function messageList(page: Page): Locator {
  return page.getByTestId("messages");
}

/**
 * The highest `seq` the store's cache holds, which says the replay has reached a given event —
 * what a reload must find in the cache.
 */
function cachedHighestSeq(page: Page, workspaceId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open(`chips-cache:${id}`, 1);
        request.onsuccess = () => {
          try {
            const last = request.result
              .transaction("events", "readonly")
              .objectStore("events")
              .openCursor(null, "prev");
            last.onsuccess = () => resolve(Number(last.result?.key ?? 0));
            last.onerror = () => resolve(0);
          } catch {
            resolve(0);
          }
        };
        request.onerror = () => resolve(0);
      }),
    workspaceId,
  );
}

/**
 * How many rows say `text` once the list is scrolled to its end. The list is windowed (Phase 1
 * review, condition 1): a row past the window is not in the page at all, so a test that wants
 * the newest row after a reload puts the list at the end first, and asks again until it is.
 */
async function rowsAtTheEnd(page: Page, text: string): Promise<number> {
  const list = messageList(page);
  if ((await list.count()) === 0) return 0;
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  return await list.getByText(text, { exact: true }).count();
}

/** How many messages the store's cache says were sent and not yet answered. */
function cachedOutboxCount(page: Page, workspaceId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open(`chips-cache:${id}`, 1);
        request.onsuccess = () => {
          try {
            const held = request.result
              .transaction("meta", "readonly")
              .objectStore("meta")
              .get("outbox");
            held.onsuccess = () => resolve(Array.isArray(held.result) ? held.result.length : 0);
            held.onerror = () => resolve(0);
          } catch {
            resolve(0);
          }
        };
        request.onerror = () => resolve(0);
      }),
    workspaceId,
  );
}

/** Before the burst: this is about the outbox, and wants an ordinary room, not one of 500. */
test("a message taken back while it is held never goes at all", async ({ context }) => {
  const page = await context.newPage();
  await pair(page);

  await context.setOffline(true);
  await expect(page.getByTestId("connection")).toHaveText("Reconnecting…", { timeout: 15_000 });
  const text = `taken back ${Date.now()}`;
  await page.getByLabel(/^Message /).fill(text);
  await page.keyboard.press("Enter");
  await expect(messageList(page).getByText(text, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // Take it back. It leaves the screen and the cache's outbox with it.
  await messageList(page).getByTestId("discard").click();
  await expect(messageList(page).getByText(text, { exact: true })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect
    .poll(() => cachedOutboxCount(page, demo().workspace_id), { timeout: 15_000 })
    .toBe(0);

  // Back online: the socket opens and sends what is unanswered. This is not among it, and no
  // copy of it arrives from the server either.
  await context.setOffline(false);
  await expect(page.getByTestId("connection")).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await expect(messageList(page).getByText(text, { exact: true })).toHaveCount(0);
});

test("two tabs stay in sync under a 500-message burst", async ({ browser, context }) => {
  const errors: string[] = [];

  const first = await context.newPage();
  first.on("pageerror", (error) => errors.push(String(error)));
  await pair(first);

  // The second tab shares the device the first stored, so it needs no code of its own.
  const second = await context.newPage();
  second.on("pageerror", (error) => errors.push(String(error)));
  await second.goto("/");
  // Into PO-4471, where the burst goes, as the first tab went: the shell opens the most recent
  // space, which after the specs before this one is somebody else's room.
  const room = second.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
  await expect(room).toBeVisible({ timeout: 20_000 });
  await room.click();

  await burst(500, "burst");

  // The last message arriving means every one before it did too — the socket delivers in order.
  for (const page of [first, second]) {
    await expect(messageList(page).getByText("burst message 499", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  }

  // The two tabs show the same thing. Since the Phase 1 review's condition 1 the list is
  // windowed, so what they show is the rows in view rather than the whole log — the log behind
  // them is what the scrollbar measures, and it is as long as the burst made it.
  const rows = (page: Page) => messageList(page).locator(".msg");
  const [countFirst, countSecond] = [await rows(first).count(), await rows(second).count()];
  expect(countFirst).toBe(countSecond);
  expect(countFirst).toBeLessThan(200);
  const scrollable = await messageList(first).evaluate((el) => el.scrollHeight);
  expect(scrollable).toBeGreaterThan(500 * 24);

  // Nothing threw during the burst.
  expect(errors).toEqual([]);

  // And a fresh device pairing against the grown log sees all of it within seconds.
  const elapsed = await timeFreshPairing(browser, "burst message 499");
  // biome-ignore lint/suspicious/noConsole: the number is the point — a run records it, so a regression shows in CI's output
  console.log(`fresh pairing against a 500-message burst: ${elapsed} ms to the last one`);
});

test("a message typed while the connection is down goes when it is back", async ({ context }) => {
  const page = await context.newPage();
  await pair(page);

  // Pull the network. The socket drops, the header says so, and the composer still works.
  await context.setOffline(true);
  await expect(page.getByTestId("connection")).toHaveText("Reconnecting…", { timeout: 15_000 });
  const text = `sent while offline ${Date.now()}`;
  await page.getByLabel(/^Message /).fill(text);
  await page.keyboard.press("Enter");
  const line = messageList(page).getByText(text, { exact: true });
  await expect(line).toBeVisible();
  // Nothing can leave, so it reads as held rather than as sending, and may be taken back.
  await expect(messageList(page).getByTestId("waiting")).toHaveCount(1);
  await expect(messageList(page).getByTestId("discard")).toHaveCount(1);

  // Back online: the socket reconnects, the outbox is resent, and the server's copy of the
  // message streams back to replace the pending line (phase-1-interim-review finding 4).
  await context.setOffline(false);
  await expect(page.getByTestId("connection")).toHaveCount(0, { timeout: 15_000 });
  await expect(messageList(page).getByTestId("waiting")).toHaveCount(0, { timeout: 15_000 });
  await expect(messageList(page).getByTestId("pending")).toHaveCount(0, { timeout: 15_000 });
  await expect(line).toBeVisible();
  await expect(messageList(page).getByTestId("failed")).toHaveCount(0);
});

test("a message typed while the connection is down survives a reload", async ({ context }) => {
  const page = await context.newPage();
  await pair(page);
  // A message of this test's own, at the end of the log: once it is on screen the replay has
  // reached the end, and once the cache holds it the reload below finds the whole room rather
  // than the prefix a cut mid-replay would leave (which also left the list anchored mid-log,
  // where a windowed list does not render the newest row).
  const marker = `before the reload ${Date.now()}`;
  const markerSeq = await postMessage(marker, `reload-${Date.now()}`);
  await expect(messageList(page).getByText(marker, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() => cachedHighestSeq(page, demo().workspace_id), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(markerSeq);

  // The server is unreachable: the socket drops, and every try to get it back fails.
  await context.route("**/v1/**", (route) => route.abort());
  await context.setOffline(true);
  await expect(page.getByTestId("connection")).toHaveText("Reconnecting…", { timeout: 15_000 });
  await context.setOffline(false);
  const text = `typed before a reload ${Date.now()}`;
  await page.getByLabel(/^Message /).fill(text);
  await page.keyboard.press("Enter");
  await expect(messageList(page).getByTestId("waiting")).toHaveCount(1);
  // The store writes the outbox with its next flush; wait for it rather than race it.
  await expect
    .poll(() => cachedOutboxCount(page, demo().workspace_id), { timeout: 15_000 })
    .toBe(1);

  // Reload with the server still unreachable: the message is on screen again, still on its way
  // (found 5 September 2026: it used to be gone, having lived only in memory).
  await page.reload();
  await expect(page.getByTestId("space-list").getByRole("button", { name: /PO-4471/ })).toBeVisible(
    { timeout: 20_000 },
  );
  await expect.poll(() => rowsAtTheEnd(page, text), { timeout: 20_000 }).toBe(1);
  const line = messageList(page).getByText(text, { exact: true });
  await expect(line).toBeVisible();
  await expect(messageList(page).getByTestId("waiting")).toHaveCount(1);

  // The server is back: the socket opens, the message goes, and the server's copy replaces it.
  await context.unroute("**/v1/**");
  await expect(page.getByTestId("connection")).toHaveCount(0, { timeout: 20_000 });
  await expect(messageList(page).getByTestId("waiting")).toHaveCount(0, { timeout: 15_000 });
  await expect(messageList(page).getByTestId("pending")).toHaveCount(0, { timeout: 15_000 });
  await expect(line).toBeVisible();
  await expect(messageList(page).getByTestId("failed")).toHaveCount(0);
  await expect
    .poll(() => cachedOutboxCount(page, demo().workspace_id), { timeout: 15_000 })
    .toBe(0);
});

test("reloading with the server unreachable shows cached history", async ({ context }) => {
  const page = await context.newPage();
  await pair(page);

  // A message that is this test's alone, so what we assert on does not depend on another test.
  const marker = `offline history ${Date.now()}`;
  const markerSeq = await postMessage(marker, `offline-${Date.now()}`);
  await expect(messageList(page).getByText(marker, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // The store writes the cache in the background, so wait until it actually holds the marker
  // before pulling the network — otherwise the reload would race the replay, not test the cache.
  await expect
    .poll(() => cachedHighestSeq(page, demo().workspace_id), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(markerSeq);

  // Cut off the API — the app is cached by the browser, but the server is gone — and reload.
  await context.route("**/v1/**", (route) => route.abort());
  await page.reload();

  // Straight into the shell, no pairing screen, with the history the cache held.
  await expect(page.getByTestId("space-list").getByRole("button", { name: /PO-4471/ })).toBeVisible(
    { timeout: 20_000 },
  );
  await expect.poll(() => rowsAtTheEnd(page, marker), { timeout: 15_000 }).toBe(1);

  await context.unroute("**/v1/**");
});
