/**
 * Joining (ADR 0034): an invite link made in the owner's You, opened in somebody else's browser,
 * a name, Join. What the link says before they join, what they land on, what the owner sees, and
 * every way a link is turned away. In the `phone` project everybody who joins is at an iPhone's
 * width, as a second person is today.
 */

import {
  aName,
  asOwner,
  expect,
  IPHONE_SAFARI,
  invite,
  join,
  letIn,
  newBrowser,
  OWNER,
  openedRow,
  openInvite,
  openLink,
  openYou,
  personRow,
  test,
} from "./support.ts";

test("a member joins by a single-use link, and the link is spent", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const url = await invite(owner, "member", "once");
  const name = aName("Priya");

  const context = await newBrowser(browser);
  try {
    const priya = await openLink(context, url);
    // Where she is going, as what, and who asked her (JR-13); the one thing to do, ready (JR-14).
    await expect(priya.getByRole("heading", { name: "Join Demo" })).toBeVisible();
    await expect(priya.getByTestId("join-role")).toContainText(`${OWNER} invited you`);
    await expect(priya.getByTestId("join-role")).toContainText("as a member");
    await expect(priya.getByLabel("Your name")).toBeFocused();
    // The card keeps a gutter from both edges, at a phone's width too (JR-12).
    const card = await priya.getByTestId("join").boundingBox();
    const width = priya.viewportSize()?.width ?? 0;
    expect(card?.x ?? 0).toBeGreaterThanOrEqual(12);
    expect((card?.x ?? 0) + (card?.width ?? 0)).toBeLessThanOrEqual(width - 12);

    await priya.getByLabel("Your name").fill(name);
    await priya.getByRole("button", { name: "Join" }).click();
    await letIn(url, priya, name);

    // A welcome, not an empty list (JR-4): who let her in, as what, and what happens next.
    const welcome = priya.getByTestId("no-rooms-welcome");
    await expect(welcome).toBeVisible({ timeout: 20_000 });
    await expect(welcome).toContainText("You're in Demo");
    await expect(welcome).toContainText(`${OWNER} invited you as a member`);
    await expect(welcome).toContainText("When somebody adds you to a space, it appears here");
    // A member opens no space either (ADR 0196): an owner or an admin does, so nothing offers one.
    await expect(welcome.getByRole("button", { name: "Create a space" })).toHaveCount(0);
    // Nothing on the page is wider than the window (JR-15).
    expect(await priya.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await openYou(priya);
    await expect(priya.getByTestId("my-role")).toHaveText(/^Member of Demo/);

    // The owner sees her, as a member, let in by him: "you", as he reads it, and by which link,
    // in her row opened (ADR 0209).
    const row = await openedRow(owner, name);
    await expect(row).toHaveAttribute("data-role", "member");
    await expect(row.getByTestId("person-details")).toContainText("invited by you");
    await expect(row.getByTestId("person-came-by")).toContainText("Your member link, made ");
  } finally {
    await context.close();
  }

  // The same link, in a browser that has never been here: spent, and the screen says what to do
  // (JR-3), still one answer for spent, withdrawn and expired.
  const stranger = await newBrowser(browser);
  try {
    const again = await openLink(stranger, url);
    const dead = again.getByTestId("join-dead");
    await expect(dead).toBeVisible();
    await expect(dead).toContainText("This invite can't be used");
    await expect(dead).toContainText("Ask whoever sent it for a new link");
    await expect(again.getByLabel("Your name")).toHaveCount(0);
    await expect(
      again.getByRole("button", { name: "I have a pairing code instead" }),
    ).toBeVisible();
  } finally {
    await stranger.close();
  }
});

test("a guest joins, and is offered no space of their own", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const url = await invite(owner, "guest", "once");
  const guest = await join(browser, url, aName("Vendor"));
  try {
    const welcome = guest.page.getByTestId("no-rooms-welcome");
    await expect(welcome).toContainText(`${OWNER} invited you as a guest`);
    // A guest opens no space (ADR 0034): nothing offers one (JR-4).
    await expect(welcome.getByRole("button", { name: "Create a space" })).toHaveCount(0);
    await openYou(guest.page);
    await expect(guest.page.getByTestId("my-role")).toHaveText(/^Guest of Demo/);
    await expect(await personRow(owner, guest.name)).toHaveAttribute("data-role", "guest");
  } finally {
    await guest.context.close();
  }
});

test("an open link lets two people in, and says how long it lasts", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const url = await invite(owner, "member", "open");
  // A week from now, as a date, never "until now" (JR-2).
  const issued = owner.getByTestId("issued-invite");
  await expect(issued).not.toContainText("until now");
  await expect(issued).toContainText(/until [A-Z][a-z]+ \d{1,2}|until \d{1,2} [A-Z][a-z]+/);

  // Other tests' open links stay on the list too: count this one's row by what it says.
  const twice = owner.getByTestId("invite-row").filter({ hasText: "used 2 times" });
  const before = await twice.count();
  const first = await join(browser, url, aName("Ravi"));
  const second = await join(browser, url, aName("Meera"));
  try {
    await expect(first.page.getByTestId("no-rooms-welcome")).toBeVisible();
    await expect(second.page.getByTestId("no-rooms-welcome")).toBeVisible();
    // The list follows with no reload: each joining counted a use.
    await expect(twice).toHaveCount(before + 1);
    await expect(twice.last()).not.toContainText("until now");
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

test("a link lasts 30 minutes and says so, and says what the role may do", async ({ page }) => {
  const owner = await asOwner(page);
  await openYou(owner);
  await owner.getByRole("combobox", { name: "Invite role" }).selectOption("guest");
  await expect(owner.getByTestId("invite-role-means")).toContainText(
    "A guest in no space sees nobody until somebody adds them to one.",
  );
  // Nothing to choose: every link lasts 30 minutes (ADR 0232).
  await expect(owner.getByRole("combobox", { name: "Invite lasts" })).toHaveCount(0);
  await expect(owner.getByTestId("invite-uses-means")).toContainText("after 30 minutes");
  await invite(owner, "guest", "once");
  await expect(owner.getByTestId("issued-invite")).toContainText("until");
});

test("a name somebody here has is refused, and the link is not spent", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const taken = aName("Asha");
  const first = await join(browser, await invite(owner), taken);
  await first.context.close();

  const url = await invite(owner, "member", "once");
  const context = await newBrowser(browser);
  try {
    const second = await openLink(context, url);
    // The same name in another case is the same @ (ADR 0091), so it is refused too (JR-1).
    await second.getByLabel("Your name").fill(taken.toLowerCase());
    await second.getByRole("button", { name: "Join" }).click();
    await expect(second.getByRole("alert")).toContainText(`Somebody here goes by ${taken} already`);
    await expect(second.getByLabel("Your name")).toBeFocused();
    // The link was not spent: another name gets in by it.
    const other = aName("Asha");
    await second.getByLabel("Your name").fill(other);
    await second.getByRole("button", { name: "Join" }).click();
    await letIn(url, second, other);
    await expect(second.getByTestId("no-rooms-welcome")).toBeVisible({ timeout: 20_000 });
    await expect(await personRow(owner, other)).toHaveAttribute("data-role", "member");
  } finally {
    await context.close();
  }
});

test("a withdrawn link says it can't be used", async ({ page, browser }) => {
  const owner = await asOwner(page);
  const url = await invite(owner, "member", "once");
  // The link just shown is withdrawn where it is shown, and its row goes with it.
  const rows = await owner.getByTestId("invite-row").count();
  await owner.getByTestId("issued-invite").getByRole("button", { name: "Withdraw" }).click();
  await expect(owner.getByTestId("issued-invite")).toHaveCount(0);
  await expect(owner.getByTestId("invite-row")).toHaveCount(rows - 1);

  const context = await newBrowser(browser);
  try {
    const withdrawn = await openLink(context, url);
    await expect(withdrawn.getByTestId("join-dead")).toContainText("This invite can't be used");
  } finally {
    await context.close();
  }
});

test("on an iPhone, the join page offers to open the invite in the Chips app", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const url = await invite(owner, "member", "once");
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get("invite");

  const context = await newBrowser(browser, true, { userAgent: IPHONE_SAFARI });
  try {
    const priya = await openLink(context, url);
    await expect(priya.getByRole("heading", { name: "Join Demo" })).toBeVisible();
    const offer = priya.getByTestId("join-in-app");
    await expect(offer).toContainText("Have the Chips app? Open the invite there.");
    // The same invite, with this page as its server, for the app to read (`chips://join`).
    const href = (await priya.getByTestId("join-app-link").getAttribute("href")) ?? "";
    const handed = new URLSearchParams(href.replace(/^chips:\/\/join\?/, ""));
    expect(href.startsWith("chips://join?")).toBe(true);
    expect(handed.get("invite")).toBe(token);
    expect(handed.get("lan")).toBe(new URL(priya.url()).origin);
    // Joining here still works beside it.
    await expect(priya.getByLabel("Your name")).toBeFocused();
  } finally {
    await context.close();
  }
});

test("a browser already in Demo that opens a link to Demo says so, and leaves the link unused", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const url = await invite(owner, "member", "once");

  // Until Phase 2 a paired tab showed the workspace it knew and said nothing (G4).
  await openInvite(owner, url);
  const dialog = owner.getByTestId("confirm-dialog");
  await expect(dialog).toContainText("You're already in Demo");
  await expect(dialog).toContainText(`As ${OWNER}, on this browser. The link stays unused`);
  await dialog.getByRole("button", { name: "Open Demo" }).click();
  await expect(dialog).toHaveCount(0);
  // Taken out of the address, so a reload doesn't ask again.
  expect(new URL(owner.url()).hash).toBe("");

  // Unused: the person it was made for can still join with it.
  const joined = await join(browser, url, aName("Mina"));
  await joined.context.close();
});
