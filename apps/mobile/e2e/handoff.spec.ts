/** Regression for a long routing reply overflowing the phone with no way to scroll it. */
import { expect, test } from "@playwright/test";
import { demo, Harness, newLaneId, newRunId, openRoom, pair } from "./support.ts";

test("a long handoff keeps controls visible and restores the expanded request after reading", async ({
  page,
}) => {
  await pair(page);
  const details = demo();
  const harness = await Harness.connect(newRunId());
  const goal =
    Array.from(
      { length: 30 },
      (_, i) => `Constraint ${i}: preserve contrast and the source identity.`,
    ).join("\n") + "\nRequest end.";
  const summary =
    "Reply start.\n\n" +
    "A full paragraph describing the material, motion and color choices.\n\n".repeat(60) +
    "Reply end.";
  try {
    await harness.send("run.started", { goal: "Compare materials" });
    expect(
      await harness.send("task", {
        task_id: newLaneId(),
        to: details.harness.id,
        home: details.space_id,
        label: "Designer",
        goal,
        on_behalf_of: details.person.id,
        constraints: ["Keep the close control visible."],
      }),
    ).toMatchObject({ frame: "ack" });
    const requested = await harness.next("run.requested");
    expect(
      await harness.send("run.completed", { run_id: requested["run_id"], summary }),
    ).toMatchObject({ frame: "ack" });
    await openRoom(page);
    // Its own row, by the name it routes to: the demo room keeps other specs' lanes too.
    await page.getByTestId("route-card").filter({ hasText: "Designer" }).last().click();
    await expect(page.getByTestId(/^lane-.+-close$/)).toBeVisible();
    await page.getByRole("button", { name: "Request details", exact: true }).click();
    const body = page.getByTestId("lane-details-scroll");
    // Where the list stands as the press lands is what Back must give again, so it is read then
    // rather than once it is put at its end. The request, opened, makes the sheet taller, and the
    // sheet glides to its new height (ADR 0110); a click on a button still moving with it waits,
    // then scrolls the button into view itself, flush with the list's foot, 21 points short of
    // the end. Slow frames, as late in a whole run, made that the place left.
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const left = () => {
        (window as Left).leftAt = element.scrollTop;
      };
      document.addEventListener("pointerdown", left, { capture: true, once: true });
    });
    await page.getByRole("button", { name: "Read full reply" }).click();
    const position = Number(await page.evaluate(() => (window as Left).leftAt));
    expect(position).toBeGreaterThan(0);
    const reader = page.getByTestId("text-reader-scroll");
    await reader.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(reader.getByText("Reply end.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy text", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hide request details" })).toBeVisible();
    expect(await body.evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0);
    await page.getByTestId(/^lane-.+-close$/).click();
    await expect(page.getByTestId("composer")).toBeVisible();
  } finally {
    harness.close();
  }
});

/** The list's place as the press on Read full reply landed. */
type Left = Window & { leftAt?: number };
