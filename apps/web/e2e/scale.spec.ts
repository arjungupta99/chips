/**
 * Gate 1 review focus: performance with 1,000 messages and 20 harnesses. Twenty harnesses connect
 * through the SDK, each starts a run and posts fifty messages into the room while a paired
 * browser watches; then the browser pairs afresh against the whole log. The numbers are the
 * point — they go into the packet — and the bounds are ceilings, not targets.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { connect } from "@chipschat/harness";
import { expect, type Locator, test } from "@playwright/test";
import { demo, pair, SERVER } from "./support.ts";

const HARNESSES = 20;
const EACH = 50;

/**
 * Whether a room's line has come up its window: drawn, and none of it left under the window's
 * foot. Not whether it is in the viewport, as until 20 October 2026: an ask still open in the room
 * is drawn under its last row, and the specs that run first leave two (lighthouse's and
 * outsider's), which between them fill all but the window's top few pixels. The same as
 * `windowing.spec.ts` asks of its tall reply.
 */
async function upTo(messages: Locator, text: string): Promise<boolean> {
  const line = await messages
    .getByText(text, { exact: true })
    .boundingBox({ timeout: 1000 })
    .catch(() => null);
  const window = await messages.boundingBox();
  return line !== null && window !== null && line.y + line.height <= window.y + window.height;
}

test("twenty harnesses post a thousand messages, and a fresh pairing reads them back", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const details = demo();
  const before = await page.request.get(`${SERVER}/v1/health`);
  expect(before.ok()).toBe(true);

  // Twenty harnesses, made through the dev route so the person's key stays in the browser.
  const made = await page.request.post(`${SERVER}/v1/dev/harnesses`, {
    data: { count: HARNESSES, space_id: details.space_id },
  });
  expect(made.status()).toBe(201);
  const { harnesses } = (await made.json()) as {
    harnesses: { harness_id: string; token: string }[];
  };
  expect(harnesses).toHaveLength(HARNESSES);

  await pair(page);
  const messages = page.getByTestId("messages");
  const clients = await Promise.all(
    harnesses.map((each, index) =>
      connect({
        url: SERVER,
        token: each.token,
        client: { name: `load-${index}`, version: "0.0.0" },
      }),
    ),
  );
  try {
    const started = Date.now();
    const summaries = await Promise.all(
      clients.map(async (chips, index) => {
        const run = await chips.runs.start({
          spaceId: details.space_id,
          goal: `Load run ${index + 1}`,
        });
        for (let n = 1; n <= EACH; n += 1) {
          await chips.post({
            spaceId: details.space_id,
            text: `Harness ${index + 1}, message ${n} of ${EACH}`,
            runId: run.id,
          });
        }
        const summary = `Load run ${index + 1} done.`;
        const ack = await run.complete({ summary });
        return { summary, seq: ack.seq };
      }),
    );
    const posted = Date.now() - started;
    // The twenty finish in whatever order the server takes them, so the room's last line is the
    // summary it numbered last, not harness twenty's (1 October 2026: harness one finished last
    // twice, and harness twenty's last message was out of the windowed list's DOM).
    const last = summaries.reduce((a, b) => (b.seq > a.seq ? b : a)).summary;

    // The room's last line has come up the window: not only in the DOM, where the windowed list
    // keeps rows on either side of what is in view.
    await expect.poll(() => upTo(messages, last), { timeout: 60_000 }).toBe(true);
    const seen = Date.now() - started;
    test.info().annotations.push({
      type: "timing",
      description: `${HARNESSES * EACH} messages from ${HARNESSES} harnesses: posted in ${posted} ms, all on screen in ${seen} ms`,
    });
    expect(seen).toBeLessThan(90_000);

    // Twenty more harnesses on the Agents tab's shelf, and each with its checklist under its View
    // all (ADR 0185); the tab still answers.
    await page.getByRole("button", { name: /^Agents/ }).click();
    const shelf = page.getByTestId("harness-shelf");
    await expect(shelf.getByRole("button", { name: `Load harness ${HARNESSES}` })).toBeVisible({
      timeout: 30_000,
    });
    expect(await shelf.getByRole("button").count()).toBeGreaterThanOrEqual(HARNESSES + 1);
    await page.getByRole("button", { name: "View all harnesses" }).click();
    await expect(page.getByRole("region", { name: `Load harness ${HARNESSES}` })).toBeVisible();
    expect(await page.getByTestId("harness-card").count()).toBeGreaterThanOrEqual(HARNESSES + 1);
    await page.getByRole("button", { name: "Spaces" }).click();

    // A fresh pairing — a new context, so a new device key — replays the whole log: the exit
    // budget is seconds, not minutes.
    const fresh = await browser.newContext();
    const again = await fresh.newPage();
    const paired = Date.now();
    await pair(again);
    await expect
      .poll(() => upTo(again.getByTestId("messages"), last), { timeout: 60_000 })
      .toBe(true);
    const replay = Date.now() - paired;
    test.info().annotations.push({
      type: "timing",
      description: `fresh pairing against ${HARNESSES * EACH}+ messages: ${replay} ms to the last one`,
    });
    expect(replay).toBeLessThan(30_000);
    await fresh.close();
    mkdirSync("reports", { recursive: true });
    writeFileSync(
      "reports/scale.json",
      JSON.stringify(
        {
          harnesses: HARNESSES,
          messages: HARNESSES * EACH,
          postedMs: posted,
          onScreenMs: seen,
          freshPairingMs: replay,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const chips of clients) chips.close();
  }
});
