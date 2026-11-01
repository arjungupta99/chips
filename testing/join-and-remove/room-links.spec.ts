/**
 * A link into a room (ADR 0168): made by the owner from the room's Add, it brings somebody new
 * into the workspace and straight into the room; somebody already in Demo is asked, and let in
 * with the link left unused; and the link goes with its room.
 */

import {
  aName,
  asOwner,
  closeSheet,
  expect,
  invite,
  join,
  letIn,
  newBrowser,
  newRoom,
  OWNER,
  openInvite,
  openLink,
  openSpace,
  openYou,
  personRow,
  roomInvite,
  roomLines,
  roomSheet,
  test,
} from "./support.ts";

test("a guest joins by a room's link and lands in the room, which says whose link", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Bakery ${test.info().project.name}`;
  await newRoom(owner, title);
  const url = await roomInvite(owner);
  // The sheet says what You's Invite someone says (ADR 0209): who a guest of the room will see,
  // and the link with its QR and the card it opens to.
  const sheet = await roomSheet(owner);
  await expect(sheet.getByTestId("invite-role-means")).toHaveText(
    new RegExp(
      `^A guest in ${title} sees only who's there: ${OWNER}.*\\. Nothing else in Demo\\.$`,
    ),
  );
  const issued = sheet.getByTestId("issued-invite");
  await expect(issued).toContainText(`Guest in ${title}`);
  await expect(issued.getByTestId("invite-qr")).toBeVisible();
  await expect(issued.getByTestId("join-preview")).toContainText(`Join ${title}`);
  await closeSheet(owner);

  const context = await newBrowser(browser);
  try {
    const joiner = await openLink(context, url);
    // The card names the room before the workspace, and what a guest of it may do.
    await expect(joiner.getByRole("heading", { name: `Join ${title}` })).toBeVisible();
    await expect(joiner.getByTestId("join-role")).toHaveText(
      `${OWNER} invited you to ${title} in Demo as a guest.`,
    );
    await expect(joiner.getByTestId("join-role-means")).toHaveText(
      `A guest is in ${title} only, and sees only the people and agents there.`,
    );
    const name = aName("Priya");
    await joiner.getByLabel("Your name").fill(name);
    await joiner.getByRole("button", { name: "Join" }).click();
    await letIn(url, joiner, name);

    // Straight into the room, not the welcome.
    await expect(joiner.getByRole("main", { name: `Space: ${title}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(roomLines(joiner)).toContainText(`You joined by ${OWNER}'s link`);
    await expect(roomLines(owner)).toContainText(`${name} joined by your link`);
    // A guest of it: Guest in the owner's People, and no Add on her sheet.
    await expect(await personRow(owner, name)).toHaveAttribute("data-role", "guest");
    const hers = await roomSheet(joiner);
    await expect(hers.getByTestId("room-sheet-add")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("somebody already in Demo is asked, let into the room, and the link stays unused", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const ravi = await join(browser, await invite(owner), aName("Ravi"));
  try {
    const title = `Larder ${test.info().project.name}`;
    await newRoom(owner, title);
    const url = await roomInvite(owner, "member");
    await closeSheet(owner);

    // Ravi, in Demo already, opens it in the tab he is in.
    await openInvite(ravi.page, url.replaceAll("127.0.0.1", "localhost"));
    const dialog = ravi.page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText(`Join ${title}?`);
    await expect(dialog).toContainText(
      `You're in Demo as ${ravi.name}, so it adds you to ${title}`,
    );
    await dialog.getByRole("button", { name: `Join ${title}` }).click();
    await expect(ravi.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(roomLines(owner)).toContainText(`${ravi.name} joined by your link`);

    // Unused: the person it was made for can still join with it, and lands in the room too.
    const mina = await join(browser, url, aName("Mina"), title);
    try {
      await expect(mina.page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
    } finally {
      await mina.context.close();
    }
  } finally {
    await ravi.context.close();
  }
});

test("a room's link goes with its room", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const title = `Cellar ${test.info().project.name}`;
  await newRoom(owner, title);
  const url = await roomInvite(owner);
  await closeSheet(owner);
  // The owner's open links name the room it brings people into.
  await openYou(owner);
  await expect(owner.getByTestId("invite-row").filter({ hasText: `into ${title}` })).toHaveCount(1);

  // Archived, the room takes its link with it.
  await openSpace(owner, title);
  await (await roomSheet(owner)).getByTestId("archive-space").click();
  await owner.getByTestId("confirm-dialog").getByTestId("confirm-go").click();

  const context = await newBrowser(browser);
  try {
    const joiner = await openLink(context, url);
    await expect(joiner.getByTestId("join-dead")).toContainText("This invite can't be used");
  } finally {
    await context.close();
  }
  await openYou(owner);
  await expect(owner.getByTestId("invite-row").filter({ hasText: `into ${title}` })).toHaveCount(0);
});
