/**
 * Asks so far (ADR 0255), end to end on the phone: Scout asks in the demo room and is answered on
 * its card; on Scout's page When it asks you keys its dots, a tap on them pushes every ask, the ask
 * opens whole with the answer and when it came, and Open in its space goes back to the room.
 *
 * The demo workspace is shared by every spec, so Scout's other asks are on the page too: the test
 * finds its own by id.
 */

import { expect, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, pair } from "./support.ts";

test("the dots open every ask, and an ask opens whole with its space a tap away", async ({
  page,
}) => {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Check the beds.", plan: [] });
    await page.getByRole("tab", { name: "Spaces" }).click();
    await page.getByRole("button", { name: /PO-4471/ }).click();
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
    // One that matters, so it waits for a person: the demo room's level lets a smaller one
    // through on the spot (ADR 0195).
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "garden.weed", input: { bed: 4 }, irreversible: true },
      question: "Pull the weeds in `bed 4`?",
      risk: ["irreversible"],
      expires_in: 3600,
    });
    const asks = page.getByTestId("room-asks");
    await expect(asks.getByText("Pull the weeds in")).toBeVisible({ timeout: 20_000 });
    await asks.getByRole("button", { name: "Approve" }).last().click();
    await harness.next("approval.resolved");

    // Out of the room, whose screen stands over the tabs.
    await page.goBack();
    await page.getByRole("tab", { name: "Agents" }).click();
    await page
      .getByTestId("harness-shelf")
      .getByRole("button", { name: "Scout", exact: true })
      .click();
    await page.getByTestId("harness-asks-row").click();
    const dots = page.getByTestId("asking-history");
    await expect(dots).toContainText(/^Asks so farSee all/);
    await expect(page.getByTestId("asking-key")).toContainText(/\d+ yes/);
    await dots.click();

    const row = page.getByTestId(`ask-row-${approvalId}`);
    await expect(row).toContainText("Pull the weeds in bed 4?");
    await expect(row).toContainText("You said yes · Scout in PO-4471");
    await expect(page.getByText("Today").first()).toBeVisible();
    await row.click();

    await expect(page.getByTestId("answered-verdict")).toHaveText(
      /^You said yesAt \d{1,2}:\d\d [AP]M, under a minute after Scout asked\.$/,
    );
    await page.getByTestId("answered-open").click();
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
  } finally {
    harness.close();
  }
});
