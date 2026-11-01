/**
 * Deleting a message (ADR 0167), end to end: for the reader alone at once, breaking into dust,
 * with Undo for five seconds; and for everyone after a question, leaving a tombstone. Every step is
 * an event through the door and back through the socket, and a reload is the proof of what the
 * log now says for this person.
 *
 * The dust itself is drawn on a canvas a test cannot read; what it can see is the row breaking,
 * the room closing, the line gone, and the line forming again.
 */

import { DUST_MS } from "@chipschat/core";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { pair } from "./support.ts";

/**
 * Opens a line's menu and picks from it. A scroll closes the menu (LineMenu's `useDismiss`), and
 * the room scrolls when an agent's state lands under a line just sent (Scout "can't answer yet"),
 * so on a slow machine the menu can be gone before the pick: then it is opened again, as a person
 * would.
 */
async function pick(page: Page, line: Locator, name: string): Promise<void> {
  const menu = page.getByTestId("line-menu");
  await expect(async () => {
    if (!(await menu.isVisible())) await line.click({ button: "right" });
    await menu.getByRole("menuitem", { name }).click({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

test("delete for me breaks the line away, Undo brings it back, and it stays gone once let go", async ({
  page,
}) => {
  await pair(page);
  const stamp = Date.now();
  const box = page.getByLabel("Message PO-4471");
  const messages = page.getByTestId("messages");
  const pill = page.getByTestId("undo-pill");

  await box.fill(`Dust me ${stamp}`);
  await box.press("Enter");
  const mine = messages.locator(".msg[data-mine='true']").filter({ hasText: `Dust me ${stamp}` });
  await expect(mine).toBeVisible();

  // Asked nothing: it breaks away at once, the room closes over it, and Undo is offered.
  await pick(page, mine, "Delete for me");
  await expect(mine).toHaveAttribute("data-breaking", "away");
  await expect(mine).toHaveCount(0);
  await expect(pill).toContainText("Deleted for you");

  // Undo: the line opens its place and forms there, and is a line again once it has.
  await pill.getByRole("button", { name: "Undo" }).click();
  await expect(mine).toBeVisible();
  await expect(mine).not.toHaveAttribute("data-breaking", /./, { timeout: 5000 });
  await expect(pill).toHaveCount(0);
  await page.reload();
  await page
    .getByTestId("space-list")
    .getByRole("button", { name: /PO-4471/ })
    .click();
  await expect(mine).toBeVisible();

  // Deleted again and let go: the count runs out, and the log keeps it gone for this person.
  await pick(page, mine, "Delete for me");
  await expect(mine).toHaveCount(0);
  await expect(pill).toHaveCount(0, { timeout: 8000 });
  await page.reload();
  await page
    .getByTestId("space-list")
    .getByRole("button", { name: /PO-4471/ })
    .click();
  await expect(messages).toBeVisible();
  await expect(mine).toHaveCount(0);
});

test("delete for everyone asks first, then leaves a tombstone in the line's place", async ({
  page,
}) => {
  await pair(page);
  const stamp = Date.now();
  const box = page.getByLabel("Message PO-4471");
  const messages = page.getByTestId("messages");
  const menu = page.getByTestId("line-menu");

  await box.fill(`Take me back ${stamp}`);
  await box.press("Enter");
  const sent = messages
    .locator(`.msg[data-mine='true']`)
    .filter({ hasText: `Take me back ${stamp}` });
  await expect(sent).not.toHaveAttribute("data-pending", "true");
  // Held by its id from here: as a tombstone it no longer says its words, and once it is gone a
  // `.last()` would find an older line of this person's.
  const mine = messages.locator(`.msg[data-line='${await sent.getAttribute("data-line")}']`);
  await expect(mine).toContainText(`Take me back ${stamp}`);

  await pick(page, mine, "Delete for everyone");
  // The question says what happens, and what the agents in the room keep.
  await expect(page.getByTestId("line-menu-asking")).toContainText("Delete for everyone?");
  await expect(page.getByTestId("line-menu-asking")).toContainText("keep what they read");
  await menu.getByRole("menuitem", { name: "Cancel" }).click();
  await expect(menu.getByRole("menuitem", { name: "Delete for me" })).toBeVisible();

  await menu.getByRole("menuitem", { name: "Delete for everyone" }).click();
  await menu.getByRole("menuitem", { name: "Delete for everyone" }).click();
  await expect(mine.getByTestId("tombstone")).toContainText("Message taken back");
  await expect(mine).not.toHaveAttribute("data-breaking", /./);
  // Seen, and not only in the page: nothing of the wipe is left over it once the dust has gone.
  await page.waitForTimeout(DUST_MS);
  await expect(mine.getByTestId("tombstone")).toBeVisible();
  await expect(mine.getByTestId("tombstone")).toHaveCSS("mask-image", "none");
  await expect(page.getByTestId("undo-pill")).toHaveCount(0);

  // A tombstone may still be deleted for oneself, and then it is gone too.
  await mine.click({ button: "right" });
  await expect(menu.getByRole("menuitem")).toHaveCount(1);
  await pick(page, mine, "Delete for me");
  await expect(mine.getByTestId("tombstone")).toHaveCount(0);
  await expect(page.getByTestId("undo-pill")).toContainText("Deleted for you");
});
