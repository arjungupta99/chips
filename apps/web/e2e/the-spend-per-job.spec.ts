/**
 * ADR 0117's acceptance on the Mac: a room's spend per job. Arjun sets the room's ceiling from the
 * room's sheet (ADR 0151) to $10, and the room says he did. His message begins a job, and Reader's turn
 * carries what it has spent, $0.00 of $10.00, as `context.spend` and as the last line of its
 * note. Reader's run reports $0.40, and the sheet says the job has spent $0.40 of $10.00.
 * Reader is played by the test over its own socket, as the adapters connect.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  closeSheet,
  type Frame,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerSpecialist,
  roomSheet,
  sheetBack,
} from "./support.ts";

/** Arjun says something; the room draws a mention as a chip with the name, so look for the rest. */
async function say(page: Page, text: string, rest: string): Promise<void> {
  await page.getByRole("textbox", { name: /Message/ }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText(rest);
}

test("a room's spend per job is set from the sheet, handed to the agent's turn, and counted", async ({
  page,
}) => {
  const reader = await registerSpecialist("Reader");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: reader.token, space: reader.space });
  // A room with nobody asked into it, and Reader moved into it.
  await page.getByRole("button", { name: "Create new space" }).click();
  // Nobody asked: Empty (ADR 0148).
  await pickEmpty(page);
  const name = page.getByRole("textbox", { name: "Name the space" });
  await name.fill("Trials");
  await name.press("Enter");
  await expect(page.getByRole("main", { name: "Space: Trials" })).toBeVisible();
  // Its sheet comes up on Add (ADR 0148): Reader, from In other rooms, moved here.
  const sheet = page.getByTestId("room-sheet");
  await expect(sheet.getByTestId("room-sheet-add-page")).toBeVisible();
  await sheet.getByTestId("room-sheet-other-rooms").click();
  await sheet.locator('[data-testid^="room-sheet-agent-"]', { hasText: "Reader" }).first().click();
  await sheet.getByTestId("room-sheet-move").click();
  harness.space = String((await harness.event("membership.added"))["space_id"]);

  // The room allows a job $3 until Arjun sets $10 on the sheet's Spend per job and saves it; the
  // room says he did.
  await sheetBack(page);
  const row = sheet.getByTestId("room-sheet-spend");
  await expect(row).toContainText("$3.00");
  await row.click();
  await sheet.locator("label", { has: page.getByTestId("spend-10") }).click();
  await expect(sheet.getByTestId("spend-10")).toBeChecked();
  await sheet.getByTestId("spend-save").click();
  await expect(row).toContainText("$10.00");
  await expect(page.getByTestId("messages")).toContainText("set the spend per job to $10.00");
  await closeSheet(page);

  // His message begins a job, and Reader's turn is handed what it has spent.
  await say(page, "@Reader read the trials", "read the trials");
  const turn = await harness.next("message.new");
  expect(turn["context"]).toMatchObject({
    spend: { ceiling_usd: 10, spent_usd: 0, uncounted_runs: 0 },
  });
  const notes = Object.values((turn["room"] as { notes: Record<string, string> }).notes);
  // The space's rules end the note (ADR 0250), so the spend sentence comes just before them.
  expect(notes[0]).toMatch(
    /This job has spent \$0\.00 of the \$10\.00 this space allows a job; at \$10\.00 Chips holds the agents until a person acts\. Everyone here reads what you write\.$/,
  );

  // Reader's run reports $0.40, and says so in the room; the sheet counts it.
  expect((await harness.send("run.started", { goal: "Read the trials", plan: [] }))["frame"]).toBe(
    "ack",
  );
  const usage: Frame = {
    scope: "run",
    model: "a-model",
    output_tokens: 400,
    cost: { usd: 0.4, estimated: true },
  };
  expect((await harness.send("usage", usage))["frame"]).toBe("ack");
  expect((await harness.send("message.post", { text: "Six trials, all small." }))["frame"]).toBe(
    "ack",
  );
  await expect((await roomSheet(page)).getByTestId("room-sheet-spend")).toContainText(
    "This job so far: $0.40",
  );
  harness.close();
});
