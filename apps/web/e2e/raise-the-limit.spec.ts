/**
 * ADR 0282 on the web, against a scratch server: a job that says its cost only as it finishes, as
 * Claude Code does, comes to $3.10 in a room that allows $3.00. Chips holds the agents, and once the
 * run has ended the banner says the job came to it when it finished, with Raise the limit and Carry
 * on at $3.00. Raise the limit opens Spend per job on $5; its Save sets $5 and lets the agents carry
 * on in one request, and the room says both in one line. Afterwards the tile says the last job and
 * the page lists it, held, with the room's total. Scribe is played by the test over its own socket.
 *
 * With `CHIPS_E2E_SHOTS` set to a folder, it leaves a picture of each step there.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  closeSheet,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerSpecialist,
  roomSheet,
  sheetBack,
} from "./support.ts";

const SHOTS = process.env["CHIPS_E2E_SHOTS"];
const shot = async (page: Page, name: string) => {
  if (SHOTS !== undefined) {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });
  }
};

test("a job held at the ceiling as it finished is raised from the banner, carried on, and kept in sight", async ({
  page,
}) => {
  const reader = await registerSpecialist("Scribe");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: reader.token, space: reader.space });
  try {
    await page.getByRole("button", { name: "Create new space" }).click();
    await pickEmpty(page);
    const name = page.getByRole("textbox", { name: "Name the space" });
    await name.fill("Explainer");
    await name.press("Enter");
    await expect(page.getByRole("main", { name: "Space: Explainer" })).toBeVisible();
    const sheet = page.getByTestId("room-sheet");
    await expect(sheet.getByTestId("room-sheet-add-page")).toBeVisible();
    await sheet.getByTestId("room-sheet-other-rooms").click();
    await sheet
      .locator('[data-testid^="room-sheet-agent-"]', { hasText: "Scribe" })
      .first()
      .click();
    await sheet.getByTestId("room-sheet-move").click();
    harness.space = String((await harness.event("membership.added"))["space_id"]);
    await sheetBack(page);
    await closeSheet(page);

    // Arjun's message begins the job; Scribe works, and says what it cost only as it finishes.
    await page.getByRole("textbox", { name: /Message/ }).fill("@Scribe explain the architecture");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await harness.next("message.new");
    await harness.send("run.started", { goal: "Explain the architecture", plan: [] });
    await harness.send("usage", {
      scope: "run",
      model: "Claude Code",
      cost: { usd: 3.096_719, estimated: true },
    });
    await harness.send("message.post", { text: "The page is written." });
    await harness.send("run.completed", { summary: "The page is written." });

    const banner = page.getByTestId("paused-banner");
    await expect(banner).toContainText(
      "Scribe's job came to $3.10 when it finished, past the $3.00 this space allows a job. The agents start nothing new until somebody lets them.",
    );
    await expect(banner.getByRole("button", { name: "Carry on at $3.00" })).toBeVisible();
    await shot(page, "1-banner");

    // Raise the limit: Spend per job on the next amount up, its Save carrying on too.
    await banner.getByRole("button", { name: "Raise the limit" }).click();
    await expect(sheet.getByTestId("spend-5")).toBeChecked();
    await expect(sheet.getByTestId("spend-since")).toContainText("Since your message at");
    await expect(sheet.getByTestId("spend-so-far")).toContainText("$3.10 of $5.00");
    await shot(page, "2-raise");
    await sheet.getByRole("button", { name: "Save $5.00 and carry on" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("paused-banner")).toHaveCount(0);
    await expect(page.getByTestId("messages")).toContainText(
      "raised the limit to $5.00 and let the agents carry on after $3.10.",
    );
    await expect(page.getByTestId("messages")).not.toContainText("set the spend per job to $5.00");
    await shot(page, "3-carried-on");

    // The new job has spent nothing; the last one stays in sight on the tile and on the page.
    const tile = (await roomSheet(page)).getByTestId("room-sheet-spend");
    await expect(tile).toContainText("$0.00 of $5.00");
    await expect(tile).toContainText("Last job $3.10");
    await tile.click();
    await expect(sheet.getByTestId("spend-since")).toContainText("Since you let them carry on at");
    const job = sheet.locator('[data-testid^="spend-job-"]');
    await expect(job).toHaveCount(1);
    await expect(job).toContainText("Scribe");
    await expect(job).toContainText("Held");
    await expect(job).toContainText("$3.10");
    await expect(sheet.getByTestId("spend-total")).toContainText("$3.10");
    await shot(page, "4-jobs");
    // A job goes to its reply, and the sheet goes.
    await job.getByRole("button").click();
    await expect(sheet).toHaveCount(0);
  } finally {
    harness.close();
  }
});
