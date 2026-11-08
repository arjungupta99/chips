/**
 * When it asks you (ADR 0195), end to end on the harness's page: a harness asks, a person answers
 * Always on the card, and the rule shows under Allowed always, by them, in that room, today. Its
 * switch turned off goes down the wire with the rule kept and `off`, and the next ask of its kind
 * comes back to the person; turned on, the rule lets it through again. Its × breaks it into dust,
 * Undo puts it back, and once it has gone for good the next ask comes back. An ask that matters
 * offers no Always at all, and the harness may not settle it.
 *
 * Its own harness and room, so the demo room's policy is left as the other specs find it.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  demo,
  Harness,
  newApprovalId,
  newRunId,
  pair,
  registerSpecialist,
  runPanel,
} from "./support.ts";

/** The newest approval card in the room. */
const card = (page: Page) => page.getByRole("article", { name: /Approval/ }).last();

/**
 * A harness's When it asks you: a page over its page (ADR 0254), which its tile on the Agents
 * page's shelf opens (ADR 0266). Until then it stood on its card, under View all.
 */
const openAsking = async (page: Page, harness: string) => {
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page
    .getByTestId("harness-shelf")
    .getByRole("button", { name: new RegExp(`^${harness}\\b`) })
    .click();
  await page.getByRole("main", { name: harness }).getByTestId("harness-asks-row").click();
};

/** What When it asks you holds, on its page. */
const askingOf = (page: Page, harness: string) =>
  page.getByRole("main", { name: `${harness}: When it asks you` }).getByTestId("asking");

test("an Always shows under Allowed always, switches off and on, and goes into dust with Undo", async ({
  page,
}) => {
  const thistle = await registerSpecialist("Thistle");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: thistle.token, space: thistle.space });
  // A kind no other spec asks for, with no flags: a smaller ask, which an Always may cover.
  const note = async () => {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "garden.note", input: { bed: 4 } },
      risk: [],
      expires_in: 3600,
    });
    return approvalId;
  };
  const asksAgain = async () => {
    const id = await note();
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    await card(page).getByRole("button", { name: "Approve" }).click();
    expect(await harness.waitFor((frame) => answered(frame, id), "its answer")).toBeTruthy();
  };
  const letThrough = async () => {
    const id = await note();
    const byPolicy = (await harness.waitFor((frame) => answered(frame, id), "policy"))[
      "event"
    ] as Record<string, unknown>;
    expect(byPolicy).toMatchObject({ decision: "approved", resolved_by: "system" });
  };

  try {
    await harness.send("run.started", { goal: "Tend the beds.", plan: [] });
    await page.getByTestId("space-list").locator(`[data-space="${thistle.space}"]`).click();
    // At L1, where a smaller ask waits for an answer: a new harness starts there.
    const l1 = runPanel(page)
      .getByRole("group", { name: /Autonomy for/ })
      .getByLabel("L1 · Ask first");
    // Where a new harness starts; the dial reads L2 only until the run's policy has come.
    await expect(l1).toBeChecked();

    // An ask that matters: no Always on its card, and the harness may not settle it.
    const payment = newApprovalId();
    await harness.send("approval.request", {
      approval_id: payment,
      action: { kind: "payment.send", input: { to: "Northwind" }, money_usd: 400 },
      risk: ["financial"],
      expires_in: 3600,
    });
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(card(page).getByText("Always", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("waits-for-you").last()).toContainText("Waits for you");
    expect(
      await harness.send("approval.resolved", {
        approval_id: payment,
        decision: "approved",
        scope: "once",
      }),
    ).toMatchObject({ frame: "error" });
    await card(page).getByRole("button", { name: "Deny" }).click();
    await page.getByTestId("deny-form").getByRole("button", { name: "Deny" }).click();
    await harness.waitFor((frame) => answered(frame, payment), "the payment's answer");

    // A smaller one, answered Always: an owner's holds in every space unless they pick this one.
    const first = await note();
    await card(page).getByText("Always", { exact: true }).click();
    await expect(card(page).getByTestId("reach")).toHaveText(
      "Asks like this go ahead without a card in every space.",
    );
    await card(page).getByRole("button", { name: "Approve" }).click();
    expect(
      (await harness.waitFor((frame) => answered(frame, first), "Always"))["event"],
    ).toMatchObject({ scope: "always", everywhere: true });
    await harness.next("policy.updated");
    await letThrough();

    // On its When it asks you, under Allowed always: by you, in its room, today.
    await openAsking(page, "Thistle");
    const asking = askingOf(page, "Thistle");
    await expect(asking.getByTestId("asking-headline")).toHaveText(
      "Thistle decides when to ask. You decide the answer.",
    );
    const list = asking.getByTestId("asking-always");
    await expect(list.locator("code")).toHaveText(["garden.note"]);
    await expect(list).toContainText(/In every space · by you, /);
    await expect(asking.getByTestId("asking-count")).toHaveText("1 on");
    await expect(asking.getByTestId("asking-history")).toContainText(/3 asks since/);

    // Off: kept, dimmed, sent with `off`, and the next one asks.
    const toggle = asking.getByRole("switch", { name: "Allow garden.note always" });
    await toggle.click();
    const off = await harness.next("policy.updated");
    expect(rules(off)).toEqual([expect.objectContaining({ match: "garden.note", off: true })]);
    await expect(toggle).not.toBeChecked();
    await expect(list).toContainText("Off · Thistle asks again");
    await expect(asking.getByTestId("asking-count")).toHaveText("0 of 1 on");
    await page.getByRole("button", { name: /Spaces/ }).click();
    await asksAgain();

    // On again: through, without asking.
    await openAsking(page, "Thistle");
    await toggle.click();
    expect(rules(await harness.next("policy.updated"))).toEqual([
      expect.not.objectContaining({ off: true }),
    ]);
    await expect(toggle).toBeChecked();
    await letThrough();

    // The ×: into dust, gone from the list and the wire; Undo puts it back.
    await asking.getByRole("button", { name: "Remove garden.note" }).click();
    expect(rules(await harness.next("policy.updated"))).toEqual([]);
    await expect(asking.getByTestId("asking-always-empty")).toBeVisible();
    await expect(page.getByTestId("undo-pill")).toContainText("Removed");
    await page.getByTestId("undo-pill-undo").click();
    expect(rules(await harness.next("policy.updated"))).toEqual([
      expect.objectContaining({ match: "garden.note", made_by: demo().person.id }),
    ]);
    await expect(list.locator("code")).toHaveText(["garden.note"]);

    // Removed for good: the next one asks.
    await asking.getByRole("button", { name: "Remove garden.note" }).click();
    expect(rules(await harness.next("policy.updated"))).toEqual([]);
    await expect(page.getByTestId("undo-pill")).toHaveCount(0, { timeout: 10_000 });
    await page.getByRole("button", { name: /Spaces/ }).click();
    await asksAgain();
  } finally {
    harness.close();
  }
});

test("a command's Always remembers how each part starts, and lets through only commands made of them", async ({
  page,
}) => {
  const bramble = await registerSpecialist("Bramble");
  await pair(page);
  const harness = await Harness.connect(newRunId(), {
    token: bramble.token,
    space: bramble.space,
  });
  // A shell ask as every bridge sends one (ADR 0239): the command in `input.command`.
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

  try {
    await harness.send("run.started", { goal: "Check the beds.", plan: [] });
    await page.getByTestId("space-list").locator(`[data-space="${bramble.space}"]`).click();
    const l1 = runPanel(page)
      .getByRole("group", { name: /Autonomy for/ })
      .getByLabel("L1 · Ask first");
    // Where a new harness starts; the dial reads L2 only until the run's policy has come.
    await expect(l1).toBeChecked();

    // One that uses rm keeps no Always, and a line says why; the hour still reaches it (ADR 0281).
    const remove = await run("ls beds && rm -rf beds/old");
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(card(page).getByText("Always", { exact: true })).toHaveCount(0);
    await expect(card(page).getByText("For an hour", { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("once-only").last()).toHaveText(
      "There is no Always for asks that use rm.",
    );
    await card(page).getByRole("button", { name: "Deny" }).click();
    await page.getByTestId("deny-form").getByRole("button", { name: "Deny" }).click();
    await harness.waitFor((frame) => answered(frame, remove), "the rm's answer");

    // A chain, answered Always: it remembers each part's start, in every space.
    const first = await run("node --check beds.js && echo ok");
    await card(page).getByText("Always", { exact: true }).click();
    await expect(card(page).getByTestId("command-plate").locator(".plate-start")).toHaveText([
      "node --check",
      "echo",
    ]);
    await expect(card(page).getByTestId("reach")).toHaveText(
      "Commands made only of the lit words go ahead without a card in every space. Anything else still comes to you.",
    );
    await card(page).getByRole("button", { name: "Approve" }).click();
    expect(
      (await harness.waitFor((frame) => answered(frame, first), "Always"))["event"],
    ).toMatchObject({ scope: "always", everywhere: true });
    const kept = await harness.next("policy.updated");
    expect(kept["space_id"]).toBeUndefined();
    expect(rules(kept)).toEqual([
      expect.objectContaining({ when: { starts_with: ["node", "--check"] } }),
      expect.objectContaining({ when: { starts_with: ["echo"] } }),
    ]);

    // Made only of those: through without a card. One more part: back to the person.
    const same = await run("echo ok; node --check paths.js");
    const byPolicy = (await harness.waitFor((frame) => answered(frame, same), "policy"))[
      "event"
    ] as Record<string, unknown>;
    expect(byPolicy).toMatchObject({ decision: "approved", resolved_by: "system" });
    await run("node --check paths.js && cat paths.js");
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();

    // Under Allowed always, each start is a row of its own, named in code.
    await openAsking(page, "Bramble");
    const list = askingOf(page, "Bramble").getByTestId("asking-always");
    await expect(list.locator(".always-words > code:first-child")).toHaveText([
      "node --check …",
      "echo …",
    ]);
    await expect(list).toContainText(/In every space · by you, /);
  } finally {
    harness.close();
  }
});

/** The rules a `policy.updated` carries, for its room. */
test("the dots open every ask, and an ask whole opens its space (ADR 0255)", async ({ page }) => {
  const sorrel = await registerSpecialist("Sorrel");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: sorrel.token, space: sorrel.space });
  const ask = async (kind: string, question: string) => {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind, input: { bed: 4 } },
      question,
      risk: [],
      expires_in: 3600,
    });
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    return approvalId;
  };

  try {
    await harness.send("run.started", { goal: "Weed the beds.", plan: [] });
    await page.getByTestId("space-list").locator(`[data-space="${sorrel.space}"]`).click();
    const l1 = runPanel(page)
      .getByRole("group", { name: /Autonomy for/ })
      .getByLabel("L1 · Ask first");
    // Where a new harness starts; the dial reads L2 only until the run's policy has come.
    await expect(l1).toBeChecked();
    const yes = await ask("garden.weed", "Pull the weeds in `bed 4`?");
    await card(page).getByRole("button", { name: "Approve" }).click();
    await harness.waitFor((frame) => answered(frame, yes), "the yes");
    const no = await ask("garden.dig", "Dig up the roses?");
    await card(page).getByRole("button", { name: "Deny" }).click();
    await page.getByTestId("deny-form").getByRole("button", { name: "Deny" }).click();
    await harness.waitFor((frame) => answered(frame, no), "the no");

    await openAsking(page, "Sorrel");
    const asking = askingOf(page, "Sorrel");
    const dots = asking.getByTestId("asking-history");
    await expect(asking.getByTestId("asking-key")).toHaveText("1 yes1 no");
    await dots.click();
    const dialog = page.getByTestId("asks-dialog");
    await expect(dialog.getByRole("heading", { name: "Sorrel's asks" })).toBeVisible();
    await expect(dialog.getByTestId(`ask-row-${no}`)).toContainText("Dig up the roses?");
    await expect(dialog.getByTestId(`ask-row-${no}`)).toContainText("You said no · Sorrel in");
    await expect(dialog.getByTestId(`ask-row-${yes}`).locator("code")).toHaveText("bed 4");

    await dialog.getByLabel("No 1").check();
    await expect(dialog.getByTestId(`ask-row-${yes}`)).toHaveCount(0);
    await dialog.getByTestId(`ask-row-${no}`).click();
    await expect(dialog.getByTestId("asks-verdict")).toHaveText(
      /^You said noAt \d{1,2}:\d\d [AP]M, under a minute after Sorrel asked\.$/,
    );
    await dialog.getByRole("button", { name: "Asks" }).click();
    await dialog.getByTestId(`ask-row-${no}`).click();
    await dialog.getByTestId("asks-open").click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByTestId("space-list").locator(`[data-space="${sorrel.space}"][data-active="true"]`),
    ).toBeVisible();
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
