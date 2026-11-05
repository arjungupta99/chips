/**
 * Out of the workspace (ADR 0160): the owner removes somebody from You → People, after a dialog
 * that says what happens. Every tab of theirs says so within a moment, and so does a reload; OK
 * forgets the key and goes to pairing, never "pair again". The rooms they were in say they were
 * removed, and what they said stays under their name. Their harness becomes the owner's. Their
 * name is free, and a new invite makes a new person, who starts with nothing. Only an owner or an
 * admin is offered Remove…, never on themselves, and an admin never on an owner.
 */

import type { Page } from "../../apps/web/e2e/playwright.ts";
import { registerSpecialist } from "../../apps/web/e2e/support.ts";
import {
  addMember,
  aName,
  asOwner,
  closeSheet,
  expect,
  invite,
  join,
  newRoom,
  openedRow,
  openSpace,
  openYou,
  openYouPage,
  personId,
  roomLines,
  say,
  test,
} from "./support.ts";

test("removed, she is told in every tab, the rooms say so, and her way back is closed", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Bakery ${test.info().project.name}`;
  const priya = await join(browser, await invite(owner), aName("Priya"));
  try {
    const id = await personId(owner, priya.name);
    const ledger = await registerSpecialist(`Ledger ${priya.name.split(" ")[1]}`, id);
    await newRoom(owner, title);
    await addMember(owner, { id });
    await closeSheet(owner);
    // Her harness's own room is hers too, so she opens this one.
    await openSpace(priya.page, title);
    await say(priya.page, "Before I go: the oven needs a service.");
    // A second tab of hers, on the same key.
    const again = await priya.context.newPage();
    await again.goto(priya.page.url());
    await openSpace(again, title);

    // The owner asks first, and is told what happens.
    const row = await openedRow(owner, priya.name);
    await row.getByRole("button", { name: `Remove ${priya.name}…` }).click();
    const dialog = owner.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText(`Remove ${priya.name} from Demo?`);
    await expect(dialog).toContainText("signed out on every device now");
    await expect(dialog).toContainText(`${ledger.name} becomes yours.`);
    await expect(dialog).toContainText(`To come back, ${priya.name} needs a new invite.`);
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(owner.getByTestId("person-row").filter({ hasText: priya.name })).toHaveCount(0);

    // Every tab of hers says so, within a moment, with no way to pair again on offer.
    for (const tab of [priya.page, again]) {
      const removed = tab.getByTestId("removed");
      await expect(removed).toBeVisible({ timeout: 10_000 });
      await expect(removed.getByRole("heading")).toHaveText("You're no longer in Demo");
      await expect(removed).toContainText("To come back, ask for a new invite.");
    }
    // And again after a reload: the server says why it refuses her key, to her alone.
    await again.reload();
    await expect(again.getByTestId("removed")).toBeVisible({ timeout: 10_000 });
    await again.close();

    // The room says she was removed, and what she said stays under her name.
    await openSpace(owner, title);
    await expect(roomLines(owner)).toContainText(
      `${priya.name} was removed from the workspace by you`,
    );
    await expect(roomLines(owner)).toContainText("Before I go: the oven needs a service.");
    await expect(roomLines(owner)).toContainText(priya.name);

    // OK forgets the key and goes to pairing, not to "pair again": the first screen, with the ways
    // in under That's Chips' Set up my own Chips (ADR 0217's addendum of 26 October).
    await priya.page.getByTestId("removed").getByRole("button", { name: "OK" }).click();
    await priya.page.getByRole("button", { name: "Skip" }).click();
    await priya.page.getByRole("button", { name: "Set up my own Chips" }).click();
    await expect(priya.page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
    await expect(priya.page.getByText(/does not know this browser/)).toHaveCount(0);
  } finally {
    await priya.context.close();
  }
});

test("her name is free, and a new invite makes a new person who starts with nothing", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Studio ${test.info().project.name}`;
  const first = await join(browser, await invite(owner), aName("Mira"));
  const name = first.name;
  const id = await personId(owner, name);
  try {
    await newRoom(owner, title);
    await addMember(owner, { id });
    await closeSheet(owner);
    await (await openedRow(owner, name)).getByRole("button", { name: `Remove ${name}…` }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(first.page.getByTestId("removed")).toBeVisible({ timeout: 10_000 });
  } finally {
    await first.context.close();
  }

  const back = await join(browser, await invite(owner), name);
  try {
    // A new person by the old name: welcomed, in no room, and listed once.
    await expect(back.page.getByTestId("no-rooms-welcome")).toBeVisible();
    await expect(back.page.getByText(title)).toHaveCount(0);
    await openYouPage(owner, "people-row");
    await expect(owner.getByTestId("person-row").filter({ hasText: name })).toHaveCount(1);
    expect(await personId(owner, name)).not.toBe(id);
  } finally {
    await back.context.close();
  }
});

/** A row of People by the person's name exactly, not by "invited by" under somebody else's. */
const named = (rows: ReturnType<Page["getByTestId"]>, name: string) =>
  rows.filter({ has: rows.page().getByText(name, { exact: true }) });

/** Remove… on a person's page, opened from their row in People (ADR 0209). */
async function removeOn(page: Page, name: string) {
  await openYouPage(page, "people-row");
  const row = named(page.getByTestId("person-row"), name);
  await expect(row).toHaveCount(1);
  await row.click();
  const details = page.getByTestId("person-details");
  await expect(details).toBeVisible();
  return details.getByTestId("remove-person");
}

test("Remove… is an owner's or an admin's, never on yourself, and never an admin's on an owner", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const admin = await join(browser, await invite(owner, "admin"), aName("Asha"));
  const member = await join(browser, await invite(owner), aName("Dev"));
  try {
    // The owner: on both of them, not on themselves.
    await expect(await removeOn(owner, admin.name)).toBeVisible();
    await expect(await removeOn(owner, member.name)).toBeVisible();
    await expect(await removeOn(owner, "Arjun (you)")).toHaveCount(0);

    // The admin: on the member, not on the owner, not on themselves.
    await expect(await removeOn(admin.page, member.name)).toBeVisible();
    await expect(await removeOn(admin.page, "Arjun")).toHaveCount(0);
    await expect(await removeOn(admin.page, `${admin.name} (you)`)).toHaveCount(0);
    // Only an owner invites (his call of 14 October 2026): an admin has no Invite someone.
    await openYou(admin.page);
    await expect(admin.page.getByTestId("invite-someone")).toHaveCount(0);

    // A member has no People at all.
    await openYou(member.page);
    await expect(member.page.getByTestId("people-row")).toHaveCount(0);
  } finally {
    await admin.context.close();
    await member.context.close();
  }
});
