/**
 * Send feedback on You (ADR 0237), in the build this suite runs, which draws it before its switch
 * is on (`CHIPS_FEEDBACK=1` in `playwright.config.ts`). The page's opener is stubbed, so nothing
 * leaves for github.com: the test reads the address the card asked for. The demo person has no
 * Main space at first, so the card opens the form at once; were one to have been made by an
 * earlier spec, its dialog's Write it on GitHub opens the same address. Then a harness seats its
 * Main agent in a Main space with the person, as a bridge does, and the dialog's Write it with
 * puts the line in that space's field.
 */

import { expect, test } from "@playwright/test";
import { pair, seatMainAgent } from "./support.ts";

test("Send feedback opens the feedback form with this build filled in", async ({ page }) => {
  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as unknown as { opened: string[] }).opened = opened;
    window.open = ((url?: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  const opened = () => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  await pair(page);
  await page.getByTestId("you").click();

  const card = page.getByTestId("feedback");
  await expect(card).toContainText("Tell the people who make Chips what you'd change.");
  await card.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  await expect
    .poll(async () => (await opened()).length + (await dialog.count()))
    .toBeGreaterThan(0);
  if ((await dialog.count()) > 0) {
    await expect(dialog).toContainText("Chips sends nothing.");
    await dialog.getByRole("button", { name: "Write it on GitHub" }).click();
  }

  const [address] = await opened();
  expect(await opened()).toHaveLength(1);
  const link = new URL(address ?? "");
  expect(`${link.origin}${link.pathname}`).toBe("https://github.com/arjungupta99/chips/issues/new");
  expect([...link.searchParams.keys()]).toEqual(["template", "version"]);
  expect(link.searchParams.get("template")).toBe("feedback-prompt.yml");
  // The build the foot of You names ("Chips 0.0.0 · b770067c · 127.0.0.1"), then the system.
  const foot = (await page.getByTestId("build").textContent()) ?? "";
  const build = foot.split(" · ").slice(0, 2).join(" · ");
  expect(link.searchParams.get("version")).toBe(`${build} · web`);
});

test("Write it with the Main agent opens its Main space with the line in the field, not sent", async ({
  page,
}) => {
  await seatMainAgent("Milo");

  await pair(page);
  await page.getByTestId("you").click();
  await page.getByTestId("feedback").getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  await expect(dialog).toContainText("Feedback for Chips");
  await dialog.getByRole("button", { name: /^Write it with Milo/ }).click();

  const field = page.getByRole("textbox", { name: /^Message / });
  await expect(field).toHaveValue(
    "Read https://chipschat.ai/feedback.md and help me write a feedback prompt for Chips.",
  );
  await expect(dialog).toHaveCount(0);
  // Not sent: no line of the person's in the room.
  await expect(page.getByTestId("messages").locator(".msg[data-mine='true']")).toHaveCount(0);
});
