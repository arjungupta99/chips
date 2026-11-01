/**
 * The room's motion, on the web target (11 September 2026): what the harness is doing is a
 * bubble at the foot of the room that goes the moment the answer lands; what was typed and not
 * sent is there again after a trip to the list; and the field is as tall as its words, one line
 * again once they are sent. The arrival and the exit are animations, which a browser standing
 * in for a phone runs on the JS driver; what is proved here is what is on screen at either end
 * of them, and the Maestro flows are where the motion itself is looked at.
 */

import { expect, type Page, test } from "@playwright/test";
import { Harness, newRunId, pair } from "./support.ts";

test.describe.configure({ mode: "serial" });

/** The golden room, from the Spaces tab. */
async function openRoom(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page
    .getByText(/PO-4471/)
    .first()
    .click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
}

test("what the harness is doing is a bubble in the room, gone the moment it answers", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await openRoom(page);
    await harness.send("run.started", { goal: "Find Tamar's hours.", plan: [] });

    // Before the harness has said anything: Thinking, and that it is reading the message — a
    // beat after the run began, which the wait covers (ADR 0147).
    const doing = page.getByTestId("doing");
    await expect(doing).toBeVisible({ timeout: 20_000 });
    await expect(doing).toHaveAttribute("aria-label", "Scout · Thinking · Reading the message");

    // Then what it is thinking, and the call in its hand, each held a beat before the next.
    await harness.send("run.status", { phase: "reading", verb_phrase: "Reading the map" });
    await expect(doing).toContainText("Reading the map");
    await harness.send("step.log", {
      step_id: "hours",
      status: "started",
      title: "web_search · Tamar hours",
      tool: "web_search",
    });
    // What kind of work, read off the tool, and what it looked for beside a glass.
    await expect(doing).toContainText("Searching the web");
    await expect(doing).toContainText("Tamar hours");
    await expect(doing).not.toContainText("web search");
    await expect(doing).toHaveAttribute("aria-label", "Scout · Searching the web · “Tamar hours”");

    // The answer lands with the run's end: the bubble is gone at once, and the answer stands
    // where it stood. The call is not under it — the receipt is not in the room (ADR 0050) —
    // but a press and hold away: the answer lifts, its menu says the run in one line, and What
    // the run did opens the receipt on a page of its own (ADR 0200).
    await harness.send("step.log", { step_id: "hours", status: "done", duration_ms: 640 });
    await harness.send("run.completed", { summary: "Tamar opens at seven." });
    await expect(page.getByText("Tamar opens at seven.").last()).toBeVisible();
    await expect(doing).toHaveCount(0);
    await expect(page.getByTestId("receipt")).toHaveCount(0);
    await page.getByText("Tamar opens at seven.").last().click({ delay: 700 });
    await expect(page.getByTestId("lift-card")).toContainText("What the run did");
    await page.getByTestId("lift-receipt").click();
    await expect(page.getByTestId("lift-card")).toHaveCount(0);
    await expect(page.getByTestId("receipt")).toContainText("1 step");
    await expect(page.getByTestId("receipt")).toContainText("web_search · Tamar hours");
    await page.getByTestId(/^line-pages-.+-close$/).click();
    await expect(page.getByTestId("receipt")).toHaveCount(0);
  } finally {
    harness.close();
  }
});

test("the field keeps a draft across a trip to the list, and is as tall as its words", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  await openRoom(page);
  const field = page.getByTestId("composer");
  const height = async () => (await field.boundingBox())?.height ?? 0;
  const oneLine = await height();

  // Three lines or so: the twin under the field measures them, and the field follows.
  const draft = "Half a thought, left here while something is checked in another room, ".repeat(2);
  await field.fill(draft);
  await expect.poll(height).toBeGreaterThan(oneLine + 10);

  // The room sits over the tabs; back to them, and in again: the words are where they were.
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Spaces" })).toBeVisible();
  await page
    .getByText(/PO-4471/)
    .first()
    .click();
  await expect(page.getByTestId("composer")).toHaveValue(draft, { timeout: 20_000 });

  // Sent: empty, and one line again.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("composer")).toHaveValue("");
  await expect.poll(height).toBeLessThan(oneLine + 10);
  await expect(page.getByText(draft.trim()).last()).toBeVisible({ timeout: 20_000 });
});
