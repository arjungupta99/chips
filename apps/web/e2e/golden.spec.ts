/**
 * M1.3's acceptance criterion: the golden scenario's events produce exactly the expected UI
 * states (technical-plan Appendix A), asserted step by step. The harness here is played by the
 * test itself over a raw socket — one event at a time, with the browser checked after each —
 * rather than as a whole run on the SDK, whose timing is its own; `approval-loop.spec.ts` keeps
 * that as the demo-script proof (`golden-run.ts`).
 *
 * Step 1 of the scenario, the attachment, is M1.5's. Steps 2 to 8 are here, followed by what
 * M1.3 adds: a person pausing, steering and stopping a run, and the harness hearing each.
 *
 * Since ADR 0293 there is no Run panel beside the room: a run is seen working by its thinking
 * bubble, which an open ask stands in for, and Pause, Resume and Stop are in the bubble's menu and
 * the room's row menu. The plan's steps, the live cost and the context ring were the panel's alone;
 * what the run did and what it cost are on the closing line's receipt.
 */

import { expect, test } from "@playwright/test";
import { bubble, demo, Harness, newRunId, pair, runMenu } from "./support.ts";

const PLAN = [
  { step_id: "read-po", title: "Read PO #4471" },
  { step_id: "check-crm", title: "Check the Northwind record in the CRM" },
  { step_id: "email-dana", title: "Email Dana to confirm" },
  { step_id: "update-tracker", title: "Update the tracker" },
];

test("the golden scenario's events produce the expected UI states, step by step", async ({
  page,
}) => {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    // 2. run.started with a four-step plan: Scout's bubble, once the thinking beat has gone by.
    expect(
      await harness.send("run.started", {
        goal: "Get PO #4471 confirmed with Northwind and update the tracker.",
        plan: PLAN,
      }),
    ).toMatchObject({ frame: "ack" });
    await expect(bubble(page)).toBeVisible();

    // 3. run.status, then two steps done with sources: the verb phrase showing.
    await harness.send("run.status", { phase: "reading", verb_phrase: "Reading PO #4471…" });
    // What it is doing, in the room, while it does it — the thinking bubble Telegram has.
    // The thought without its ellipsis: the dots beside it say the work goes on (ADR 0126). The
    // bubble alone says it (ADR 0147).
    await expect(page.getByTestId("doing")).toContainText("Reading PO #4471");
    await harness.send("step.log", {
      step_id: "read-po",
      status: "done",
      sources: [{ kind: "internal", label: "Drive" }],
      duration_ms: 1840,
    });
    await harness.send("step.log", {
      step_id: "check-crm",
      status: "done",
      sources: [{ kind: "internal", label: "CRM" }],
      duration_ms: 920,
    });
    // Still at it. The plan's steps are drawn nowhere while it works now; the receipt counts them
    // once the run is over (step 8).
    await expect(bubble(page)).toBeVisible();

    // 4. approval.request for email.send, external and irreversible, on step three: the card in
    //    the space, standing where the bubble was while it waits (ADR 0268).
    const approvalId = "apr_01K4ZQPX0000000000000000G1";
    await harness.send("approval.request", {
      approval_id: approvalId,
      step_id: "email-dana",
      action: {
        kind: "email.send",
        input: { to: "dana@northwind.com", subject: "PO #4471 confirmation" },
        external: true,
        irreversible: true,
      },
      preview: {
        format: "markdown",
        title: "To dana@northwind.com",
        body: "Hi Dana, confirming PO #4471 for 120 units, delivery 19 September.",
      },
      risk: ["external", "irreversible"],
      sources: [{ kind: "external", label: "vendor website" }],
      expires_in: 3600,
      editable: true,
    });
    const card = page.getByRole("article", { name: /Approval/ }).last();
    await expect(card).toBeVisible();
    // It asks no question, so the card is headed by the preview's title (ADR 0142).
    await expect(card.locator(".ui-approval__who b")).toHaveText("To dana@northwind.com");
    await expect(card).toContainText("Scout asks");
    await expect(bubble(page)).toHaveCount(0);

    // 5. The person approves, scope once: approval.resolved reaches the harness; the card goes;
    //    the bubble comes back, the run working again.
    await card.getByRole("button", { name: "Approve" }).click();
    const resolved = await harness.event("approval.resolved");
    expect(resolved).toMatchObject({
      approval_id: approvalId,
      decision: "approved",
      scope: "once",
      resolved_by: demo().person.id,
    });
    await expect(page.locator(`[data-approval="${approvalId}"]`)).toHaveCount(0);
    await expect(bubble(page)).toBeVisible();

    // 6. approval.executed.
    await harness.send("approval.executed", { approval_id: approvalId, outcome: "executed" });

    // 7. Steps three and four done; usage with tokens and cost; context at 41 percent. The cost
    //    meter and the context ring went with the panel (ADR 0293): the cost is the receipt's.
    await harness.send("step.log", { step_id: "email-dana", status: "done", duration_ms: 610 });
    await harness.send("step.log", { step_id: "update-tracker", status: "done", duration_ms: 340 });
    expect(
      await harness.send("usage", {
        scope: "run",
        model: "opus-5",
        input_tokens: 82_140,
        output_tokens: 3402,
        cost: { usd: 1.47, estimated: true },
      }),
    ).toMatchObject({ frame: "ack" });
    expect(
      await harness.send("context.usage", {
        used_tokens: 82_000,
        limit_tokens: 200_000,
        model: "opus-5",
      }),
    ).toMatchObject({ frame: "ack" });

    // 8. run.completed with a summary: the summary card, saying no Done — and the receipt under
    //    the summary, collapsed, with the four steps, the time and the cost.
    await harness.send("run.completed", {
      summary: "Confirmed PO #4471 with Northwind and updated the tracker.",
      cost: { usd: 1.47, estimated: true },
    });
    // The last one: every spec shares the demo's room, and `approval-loop.spec.ts` plays Scout
    // through the same scenario, so this summary's words are in the room twice by now. Whether
    // both are on the page depends on where the window sits (the list is windowed since the
    // Phase 1 review's condition 1), so a locator has to name its own row rather than the words.
    const summary = page
      .getByTestId("messages")
      .getByText("Confirmed PO #4471 with Northwind and updated the tracker.")
      .last();
    await expect(summary).toBeVisible();
    // The bubble is gone: the calls belong to the reply's receipt now, asked for from its menu as
    // on the phone, and not drawn in the room (ADR 0268).
    await expect(page.getByTestId("doing")).toHaveCount(0);
    await expect(page.getByTestId("receipt-card")).toHaveCount(0);
    await page
      .getByTestId("messages")
      .locator(".msg", { hasText: "Confirmed PO #4471 with Northwind and updated the tracker." })
      .last()
      .click({ button: "right" });
    const item = page.getByTestId("line-menu").getByRole("menuitem", { name: "What the run did" });
    await expect(item).toContainText("4 steps");
    await expect(item).toContainText("≈$1.47");
    await item.click();
    const receipt = page.getByTestId("run-did");
    await expect(receipt).toContainText("4 steps");
    await expect(receipt.getByText("Drive", { exact: true })).toBeVisible();
    await expect(receipt.getByText("CRM", { exact: true })).toBeVisible();

    // And the run is over: the door refuses anything more into it.
    const late = await harness.send("run.status", { phase: "late", verb_phrase: "Still going…" });
    expect(late).toMatchObject({ frame: "error", code: "invalid_event" });
    expect(String(late["message"])).toContain("ended as done");
  } finally {
    harness.close();
  }
});

test("a person pauses, steers and stops a run, and the harness hears each", async ({ page }) => {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Chase the Northwind quotes.", plan: PLAN.slice(2) });
    await harness.send("run.status", { phase: "drafting", verb_phrase: "Drafting the email…" });
    await expect(page.getByTestId("doing")).toContainText("Drafting the email");
    const scout = bubble(page);

    // The bubble's menu names who is working and for how long. Its harness has not said a Pause
    // holds this run, so it offers Stop alone (ADR 0293).
    let menu = await runMenu(page);
    await expect(menu.getByTestId("run-menu-head")).toContainText("Scout · working for");
    await expect(menu.getByTestId("run-act-stop")).toBeVisible();
    await expect(menu.getByTestId("run-act-pause")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // The harness says it can pause, as a bridge does once as each run starts.
    expect(
      await harness.send("run.status", {
        phase: "thinking",
        verb_phrase: "Thinking…",
        pausable: true,
      }),
    ).toMatchObject({ frame: "ack" });

    // Pause, from the bubble's menu: the harness gets run.pause, attributed to the person. The
    // bubble stays, says Paused, and holds a flat Resume.
    menu = await runMenu(page);
    await expect(menu.getByRole("menuitem")).toHaveText(["Pause", "Stop"]);
    await menu.getByTestId("run-act-pause").click();
    expect(await harness.next("run.pause")).toMatchObject({ by: demo().person.id });
    await expect(scout).toHaveAttribute("data-paused", "true");
    await expect(scout.locator(".doing-label .swap-now")).toHaveText("Paused");
    await expect(scout.getByTestId("doing-resume")).toHaveAttribute("data-shown", "true");
    // Its menu offers Resume in Pause's place, and says when it held.
    menu = await runMenu(page);
    await expect(menu.getByTestId("run-menu-head")).toContainText("Scout · paused at");
    await expect(menu.getByRole("menuitem")).toHaveText(["Resume", "Stop"]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Resume, from the bubble's own button.
    await scout.getByTestId("doing-resume").click();
    expect(await harness.next("run.resume")).toMatchObject({ by: demo().person.id });
    await expect(scout).not.toHaveAttribute("data-paused", "true");
    await expect(scout.getByTestId("doing-resume")).not.toHaveAttribute("data-shown", "true");

    // The room's row menu has them too, first, above Change icon and the rest.
    const row = page.getByTestId("space-list").locator(`[data-space="${demo().space_id}"]`);
    await row.click({ button: "right" });
    const rowMenu = page.getByTestId("row-menu");
    await rowMenu.getByRole("menuitem", { name: "Pause Scout" }).click();
    expect(await harness.next("run.pause")).toMatchObject({ by: demo().person.id });
    await expect(scout).toHaveAttribute("data-paused", "true");
    await row.click({ button: "right" });
    await expect(rowMenu.getByRole("menuitem", { name: "Stop Scout" })).toBeVisible();
    await rowMenu.getByRole("menuitem", { name: "Resume Scout" }).click();
    expect(await harness.next("run.resume")).toMatchObject({ by: demo().person.id });
    await expect(scout).not.toHaveAttribute("data-paused", "true");

    // Steer from the composer: the harness gets run.steer with `from` filled by Chips and a
    // receipt saying it was steered; the person's line wears the same receipt.
    const composer = page.getByLabel(/^Message /);
    await composer.fill("/steer Mention the pallet count in the email.");
    await page.keyboard.press("Enter");
    const steer = await harness.event("run.steer");
    expect(steer).toMatchObject({
      mode: "steer",
      text: "Mention the pallet count in the email.",
      from: {
        participant_id: demo().person.id,
        kind: "person",
        display_name: demo().person.displayName,
        role: "owner",
      },
    });
    const steerReceipt = await harness.waitFor(
      (frame) =>
        frame["frame"] === "receipt" && frame["idempotency_key"] === steer["idempotency_key"],
      "the harness's receipt for the steer",
    );
    expect(steerReceipt).toMatchObject({ disposition: "steered" });
    const messages = page.getByTestId("messages");
    await expect(messages.getByTestId("mode").last()).toHaveText("Steer");
    await expect(messages.getByTestId("receipt").last()).toHaveText("steered");

    // The harness replans: the steps still to come are replaced. They were drawn on the panel's
    // timeline, which went with it (ADR 0293).
    expect(
      await harness.send("run.plan", {
        plan: [
          { step_id: "email-dana", title: "Email Dana to confirm, with the pallet count" },
          { step_id: "update-tracker", title: "Update the tracker" },
        ],
        reason: "Steered.",
      }),
    ).toMatchObject({ frame: "ack" });

    // A plain message mid-run is queued, and says so.
    await composer.fill("Any news from Northwind?");
    await page.keyboard.press("Enter");
    await expect(messages.getByText("Any news from Northwind?")).toBeVisible();
    await expect(messages.getByTestId("receipt").last()).toHaveText("queued");
    // The harness hears it as `message.new`, carrying the person's key, which the receipt names.
    const message = await harness.event("message.new");
    expect(message).toMatchObject({ text: "Any news from Northwind?" });
    await harness.waitFor(
      (frame) =>
        frame["frame"] === "receipt" && frame["idempotency_key"] === message["idempotency_key"],
      "the harness's receipt for the message",
    );

    // Stop, from the bubble's menu, asking nothing: the harness gets run.cancel; the bubble goes,
    // and a line where it stood says who stopped it, for everybody in the room (ADR 0293).
    menu = await runMenu(page);
    await menu.getByTestId("run-act-stop").click();
    const cancel = await harness.event("run.cancel");
    expect(cancel).toMatchObject({ by: demo().person.id });
    await expect(scout).toHaveCount(0);
    await expect(messages.getByTestId("fetch-line").last()).toHaveText(
      `Scout was stopped by ${demo().person.displayName}`,
    );

    const late = await harness.send("step.log", { step_id: "email-dana", status: "done" });
    expect(late).toMatchObject({ frame: "error", code: "invalid_event" });
  } finally {
    harness.close();
  }
});
