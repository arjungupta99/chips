/**
 * What this folder's specs share: the owner at a desk, an invite made from You, somebody joining
 * by it at a desk or at an iPhone's width, and the places on screen each spec looks.
 *
 * Every spec runs against one server and one workspace, so names are never reused: each person
 * gets the next surname from a list kept in the run's data directory, which outlives a worker.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from "../../apps/web/e2e/playwright.ts";
import { allowFrom, openInvite, pair, roomSheet } from "../../apps/web/e2e/support.ts";

export {
  addMember,
  closeSheet,
  pickEmpty,
  roomSheet,
  SERVER,
  sheetBack,
} from "../../apps/web/e2e/support.ts";
export { expect, openInvite, test };

/** What the workspace's first person goes by here, in place of the demo's "You". */
export const OWNER = "Arjun";

/** An iPhone 15's window, under Chromium: where a second person joins today. */
const PHONE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
} as const;

/** Whether this project's joiners are at a desk or on a phone (`playwright.config.ts`). */
export function onPhone(): boolean {
  return test.info().project.metadata["joiner"] === "phone";
}

const SURNAMES = [
  "Nair",
  "Shah",
  "Rao",
  "Iyer",
  "Menon",
  "Bose",
  "Kapoor",
  "Sen",
  "Das",
  "Pillai",
  "Joshi",
  "Reddy",
  "Gill",
  "Mehta",
  "Verma",
  "Chopra",
  "Dutta",
  "Kaur",
  "Malik",
  "Bhatt",
  "Ghosh",
  "Saxena",
  "Sinha",
  "Varma",
  "Mishra",
  "Patil",
  "Naidu",
  "Kohli",
  "Arora",
  "Bajaj",
];

/** The next of a count kept in the run's data directory, which outlives a worker. */
function next(counter: string): number {
  const directory = process.env["CHIPS_E2E_DATA_DIR"];
  if (directory === undefined) throw new Error("run this through playwright.config.ts");
  const file = joinPath(directory, `${counter}.count`);
  const used = existsSync(file) ? Number(readFileSync(file, "utf8")) : 0;
  writeFileSync(file, String(used + 1));
  return used;
}

/** A name nobody in this run's workspace has had: `Priya Nair`, then `Dev Shah`, and so on. */
export function aName(first: string): string {
  const used = next("names");
  const surname = SURNAMES[used % SURNAMES.length] ?? "Doe";
  const round = Math.floor(used / SURNAMES.length);
  return round === 0 ? `${first} ${surname}` : `${first} ${surname}-${round + 1}`;
}

/**
 * The owner, paired at a desk and in PO-4471, going by Arjun: the first spec renames the demo's
 * person, and every later pairing finds the name already given.
 */
export async function asOwner(page: Page): Promise<Page> {
  await pair(page);
  await openYou(page);
  const name = page.getByRole("textbox", { name: "Your name" });
  if ((await name.inputValue()) !== OWNER) {
    await name.fill(OWNER);
    await name.press("Enter");
    await expect(name).toHaveValue(OWNER);
  }
  return page;
}

/**
 * You's list, wherever it is: on a phone's width behind the menu (JR-15), at a desk in the rail;
 * where You is too narrow for a page beside the list, back from the page last opened, a person's
 * to People and People's to You (ADR 0265).
 */
export async function openYou(page: Page): Promise<void> {
  const menu = page.getByTestId("narrow-menu");
  if (await menu.isVisible()) await menu.click();
  await page.getByTestId("you").click();
  for (const name of ["‹ People", "‹ You"]) {
    const back = page.getByRole("button", { name });
    if (await back.isVisible()) await back.click();
  }
  await expect(page.getByTestId("my-role")).toBeVisible();
}

/** A row of You's opened: People or Invite someone, its page beside the list or in its place. */
export async function openYouPage(page: Page, row: "people-row" | "invite-someone"): Promise<void> {
  await openYou(page);
  await page.getByTestId(row).click();
  await expect(page.getByTestId(row === "people-row" ? "people" : "invites")).toBeVisible();
}

/** A space, wherever the list is: behind the menu on a phone, in the rail at a desk. */
export async function openSpace(page: Page, title: string): Promise<Locator> {
  const menu = page.getByTestId("narrow-menu");
  if (await menu.isVisible()) await menu.click();
  await page
    .getByTestId("space-list")
    .getByRole("button", { name: new RegExp(title) })
    .click();
  const room = page.getByRole("main", { name: `Space: ${title}` });
  await expect(room).toBeVisible();
  return room;
}

export type Uses = "once" | "open";

/**
 * The page that made each link of this run, by the link's words. This suite's server has its relay
 * on, so every invite asks the person who made it before it lets anyone in (ADR 0232), and `join`
 * allows from that page.
 */
const makers = new Map<string, Page>();

/** An invite from the owner's You, as a link: the words the owner would copy and send. */
export async function invite(
  owner: Page,
  role: "admin" | "member" | "guest" = "member",
  uses: Uses = "once",
): Promise<string> {
  await openYouPage(owner, "invite-someone");
  await owner.getByRole("combobox", { name: "Invite role" }).selectOption(role);
  await owner.getByRole("combobox", { name: "Invite uses" }).selectOption(uses);
  // The link shown last stays until the new one replaces it: wait for a different one.
  const shown = owner.getByTestId("invite-url");
  const before = (await shown.count()) === 0 ? "" : ((await shown.textContent()) ?? "");
  await owner.getByTestId("make-invite").click();
  await expect(shown).toHaveText(/#invite=chips_inv_/);
  await expect(shown).not.toHaveText(before === "" ? /^$/ : before);
  const url = (await shown.textContent()) ?? "";
  makers.set(url, owner);
  return url;
}

/**
 * A link into the open room, made from its sheet's Add (ADR 0168): Invite someone new, as a guest
 * (the form's first) or a member, used once. The sheet stays on the page that shows the link.
 */
export async function roomInvite(owner: Page, role: "guest" | "member" = "guest"): Promise<string> {
  const sheet = await roomSheet(owner);
  const page = sheet.getByTestId("room-sheet-invite-page");
  if (!(await page.isVisible())) {
    if (!(await sheet.getByTestId("room-sheet-invite").isVisible())) {
      await sheet.getByTestId("room-sheet-add").click();
    }
    await sheet.getByTestId("room-sheet-invite").click();
  }
  await expect(page).toBeVisible();
  await page.getByRole("radio", { name: role === "guest" ? "Guest" : "Member" }).check();
  await page.getByTestId("make-invite").click();
  const shown = page.getByTestId("invite-url");
  await expect(shown).toHaveText(/#invite=chips_inv_/);
  const url = (await shown.textContent()) ?? "";
  makers.set(url, owner);
  return url;
}

/**
 * A browser of somebody new: at an iPhone's width in the phone project, at a desk otherwise. Each
 * is somewhere of its own on the internet, as two people are: the server counts a link that is no
 * good against the address it came from (five a minute), and the web app's dev server is the one
 * peer it sees, so the address it is told is the browser's. A documentation range, never a real one.
 */
export async function newBrowser(
  browser: Browser,
  phone = onPhone(),
  options: { readonly userAgent?: string } = {},
): Promise<BrowserContext> {
  const elsewhere = { extraHTTPHeaders: { "x-forwarded-for": anAddress() }, ...options };
  return browser.newContext(phone ? { ...PHONE, ...elsewhere } : elsewhere);
}

/**
 * An address on the internet nobody in this run has used: a documentation range, never a real
 * one. A browser of somebody new is at one, and so is each device a spec plays on the wire.
 */
export function anAddress(): string {
  const n = next("addresses");
  return `198.51.${100 + Math.floor(n / 250)}.${1 + (n % 250)}`;
}

/** Safari on an iPhone, as it says it is: what the join page offers the app to (ADR 0164). */
export const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";

/**
 * The link opened in a browser of its own. At `localhost`, not the owner's `127.0.0.1`: a
 * passkey's home must be a name, and it is what a second person on this machine would type. The
 * server in it too, since the link is the relay's page with the server inside it (ADR 0207), and
 * on through that page to the server's own.
 */
export async function openLink(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await openInvite(page, url.replaceAll("127.0.0.1", "localhost"));
  return page;
}

export interface Joined {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly name: string;
}

/**
 * Somebody opens the link, gives their name, and joins; they land on the welcome (JR-4), or in the
 * room a room's link names (ADR 0168), whose card is called after it.
 */
export async function join(
  browser: Browser,
  url: string,
  name: string,
  into = "Demo",
): Promise<Joined> {
  const context = await newBrowser(browser);
  const page = await openLink(context, url);
  await expect(page.getByRole("heading", { name: `Join ${into}` })).toBeVisible();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await letIn(url, page, name);
  await expect(page.getByTestId("join")).toHaveCount(0, { timeout: 20_000 });
  return { context, page, name };
}

/**
 * Join pressed on `joining` under `name`: the link waits for whoever made it, who compares the six
 * digits and allows it (ADR 0232). Nothing to do for a link this run didn't make.
 */
export async function letIn(url: string, joining: Page, name: string): Promise<void> {
  const maker = makers.get(url);
  if (maker !== undefined)
    await allowFrom(maker, joining, new RegExp(`^${escaped(name)} is asking`));
}

/** Words matched as they are in a pattern: a name may hold a dot or a bracket. */
function escaped(words: string): string {
  return words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A person's row in the owner's People, found by name. */
export async function personRow(owner: Page, name: string): Promise<Locator> {
  await openYouPage(owner, "people-row");
  const row = owner.getByTestId("person-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  return row;
}

/** A person's page, opened from their row, where New phone… and Remove… are (ADR 0209). */
export async function openedRow(owner: Page, name: string): Promise<Locator> {
  await (await personRow(owner, name)).click();
  const page = owner.getByTestId("person-details");
  await expect(page).toBeVisible();
  return page;
}

/** A person's id, read off their row in the owner's People. */
export async function personId(owner: Page, name: string): Promise<string> {
  const id = await (await personRow(owner, name)).getAttribute("data-participant");
  if (id === null) throw new Error(`no id on ${name}'s row`);
  return id;
}

/**
 * A room of the owner's own, asking nobody (ADR 0148), named for this test: the specs share one
 * workspace, and a room per test keeps one test's members out of the next one's count.
 */
export async function newRoom(owner: Page, title: string): Promise<Locator> {
  await owner.getByRole("button", { name: "Create new space" }).first().click();
  const dialog = owner.getByRole("dialog", { name: "New space" });
  await expect(dialog).toBeVisible();
  const empty = dialog.getByRole("checkbox", { name: "Empty space" });
  if (!(await empty.isChecked())) await dialog.getByText("Empty", { exact: true }).click();
  const name = owner.getByRole("textbox", { name: "Name the space" });
  await name.fill(title);
  await name.press("Enter");
  const room = owner.getByRole("main", { name: `Space: ${title}` });
  await expect(room).toBeVisible();
  // Its sheet comes up on Add (ADR 0148), where the caller adds whoever comes in.
  await expect(owner.getByTestId("room-sheet-add-page")).toBeVisible();
  return room;
}

/** The room's lines that say who came and went (JR-5), as the reader of `page` sees them. */
export function roomLines(page: Page): Locator {
  return page.getByTestId("messages");
}

/**
 * Take a person out of the open room from its sheet: Remove on their row, which asks first (his
 * call of 14 October 2026), then Take out.
 */
export async function takeOut(page: Page, name: string): Promise<void> {
  const sheet = await roomSheet(page);
  await sheet.getByRole("button", { name: `Remove ${name}` }).click();
  const asking = page.getByTestId("confirm-dialog");
  await expect(asking.getByRole("heading")).toHaveText(new RegExp(`^Take ${name} out of `));
  await asking.getByTestId("confirm-go").click();
  await expect(asking).toHaveCount(0);
}

/** Send words in the open room, and wait for them to be on screen. */
export async function say(page: Page, words: string): Promise<void> {
  await page.getByRole("textbox", { name: /^Message/ }).fill(words);
  await page.getByRole("textbox", { name: /^Message/ }).press("Enter");
  await expect(page.getByTestId("messages")).toContainText(words);
}
