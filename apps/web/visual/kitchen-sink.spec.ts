/**
 * M1.1's acceptance criterion: visual regression snapshots for every component in both themes,
 * and axe passing on the kitchen sink. Also the two ways a page becomes dark, because the
 * tokens promise both.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/** The sections the kitchen sink renders, in its order. Mirrors `COMPONENTS` in the page. */
const COMPONENTS = [
  "mark",
  "icon",
  "avatar",
  "ring",
  "pill",
  "button",
  "card",
  "tier",
  "attachment",
  "receipt",
  "timeline",
  "dial",
  "approval",
  "question",
  "composer",
  "route",
  "task",
  "media-viewer",
  "album",
] as const;

const THEMES = ["light", "dark"] as const;

/** The dark and light `--bg`, as Chromium reports them (the dark one #0f1013 since the palette lift). */
const DARK_BG = "rgb(15, 16, 19)";
const LIGHT_BG = "rgb(251, 251, 248)";

async function open(page: Page, path = "/kitchen-sink") {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Kitchen sink" })).toBeVisible();
  // The faces are self-hosted and load fast, but a snapshot taken a frame early would
  // photograph the fallback face.
  await page.evaluate(() => document.fonts.ready);
}

test.describe("every component, both themes", () => {
  test("shows every section in each theme", async ({ page }) => {
    await open(page);
    for (const theme of THEMES) {
      const panel = page.getByTestId(`sink-${theme}`);
      await expect(panel.locator("[data-component]")).toHaveCount(COMPONENTS.length);
    }
  });

  for (const theme of THEMES) {
    for (const component of COMPONENTS) {
      test(`${component}, ${theme}`, async ({ page }) => {
        await open(page);
        const section = page
          .getByTestId(`sink-${theme}`)
          .locator(`[data-component="${component}"]`);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toHaveScreenshot(`${component}-${theme}.png`);
      });
    }
  }
});

test("the faces the blueprint names are the ones on the page", async ({ page }) => {
  await open(page);
  const loaded = await page.evaluate(() => [
    document.fonts.check('16px "Bricolage Grotesque Variable"'),
    document.fonts.check('16px "Instrument Sans Variable"'),
    document.fonts.check('16px "JetBrains Mono Variable"'),
  ]);
  expect(loaded).toEqual([true, true, true]);
});

test("axe finds nothing to report, in either theme", async ({ page }) => {
  await open(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
});

test.describe("how a page becomes dark", () => {
  test("follows the system when nothing says otherwise", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      DARK_BG,
    );
  });

  test("an explicit choice wins over the system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, "/kitchen-sink?theme=light");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      LIGHT_BG,
    );
    await page.getByRole("radio", { name: "dark" }).check();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      DARK_BG,
    );
  });

  test("a subtree can be themed on its own", async ({ page }) => {
    await open(page);
    const backgrounds = await page.evaluate(() =>
      ["sink-light", "sink-dark"].map(
        (id) =>
          getComputedStyle(document.querySelector(`[data-testid="${id}"]`) as Element)
            .backgroundColor,
      ),
    );
    expect(backgrounds).toEqual([LIGHT_BG, DARK_BG]);
  });
});
