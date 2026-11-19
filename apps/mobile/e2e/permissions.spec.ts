/**
 * A harness's Permissions on the phone (ADR 0300), end to end: a new harness's ask comes to the
 * person with no snooze on it, since its Chips's rules start off. On its Chips's rules page they
 * turn on and Chips stops asking for an hour: the next ask goes ahead on Chips's yes and the room
 * says so in a plain line, but `rm` still comes to the person. Ask again brings the asks back.
 *
 * Its own harness and room, so the demo room's policy is left as the other specs find it.
 */

import { expect, type Page, test } from "@playwright/test";
import { demo, Harness, newApprovalId, newRunId, pair, registerSpecialist } from "./support.ts";

const asks = (page: Page) => page.getByTestId("room-asks");

/** The frame that answers an ask, from anybody. */
function answered(frame: Record<string, unknown>, approvalId: string): boolean {
  const event = frame["event"] as Record<string, unknown> | undefined;
  return event?.["type"] === "approval.resolved" && event["approval_id"] === approvalId;
}

test("Chips's rules off, then on with Stop asking, rm still asks, and Ask again", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sorrel = await registerSpecialist("Marlow");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: sorrel.token, space: sorrel.space });
  const run = async (command: string) => {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "garden.shell", input: { command } },
      question: `Run ${command}?`,
      risk: [],
      expires_in: 3600,
    });
    return approvalId;
  };
  const answer = async (approvalId: string) =>
    (await harness.waitFor((frame) => answered(frame, approvalId), "its answer"))[
      "event"
    ] as Record<string, unknown>;
  const openRoom = async () => {
    await page.goto(`/spaces/${sorrel.space}`);
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
  };

  try {
    await harness.send("run.started", { goal: "Sort the seeds.", plan: [] });
    await openRoom();

    // Off for a new harness: opened whole, the ask has no snooze, and Approve is once.
    const first = await run("ls seeds");
    await expect(asks(page).getByText("Marlow asks").last()).toBeVisible({ timeout: 20_000 });
    await asks(page).getByRole("button", { name: "Details" }).last().click();
    await expect(page.getByTestId("decide-snooze")).toHaveCount(0);
    await page.getByTestId("approve").click();
    expect(await answer(first)).toMatchObject({ decision: "approved", scope: "once" });

    // Its Permissions (the shelf's way there is harnessShelf.spec's): Chips's rules are off, and
    // turn on on their own page; then Stop asking for an hour.
    await page.goto(`/harnesses/${sorrel.id}/asks`);
    await expect(page.getByTestId("permissions")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("perms-chips-row")).toContainText("Off");
    await page.getByTestId("perms-chips-row").click();
    const chips = page.getByTestId("perms-chips");
    await expect(chips.getByTestId("perms-off-foot")).toBeVisible();
    await chips.getByTestId("perms-switch").click();
    expect((await harness.next("policy.updated"))["policy"]).toMatchObject({ chips_rules: true });
    await chips.getByTestId("perms-stop").click();
    await chips.getByTestId("perms-stop-len-1h").click();
    const held = await harness.next("policy.updated");
    expect(held["policy"]).toMatchObject({ hold: { by: demo().person.id } });
    await expect(chips.getByTestId("perms-ask-again")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("chips-rules.png"), fullPage: true });

    // The next goes ahead on Chips's yes, and the room says so in a plain line.
    await openRoom();
    const second = await run("cat seeds/list.txt");
    expect(await answer(second)).toMatchObject({
      decision: "approved",
      resolved_by: "system",
      reason: expect.stringMatching(/^its asks are off/),
    });
    const bands = page.getByTestId("hold-bands");
    await expect(bands).toContainText(/Chips is saying yes for Marlow until /, { timeout: 20_000 });
    await page.screenshot({ path: test.info().outputPath("hold-band.png") });

    // Never the pause's list: rm still comes to the person.
    await run("rm seeds/old.txt");
    await expect(asks(page).getByText("Marlow asks").last()).toBeVisible({ timeout: 20_000 });

    // Ask again: the hold goes, the line with it.
    await bands.getByTestId("hold-band-resume").click();
    expect((await harness.next("policy.updated"))["policy"]).toMatchObject({ hold: null });
    await expect(bands).toHaveCount(0);
  } finally {
    harness.close();
  }
});
