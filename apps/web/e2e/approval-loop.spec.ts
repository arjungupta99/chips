/**
 * M0.6's acceptance criterion, now in M1.2's shell: the approval loop, end to end, in a browser.
 *
 * A real `chipsd`, a real browser generating an Ed25519 key and pairing with it, a real harness
 * on a real socket, and a person clicking Approve in the space. Nothing is stubbed. The
 * shell is the blueprint's desktop — a sidebar, the space, the run panel — so the loop
 * plays out where a person would actually see it. The harness is the demo's Scout on
 * `@chipschat/harness`, played in this process (`golden-run.ts`; the sample it used to be
 * was withdrawn, ADR 0188).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { connectDemoHarness, playGolden, SUMMARY } from "./golden-run.ts";
import { pairingPage, settled } from "./support.ts";

const DATA_DIR = process.env["CHIPS_E2E_DATA_DIR"];
if (DATA_DIR === undefined) throw new Error("run this through playwright.config.ts");
const DEMO_FILE = join(DATA_DIR, "demo.json");

interface Demo {
  pairing_code: string;
  space_id: string;
}

function demo(): Demo {
  return JSON.parse(readFileSync(DEMO_FILE, "utf8")) as Demo;
}

/**
 * The main screen passes axe at every state the loop puts it in (technical-plan 4.5: axe on
 * every screen; the kitchen sink covers the components, this covers the shell around them).
 *
 * Asked once what was arriving has arrived: the rooms fade in over a quarter of a second
 * (`convos-arrive`), and axe reading the sidebar half way through that fade measured its words
 * against a colour they were only passing through, and called them too faint (7 October 2026).
 * Animations that run for ever, the backdrop's and a placeholder's breath, are not waited for.
 */
async function expectAccessible(page: Page, state: string): Promise<void> {
  await settled(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      state,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

test("a person approves in the browser and the harness finishes", async ({ page }) => {
  const { pairing_code } = demo();

  // 1. Pair. The browser generates a non-extractable Ed25519 key and sends only the public half.
  await pairingPage(page);
  await expect(page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
  await page.getByLabel("Pairing code").fill(pairing_code);
  await page.getByRole("button", { name: "Pair" }).click();

  // The shell: the sidebar lists the demo space, which opens on Scout waiting for the first
  // message (ADR 0149). The shell opens the most recent space by itself, which after the specs
  // before this one is a harness of theirs, so the person opens PO-4471, as `pair()` does.
  const room = page.getByTestId("space-list").getByRole("button", { name: /PO-4471/ });
  await expect(room).toBeVisible();
  await room.click();
  await expect(page.getByRole("heading", { name: "PO-4471", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "What would you like to do?" })).toBeVisible();
  await expectAccessible(page, "an empty space");

  // 2. Scout starts a run and asks for approval. A failure is kept rather than thrown, so a
  //    test that stops early does not leave a rejection behind when the socket closes.
  const chips = await connectDemoHarness();
  const played = playGolden(chips).catch((error: unknown) => error);
  try {
    await approveAndFinish(page);
  } finally {
    chips.close();
  }
  expect(await played).toBe("completed");
});

/** From the run's first event to its summary: the card, the person's yes, the run over. */
async function approveAndFinish(page: Page): Promise<void> {
  const runPanel = page.getByRole("complementary", { name: "Run" });
  await expect(runPanel.getByRole("button", { name: "Pause" })).toBeDisabled({ timeout: 20_000 });
  // The timeline shows two steps done and the third waiting on a person.
  await expect(runPanel.locator('.ui-timeline__item[data-status="done"]')).toHaveCount(2);
  await expect(runPanel.locator('.ui-timeline__item[data-status="now"]')).toHaveCount(1);

  // The approval card asks Scout's question and says what a yes does and for how long (ADR 0142),
  // then carries the risk, the preview, the source and the injection flag.
  const card = page.getByRole("article", { name: /Approval/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Send this email to dana@northwind.com?");
  await expect(card).toContainText("Scout asks");
  await expect(card).toContainText("An email can't be unsent.");
  await expect(card).toContainText("Just this once");
  await expect(card).toContainText("dana@northwind.com");
  await expect(card).toContainText("External message");
  await expect(card).toContainText("Not reversible");
  await expect(card).toContainText("confirming PO #4471 for 120 units");
  await expect(card).toContainText("outside the workspace");
  await expect(card.getByRole("button", { name: "Approve" })).toBeEnabled();
  await expect(card.getByRole("button", { name: "Deny" })).toBeEnabled();
  // Editable, with a preview: Edit opens the editor (M1.4), and is not a second Approve.
  await expect(card.getByRole("button", { name: "Edit" })).toBeEnabled();
  await expectAccessible(page, "waiting on an approval");

  // 3. Approve.
  await card.getByRole("button", { name: "Approve" }).click();

  // 4. The harness hears the decision and finishes.
  // The run is over and its panel goes: the room has the width (ADR 0268).
  await expect(runPanel).toHaveCount(0, { timeout: 20_000 });
  await expect(card).toContainText("Approved by");
  await expect(card).toContainText("sent");
  await expect(page.getByText(SUMMARY).first()).toBeVisible();
  // What it did is asked of the line that closed it, as on the phone.
  await page
    .getByTestId("messages")
    .locator(".msg", { hasText: SUMMARY })
    .last()
    .click({ button: "right" });
  await expect(
    page.getByTestId("line-menu").getByRole("menuitem", { name: "What the run did" }),
  ).toContainText("4 steps");
  await page.keyboard.press("Escape");
  await expectAccessible(page, "a finished run");
}

test("a pairing code works once", async ({ page }) => {
  // A fresh browser context, so the device from the test above is not here. The code it used
  // is spent: a code seen over somebody's shoulder is worth one attempt at most.
  const { pairing_code } = demo();

  await pairingPage(page);
  await expect(page.getByLabel("Pairing code")).toBeVisible();
  await page.getByLabel("Pairing code").fill(pairing_code);
  await page.getByRole("button", { name: "Pair" }).click();

  await expect(page.getByText("That pairing code is not valid.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
});
