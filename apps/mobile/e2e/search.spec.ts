/**
 * The Search tab (ADR 0132), on the web target against the suite's own chipsd: a room found by
 * its name, a line found by a word said in it, and the line's room opened at that line, lit, with
 * the word marked in it for a moment (ADR 0133). What the keyboard does, and the landing's
 * motion, are the simulator walk's to look at.
 */

import { expect, test } from "@playwright/test";
import { Harness, newRunId, pair } from "./support.ts";

/** A word nothing else in the suite says, so the one line found is this spec's. */
const WORD = "quillwort";

test("finds a room by name and a line by a word, and opens the room at that line, marked", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Say where it is.", plan: [] });
    await harness.send("message.post", { text: `The ${WORD} cuttings are on the second shelf.` });
    await harness.send("run.completed", { summary: "Said." });
  } finally {
    harness.close();
  }

  await page.getByRole("tab", { name: "Search" }).click();
  const field = page.getByTestId("search");
  await expect(field).toBeVisible();
  await expect(page.getByText("Spaces, agents, and anything said in them.")).toBeVisible();

  // The demo room, by a word of its name, found on the phone with what was typed marked.
  await field.fill("4471");
  const room = page.locator('[data-testid^="result-space-"]').filter({ hasText: "PO-4471" });
  await expect(room).toBeVisible();
  await expect(room.getByTestId("mark")).toHaveText("4471");

  // The line, by the start of a word said in it, from the server.
  await field.fill(WORD.slice(0, 6));
  const line = page.locator('[data-testid^="result-message-"]').filter({ hasText: "cuttings" });
  await expect(line).toBeVisible({ timeout: 20_000 });
  await expect(line.getByTestId("mark")).toHaveText(WORD);

  // Opened, it is the room at that line, lit for a moment, with the word searched for marked.
  await line.click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
  // The line that flashes, not the band that sweeps across it.
  const lit = page.locator('[data-testid^="flash-"]:not([data-testid="flash-sweep"])');
  await expect(lit).toBeVisible({ timeout: 20_000 });
  await expect(lit).toContainText("cuttings");
  await expect(lit.getByTestId("mark")).toHaveText(WORD);
  // And only for a moment: the marks go once the flash has.
  await expect(lit.getByTestId("mark")).toHaveCount(0, { timeout: 10_000 });
});
