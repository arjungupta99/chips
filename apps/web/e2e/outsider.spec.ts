/**
 * ADR 0042 on the web: an ask handed to somebody outside the room goes out addressed to them,
 * and nothing of that room reaches their sidebar. Priya is in the workspace and in none of
 * Arjun's rooms. Scout asks; Arjun hands the ask to her by name; Scout hears whom it now waits
 * on, and her space list stays empty. Open decision 9, answered yes on 7 September 2026.
 *
 * Her answering it was driven from For you, which was withdrawn on 22 September 2026 (ADR 0065):
 * a browser tab has nowhere to show her the card now. The phone's push and the desktop's banner
 * still reach her.
 */

import { expect, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, pair, pairWith, registerPerson } from "./support.ts";

test("an ask handed outside the room is addressed to the person it names, and nothing else reaches her", async ({
  page,
  browser,
}) => {
  const priya = await registerPerson("Priya");
  await pair(page);
  const scout = await Harness.connect(newRunId());
  const context = await browser.newContext();
  const priyaPage = await context.newPage();
  try {
    await pairWith(priyaPage, priya.code);
    // Nothing of Arjun's rooms is hers: her space list is empty before the ask, and after.
    const spaces = priyaPage.getByTestId("space-list");
    await expect(spaces).toContainText("No spaces yet.");

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

    // Arjun hands it on by name. Priya is in the workspace and in none of his rooms.
    await expect(page.getByRole("article", { name: /Approval/ }).last()).toBeVisible();
    await page.getByRole("button", { name: "Hand to…" }).last().click();
    const form = page.getByTestId("route-form");
    await form.getByLabel("Hand to").selectOption(priya.id);
    await form.getByRole("button", { name: "Hand on" }).click();
    const routed = await scout.next("approval.routed");
    expect(routed["approvers"]).toEqual([priya.id]);

    // Nothing of the room reached her: no room in her sidebar, before the ask or after it.
    await expect(spaces).toContainText("No spaces yet.");
  } finally {
    scout.close();
    await context.close();
  }
});
