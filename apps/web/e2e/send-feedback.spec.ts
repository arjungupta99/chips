/**
 * Send feedback on You (ADR 0237), in the build this suite runs, which draws it before its switch
 * is on (`CHIPS_FEEDBACK=1` in `playwright.config.ts`). The page's opener is stubbed, so nothing
 * leaves for github.com: the test reads the address the card asked for. The demo person has no
 * Main space at first, so the card opens the form at once; were one to have been made by an
 * earlier spec, its page's Write it on GitHub opens the same address. Then a harness seats its
 * Main agent in a Main space with the person, as a bridge does, and the page's Write it with
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
  const choice = page.getByTestId("feedback-page");
  await expect
    .poll(async () => (await opened()).length + (await choice.count()))
    .toBeGreaterThan(0);
  if ((await choice.count()) > 0) {
    await expect(choice).toContainText("Chips sends nothing.");
    await choice.getByRole("button", { name: "Write it on GitHub" }).click();
  }

  const [address] = await opened();
  expect(await opened()).toHaveLength(1);
  const link = new URL(address ?? "");
  expect(`${link.origin}${link.pathname}`).toBe("https://github.com/arjungupta99/chips/issues/new");
  expect([...link.searchParams.keys()]).toEqual(["template", "version"]);
  expect(link.searchParams.get("template")).toBe("feedback-prompt.yml");
  // The build You's Version row names ("0.0.0 · b770067c"), then the system.
  const build = (await page.getByTestId("build").locator("small").textContent()) ?? "";
  expect(link.searchParams.get("version")).toBe(`Chips ${build} · web`);
});

test("Write it with the Main agent opens its Main space with the line in the field, not sent", async ({
  page,
}) => {
  await seatMainAgent("Milo");

  await pair(page);
  await page.getByTestId("you").click();
  await page.getByTestId("feedback").getByRole("button", { name: "Send feedback" }).click();
  const choice = page.getByTestId("feedback-page");
  await expect(choice).toContainText("Feedback for Chips");
  await choice.getByRole("button", { name: /^Write it with Milo/ }).click();

  const field = page.getByRole("textbox", { name: /^Message / });
  await expect(field).toHaveValue(
    "Read https://chipschat.ai/feedback.md and help me write a feedback prompt for Chips.",
  );
  await expect(choice).toHaveCount(0);
  // Not sent: no line of the person's in the room.
  await expect(page.getByTestId("messages").locator(".msg[data-mine='true']")).toHaveCount(0);
});
