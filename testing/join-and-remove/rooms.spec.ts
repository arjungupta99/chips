/**
 * In and out of a room: a person who joined is added to one of the owner's rooms, sees it come
 * with no reload, and talks both ways; the room says who came and who went (JR-5); taken out,
 * she is told by whom (JR-6); she can leave; and only those who may are offered Remove.
 */

import {
  addMember,
  aName,
  asOwner,
  closeSheet,
  expect,
  invite,
  type Joined,
  join,
  newRoom,
  OWNER,
  openSpace,
  personId,
  roomLines,
  roomSheet,
  say,
  takeOut,
  test,
} from "./support.ts";

/** A person joined by a member link, and added to a fresh room of the owner's. */
async function inARoom(
  owner: Parameters<typeof asOwner>[0],
  browser: Parameters<typeof join>[0],
  title: string,
  first = "Priya",
): Promise<Joined> {
  const joined = await join(browser, await invite(owner), aName(first));
  const id = await personId(owner, joined.name);
  await newRoom(owner, title);
  await addMember(owner, { id });
  await closeSheet(owner);
  return joined;
}

test("added to a room, she sees it at once, the room says so, and both talk", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Kitchen ${test.info().project.name}`;
  const priya = await inARoom(owner, browser, title);
  try {
    // Hers with no reload: the welcome gives way to the room, which opens (the only one she has).
    const room = priya.page.getByRole("main", { name: `Space: ${title}` });
    await expect(room).toBeVisible({ timeout: 5000 });
    // Both screens say who brought her in, each from where its reader stands (JR-5).
    await expect(roomLines(owner)).toContainText(`You added ${priya.name}`);
    await expect(roomLines(priya.page)).toContainText(`${OWNER} added you`);

    await say(owner, "Welcome in, the menu is on the wall.");
    await expect(roomLines(priya.page)).toContainText("Welcome in, the menu is on the wall.");
    await say(priya.page, "Thanks, glad to be here.");
    await expect(roomLines(owner)).toContainText("Thanks, glad to be here.");
    await expect(roomLines(owner)).toContainText(priya.name);
    // The room fits the phone: nothing wider than the window, the composer whole (JR-15).
    const width = priya.page.viewportSize()?.width ?? 0;
    expect(
      await priya.page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const composer = await priya.page.getByRole("textbox", { name: /^Message/ }).boundingBox();
    expect((composer?.x ?? 0) + (composer?.width ?? 0)).toBeLessThanOrEqual(width);
  } finally {
    await priya.context.close();
  }
});

test("taken out of a room, she is told by whom, and the room says so", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Garden ${test.info().project.name}`;
  const priya = await inARoom(owner, browser, title);
  try {
    await expect(priya.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();

    // Remove asks first, saying she is told and that what she said stays.
    await takeOut(owner, priya.name);
    const sheet = await roomSheet(owner);
    await expect(sheet.getByTestId("member").filter({ hasText: priya.name })).toHaveCount(0);
    await closeSheet(owner);
    await expect(roomLines(owner)).toContainText(`You removed ${priya.name}`);

    // Where the room was, she is told what happened and by whom, until she says OK (JR-6).
    const told = priya.page.getByTestId("removed-from-room");
    await expect(told).toBeVisible({ timeout: 5000 });
    await expect(told).toContainText(`${OWNER} removed you from ${title}`);
    await expect(priya.page.getByRole("textbox", { name: /^Message/ })).toHaveCount(0);
    await told.getByRole("button", { name: "OK" }).click();
    await expect(told).toHaveCount(0);
    // With no room left, the welcome again.
    await expect(priya.page.getByTestId("no-rooms-welcome")).toBeVisible();
  } finally {
    await priya.context.close();
  }
});

test("added back, she finds the room whole: its name, what was said, and what she missed", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Cellar ${test.info().project.name}`;
  const priya = await inARoom(owner, browser, title);
  try {
    const room = priya.page.getByRole("main", { name: `Space: ${title}` });
    await expect(room).toBeVisible();
    await say(owner, "Before she went.");
    await expect(roomLines(priya.page)).toContainText("Before she went.");

    await takeOut(owner, priya.name);
    await closeSheet(owner);
    await expect(priya.page.getByTestId("removed-from-room")).toBeVisible();
    await say(owner, "While she was out.");

    const id = await personId(owner, priya.name);
    await openSpace(owner, title);
    await addMember(owner, { id });
    await closeSheet(owner);
    // Where the notice was, the room comes back under its own name, with everything in it
    // (JR-16), with no reload and nothing to dismiss.
    await expect(priya.page.getByTestId("removed-from-room")).toHaveCount(0);
    await expect(room).toBeVisible();
    await expect(roomLines(priya.page)).toContainText("Before she went.");
    await expect(roomLines(priya.page)).toContainText("While she was out.");
    // And again after a reload, from the cache and the server.
    await priya.page.reload();
    await expect(room).toBeVisible({ timeout: 20_000 });
    await expect(roomLines(priya.page)).toContainText("Before she went.");
    await expect(roomLines(priya.page)).toContainText("While she was out.");
  } finally {
    await priya.context.close();
  }
});

test("she leaves a room, and the room says so", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const title = `Porch ${test.info().project.name}`;
  const priya = await inARoom(owner, browser, title);
  try {
    await expect(priya.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
    await priya.page.getByRole("textbox", { name: /^Message/ }).fill("/leave");
    await priya.page.getByRole("textbox", { name: /^Message/ }).press("Enter");
    // Her own leaving is no news to her: no notice, the room is simply gone.
    await expect(priya.page.getByTestId("no-rooms-welcome")).toBeVisible();
    await expect(priya.page.getByTestId("removed-from-room")).toHaveCount(0);
    await expect(roomLines(owner)).toContainText(`${priya.name} left`);
  } finally {
    await priya.context.close();
  }
});

test("she leaves from the room's sheet, after it asks, and the room says so", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Pantry ${test.info().project.name}`;
  const priya = await inARoom(owner, browser, title);
  try {
    await expect(priya.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
    // The workspace's owner is offered no Leave: the room's agents are his (ADR 0204's addendum,
    // Foodie, 19 October 2026); Hide stands in its place (ADR 0205).
    const ownersSheet = await roomSheet(owner);
    await expect(ownersSheet.getByTestId("hide-space")).toBeVisible();
    await expect(ownersSheet.getByTestId("leave-space")).toHaveCount(0);
    await closeSheet(owner);
    const sheet = await roomSheet(priya.page);
    await sheet.getByTestId("leave-space").click();
    const asking = priya.page.getByTestId("confirm-dialog");
    await expect(asking.getByRole("heading")).toHaveText(`Leave ${title}?`);
    await asking.getByTestId("confirm-go").click();
    await expect(priya.page.getByTestId("no-rooms-welcome")).toBeVisible();
    await expect(priya.page.getByTestId("removed-from-room")).toHaveCount(0);
    await expect(roomLines(owner)).toContainText(`${priya.name} left`);
  } finally {
    await priya.context.close();
  }
});

test("a guest is offered no Add in their room, and may leave it", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const title = `Shed ${test.info().project.name}`;
  const guest = await join(browser, await invite(owner, "guest"), aName("Vera"));
  try {
    const id = await personId(owner, guest.name);
    await newRoom(owner, title);
    await addMember(owner, { id });
    await closeSheet(owner);
    await expect(guest.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
    const sheet = await roomSheet(guest.page);
    // Their own row is "You", and says they are a guest here.
    await expect(sheet.getByTestId("member").filter({ hasText: "You" })).toContainText("Guest");
    await expect(sheet.getByTestId("room-sheet-add")).toHaveCount(0);
    await expect(sheet.getByTestId("leave-space")).toBeVisible();
    // The owner sees them as a guest, and themselves as the owner.
    const owners = await roomSheet(owner);
    await expect(owners.getByTestId("member").filter({ hasText: guest.name })).toContainText(
      "Guest",
    );
    // Under their one room, why it is their only one (ADR 0196); on a phone, behind the menu.
    await guest.page.keyboard.press("Escape");
    const menu = guest.page.getByTestId("narrow-menu");
    if (await menu.isVisible()) await menu.click();
    await expect(guest.page.getByTestId("side-guest-note")).toHaveText(
      `You're ${OWNER}'s guest in ${title}, so it's your one space here.`,
    );
  } finally {
    await guest.context.close();
  }
});

test("only the room's owner and the workspace's admins are offered Remove", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Attic ${test.info().project.name}`;
  const priya = await join(browser, await invite(owner), aName("Priya"));
  const dev = await join(browser, await invite(owner), aName("Dev"));
  try {
    const ids = [await personId(owner, priya.name), await personId(owner, dev.name)];
    await newRoom(owner, title);
    for (const id of ids) await addMember(owner, { id });
    await closeSheet(owner);

    // Priya, a member who does not own the room, sees Dev and no Remove beside him.
    await expect(priya.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
    const sheet = await roomSheet(priya.page);
    await expect(sheet.getByTestId("member").filter({ hasText: dev.name })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    // The owner is offered it beside both.
    const owners = await roomSheet(owner);
    await expect(owners.getByRole("button", { name: `Remove ${dev.name}` })).toBeAttached();
    await expect(owners.getByRole("button", { name: `Remove ${priya.name}` })).toBeAttached();
  } finally {
    await priya.context.close();
    await dev.context.close();
  }
});
