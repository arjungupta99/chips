/**
 * M1.4's acceptance criterion: Playwright covers approve, edit, deny, expire and resolved
 * elsewhere — and, beside them, a question answered, and the dial turning policy so that Chips
 * decides on the spot. The harness is played by the test; `approval-loop.spec.ts` keeps the plain
 * approve with Scout, so it is not repeated here.
 *
 * The dial was the Run panel's, for one space, until the panel went (ADR 0293): the tests that
 * turn or lean on a level have a harness and room of their own, at L1 where a new harness starts,
 * and turn the agent's own dial on its page, which holds for every space.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  bubble,
  demo,
  Harness,
  newApprovalId,
  newRunId,
  openLog,
  pair,
  registerSpecialist,
  type Specialist,
} from "./support.ts";

/** The newest approval card in the space: the demo space is shared with every test. */
const card = (page: Page) => page.getByRole("article", { name: /Approval/ }).last();

/** One ask's card by its id. Once answered, it says how for a moment and goes (`RoomAsks`). */
const cardOf = (page: Page, approvalId: string) => page.locator(`[data-approval="${approvalId}"]`);

async function askToEmail(harness: Harness, extra: Record<string, unknown> = {}) {
  const approvalId = newApprovalId();
  expect(
    await harness.send("approval.request", {
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
      editable: true,
      ...extra,
    }),
  ).toMatchObject({ frame: "ack" });
  return approvalId;
}

async function start(page: Page): Promise<Harness> {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  await harness.send("run.started", { goal: "Confirm PO #4471.", plan: [] });
  return harness;
}

/**
 * A harness of its own, working in its own room, open in the page: at L1, where a new harness
 * starts, so a smaller ask waits for a person, and the demo room's policy is left as the other
 * specs find it.
 */
async function startOwn(page: Page, name: string): Promise<[Specialist, Harness]> {
  const own = await registerSpecialist(name);
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: own.token, space: own.space });
  await harness.send("run.started", { goal: "Confirm PO #4471.", plan: [] });
  await page.getByTestId("space-list").locator(`[data-space="${own.space}"]`).click();
  return [own, harness];
}

/**
 * How far it is trusted, on the agent's When it asks you (ADR 0195): a page over its page
 * (ADR 0254), which its tile on the Agents page's shelf opens (ADR 0266).
 */
async function agentDial(page: Page, name: string) {
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page
    .getByTestId("harness-shelf")
    .getByRole("button", { name: new RegExp(`^${name}\\b`) })
    .click();
  await page.getByRole("main", { name }).getByTestId("harness-asks-row").click();
  return page
    .getByRole("main", { name: `${name}: When it asks you` })
    .getByRole("region", { name: "How far it is trusted" });
}

test("edit: the person's words reach the harness, and the card goes", async ({ page }) => {
  const harness = await start(page);
  try {
    const approvalId = await askToEmail(harness);
    await card(page).getByRole("button", { name: "Edit" }).click();
    const form = page.getByTestId("edit-form");
    await form
      .getByLabel("Edited input")
      .fill("Hi Dana, confirming PO #4471: 120 units, 4 pallets.");
    await form.getByRole("button", { name: "Approve with edits" }).click();

    const resolved = await harness.next("approval.resolved");
    expect(resolved).toMatchObject({
      decision: "edited",
      scope: "once",
      resolved_by: demo().person.id,
      updated_input: {
        to: "dana@northwind.com",
        body: "Hi Dana, confirming PO #4471: 120 units, 4 pallets.",
      },
    });
    await expect(cardOf(page, approvalId)).toHaveCount(0);
  } finally {
    harness.close();
  }
});

test("deny: the reason reaches the harness, and the run carries on", async ({ page }) => {
  const harness = await start(page);
  try {
    // Scout at work: its bubble, once the thinking beat has gone by. The card stands in its place
    // while it waits (ADR 0268), and once it is answered the bubble is back, the run going on.
    await expect(bubble(page)).toBeVisible();
    const approvalId = await askToEmail(harness);
    await expect(card(page)).toBeVisible();
    await expect(bubble(page)).toHaveCount(0);
    await card(page).getByRole("button", { name: "Deny" }).click();
    const form = page.getByTestId("deny-form");
    await form.getByLabel("Reason").fill("Wrong address. Use the procurement alias.");
    await form.getByRole("button", { name: "Deny" }).click();

    const resolved = await harness.next("approval.resolved");
    expect(resolved).toMatchObject({
      decision: "denied",
      reason: "Wrong address. Use the procurement alias.",
    });
    await expect(cardOf(page, approvalId)).toHaveCount(0);
    await expect(bubble(page)).toBeVisible();
  } finally {
    harness.close();
  }
});

test("expire: an approval nobody answers is resolved by its fallback, as an event", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    const approvalId = await askToEmail(harness, { expires_in: 1, fallback: "deny" });
    // The server's sweep runs every second in this suite; nobody presses anything.
    const resolved = await harness.next("approval.resolved");
    expect(resolved).toMatchObject({
      approval_id: approvalId,
      decision: "expired",
      resolved_by: "system",
    });
    expect(String(resolved["reason"])).toContain("deny");
    await expect(cardOf(page, approvalId)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});

test("resolved elsewhere: a decision made on one surface takes the card from the other", async ({
  page,
  context,
}) => {
  const harness = await start(page);
  const other = await context.newPage();
  try {
    await other.goto("/");
    await expect(
      other.getByTestId("space-list").getByRole("button", { name: /PO-4471/ }),
    ).toBeVisible({ timeout: 20_000 });
    const approvalId = await askToEmail(harness);
    await expect(card(other).getByRole("button", { name: "Approve" })).toBeEnabled();

    await card(page).getByRole("button", { name: "Approve" }).click();
    await harness.next("approval.resolved");

    await expect(cardOf(page, approvalId)).toHaveCount(0);
    await expect(cardOf(other, approvalId)).toHaveCount(0);
  } finally {
    await other.close();
    harness.close();
  }
});

test("a question with a default is answered from its card in the room, and the harness hears it", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    const askId = "qst_01K4ZQPX00000000000000000Q";
    await harness.send("question.ask", {
      ask_id: askId,
      questions: [
        {
          question_id: "date",
          prompt: "Ship on the 19th or the 26th?",
          options: [
            { value: "19", label: "19 September" },
            { value: "26", label: "26 September", description: "A full pallet." },
          ],
          allow_free_text: true,
          default_value: "19",
        },
      ],
      timeout_seconds: 3600,
    });

    const question = page.getByRole("article", { name: /Question from/ }).last();
    await question.getByLabel(/26 September/).check();
    await question.getByRole("button", { name: "Send the answer" }).click();

    const answered = await harness.next("question.answered");
    expect(answered).toMatchObject({
      ask_id: askId,
      answered_by: demo().person.id,
      timed_out: false,
      answers: [{ question_id: "date", values: ["26"] }],
    });
    await expect(page.locator(`[data-ask="${askId}"]`)).toHaveCount(0);
  } finally {
    harness.close();
  }
});

test("the dial: at L1 a write asks; turned to L2 on the agent's page, policy approves it on the spot, as an event", async ({
  page,
}) => {
  const [fern, harness] = await startOwn(page, "Fern");
  try {
    const write = (id: string) =>
      harness.send("approval.request", {
        approval_id: id,
        action: { kind: "tracker.write", input: { row: 4471 } },
        risk: [],
        expires_in: 3600,
      });
    const first = newApprovalId();
    await write(first);
    await card(page).getByRole("button", { name: "Approve" }).click();
    await harness.next("approval.resolved");
    await expect(cardOf(page, first)).toHaveCount(0);

    // The dial is controlled by the log: it moves when the policy event comes back.
    const dial = await agentDial(page, "Fern");
    await expect(dial.getByLabel("L1 · Ask first")).toBeChecked();
    await dial.getByLabel("L2 · Ask when it matters").click();
    const turned = await harness.next("policy.updated");
    await expect(dial.getByLabel("L2 · Ask when it matters")).toBeChecked();
    expect(turned).toMatchObject({
      harness_id: fern.id,
      policy: { autonomy: 2 },
      changed_by: demo().person.id,
    });
    // The agent's own level, for every space it works in.
    expect(turned["space_id"]).toBeUndefined();

    const second = newApprovalId();
    await write(second);
    const byPolicy = await harness.next("approval.resolved");
    expect(byPolicy).toMatchObject({
      approval_id: second,
      decision: "approved",
      resolved_by: "system",
    });
    expect(String(byPolicy["reason"])).toContain("L2");

    // The workspace's log says so, in words.
    await openLog(page);
    const audit = page.getByTestId("audit");
    await expect(audit).toContainText("Chips");
    await expect(audit).toContainText("approved tracker.write");
    await expect(audit).toContainText("set autonomy to L2");
  } finally {
    harness.close();
  }
});

test("always at L1: the next ask of its kind is approved by policy (ADR 0080)", async ({
  page,
}) => {
  const [, harness] = await startOwn(page, "Yarrow");
  try {
    // A kind no other test asks for.
    const note = (id: string) =>
      harness.send("approval.request", {
        approval_id: id,
        action: { kind: "notes.write", input: { note: "PO #4471 confirmed" } },
        risk: [],
        expires_in: 3600,
      });
    await note(newApprovalId());
    await card(page).getByText("Always", { exact: true }).click();
    await card(page).getByRole("button", { name: "Approve" }).click();
    expect(await harness.next("approval.resolved")).toMatchObject({ scope: "always" });
    await harness.next("policy.updated");

    const second = newApprovalId();
    await note(second);
    const byPolicy = await harness.next("approval.resolved");
    expect(byPolicy).toMatchObject({
      approval_id: second,
      decision: "approved",
      resolved_by: "system",
    });
    expect(String(byPolicy["reason"])).toContain("said always");
    await expect(cardOf(page, second)).toHaveCount(0);
  } finally {
    harness.close();
  }
});

test("settled in the harness's own tools: the card cools, in its name (ADR 0079); one that matters waits for a person (ADR 0195)", async ({
  page,
}) => {
  // A small ask is let through at L2 before the harness could settle it: at L1 it waits.
  const [, harness] = await startOwn(page, "Clover");
  const write = async () => {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "tracker.write", input: { row: 4471 } },
      risk: [],
      expires_in: 3600,
    });
    return approvalId;
  };
  try {
    const approvalId = await write();
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(
      await harness.send("approval.resolved", {
        approval_id: approvalId,
        decision: "approved",
        scope: "once",
        reason: "Answered in Scout's own tools.",
      }),
    ).toMatchObject({ frame: "ack" });
    await expect(cardOf(page, approvalId)).toHaveCount(0);

    // This session and Always are a person's to give.
    const again = await write();
    expect(
      await harness.send("approval.resolved", {
        approval_id: again,
        decision: "approved",
        scope: "always",
      }),
    ).toMatchObject({ frame: "error" });
    await card(page).getByRole("button", { name: "Approve" }).click();
    await expect(cardOf(page, again)).toHaveCount(0);

    // An ask that matters waits for a person, answered once: the harness may not settle it, and
    // the card offers no Always.
    const matters = await askToEmail(harness);
    await expect(card(page).getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(page.getByTestId("waits-for-you").last()).toContainText("Waits for you");
    await expect(card(page).getByText("Always", { exact: true })).toHaveCount(0);
    expect(
      await harness.send("approval.resolved", {
        approval_id: matters,
        decision: "approved",
        scope: "once",
      }),
    ).toMatchObject({ frame: "error" });
    await card(page).getByRole("button", { name: "Approve" }).click();
    await expect(cardOf(page, matters)).toHaveCount(0);
  } finally {
    harness.close();
  }
});

test("a tall card low in a long room leaves the page where it is", async ({ page }) => {
  // The card's words for screen readers were placed against the page rather than the card, so a
  // card far down a long room stretched the document and the whole window scrolled under the app,
  // taking clicks meant for the composer with it (OpenClaw test, finding 1).
  const harness = await start(page);
  try {
    for (let line = 1; line <= 24; line += 1) {
      await harness.send("message.post", { text: `Line ${line} of a long room.\n\n`.repeat(3) });
    }
    const approvalId = await askToEmail(harness, {
      preview: { format: "markdown", body: "A long letter.\n\n".repeat(40) },
    });
    await expect(card(page)).toBeVisible();
    const measured = await page.evaluate(() => ({
      scrolls: document.scrollingElement?.scrollHeight ?? 0,
      window: window.innerHeight,
    }));
    expect(measured.scrolls).toBeLessThanOrEqual(measured.window);
    // Answered before it goes, so the room the next spec opens has nothing of this one waiting.
    await card(page).getByRole("button", { name: "Approve" }).click();
    await expect(cardOf(page, approvalId)).toHaveCount(0);
  } finally {
    harness.close();
  }
});
