/**
 * M3.3's acceptance: a space with two harnesses and two people in it, where an approval from one
 * harness is answered by the right person per policy. Arjun opens a room, adds Scout, Ledger and
 * Dana; Dana, in a second browser, reads the room from its beginning; a message that names Ledger
 * reaches it as one that names it; one Arjun picks Dana for, and her answer for him, give neither
 * harness a turn (ADR 0204); what the two harnesses say to each other folds into one row;
 * Ledger's ask is Dana's to answer, because Ledger is hers, and Arjun's screen says so; the room
 * is renamed and closed, and Dana's screen follows. Both harnesses and both people are driven by
 * the test; nothing is seeded.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  addMember,
  closeSheet,
  demo,
  type Frame,
  Harness,
  newApprovalId,
  newRunId,
  pair,
  pairWith,
  pickEmpty,
  registerAgent,
  registerPerson,
  registerSpecialist,
  roomSheet,
  sheetBack,
} from "./support.ts";

test("a room with two harnesses and two people, and the right person answers", async ({
  page,
  browser,
}) => {
  // Dana, and Ledger as her harness, exist before Arjun pairs: his directory is read as he does.
  const dana = await registerPerson("Dana");
  const ledger = await registerSpecialist("Ledger", dana.id);
  await pair(page);
  const scout = await Harness.connect(newRunId());
  const ledgerHarness = await Harness.connect(newRunId(), {
    token: ledger.token,
    space: ledger.space,
  });
  const danaContext = await browser.newContext();
  const danaPage = await danaContext.newPage();
  try {
    await pairWith(danaPage, dana.code);

    // Arjun opens the room, asking no harness into it, and says something in it before anyone
    // else is there.
    await page.getByRole("button", { name: "Create new space" }).click();
    // Nobody asked: Empty (ADR 0148).
    await pickEmpty(page);
    const name = page.getByRole("textbox", { name: "Name the space" });
    await name.fill("Northwind");
    await name.press("Enter");
    await expect(page.getByTestId("new-space-window")).toHaveCount(0);
    const room = page.getByRole("main", { name: "Space: Northwind" });
    await expect(room).toBeVisible();
    // Its sheet comes up on Add (ADR 0148); put away for now, the room takes the first message.
    await expect(page.getByTestId("room-sheet-add-done")).toBeVisible();
    await closeSheet(page);
    await page.getByRole("textbox", { name: /Message/ }).fill("Kicking off the Northwind check.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("messages")).toContainText("Kicking off the Northwind check.");

    // Scout, Ledger and Dana, from the room's sheet (ADR 0151). An agent is in one room at a
    // time (ADR 0087): Scout's is a second one, free, so its first stays in the demo room;
    // Ledger's is moved from the direct room it came with, which Arjun may do as the workspace's
    // owner.
    const scoutHere = await registerAgent(demo().harness, "northwind-group", "Scout");
    await addMember(page, { id: scoutHere });
    await addMember(page, { moving: "Ledger" });
    await addMember(page, { id: dana.id });
    await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(4);
    await closeSheet(page);

    // The harnesses learn the room from being added to it.
    const joined = await ledgerHarness.event("membership.added");
    const groupId = String(joined["space_id"]);
    ledgerHarness.space = groupId;
    scout.space = groupId;

    // Dana was added while looking: the room appears, from its beginning.
    await danaPage
      .getByTestId("space-list")
      .getByRole("button", { name: /Northwind/ })
      .click();
    const danaRoom = danaPage.getByRole("main", { name: "Space: Northwind" });
    await expect(danaRoom).toBeVisible();
    await expect(danaPage.getByTestId("messages")).toContainText(
      "Kicking off the Northwind check.",
    );

    // A message that names Ledger reaches Ledger as one that names it.
    await page.getByRole("textbox", { name: /Message/ }).fill("@Ledger are the quotes in line?");
    await page.getByRole("button", { name: "Send" }).click();
    const heard = await ledgerHarness.next("message.new");
    expect(heard["mentions"]).toEqual([ledger.id]);

    // A message can be for a person (ADR 0204): Arjun picks Dana from the field's list, under
    // the agents, and neither harness takes a turn on it; both overhear it.
    const said = (text: string) => (frame: Frame) =>
      ((frame["event"] as Frame | undefined)?.["text"] as string | undefined) === text;
    await page.getByRole("button", { name: "To Ledger", exact: true }).click();
    const menu = page.getByRole("listbox", { name: "Where the next message goes" });
    await menu.getByRole("option", { name: "Dana, @Dana", exact: true }).click();
    await expect(page.getByRole("button", { name: "To Dana", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Message Dana" }).fill("Dana, are the totals right?");
    await page.getByRole("button", { name: "Send" }).click();
    for (const who of [scout, ledgerHarness]) {
      const frame = await who.waitFor(said("Dana, are the totals right?"), "Arjun's ask of Dana");
      expect(frame["event"]).toMatchObject({ type: "message.overheard", addressed_to: [] });
    }
    const row = (on: Page, text: string) =>
      on.getByTestId("messages").locator("[data-line]", { hasText: text });
    await expect(
      row(page, "are the totals right?").getByRole("button", { name: "Went to Dana" }),
    ).toBeVisible();
    // Dana answers him alone from her own list: Arjun is under the agents there.
    const arjun = demo().person.displayName;
    await danaPage.getByRole("button", { name: /^To / }).click();
    await danaPage
      .getByRole("listbox", { name: "Where the next message goes" })
      .getByRole("option", { name: new RegExp(`^${arjun},`) })
      .click();
    await expect(danaPage.getByRole("button", { name: `To ${arjun}`, exact: true })).toBeVisible();
    await danaPage.getByRole("textbox", { name: `Message ${arjun}` }).fill("They match, Arjun.");
    await danaPage.getByRole("button", { name: "Send" }).click();
    for (const who of [scout, ledgerHarness]) {
      const frame = await who.waitFor(said("They match, Arjun."), "Dana's answer");
      expect(frame["event"]).toMatchObject({ type: "message.overheard", addressed_to: [] });
    }
    await expect(
      row(page, "They match, Arjun.").getByRole("button", { name: `Went to ${arjun}` }),
    ).toBeVisible();

    // Both harnesses are working in the room: every event a harness sends names its run.
    for (const [who, goal] of [
      [scout, "Check the Northwind quotes."],
      [ledgerHarness, "Compare the quotes with last quarter."],
    ] as const) {
      expect(await who.send("run.started", { goal })).toMatchObject({ frame: "ack" });
    }

    // What the harnesses say to each other folds into one row; what they tell the room does not.
    for (const [who, text] of [
      [scout, "@Ledger which warehouse?"],
      [ledgerHarness, "@Scout the finance one."],
      [scout, "Checking the Northwind quotes now."],
    ] as const) {
      expect(await who.send("message.post", { text })).toMatchObject({ frame: "ack" });
    }
    // Their faces with a two-way arrow, the count and the latest line (ADR 0081); the names are
    // the fold's button's to say.
    const fold = page.getByTestId("chatter");
    await expect(fold.getByRole("button", { name: "Scout and Ledger · 2 messages" })).toBeVisible();
    await expect(fold).toContainText("2 messages");
    await expect(page.getByTestId("messages")).not.toContainText("which warehouse");
    await expect(page.getByTestId("messages")).toContainText("Checking the Northwind quotes now.");
    await fold.getByRole("button").click();
    await expect(page.getByTestId("messages")).toContainText("which warehouse");

    // Ledger asks. It is Dana's, so the ask is Dana's to answer: Arjun's screen says so and
    // offers nothing; Dana's offers Approve, and her yes reaches Ledger.
    const approvalId = newApprovalId();
    const asked = await ledgerHarness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "email.send", input: { to: "finance@northwind.example" }, external: true },
      preview: { format: "markdown", body: "Asking Northwind for last quarter's price list." },
      risk: ["external_communication"],
      expires_in: 3600,
    });
    expect(asked).toMatchObject({ frame: "ack" });
    const card = page.getByRole("article", { name: /Approval/ });
    await expect(card.getByTestId("waiting-on")).toHaveText("Waiting on Dana");
    await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);

    const danaCard = danaPage.getByRole("article", { name: /Approval/ });
    await danaCard.getByRole("button", { name: "Approve" }).click();
    const resolved = await ledgerHarness.event("approval.resolved");
    expect(resolved).toMatchObject({ approval_id: approvalId, resolved_by: dana.id });
    await expect(card).toContainText("Approved by Dana");

    // Renamed where its name stands and archived by Arjun; Dana's screen follows, and the room
    // says who did it.
    const sheet = await roomSheet(page);
    await sheet.getByTestId("room-sheet-title").click();
    await sheet.getByTestId("room-sheet-title-field").fill("Northwind quotes");
    await sheet.getByTestId("room-sheet-title-field").press("Enter");
    await expect(danaPage.getByRole("main", { name: "Space: Northwind quotes" })).toBeVisible();
    await expect(danaPage.getByTestId("messages")).toContainText(
      "renamed this space to Northwind quotes",
    );
    await sheet.getByTestId("archive-space").click();
    await page.getByTestId("confirm-dialog").getByTestId("confirm-go").click();
    await expect(danaPage.getByTestId("archived-list")).toContainText("Northwind quotes");
    await expect(danaPage.getByTestId("archived")).toBeVisible();
  } finally {
    scout.close();
    ledgerHarness.close();
    await danaContext.close();
  }
});
