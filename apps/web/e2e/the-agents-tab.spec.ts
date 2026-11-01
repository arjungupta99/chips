/**
 * ADR 0087, Phase 5: the Agents tab, an agent's card and its message history, on the desktop.
 *
 * Wren is a harness whose default agent sits in the direct room it came with, and Finch is a
 * second agent of Wren's, free. Arjun asks Wren something in its room. He opens a room, Attic,
 * puts Finch in it, asks Finch something there, and leaves Attic. On the Agents page Wren's
 * history is its room under a divider marked *now*, with what he asked; Finch is in a room he isn't
 * in, and its history is that room's dates and a count, with no name.
 *
 * Named to run after `approval-loop.spec.ts`, which needs the workspace as the demo left it: the
 * app opens on the newest room, and this spec makes one.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
import {
  addMember,
  closeSheet,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerAgent,
  registerSpecialist,
  roomSheet,
  sheetBack,
} from "./support.ts";

/** Arjun says something in the open room. */
async function say(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: /Message/ }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText(text);
}

test("an agent's history is its rooms, and a room you're not in is a count", async ({ page }) => {
  const wren = await registerSpecialist("Wren", undefined, [HARNESS_CAPABILITIES.agents]);
  const finch = await registerAgent(wren, "finch", "Finch");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: wren.token, space: wren.space });
  try {
    // Wren's own room: what Arjun asks it there is in its history.
    await page.getByTestId("space-list").locator(`[data-space="${wren.space}"]`).click();
    await say(page, "Wren, is the shed order in?");

    // Attic, with Finch in it, asked something, and left.
    await page.getByRole("button", { name: "Create new space" }).click();
    // Nobody asked: Empty (ADR 0148).
    await pickEmpty(page);
    const name = page.getByRole("textbox", { name: "Name the space" });
    await name.fill("Attic");
    await name.press("Enter");
    await expect(page.getByRole("main", { name: "Space: Attic" })).toBeVisible();
    await expect(page.getByTestId("room-sheet-add-done")).toBeVisible();
    await addMember(page, { id: finch });
    await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(2);
    await closeSheet(page);
    await say(page, "Finch, which lamp is cheaper?");
    await page.getByRole("textbox", { name: /Message/ }).fill("/leave");
    await page.getByRole("textbox", { name: /Message/ }).press("Enter");
    await expect(page.getByRole("main", { name: "Space: Attic" })).toHaveCount(0);

    // The Agents page: Wren in its room, Finch in a room Arjun isn't in.
    await page.getByRole("button", { name: /^Agents/ }).click();
    const finchRow = page.getByTestId(`agent-${finch}`);
    await expect(finchRow).toContainText("Finch");
    await expect(finchRow).toContainText("Wren · in a space you're not in");

    await finchRow.click();
    await expect(page.getByRole("heading", { name: "Finch", level: 1 })).toBeVisible();
    await expect(page.getByTestId("away-count")).toHaveText("1 message in a space you're not in");
    await expect(page.getByRole("region", { name: "Message history" })).not.toContainText("Attic");
    await page.getByRole("button", { name: "‹ Agents" }).click();

    // Its default agent, named for the harness, in the untitled room it came with. Its card's
    // dates hold their place while the server is asked, so nothing after them moves when they
    // come; drawn only once the answer came, they pushed Now aside (2 October 2026).
    let answer: () => void = () => {};
    const asked = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await page.route("**/v1/agents/*/stays", async (route) => {
      await asked;
      await route.continue();
    });
    const wrenRow = page.locator('[data-testid^="agent-agt_"]', { hasText: "Wren · with you" });
    await wrenRow.click();
    await expect(page.getByRole("heading", { name: "Wren", level: 1 })).toBeVisible();
    await expect(page.getByTestId("agent-stay")).toContainText("Since");
    await expect(page.getByTestId("agent-stay-dates")).toHaveText("");
    const before = await page.getByTestId("agent-now").boundingBox();
    answer();
    await expect(page.getByTestId("agent-stay-dates")).toHaveText(/^\d{1,2} [A-Z][a-z]{2}$/);
    expect(await page.getByTestId("agent-now").boundingBox()).toEqual(before);
    await page.unroute("**/v1/agents/*/stays");
    const history = page.getByRole("region", { name: "Message history" });
    await expect(history.getByTestId("divider-now")).toBeVisible();
    await expect(history).toContainText("Wren, is the shed order in?");
  } finally {
    harness.close();
  }
});

test("an agent's row in a room's sheet opens its page (ADR 0111 addendum)", async ({ page }) => {
  const curlew = await registerSpecialist("Curlew", undefined, [HARNESS_CAPABILITIES.agents]);
  await pair(page);
  await page.getByTestId("space-list").locator(`[data-space="${curlew.space}"]`).click();
  const sheet = await roomSheet(page);
  // The agent's row is one button, which the sheet goes away for; the person's row is not one.
  const open = sheet.getByRole("button", { name: "Open Curlew's page" });
  await expect(sheet.locator('[data-testid^="room-sheet-member-"]')).toHaveCount(1);
  await open.hover();
  if (process.env["CHIPS_E2E_SHOTS"] !== undefined) {
    await sheet.screenshot({ path: `${process.env["CHIPS_E2E_SHOTS"]}/members-open.png` });
  }
  await open.click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Curlew", level: 1 })).toBeVisible();
  await expect(page.getByTestId("agent-sub")).toHaveText("Curlew");
});
