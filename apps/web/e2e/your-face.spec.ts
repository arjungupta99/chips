/**
 * Your face, chosen on the Mac and the web (ADR 0272). Arjun opens You and clicks his face, which
 * wears the phone's pen; the face picker opens as a page beside the list, with him at its head. He
 * picks Navy, then a rocket on it, then types two letters, and the face on You wears each one as
 * it is picked. The face is the server's: after a reload it is still his. Use the default puts his
 * initials back.
 */

import { expect, test } from "@playwright/test";
import { pair } from "./support.ts";

test.use({ colorScheme: "dark" });

test("your face is chosen from You, on a page beside the list, and kept", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the Mac's window; narrow You is a unit test");
  await pair(page);
  await page.getByTestId("you").click();
  const face = page.getByTestId("profile-face");
  const worn = face.locator(".ui-avatar");
  await expect(face).toHaveAccessibleName("Your face");
  await face.click();

  const pane = page.getByTestId("you-pane");
  await expect(pane.getByRole("heading", { level: 2 })).toHaveText("Your face");
  await expect(face).toHaveAttribute("aria-current", "page");
  const picker = pane.getByTestId("your-face");
  await expect(picker.getByRole("radiogroup", { name: "Colours" }).getByRole("radio")).toHaveCount(
    27,
  );

  // A colour on its own, then a mark on it: the face on You wears each before anything else.
  await picker.getByRole("radio", { name: "Navy" }).click();
  await expect(picker.getByRole("radio", { name: "Navy" })).toHaveAttribute("aria-checked", "true");
  await expect(worn).toHaveAttribute("style", /--icon-ground-16/);
  await picker.getByRole("button", { name: "Work" }).click();
  await picker.getByTestId("mark-rocket").click();
  await expect(picker.getByTestId("mark-rocket")).toHaveAttribute("aria-pressed", "true");
  await expect(worn.locator(".ui-avatar-face svg")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("your-face-rocket.png") });

  // Letters in place of the mark, saved on Enter.
  const letters = picker.getByTestId("face-letters");
  // Kept as typed: no third letter, no space.
  await letters.fill("AB C");
  await expect(letters).toHaveValue("AB");
  await letters.press("Enter");
  await expect(worn).toHaveText("AB");
  await expect(picker.getByTestId("mark-rocket")).toHaveAttribute("aria-pressed", "false");

  // The server kept it.
  await page.reload();
  await page.getByTestId("you").click();
  await expect(page.getByTestId("profile-face").locator(".ui-avatar")).toHaveText("AB");

  await page.getByTestId("profile-face").click();
  await page.getByTestId("your-face").getByTestId("face-default").click();
  await expect(page.getByTestId("profile-face").locator(".ui-avatar")).not.toHaveText("AB");
  await expect(page.getByTestId("your-face").getByTestId("face-default")).toBeDisabled();
});
