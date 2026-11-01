/**
 * ADR 0042 on a phone: an ask handed to somebody outside the space goes out addressed to them,
 * and nothing of that space reaches their list.
 *
 * Priya is in the workspace and in none of Arjun's spaces. Scout asks; Arjun hands the ask to
 * her from the card in the room; Scout hears whom it now waits on, and her list stays empty.
 * Her answering it was driven from For you, withdrawn on 22 September 2026 (ADR 0065): on a real
 * phone the push reaches her and opens the ask's own screen, which the web target cannot show.
 */

import { expect, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, openRoom, pair, registerPerson } from "./support.ts";

test("an ask handed outside the space is addressed to the person it names, and nothing else reaches her", async ({
  page,
  browser,
}) => {
  const priya = await registerPerson("Priya");
  await pair(page);
  const scout = await Harness.connect(newRunId());
  const context = await browser.newContext();
  const hers = await context.newPage();
  try {
    await pair(hers, priya.code);
    await expect(hers.getByRole("heading", { name: "No spaces yet" })).toBeVisible();

    await scout.send("run.started", { goal: "Confirm PO #4471.", plan: [] });
    const approvalId = newApprovalId();
    expect(
      await scout.send("approval.request", {
        approval_id: approvalId,
        action: {
          kind: "email.send",
          input: { to: "dana@northwind.com", subject: "PO #4471" },
          external: true,
          irreversible: true,
        },
        preview: { format: "markdown", body: "Hi Dana, confirming PO #4471 for 120 units." },
        risk: ["external_communication"],
        expires_in: 3600,
      }),
    ).toMatchObject({ frame: "ack" });

    // Arjun hands it on by name, from the ask's own screen, opened from its card in the room.
    await openRoom(page);
    const asks = page.getByTestId("room-asks");
    await expect(asks.getByText("Scout asks").last()).toBeVisible({ timeout: 20_000 });
    await asks.getByRole("button", { name: "Details" }).last().click();
    await page.getByRole("button", { name: "Hand to…" }).click();
    await page.getByTestId("hand-on").getByRole("radio", { name: "Priya" }).click();
    await page.getByRole("button", { name: "Hand on" }).click();
    const routed = await scout.next("approval.routed");
    expect(routed["approvers"]).toEqual([priya.id]);

    // Nothing of the space reached her: none in her list, before the ask or after it.
    await expect(hers.getByRole("heading", { name: "No spaces yet" })).toBeVisible();
  } finally {
    scout.close();
    await context.close();
  }
});
