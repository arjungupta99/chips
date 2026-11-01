/**
 * How long a cold pairing takes to reach the last line of a full log — the number M4.2 asks
 * for, measured where it can be measured on every commit.
 *
 * What this is: the fold, the socket, the paged replay (ADR 0043) and a browser cache, against
 * a thousand messages, in a phone-sized window running the phone's own bundle. What it is not:
 * a phone. The web target keeps core's IndexedDB rather than `expo-sqlite` (`cache/sqlite.web.ts`
 * says why), and loopback is not Wi-Fi. So this is the ceiling that guards the fold from
 * regressing, and the device number is taken by hand and recorded in STATUS.
 *
 * The bound is generous on purpose. A number that fails on a busy laptop teaches nobody
 * anything; a fold that has gone quadratic will blow through it by an order of magnitude.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { demo, Harness, newRunId, pair } from "./support.ts";

const MESSAGES = 1000;

test("a cold pairing reads a thousand messages back", async ({ browser }) => {
  test.setTimeout(240_000);
  const details = demo();
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Fill the log.", plan: [] });
    const filling = Date.now();
    for (let n = 1; n <= MESSAGES; n += 1) {
      await harness.send("message.post", { text: `Filler ${n} of ${MESSAGES}` });
    }
    const filled = Date.now() - filling;

    // A fresh context is a fresh device key and an empty cache: the whole log, from nothing.
    const cold = await browser.newContext();
    const phone = await cold.newPage();
    try {
      const started = Date.now();
      await pair(phone);
      await phone.getByRole("tab", { name: "Spaces" }).click();
      await phone.getByRole("button", { name: /PO-4471/ }).click();
      await expect(
        phone.getByTestId("space-lines").getByText(`Filler ${MESSAGES} of ${MESSAGES}`).first(),
      ).toBeVisible({ timeout: 60_000 });
      const replay = Date.now() - started;

      test.info().annotations.push({
        type: "timing",
        description: `${MESSAGES} messages posted in ${filled} ms; a cold pairing reached the last line in ${replay} ms`,
      });
      expect(replay).toBeLessThan(30_000);

      mkdirSync("reports", { recursive: true });
      writeFileSync(
        "reports/replay.json",
        JSON.stringify(
          { messages: MESSAGES, spaceId: details.space_id, postedMs: filled, replayMs: replay },
          null,
          2,
        ),
      );
    } finally {
      await cold.close();
    }
  } finally {
    harness.close();
  }
});
