/**
 * Phase 1 exit criterion: a Lighthouse accessibility score above 90 on the main screens. The
 * screens are states of one page, so this uses Lighthouse's flow API in snapshot mode on a
 * paired session with a run in it: the space with a run waiting on an approval, Needs
 * you, Agents, and the workspace's log. Chromium is Playwright's; Puppeteer drives it because
 * that is what Lighthouse's flow API takes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { connect } from "@chipschat/harness";
import { chromium, expect, test } from "@playwright/test";
import { startFlow } from "lighthouse";
import puppeteer, { type Page } from "puppeteer-core";
import { demo, freshCode, SERVER, WEB } from "./support.ts";

const FLOOR = 0.9;

/** Click the first button whose text includes `text`. */
async function click(page: Page, text: string): Promise<void> {
  const clicked = await page.evaluate((needle) => {
    const button = [...document.querySelectorAll("button")].find((each) =>
      each.textContent?.includes(needle),
    );
    button?.click();
    return button !== undefined;
  }, text);
  expect(clicked, `a button "${text}"`).toBe(true);
}

test("the main screens score above 90 on Lighthouse accessibility", async () => {
  test.setTimeout(180_000);
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    // What Playwright passes when it launches this same Chromium for every other spec. Ubuntu
    // 23.10 and later refuse the sandbox unprivileged user namespaces, so on CI's runner Chromium
    // aborts at launch without it ("No usable sandbox!"). The page is our own, on loopback.
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const details = demo();
  const harness = await connect({
    url: SERVER,
    token: details.harness.token,
    client: { name: "lighthouse", version: "0.0.0" },
  });
  try {
    // Pair, the way a person does: past the film with Skip, then That's Chips' Set up my own Chips
    // (ADR 0217's addendum of 26 October). Not "networkidle0": the first screen fetches the film.
    await page.goto(WEB, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="film-skip"]');
    await click(page, "Skip");
    await click(page, "Set up my own Chips");
    await page.waitForSelector('input[aria-label="Pairing code"]');
    await page.type('input[aria-label="Pairing code"]', await freshCode());
    await click(page, "Pair");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some((b) => /PO-4471/.test(b.textContent ?? "")),
      { timeout: 30_000 },
    );
    await click(page, "PO-4471");

    // A run in the room, waiting on an approval: its card stands in the space (the Run panel
    // beside it went, ADR 0293).
    const run = await harness.runs.start({
      spaceId: details.space_id,
      goal: "Get PO #4471 confirmed with Northwind.",
      plan: [
        { stepId: "read-po", title: "Read PO #4471" },
        { stepId: "email-dana", title: "Email Dana to confirm" },
      ],
    });
    await run.step({ stepId: "read-po", tool: "drive.read", summary: "120 units." });
    await run.context({ usedTokens: 82_000, limitTokens: 200_000, model: "opus-5" });
    void run.approval({
      action: { kind: "email.send", input: { to: "dana@northwind.com" }, external: true },
      preview: {
        format: "markdown",
        title: "To dana@northwind.com",
        body: "Hi Dana, confirming PO #4471.",
      },
      risk: ["external_communication", "irreversible"],
      editable: true,
    });
    // The approval's card, in the room. "Waiting on you" was the sidebar's harness row, which went
    // on 3 November 2026 (ADR 0261's addendum).
    await page.waitForSelector('article[aria-label^="Approval:"][data-decision="pending"]', {
      timeout: 30_000,
    });

    const flow = await startFlow(page, {
      name: "Chips, paired",
      config: {
        extends: "lighthouse:default",
        settings: {
          onlyCategories: ["accessibility"],
          formFactor: "desktop",
          screenEmulation: { disabled: true },
        },
      },
    });
    await flow.snapshot({ name: "Space with a run waiting on an approval" });
    await click(page, "Agents");
    // The harnesses' shelf heads the page (ADR 0185): their cards are under its View all.
    await page.waitForFunction(
      () => document.querySelector('[data-testid="harness-shelf"]') !== null,
    );
    await flow.snapshot({ name: "Agents" });
    // The workspace's log opens from You (ADR 0261).
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="you"]')?.click());
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workspace-log"]') !== null,
    );
    await page.evaluate(() =>
      document.querySelector<HTMLElement>('[data-testid="workspace-log"]')?.click(),
    );
    await page.waitForFunction(() => document.querySelector(".you-page.audit") !== null);
    await flow.snapshot({ name: "Workspace log" });

    const result = await flow.createFlowResult();
    const scores = result.steps.map((step) => ({
      screen: step.name,
      score: step.lhr.categories["accessibility"]?.score ?? 0,
      failing: Object.values(step.lhr.audits)
        .filter((audit) => audit.score !== null && audit.score < 1)
        .map((audit) => ({
          id: audit.id,
          nodes: (
            (audit.details as { items?: { node?: { snippet?: string } }[] } | undefined)?.items ??
            []
          )
            .map((item) => item.node?.snippet ?? "")
            .slice(0, 6),
        })),
    }));
    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/accessibility.json", JSON.stringify(scores, null, 2));
    for (const { screen, score, failing } of scores) {
      test.info().annotations.push({
        type: "lighthouse",
        description: `${screen}: ${Math.round(score * 100)}${failing.length === 0 ? "" : ` (${failing.map((f) => f.id).join(", ")})`}`,
      });
      expect(score, `${screen} failing: ${JSON.stringify(failing)}`).toBeGreaterThan(FLOOR);
    }
  } finally {
    harness.close();
    await browser.close();
  }
});
