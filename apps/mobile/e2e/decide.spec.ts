/**
 * The three flows the phone exists for, end to end: approve, deny, steer. They are also the
 * three the Maestro flows drive on a device, so what passes here is what those check by hand.
 *
 * The harness is played by the test, over the same socket a real one uses, so every assertion
 * is about what actually reached the server rather than about what the screen did afterwards.
 */

import { ONCE_ONLY_WORDS } from "@chipschat/core";
import { expect, type Page, test } from "@playwright/test";
import { demo, Harness, newApprovalId, newRunId, pair, registerSpecialist } from "./support.ts";

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
      question: "Send this email to dana@northwind.com?",
      effect: "It confirms PO #4471 for 120 units.",
      lasts: "once",
      preview: { format: "markdown", body: "Hi Dana, confirming PO #4471 for 120 units." },
      risk: ["external_communication", "irreversible"],
      expires_in: 3600,
      editable: true,
      ...extra,
    }),
  ).toMatchObject({ frame: "ack" });
  return approvalId;
}

/**
 * The newest ask at the foot of the room. The demo workspace is shared by every spec in this
 * file, so the one this test raised is the last one.
 */
const asks = (page: Page) => page.getByTestId("room-asks");
const card = (page: Page) => asks(page).getByText("Scout asks").last();

/** Paired, in the demo room, with Scout's run started there. */
async function start(page: Page): Promise<Harness> {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  await harness.send("run.started", { goal: "Confirm PO #4471.", plan: [] });
  await pageToRoom(page);
  return harness;
}

test("an ask arrives at the foot of the room, with its risks and what lapsing would mean", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    await askToEmail(harness);
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    // The harness's question heads the card, with what a yes does under it (ADR 0142).
    await expect(
      asks(page).getByText("Send this email to dana@northwind.com?").last(),
    ).toBeVisible();
    await expect(asks(page).getByText("It confirms PO #4471 for 120 units.").last()).toBeVisible();
    await expect(asks(page).getByText("Just this once").last()).toBeVisible();
    await expect(asks(page).getByText("External message")).toBeVisible();
    await expect(asks(page).getByText("Not reversible")).toBeVisible();
    await expect(
      asks(page)
        .getByText(/Denied in .* if you don't answer/)
        .last(),
    ).toBeVisible();
    // Answered before leaving, so the next test opens on a room with no asks: the demo workspace
    // is shared, and a card left behind makes "the newest card" mean two different things.
    await asks(page).getByRole("button", { name: "Approve" }).last().click();
    await harness.next("approval.resolved");
  } finally {
    harness.close();
  }
});

test("deny, from the ask's own screen, with the reason the harness reads", async ({ page }) => {
  const harness = await start(page);
  try {
    const approvalId = await askToEmail(harness);
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await asks(page).getByRole("button", { name: "Details" }).last().click();

    await expect(page.getByText("Send this email to dana@northwind.com?").last()).toBeVisible();
    await page.getByRole("button", { name: "Deny" }).first().click();
    await page.getByTestId("deny-input").fill("Wrong supplier this quarter");
    await page.getByTestId("deny-form").getByRole("button", { name: "Deny" }).click();

    const resolved = await harness.next("approval.resolved");
    expect(resolved).toMatchObject({
      approval_id: approvalId,
      decision: "denied",
      reason: "Wrong supplier this quarter",
    });
  } finally {
    harness.close();
  }
});

test("an ask that matters waits for you and is answered once: no scope beyond it (ADR 0195)", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    await askToEmail(harness);
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await asks(page).getByRole("button", { name: "Details" }).last().click();
    await expect(page.getByTestId("waits-for-you")).toContainText("Waits for you");
    await expect(page.getByTestId("once-only")).toHaveText(ONCE_ONLY_WORDS);
    await expect(page.getByRole("radio", { name: "For an hour" })).toHaveCount(0);
    await page.getByRole("button", { name: "Approve once" }).click();
    expect(await harness.next("approval.resolved")).toMatchObject({
      decision: "approved",
      scope: "once",
    });
  } finally {
    harness.close();
  }
});

test("approve a smaller ask with a scope beyond this once, which is a policy rule being written", async ({
  page,
}) => {
  // A harness of its own, which starts at L1, so a smaller ask waits for an answer: in the demo
  // room, at L2, policy would answer it before the card came.
  const juniper = await registerSpecialist("Juniper");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: juniper.token, space: juniper.space });
  try {
    await harness.send("run.started", { goal: "Update the tracker.", plan: [] });
    await page.getByRole("tab", { name: "Spaces" }).click();
    await page
      .getByRole("button", { name: /^Juniper/ })
      .first()
      .click();
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
    await harness.send("approval.request", {
      approval_id: newApprovalId(),
      action: { kind: "tracker.write", input: { row: 4471 } },
      question: "Mark PO #4471 confirmed in the tracker?",
      risk: [],
      expires_in: 3600,
    });
    await expect(asks(page).getByText("Juniper asks").last()).toBeVisible({ timeout: 20_000 });
    await asks(page).getByRole("button", { name: "Details" }).last().click();
    await page.getByRole("radio", { name: "For an hour" }).click();
    await page.getByRole("button", { name: "Approve for an hour" }).click();
    expect(await harness.next("approval.resolved")).toMatchObject({
      decision: "approved",
      scope: "once",
      for_minutes: 60,
    });
  } finally {
    harness.close();
  }
});

test("steer, from the space, through the same command core gives the desktop", async ({ page }) => {
  const harness = await start(page);
  try {
    await page.getByTestId("composer").fill("/steer use the other address");
    await page.getByRole("button", { name: "Send" }).click();
    expect(await harness.next("run.steer")).toMatchObject({
      mode: "steer",
      text: "use the other address",
    });
  } finally {
    harness.close();
  }
});

test("a message typed in the space reaches the log", async ({ page }) => {
  const harness = await start(page);
  try {
    const text = `From a phone, ${Date.now()}`;
    await page.getByTestId("composer").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    // Scoped to the list: the Spaces tab is still mounted behind this screen, and its row for
    // this space now previews the same words at zero size.
    await expect(page.getByTestId("space-lines").getByText(text).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    harness.close();
  }
});

test("a tap on the box's margin puts the caret in it, not nowhere", async ({ page }) => {
  await pair(page);
  await pageToRoom(page);
  // Six points in from the left edge at half height: inside the pill — its corners are round,
  // and a point in the corner is the row behind it — in the padding, left of any text. A phone
  // is aimed with a thumb, and a field whose only target is its glyphs is one that ignores you.
  await page.getByTestId("composer-field").click({ position: { x: 6, y: 22 } });
  await expect(page.getByTestId("composer")).toBeFocused();
});

test("approve, from the card at the foot of the room, at scope once", async ({ page }) => {
  const harness = await start(page);
  try {
    const approvalId = await askToEmail(harness);
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await asks(page).getByRole("button", { name: "Approve" }).click();
    expect(await harness.next("approval.resolved")).toMatchObject({
      approval_id: approvalId,
      decision: "approved",
      scope: "once",
      resolved_by: demo().person.id,
    });
    // Answered, so it leaves the room's foot on its own.
    await expect(asks(page)).toHaveCount(0, { timeout: 20_000 });
  } finally {
    harness.close();
  }
});

/** Into the demo space, which is where the harness is running. */
async function pageToRoom(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: /PO-4471/ }).click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
}
