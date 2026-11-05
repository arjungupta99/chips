/**
 * ADR 0202's addendum on the Mac (Arjun's 2, 18 October 2026): the room sheet's first page is the
 * phone's, laid out in tiles. The room's face stands beside its name; *In this room* has Add at its
 * right; Leave is who is here's last row, though not for the owner, who has Hide at the foot (ADR
 * 0205); one Media & files card shows the newest things the room
 * carries and turns to its page, where a photo opens the viewer; Lead, Spend per job and Lock
 * changes are tiles in one row, and two to a row at a phone's width. Lock changes takes the pen off
 * the name and Archive and Delete off the foot, and gives them back.
 */

import { expect, type Locator, type Page, test } from "@playwright/test";
import { blankPdf, noisyPng } from "./png.ts";
import {
  addMember,
  closeSheet,
  pair,
  pickEmpty,
  registerPerson,
  registerSpecialist,
  roomSheet,
  sheetBack,
} from "./support.ts";

/** Where something stands on the page. */
async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("not on the page");
  return found;
}

/** Where the room sheet's tiles stand, read at one moment so nothing moves between them. */
function tiles(page: Page): Promise<{ x: number; y: number; width: number; height: number }[]> {
  return page.evaluate(() =>
    ["room-sheet-lead", "room-sheet-spend", "room-sheet-lock"].map((id) => {
      const rect = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      if (rect === undefined) throw new Error(`no ${id}`);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
}

/** Attach through the picker and wait for the upload to finish. */
async function attach(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByTestId("file-picker").setInputFiles(file);
  await expect(page.getByRole("list", { name: "Attachments" }).getByText(file.name)).toBeVisible();
  await expect(page.getByRole("list", { name: "Attachments" })).not.toContainText("uploading…", {
    timeout: 30_000,
  });
}

test("the room sheet's first page is laid out in tiles, three across on the Mac and two to a row at a phone's width", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await registerSpecialist("Surveyor");
  const tamsin = await registerPerson("Tamsin Hale");
  await pair(page);

  // A room of its own, with Surveyor moved into it from Add (ADR 0148) and Tamsin added, who could
  // add Arjun back if he left.
  await page.getByRole("button", { name: "Create new space" }).click();
  await pickEmpty(page);
  const name = page.getByRole("textbox", { name: "Name the space" });
  await name.fill("Dunes");
  await name.press("Enter");
  await expect(page.getByRole("main", { name: "Space: Dunes" })).toBeVisible();
  const sheet = page.getByTestId("room-sheet");
  await expect(sheet.getByTestId("room-sheet-add-page")).toBeVisible();
  await sheet.getByTestId("room-sheet-other-rooms").click();
  await sheet
    .locator('[data-testid^="room-sheet-agent-"]', { hasText: "Surveyor" })
    .first()
    .click();
  await sheet.getByTestId("room-sheet-move").click();
  await expect(sheet.getByTestId("room-sheet-add-page")).toBeVisible();
  await addMember(page, { id: tamsin.id });
  await sheetBack(page);

  // The face beside the name, and who is here under it.
  const face = await box(sheet.getByTestId("room-sheet-icon"));
  const title = await box(sheet.getByTestId("room-sheet-title"));
  expect(face.x + face.width).toBeLessThanOrEqual(title.x);
  expect(title.y).toBeGreaterThanOrEqual(face.y - 2);
  expect(title.y + title.height).toBeLessThanOrEqual(face.y + face.height + 2);

  // In this room and how many, with Add at its right: the full-width button is gone.
  const heading = sheet.getByRole("heading", { name: "In this space" });
  await expect(heading.locator("..")).toHaveText("In this space3Add");
  const add = await box(sheet.getByRole("button", { name: "Add agents or people" }));
  const headed = await box(heading);
  expect(Math.abs(add.y + add.height / 2 - (headed.y + headed.height / 2))).toBeLessThan(4);
  expect(add.x).toBeGreaterThan(headed.x + 200);

  // The workspace's owner, whose agents answer here, is offered no Leave (ADR 0204's addendum):
  // Hide stands at the foot with Archive and Done instead, which is only theirs (ADR 0205).
  const members = sheet.getByTestId("room-sheet-members");
  await expect(members.getByTestId("leave-space")).toHaveCount(0);
  await expect(sheet.locator(".sheet-foot").getByTestId("leave-space")).toHaveCount(0);
  await expect(sheet.locator(".sheet-foot").getByTestId("hide-space")).toHaveText("Hide");

  // The settings as tiles, all three in one row, Lead first.
  await expect
    .poll(async () => {
      const [lead, spend, lock] = await tiles(page);
      return (
        lead !== undefined &&
        spend !== undefined &&
        lock !== undefined &&
        Math.abs(spend.y - lead.y) < 1 &&
        Math.abs(lock.y - lead.y) < 1 &&
        lead.x < spend.x &&
        spend.x < lock.x
      );
    })
    .toBe(true);
  await expect(sheet.getByTestId("room-sheet-lead")).toContainText("NobodyLead");
  await expect(sheet.getByTestId("room-sheet-spend")).toContainText("$3.00");

  // Lock changes: the pen and Archive go while it is on, and come back.
  await expect(sheet.getByTestId("archive-space")).toBeVisible();
  await sheet.getByTestId("room-sheet-lock-switch").click();
  await expect(sheet.getByTestId("room-sheet-lock")).toContainText("OnLock changes");
  await expect(sheet.getByTestId("room-sheet-title")).toHaveCount(0);
  await expect(sheet.getByTestId("archive-space")).toHaveCount(0);
  // Hide stays: it changes nothing for anybody else (ADR 0205).
  await expect(sheet.getByTestId("hide-space")).toBeVisible();
  await expect(page.getByTestId("messages")).toContainText("locked changes to the space");
  await sheet.getByTestId("room-sheet-lock-switch").click();
  await expect(sheet.getByTestId("room-sheet-lock")).toContainText("OffLock changes");
  await expect(sheet.getByTestId("archive-space")).toBeVisible();
  await expect(sheet.getByTestId("room-sheet-title")).toBeVisible();

  // Media & files says None yet until something is sent.
  const card = sheet.getByTestId("room-sheet-media");
  await expect(card).toContainText("None yet");
  await closeSheet(page);

  // Two photos and a PDF, sent in one message.
  await attach(page, { name: "erg-chebbi.png", mimeType: "image/png", buffer: noisyPng(320, 240) });
  await attach(page, { name: "sossusvlei.png", mimeType: "image/png", buffer: noisyPng(240, 320) });
  await attach(page, { name: "dune-heights.pdf", mimeType: "application/pdf", buffer: blankPdf() });
  await page.getByLabel(/^Message /).fill("Three from the survey.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText("Three from the survey.");

  // The card counts them and shows them, the photos as their thumbnails.
  await roomSheet(page);
  await expect(card).toContainText(/^Media & files3/);
  const strip = card.getByTestId("room-sheet-media-strip");
  await expect(strip.locator("img")).toHaveCount(2);
  await expect(strip.locator("img").first()).toHaveAttribute("src", /^blob:/);

  // Its page: the newest first, and a photo opens the viewer over the sheet.
  await card.click();
  const grid = sheet.getByTestId("room-media");
  await expect(grid.getByRole("button")).toHaveCount(3);
  await grid.getByRole("button", { name: "Open sossusvlei.png" }).click();
  await expect(page.getByTestId("viewer-count")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("viewer-count")).toBeHidden();
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("room-media-back").click();
  await expect(sheet.getByTestId("room-sheet-icon")).toBeVisible();

  // At a phone's width, the tiles go two to a row and Lock changes takes the row under them.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const [lead, spend, lock] = await tiles(page);
      return (
        lead !== undefined &&
        spend !== undefined &&
        lock !== undefined &&
        Math.abs(spend.y - lead.y) < 1 &&
        lock.y > lead.y + lead.height &&
        lock.width > lead.width * 2
      );
    })
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await closeSheet(page);
});
