/**
 * A face a person chooses for a space, end to end on the phone's web target (22 September 2026):
 * picked in the sheet from the doubled library on one of the grounds added on 26 September,
 * saved to the server, worn by the row in the list as folded paper on its lit ground, worn again
 * by a lane's row in a room, where the room it crosses to is the room with that face, and put
 * back to the default.
 */
import { expect, test } from "@playwright/test";
import { demo, Harness, newLaneId, newRunId, pair } from "./support.ts";

test("a chosen mark is paper in the sheet and the list, and a lane's row wears it for its room", async ({
  page,
}, testInfo) => {
  await pair(page);
  await page.getByRole("tab", { name: "Spaces" }).click();
  const row = page.getByRole("button", { name: /PO-4471/ }).first();
  // A long press is how the sheet is reached; held past the press's own delay.
  await row.click({ delay: 900 });
  await expect(page.getByTestId("icon-sheet")).toBeVisible();

  // One of the fifteen grounds added on 26 September 2026, which a server before them refused.
  const navy = page.waitForResponse(
    (answer) => answer.url().includes("/v1/me/space-icons/") && answer.request().method() === "PUT",
  );
  await page.getByRole("radio", { name: "Navy" }).click();
  expect((await navy).status()).toBe(200);

  // One of the 84 new marks. Unchosen cells are ink on the cell; the chosen one is lit.
  const lighthouse = page.getByTestId("mark-lighthouse");
  await lighthouse.scrollIntoViewIfNeeded();
  await expect(lighthouse.locator("linearGradient")).toHaveCount(0);
  await lighthouse.click();
  await expect(lighthouse.locator("linearGradient")).toHaveCount(1);
  expect(await lighthouse.locator("path").count()).toBeGreaterThan(3);
  await page.screenshot({ path: testInfo.outputPath("sheet.png") });
  await page.getByTestId("icon-sheet-close").click();
  await expect(page.getByTestId("icon-sheet")).toBeHidden();

  // The row wears it: the initials gone, the paper in their place.
  await expect(row.locator("linearGradient")).toHaveCount(1);
  expect(await row.locator("path").count()).toBeGreaterThan(3);
  await page.screenshot({ path: testInfo.outputPath("list.png") });

  // A lane at home in that room: its route row is the room it crosses to, in the chosen face.
  const details = demo();
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Check the lamp" });
    expect(
      await harness.send("task", {
        task_id: newLaneId(),
        to: details.harness.id,
        home: details.space_id,
        label: "Keeper",
        goal: "Is the lamp lit?",
        on_behalf_of: details.person.id,
      }),
    ).toMatchObject({ frame: "ack" });
    // The row itself, rather than the room found by its name: the sheet's head says it too.
    await row.click();
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
    const face = page.getByTestId("lane-face").last();
    await expect(face).toBeAttached();
    await expect(face.locator("linearGradient")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("room.png") });
    // Finish the lane, so the room the next spec opens holds nothing of this one still going.
    const requested = await harness.next("run.requested");
    expect(
      await harness.send("run.completed", { run_id: requested["run_id"], summary: "Lit." }),
    ).toMatchObject({ frame: "ack" });
  } finally {
    harness.close();
  }

  // And back to the default. The server answers that with no content, which the app used to
  // read as JSON: the reset threw, was taken back, and the sheet said "not saved: JSON Parse
  // error" (Arjun, 26 September 2026).
  await page.goBack();
  await row.click({ delay: 900 });
  await expect(page.getByTestId("icon-sheet")).toBeVisible();
  const reset = page.waitForResponse(
    (answer) =>
      answer.url().includes("/v1/me/space-icons/") && answer.request().method() === "DELETE",
  );
  const fallback = page.getByRole("button", { name: "Use the default" });
  await fallback.scrollIntoViewIfNeeded();
  await fallback.click();
  expect((await reset).status()).toBe(204);
  await page.getByTestId("icon-sheet-close").click();
  await expect(page.getByTestId("icon-sheet")).toBeHidden();
  await expect(page.getByTestId("icon-failed")).toHaveCount(0);
  await expect(row.locator("linearGradient")).toHaveCount(0);
});
