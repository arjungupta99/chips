/**
 * Let it work (ADR 0281), end to end on the web: a harness at L1 asks to run a loop Chips can't
 * read, a person flips the switch over the card's choices and approves, and the harness is
 * answered once with `until_stopped`. Its next asks, a loop and an `rm` among them, are answered by
 * Chips on the spot; the room says so in a band under its name; Stop in the band ends it, and the
 * next ask comes to the person's card again.
 *
 * Its own harness and room, so the demo room's policy is left as the other specs find it. With
 * `CHIPS_E2E_SHOTS` set to a folder, it leaves a picture of each step there.
 */

import { expect, type Page, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, pair, registerSpecialist, runPanel } from "./support.ts";

/** The newest approval card in the room. */
const card = (page: Page) => page.getByRole("article", { name: /Approval/ }).last();

const SHOTS = process.env["CHIPS_E2E_SHOTS"];
const shot = async (page: Page, name: string) => {
  if (SHOTS !== undefined) {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });
  }
};

test("a yes until stopped lets the agent work without asking, and Stop brings its asks back", async ({
  page,
}) => {
  const juniper = await registerSpecialist("Juniper");
  await pair(page);
  const harness = await Harness.connect(newRunId(), {
    token: juniper.token,
    space: juniper.space,
  });
  const run = async (command: string) => {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "garden.shell", input: { command } },
      risk: [],
      expires_in: 3600,
    });
    return approvalId;
  };
  const answer = async (approvalId: string, by: string) =>
    (await harness.waitFor((frame) => answered(frame, approvalId), by))["event"] as Record<
      string,
      unknown
    >;

  try {
    await harness.send("run.started", { goal: "Read the bridge notes.", plan: [] });
    await page.getByTestId("space-list").locator(`[data-space="${juniper.space}"]`).click();
    const l1 = runPanel(page)
      .getByRole("group", { name: /Autonomy for/ })
      .getByLabel("L1 · Ask first");
    // Where a new harness starts; the dial reads L2 only until the run's policy has come.
    await expect(l1).toBeChecked();

    // A loop Chips can't read: no Always, but the hour and the switch are there.
    const loop = await run("for r in acp hermes; do head -30 $r/README.md; done");
    await expect(card(page).getByText("Always", { exact: true })).toHaveCount(0);
    await expect(card(page).getByText("For an hour", { exact: true })).toHaveCount(1);
    await shot(page, "1-card");
    await card(page)
      .getByRole("switch", { name: /Let Juniper work without asking/ })
      .click();
    await expect(card(page).getByText("For an hour", { exact: true })).toHaveCount(0);
    await expect(card(page).getByTestId("until-stopped")).toContainText(
      "Everything Juniper asks here goes ahead without a card until you stop it",
    );
    await shot(page, "2-switch-on");
    await card(page).getByRole("button", { name: "Approve and let it work" }).click();
    expect(await answer(loop, "the person's yes")).toMatchObject({
      decision: "approved",
      scope: "once",
      until_stopped: true,
    });

    // Every ask after it goes ahead on the spot, read or not, rm too; the room says so.
    for (const command of ["for f in *.md; do wc -l $f; done", "rm -rf build && ls"]) {
      expect(await answer(await run(command), "policy")).toMatchObject({
        decision: "approved",
        resolved_by: "system",
      });
    }
    const band = page.getByTestId("let-work-band");
    await expect(band).toHaveText(/^Juniper is working without asking\s*Stop$/);
    await shot(page, "3-band");

    // Stop: the band says so and goes, and the next ask comes to the card.
    await band.getByRole("button", { name: "Stop Juniper working without asking" }).click();
    await expect(band).toHaveText("Stopped. Juniper asks again from its next step.");
    await shot(page, "4-stopped");
    await expect(page.getByTestId("let-work-band")).toHaveCount(0, { timeout: 10_000 });
    await run("ls -la");
    await expect(card(page).getByRole("button", { name: "Approve once" })).toBeEnabled();
    await shot(page, "5-asks-again");
  } finally {
    harness.close();
  }
});

function answered(frame: Record<string, unknown>, approvalId: string): boolean {
  const event = frame["event"] as Record<string, unknown> | undefined;
  return event?.["type"] === "approval.resolved" && event["approval_id"] === approvalId;
}
