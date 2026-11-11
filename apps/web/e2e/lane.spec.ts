/**
 * M3.2's acceptance: a lead routes work to a specialist, and the one lane shows two ways — the
 * route card in the lead's chat, the task card in the specialist's home — with the specialist's
 * reply and cost coming back to the lead. Scout routes a finance question to Ledger, the
 * blueprint's own example (Lead and lanes). Both harnesses are played by the test over their own
 * sockets; the lane is opened by the real server, not seeded. Then a person cancels a lane from
 * the route card while the specialist is still on it (M3.5): the specialist is told to stop, and
 * the lead hears the lane end, which `route.spec.ts` proved with the sample harnesses until they
 * were withdrawn (ADR 0188).
 */

import { expect, test } from "@playwright/test";
import {
  demo,
  eventType,
  type Frame,
  Harness,
  newLaneId,
  newRunId,
  pair,
  registerSpecialist,
} from "./support.ts";

test("a lead routes a task to a specialist: one lane, two views, and the cost rolls up", async ({
  page,
}) => {
  await pair(page);
  const scout = await Harness.connect(newRunId());
  const ledger = await registerSpecialist("Ledger");
  // Ledger is listening before the task is routed, so it hears `run.requested` live: subscribe
  // streams what comes next, and the lane is opened after it connects.
  const ledgerHarness = await Harness.connect(newRunId(), {
    token: ledger.token,
    space: ledger.space,
  });
  try {
    // Scout is working: a run, so the lane's trail carries the lead's own hop.
    await scout.send("run.started", { goal: "Get PO #4471 confirmed with Northwind." });

    // Scout routes the finance question to Ledger. On the server this becomes a lane.
    const laneId = newLaneId();
    const routed = await scout.send("task", {
      task_id: laneId,
      to: ledger.id,
      on_behalf_of: demo().person.id,
      goal: "Are the Northwind quotes in line with last quarter?",
      constraints: ["Use the finance warehouse, not the CRM"],
      link_to: demo().space_id,
    });
    expect(routed).toMatchObject({ frame: "ack" });

    // The lead's view: the route card in PO-4471, routed to Ledger, with the goal.
    const route = page.getByTestId("route-card");
    await expect(route).toBeVisible();
    await expect(route).toContainText("Ledger");
    await expect(route).toContainText("Are the Northwind quotes");

    // The specialist's view: the task card in Ledger's home, with the trail and the constraint.
    await page
      .getByTestId("space-list")
      .getByRole("button", { name: /Ledger/ })
      .click();
    const task = page.getByTestId("task-card");
    await expect(task).toBeVisible();
    await expect(task).toContainText("Scout → Ledger");
    await expect(task).toContainText("Are the Northwind quotes");
    await expect(task).toContainText("Use the finance warehouse");

    // Ledger works the lane: it learns its run from `run.requested`, replies once, and finishes.
    const requested = await ledgerHarness.event("run.requested");
    expect(requested).toMatchObject({ lane_id: laneId, specialist_id: ledger.id });
    ledgerHarness.runId = String(requested["run_id"]);
    const answer = "Northwind's unit price is 4 percent under last quarter's average.";
    await ledgerHarness.send("message.post", { text: answer });
    const spent = await ledgerHarness.send("usage", {
      scope: "run",
      model: "claude-opus-4-8",
      input_tokens: 900,
      output_tokens: 120,
      cost: { usd: 0.03, estimated: true },
    });
    expect(spent).toMatchObject({ frame: "ack" });
    await ledgerHarness.send("run.completed", { summary: answer });

    // Back in the lead's chat, the route card carries the news: the reply, unfolded, and the cost.
    await page
      .getByTestId("space-list")
      .getByRole("button", { name: /PO-4471/ })
      .click();
    await expect(route.getByTestId("lane-reply")).toContainText("4 percent under");
    // Finished, and saying no Done (ADR 0151): the reply is what says so.
    await expect(route.getByText("Done", { exact: true })).toHaveCount(0);
    // What the lane cost is the route card's: the lead's run panel, which totalled it beneath the
    // run's own, went with the panel (ADR 0293).
    await expect(route).toContainText("$0.03");
  } finally {
    scout.close();
    ledgerHarness.close();
  }
});

test("a person cancels a lane from the route card, and both harnesses hear it", async ({
  page,
}) => {
  await pair(page);
  const scout = await Harness.connect(newRunId());
  // A specialist of its own, so the route card is found by its name and not by the lane above.
  const tally = await registerSpecialist("Tally");
  const tallyHarness = await Harness.connect(newRunId(), {
    token: tally.token,
    space: tally.space,
  });
  try {
    await scout.send("run.started", { goal: "Check the Northwind quotes." });
    const laneId = newLaneId();
    const routed = await scout.send("task", {
      task_id: laneId,
      to: tally.id,
      on_behalf_of: demo().person.id,
      goal: "Are the Northwind quotes in line with last quarter?",
      link_to: demo().space_id,
    });
    expect(routed).toMatchObject({ frame: "ack" });

    // The specialist takes the lane up, and is still on it when the person cancels.
    const requested = await tallyHarness.event("run.requested");
    tallyHarness.runId = String(requested["run_id"]);
    await tallyHarness.send("run.status", {
      phase: "thinking",
      verb_phrase: "Comparing quarters…",
    });
    const route = page.locator(`[data-testid="route-card"][data-lane="${laneId}"]`);
    const cancel = route.getByRole("button", { name: "Cancel the lane to Tally" });
    await expect(cancel).toBeVisible();
    await cancel.click();

    // The specialist's run is told to stop, by the person; the lead hears the lane end, and the
    // route card says so and offers no Cancel any more.
    const stop = await tallyHarness.event("run.cancel");
    expect(stop).toMatchObject({ run_id: tallyHarness.runId });
    const ended = await scout.waitFor(
      (frame) =>
        eventType(frame) === "lane.updated" && (frame["event"] as Frame)["state"] === "cancelled",
      "the lane, cancelled",
    );
    expect(ended["event"]).toMatchObject({ lane_id: laneId });
    await expect(route).toContainText("Failed");
    await expect(cancel).toHaveCount(0);
  } finally {
    scout.close();
    tallyHarness.close();
  }
});
