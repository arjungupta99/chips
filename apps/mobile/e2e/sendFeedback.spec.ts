/**
 * Send feedback on the phone's You (ADR 0237), in the export this suite serves, which draws it
 * before its switch is on (`EXPO_PUBLIC_CHIPS_FEEDBACK=1` in `playwright.config.ts`). The opener
 * is stubbed (`Linking.openURL` is `window.open` on the web target), so nothing leaves for
 * github.com. The demo person has no Main space at first, so the row opens the form at once; were
 * one to have been made by an earlier spec, its sheet's Write it on GitHub opens the same address.
 * Then a harness seats its Main agent in a Main space with the person, and the sheet's Write it
 * with puts the line in that space's field, not sent.
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
  await page.getByRole("tab", { name: "You", exact: true }).click();

  const row = page.getByRole("button", { name: "Send feedback" });
  await expect(page.getByText("Tell the people who make Chips what you'd change.")).toBeVisible();
  await row.click();
  const sheet = page.getByTestId("feedback-sheet");
  await expect
    .poll(
      async () => (await opened()).length + (await sheet.getByText("Feedback for Chips").count()),
    )
    .toBeGreaterThan(0);
  if ((await opened()).length === 0) {
    await expect(sheet.getByText("Chips sends nothing.", { exact: false })).toBeVisible();
    await sheet.getByRole("button", { name: "Write it on GitHub" }).click();
    await expect.poll(async () => (await opened()).length).toBe(1);
  }

  const [address] = await opened();
  expect(await opened()).toHaveLength(1);
  const link = new URL(address ?? "");
  expect(`${link.origin}${link.pathname}`).toBe("https://github.com/arjungupta99/chips/issues/new");
  expect([...link.searchParams.keys()]).toEqual(["template", "version"]);
  expect(link.searchParams.get("template")).toBe("feedback-prompt.yml");
  // The Version row's words, then the system: "Chips 0.0.0 · dev · web" in this export.
  expect(link.searchParams.get("version")).toMatch(/^Chips \d+\.\d+\.\d+( \(\S+\))? · \S+ · web$/);
});

test("Write it with the Main agent opens its Main space with the line in the field, not sent", async ({
  page,
}) => {
  await seatMainAgent("Milo");
  await pair(page);
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: "Send feedback" }).click();
  const sheet = page.getByTestId("feedback-sheet");
  await expect(sheet.getByText("Feedback for Chips")).toBeVisible();
  await sheet.getByRole("button", { name: /^Write it with Milo/ }).click();

  await expect(page.getByTestId("composer")).toHaveValue(
    "Read https://chipschat.ai/feedback.md and help me write a feedback prompt for Chips.",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("composer-send")).toBeVisible();
});
