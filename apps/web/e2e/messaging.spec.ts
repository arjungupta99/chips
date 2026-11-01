/**
 * Messaging depth (M5.4), end to end: a person edits their own line, pins it, finds it by search,
 * and takes it back. Search also finds an agent by its name and the room by its own (ADR 0132's
 * addendum), and the line it opens marks the words searched for, for a moment (ADR 0133). Every step is an event through the door and back through the socket;
 * nothing here is drawn from local state alone. The thread step went with the offer (ADR 0035's
 * addendum, 15 September 2026).
 *
 * Every one of them is asked for by right-clicking the line, which is the real gesture and the
 * one a unit test cannot make.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { pair, registerAgent, registerSpecialist } from "./support.ts";

test("edit, pin, search and take back", async ({ page }) => {
  // An agent to be found by its name: in no room, so it changes nothing the other specs talk to.
  const quill = await registerSpecialist("Quill", undefined, [HARNESS_CAPABILITIES.agents]);
  const tally = await registerAgent(quill, "tally", "Tally");
  await pair(page);
  const stamp = Date.now();
  const box = page.getByLabel("Message PO-4471");
  const messages = page.getByTestId("messages");

  // Said, then changed: the line shows the new words, marked as edited.
  await box.fill(`Northwind quotes ${stamp} are in.`);
  await box.press("Enter");
  const mine = messages.locator(".msg[data-mine='true']").last();
  const menu = page.getByTestId("line-menu");
  await expect(mine).toContainText("are in.");
  await mine.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByLabel("Edit message");
  await edit.fill(`Northwind quotes ${stamp} are in, finally.`);
  await edit.press("Enter");
  await expect(mine).toContainText("are in, finally.");
  await expect(mine.getByTestId("edited")).toBeVisible();

  // Pinned: the strip at the top names it, and unpinning clears it.
  await mine.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Pin to the top" }).click();
  await expect(page.getByTestId("pins")).toContainText(`Northwind quotes ${stamp}`);
  await mine.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Unpin from the top" }).click();
  await expect(page.getByTestId("pins")).toHaveCount(0);

  // Search finds an agent by its name, and opens its page.
  const field = page.getByLabel("Search spaces, agents and messages");
  await page.getByRole("button", { name: "Search" }).click();
  await field.fill("tal");
  const agent = page.getByTestId(`result-agent-${tally}`);
  await expect(agent.locator("mark")).toHaveText("Tal");
  await agent.click();
  await expect(page.getByRole("heading", { name: "Tally", level: 1 })).toBeVisible();

  // And the room by its own, and opens it.
  await page.getByRole("button", { name: "Search" }).click();
  await expect(field).toHaveValue("tal");
  await field.fill("po-44");
  await page
    .getByTestId(/^result-space-/)
    .filter({ hasText: "PO-4471" })
    .click();
  await expect(page.getByRole("main", { name: "Space: PO-4471" })).toBeVisible();

  // And the line by its words, opened at the line with the words marked there for a moment.
  await page.getByRole("button", { name: "Search" }).click();
  await field.fill(`${stamp}`);
  const hits = page.getByTestId("search-hit");
  await expect(hits).toHaveCount(1);
  await expect(hits.first().locator("mark")).toHaveText(`${stamp}`);
  await hits.first().click();
  const found = messages.locator(".msg[data-focused='true']");
  await expect(found).toContainText("are in, finally.");
  await expect(found.locator(".bub mark")).toHaveText(`${stamp}`);
  await expect(found.locator(".bub mark")).toHaveCount(0, { timeout: 5000 });
  await expect(found).toContainText(`Northwind quotes ${stamp} are in, finally.`);

  // Taken back: a tombstone where the words were, and the search no longer finds them.
  await mine.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Delete for everyone" }).click();
  await menu.getByRole("menuitem", { name: "Delete for everyone" }).click();
  // The tombstone keeps the time with it: the message is gone, its place in the day is not.
  await expect(mine.getByTestId("tombstone")).toContainText("Message taken back");
  await page.getByRole("button", { name: "Search" }).click();
  await field.fill(`${stamp} finally`);
  await expect(page.getByTestId("search-empty")).toBeVisible();
});
