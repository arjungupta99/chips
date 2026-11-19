/**
 * A harness's Permissions (ADR 0300), end to end: a new harness starts with Chips's rules off, so
 * its asks come to a person with Yes and No for a command. On its Chips's rules page an owner turns
 * them on and stops asking for an hour: the next ask goes ahead on Chips's yes and the room says so
 * in a plain line, but `rm` still asks, since Stop asking never says yes to what is on its list. Ask
 * again brings the asks back. A rule written on New rule, beside the page, lets through the
 * commands that start as it says; with the rules turned off again, the same command asks.
 *
 * Its own harness and room, so the demo room's policy is left as the other specs find it.
 */

import { expect, type Page, test } from "@playwright/test";
import { demo, Harness, newApprovalId, newRunId, pair, registerSpecialist } from "./support.ts";

/** The newest approval card in the room. */
const card = (page: Page) => page.getByRole("article", { name: /Approval/ }).last();

/** A harness's Permissions: the row on its page, which its tile on the shelf opens. */
const openPermissions = async (page: Page, harness: string) => {
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page
    .getByTestId("harness-shelf")
    .getByRole("button", { name: new RegExp(`^${harness}\\b`) })
    .click();
  await page.getByRole("main", { name: harness }).getByTestId("harness-asks-row").click();
  return page.getByRole("main", { name: `${harness}: Permissions` }).getByTestId("permissions");
};

/** Its Chips's rules page, from the main page's row. */
const openChipsRules = async (page: Page, harness: string) => {
  await (await openPermissions(page, harness)).getByTestId("perms-chips-row").click();
  return page.getByTestId("perms-chips");
};

test("Chips's rules off, then on with Stop asking, Ask again, a rule, and off again", async ({
  page,
}) => {
  const tansy = await registerSpecialist("Tansy");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: tansy.token, space: tansy.space });
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
  const byChips = async (approvalId: string) =>
    (await harness.waitFor((frame) => answered(frame, approvalId), "Chips's yes"))[
      "event"
    ] as Record<string, unknown>;
  const openRoom = async () => {
    await page.getByRole("button", { name: /Spaces/ }).click();
    await page.getByTestId("space-list").locator(`[data-space="${tansy.space}"]`).click();
    await expect(
      page.getByTestId("space-list").locator(`[data-space="${tansy.space}"][data-active="true"]`),
    ).toBeVisible();
  };
  const deny = async (approvalId: string) => {
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    await card(page).getByRole("button", { name: "Deny" }).click();
    await page.getByTestId("deny-form").getByRole("button", { name: "Deny" }).click();
    await harness.waitFor((frame) => answered(frame, approvalId), "the no");
  };

  try {
    await harness.send("run.started", { goal: "Sort the seeds.", plan: [] });
    await openRoom();

    // Off for a new harness: the ask comes to the person, with no snooze on it.
    const first = await run("ls seeds");
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(page.getByTestId("decide-snooze")).toHaveCount(0);
    await card(page).getByRole("button", { name: "Approve" }).click();
    expect(
      (await harness.waitFor((frame) => answered(frame, first), "its answer"))["event"],
    ).toMatchObject({ decision: "approved", scope: "once" });

    // Its Permissions says where it's set; Chips's rules are off, and turn on on their own page.
    const permissions = await openPermissions(page, "Tansy");
    await expect(permissions.getByTestId("perms-settings-row")).toBeVisible();
    await expect(permissions.getByTestId("perms-chips-value")).toHaveText("Off");
    await permissions.getByTestId("perms-chips-row").click();
    const chips = page.getByTestId("perms-chips");
    await expect(chips.getByTestId("perms-off-foot")).toBeVisible();
    await chips.getByTestId("perms-switch").click();
    expect((await harness.next("policy.updated"))["policy"]).toMatchObject({ chips_rules: true });

    // Stop asking for an hour: a hold on the harness, by the person.
    await chips.getByTestId("perms-stop-open").click();
    await chips.getByTestId("perms-stop-len-1h").click();
    const held = await harness.next("policy.updated");
    expect(held["policy"]).toMatchObject({ hold: { by: demo().person.id } });
    const until = Date.parse(String((held["policy"] as { hold: { until: string } }).hold.until));
    expect(until - Date.now()).toBeGreaterThan(55 * 60_000);
    await expect(chips.getByTestId("perms-ask-again")).toBeVisible();

    // The next goes ahead on Chips's yes, and the room says so in a plain line.
    await openRoom();
    const second = await run("cat seeds/list.txt");
    expect(await byChips(second)).toMatchObject({
      decision: "approved",
      resolved_by: "system",
      reason: expect.stringMatching(/^its asks are off/),
    });
    await expect(page.getByTestId("hold-bands")).toContainText(
      /^Chips is saying yes for Tansy until /,
    );

    // Never for the pause's list: rm still comes to the person while Chips says yes.
    await deny(await run("rm seeds/old.txt"));

    // Ask again: the hold goes, and the next one comes to the person.
    await page.getByTestId("hold-band-resume").click();
    expect((await harness.next("policy.updated"))["policy"]).toMatchObject({ hold: null });
    await expect(page.getByTestId("hold-bands")).toHaveCount(0);
    await deny(await run("cat seeds/notes.txt"));

    // New rule, beside the page: cat, allowed. One rule, stamped with who made it.
    await (await openChipsRules(page, "Tansy")).getByTestId("perms-add-rule").click();
    const rule = page.getByTestId("new-rule");
    await expect(rule.getByTestId("rule-chip-rm")).toBeDisabled();
    await rule.getByTestId("rule-chip-cat").click();
    await expect(rule.getByTestId("rule-count")).toHaveText("2");
    await rule.getByTestId("rule-save").click();
    expect(rules(await harness.next("policy.updated"))).toEqual([
      expect.objectContaining({
        match: "*",
        when: { starts_with: ["cat"] },
        decision: "allow",
        made_by: demo().person.id,
      }),
    ]);
    await expect(page.getByTestId("perms-chips").getByTestId("perms-rules")).toContainText(
      "Run cat",
    );

    // Through on the rule: a command made of it; anything else still asks.
    await openRoom();
    const fourth = await run("cat seeds/order.txt");
    expect(await byChips(fourth)).toMatchObject({ decision: "approved", resolved_by: "system" });
    await deny(await run("cat seeds/order.txt && rm seeds/old.txt"));

    // Off again: the rule stays, unread, and the same command comes to the person.
    await (await openChipsRules(page, "Tansy")).getByTestId("perms-switch").click();
    expect((await harness.next("policy.updated"))["policy"]).toMatchObject({ chips_rules: false });
    await openRoom();
    await deny(await run("cat seeds/order.txt"));
  } finally {
    harness.close();
  }
});

function rules(event: Record<string, unknown>): unknown[] {
  return ((event["policy"] as { rules?: unknown[] } | undefined)?.rules ?? []) as unknown[];
}

/** The frame that answers an ask, from anybody. */
function answered(frame: Record<string, unknown>, approvalId: string): boolean {
  const event = frame["event"] as Record<string, unknown> | undefined;
  return event?.["type"] === "approval.resolved" && event["approval_id"] === approvalId;
}
