/**
 * An agent's Permissions and the banner (ADR 0286), end to end on the web and the Mac's WebView: an
 * agent is let work from its own page and the server takes its next ask on the spot; the band's ×
 * closes it for that yes, on every device and across a reload; Disable banner turns it off for the
 * agent; the harness's switch turns it off for all of them, with Undo; Stop brings the asks back.
 *
 * Its own harness and room, so the demo room is left as the other specs find it. With
 * `CHIPS_E2E_SHOTS` set to a folder, it leaves a picture of each step there.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
import {
  Harness,
  newApprovalId,
  newRunId,
  pair,
  registerSpecialist,
  type Specialist,
  settled,
} from "./support.ts";

const SERVER = `http://127.0.0.1:${process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432"}`;
const SHOTS = process.env["CHIPS_E2E_SHOTS"];
const shot = async (page: Page, name: string) => {
  if (SHOTS === undefined) return;
  // A beat, so a picture is of where things landed and not of them on their way.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** A harness's own agent, the one in the room it came with. */
async function ownAgent(harness: Specialist): Promise<{ id: string; name: string }> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    headers: { authorization: `Bearer ${harness.token}` },
  });
  const { agents } = (await response.json()) as {
    agents: { agent_id: string; key: string; name: string }[];
  };
  const own = agents.find((agent) => agent.key === harness.id);
  if (own === undefined) throw new Error("the harness has no agent of its own");
  return { id: own.agent_id, name: own.name };
}

const openTab = (page: Page, name: "Agents" | "Spaces") =>
  page
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();

async function openRoom(page: Page, space: string): Promise<void> {
  await openTab(page, "Spaces");
  await page.getByTestId("space-list").locator(`[data-space="${space}"]`).click();
  await expect(page.getByTestId("messages")).toBeVisible();
}

async function openPermissions(page: Page, agent: string): Promise<void> {
  await openTab(page, "Agents");
  await page.getByTestId(`agent-${agent}`).click();
  await page.getByTestId("agent-permissions").click();
  await expect(page.getByTestId("permissions")).toBeVisible();
}

const band = (page: Page) => page.getByTestId("let-work-band");

function answered(frame: Record<string, unknown>, approvalId: string): boolean {
  const event = frame["event"] as Record<string, unknown> | undefined;
  return event?.["type"] === "approval.resolved" && event["approval_id"] === approvalId;
}

async function ready(prefix: string) {
  const owner = await registerSpecialist(prefix, undefined, [HARNESS_CAPABILITIES.agents]);
  const agent = await ownAgent(owner);
  return { owner, agent };
}

test("let work from its page; ×, Disable banner and the harness's switch only change what shows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { owner, agent } = await ready("Heron");
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: owner.token, space: owner.space });
  const actor = { kind: "agent", id: agent.id };
  const ask = async (command: string) => {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "garden.shell", input: { command } },
      risk: [],
      expires_in: 3600,
      actor,
    });
    return approvalId;
  };
  const answer = async (approvalId: string, by: string) =>
    (await harness.waitFor((frame) => answered(frame, approvalId), by))["event"] as Record<
      string,
      unknown
    >;

  try {
    await harness.send("run.started", { goal: "Read the bridge notes.", plan: [], actor });

    // The agent's page: it asks, and Let it work says what it covers before anything changes.
    await openPermissions(page, agent.id);
    await expect(page.getByTestId("permissions-headline")).toHaveText(
      `${agent.name} decides when to ask. You decide the answer.`,
    );
    await page.getByTestId("permissions-let-work").click();
    await expect(page.getByTestId("permissions-confirm")).toContainText("until you stop it");
    await shot(page, "1-confirm");
    await page.getByTestId("permissions-cancel").click();
    await expect(page.getByTestId("permissions-confirm")).toHaveCount(0);
    await page.getByTestId("permissions-let-work").click();
    await page.getByRole("button", { name: `Let ${agent.name} work` }).click();
    await expect(page.getByTestId("permissions-headline")).toHaveText(
      new RegExp(`^${agent.name} is working without asking in `),
    );
    await expect(page.getByTestId("permissions-stop")).toBeVisible();
    await shot(page, "2-working");

    // The server took it: the next ask goes ahead on the spot, rm too.
    expect(await answer(await ask("rm -rf build && ls"), "policy")).toMatchObject({
      decision: "approved",
      resolved_by: "system",
    });

    // The room says so, and its words lead back to the page.
    await openRoom(page, owner.space);
    await expect(band(page)).toHaveText(
      new RegExp(`^${agent.name} is working without asking\\s*Stop$`),
    );
    await shot(page, "3-band");
    await page.getByTestId("let-work-open").click();
    await expect(page.getByTestId("permissions")).toBeVisible();
    await openRoom(page, owner.space);

    // ×, then Undo.
    await page.getByRole("button", { name: "Close this banner" }).click();
    await expect(band(page)).toHaveText(/^Hidden for now\s*Disable banner\s*Undo$/);
    await shot(page, "4-hidden");
    await page.getByTestId("let-work-undo-close").click();
    await expect(band(page)).toHaveText(/working without asking\s*Stop$/);

    // × for good: it folds, stays gone across a reload, and the agent keeps working.
    await page.getByRole("button", { name: "Close this banner" }).click();
    await expect(band(page)).toHaveCount(0, { timeout: 8000 });
    await page.reload();
    await settled(page);
    await expect(page.getByTestId("messages")).toBeVisible();
    await expect(band(page)).toHaveCount(0);
    await shot(page, "5-gone");
    expect(await answer(await ask("ls -la"), "policy")).toMatchObject({ resolved_by: "system" });

    // Its page says it is closed, and Show again brings it back.
    await openPermissions(page, agent.id);
    await expect(page.getByTestId("permissions-closed")).toContainText(
      `Until ${agent.name} is given a new yes`,
    );
    await shot(page, "6-closed");
    await page.getByTestId("permissions-show-again").click();
    await expect(page.getByTestId("permissions-closed")).toHaveCount(0);
    await openRoom(page, owner.space);
    await expect(band(page)).toHaveCount(1);

    // Disable banner: off for this agent, on every load, and its page and row say so.
    await page.getByRole("button", { name: "Close this banner" }).click();
    await page.getByRole("button", { name: `Disable the banner for ${agent.name}` }).click();
    await expect(band(page)).toHaveText(new RegExp(`^Banner off for ${agent.name}\\s*Undo$`));
    await shot(page, "7-off");
    await expect(band(page)).toHaveCount(0, { timeout: 6000 });
    await page.reload();
    await settled(page);
    await expect(band(page)).toHaveCount(0);
    await openTab(page, "Agents");
    await page.getByTestId(`agent-${agent.id}`).click();
    await expect(page.getByTestId("agent-permissions")).toContainText("Banner off");
    await page.getByTestId("agent-permissions").click();
    await expect(page.getByTestId("permissions-banner-row")).toContainText(
      `Off for ${agent.name} only`,
    );
    await expect(page.getByTestId("permissions-nothing")).toBeVisible();
    await shot(page, "8-page-off");

    // Flip it back: matching its harness is no choice, so it follows the harness again.
    await page.getByTestId("permissions-banner-switch").click();
    await expect(page.getByTestId("permissions-banner-row")).toContainText("Same as");
    await openRoom(page, owner.space);
    await expect(band(page)).toHaveCount(1);

    // The harness's switch, with Undo.
    await openPermissions(page, agent.id);
    await page.getByTestId("permissions-harness").click();
    const row = page.getByTestId("harness-banners-row");
    await expect(row).toContainText("On for its agent");
    await shot(page, "9-harness");
    await page.getByTestId("harness-banners-switch").click();
    await expect(row).toContainText("Off for its agent");
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await shot(page, "10-harness-off");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row).toContainText("On for its agent");
    await page.getByTestId("harness-banners-switch").click();
    await expect(row).toContainText("Off for its agent");
    await openRoom(page, owner.space);
    await expect(band(page)).toHaveCount(0);
    expect(await answer(await ask("pwd"), "policy")).toMatchObject({ resolved_by: "system" });

    // And on again, for what comes next.
    await openPermissions(page, agent.id);
    await expect(page.getByTestId("permissions-banner-row")).toContainText("Off for all of");
    await page.getByTestId("permissions-banner-switch").click();
    await expect(page.getByTestId("permissions-banner-row")).toContainText(
      `On for ${agent.name} only`,
    );

    // Stop from the page: its asks come back to the card.
    await page.getByTestId("permissions-stop").click();
    await expect(page.getByTestId("permissions-headline")).toHaveText(
      `${agent.name} decides when to ask. You decide the answer.`,
    );
    await expect(page.getByTestId("permissions-let-work")).toBeVisible();
    await ask("ls");
    await openRoom(page, owner.space);
    await expect(page.getByRole("button", { name: "Approve once" }).last()).toBeEnabled();
    await shot(page, "11-asks-again");
  } finally {
    harness.close();
  }
});

test("a banner closed on one device closes on the others at once, and a new yes shows it", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { owner, agent } = await ready("Plover");
  const here = await (await browser.newContext()).newPage();
  const there = await (await browser.newContext()).newPage();
  await pair(here);
  await pair(there);
  try {
    for (const page of [here, there]) {
      await openPermissions(page, agent.id);
    }
    await here.getByTestId("permissions-let-work").click();
    await here.getByRole("button", { name: `Let ${agent.name} work` }).click();
    await expect(there.getByTestId("permissions-stop")).toBeVisible();
    for (const page of [here, there]) await openRoom(page, owner.space);
    await expect(band(here)).toHaveCount(1);
    await expect(band(there)).toHaveCount(1);

    // Closed here, gone there with nothing reloaded.
    await here.getByRole("button", { name: "Close this banner" }).click();
    await expect(band(there)).toHaveCount(0);

    // Stopped and let work again is a new yes, so its banner shows on both.
    await openPermissions(here, agent.id);
    await here.getByTestId("permissions-stop").click();
    await here.getByTestId("permissions-let-work").click();
    await here.getByRole("button", { name: `Let ${agent.name} work` }).click();
    await expect(here.getByTestId("permissions-stop")).toBeVisible();
    await expect(band(there)).toHaveCount(1);
  } finally {
    await here.context().close();
    await there.context().close();
  }
});
