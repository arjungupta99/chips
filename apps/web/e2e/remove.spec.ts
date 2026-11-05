/**
 * Removing a harness (ADR 0078), end to end: a harness that takes new spaces is on the Agents
 * tab and offered by the +; removed from its card, it leaves both, and the token it was given
 * speaks for nobody. The screens and the route each have their own tests; this is them against a
 * real server, which is the only place the directory being read again can be seen to take it off
 * both lists at once.
 */

import { expect, type Page, test } from "@playwright/test";
import { pair, registerSpecialist, SERVER } from "./support.ts";

/** The + dialog, open; closed again with Escape by the caller. */
async function plus(page: Page) {
  await page.getByRole("button", { name: "Create new space" }).click();
  const dialog = page.getByRole("dialog", { name: "New space" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closePlus(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New space" })).toHaveCount(0);
}

test("a harness removed from its card leaves Harnesses and the +, and its token stops", async ({
  page,
}) => {
  // Named after Scout in the alphabet, so the +'s first choice stays the demo's harness.
  const leaving = await registerSpecialist("Tumbleweed", undefined, ["new_spaces"]);
  await pair(page);

  // Here, and offered by the +.
  let dialog = await plus(page);
  await expect(dialog.getByRole("checkbox", { name: /^Tumbleweed/ })).toBeVisible();
  await closePlus(page);
  await page.getByRole("button", { name: /^Agents/ }).click();
  // Its page, from its tile on the shelf (ADR 0254).
  const shelf = page.getByTestId("harness-shelf");
  await shelf.getByRole("button", { name: "Tumbleweed" }).click();
  const card = page.getByRole("region", { name: "Tumbleweed" });
  await expect(card).toBeVisible();

  // Asked first, then removed; the page goes once the directory is read again, back to the list.
  await card.getByTestId("remove-harness").click();
  const asking = page.getByTestId("confirm-dialog");
  await expect(asking).toContainText("Remove Tumbleweed?");
  await asking.getByTestId("confirm-go").click();
  await expect(asking).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect(shelf.getByRole("button", { name: "Scout" })).toBeVisible();
  await expect(shelf.getByRole("button", { name: "Tumbleweed" })).toHaveCount(0);

  // Gone from the + too, which still offers the demo's harness.
  dialog = await plus(page);
  await expect(dialog.getByRole("checkbox", { name: /^Scout/ })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^Tumbleweed/ })).toHaveCount(0);
  await closePlus(page);

  // Its token speaks for nobody.
  const asIt = await fetch(`${SERVER}/v1/participants`, {
    headers: { authorization: `Bearer ${leaving.token}` },
  });
  expect(asIt.status).toBe(401);
});
