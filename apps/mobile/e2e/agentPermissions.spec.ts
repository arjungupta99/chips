/**
 * An agent's Permissions and the banner (ADR 0286, ADR 0300), end to end on the phone's screens
 * against a real server: its card's Permissions opens its harness's; with the harness's Chips's
 * rules on, it is let work from an ask's screen, and its card then shows Working without asking,
 * which opens its own page. The band's × and Undo, Disable banner, the harness's switch, and Stop.
 *
 * Its own harness and room, so the demo room is left as the other specs find it. With
 * `CHIPS_E2E_SHOTS` set to a folder, it leaves a picture of each step there.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
import { registerSpecialist, type Specialist } from "../../web/e2e/support.ts";
import { Harness, newApprovalId, newRunId, pair } from "./support.ts";

const SERVER = `http://127.0.0.1:${process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432"}`;
const SHOTS = process.env["CHIPS_E2E_SHOTS"];
const shot = async (page: Page, name: string) => {
  if (SHOTS === undefined) return;
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

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

function answered(frame: Record<string, unknown>, approvalId: string): boolean {
  const event = frame["event"] as Record<string, unknown> | undefined;
  return event?.["type"] === "approval.resolved" && event["approval_id"] === approvalId;
}

const band = (page: Page) => page.getByTestId("let-work-band");

test.describe.configure({ mode: "serial" });

test("let work from an ask; ×, Disable banner and the harness's switch only change what shows", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const owner = await registerSpecialist("Sparrow", undefined, [HARNESS_CAPABILITIES.agents], true);
  const agent = await ownAgent(owner);
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
  try {
    await harness.send("run.started", { goal: "Read the notes.", plan: [], actor });

    // Its card: Permissions is its harness's (ADR 0300), and nothing says it works on its own.
    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByTestId("agent-permissions")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("agent-working")).toHaveCount(0);
    await shot(page, "1-card");
    await page.getByTestId("agent-permissions").click();
    await expect(page.getByTestId("perms-chips-row")).toContainText("On", { timeout: 20_000 });
    await shot(page, "2-harness");

    // Let it work, from the ask's own screen.
    await page.goto(`/spaces/${owner.space}`);
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
    const first = await ask("ls");
    await page.getByTestId("room-asks").getByRole("button", { name: "Details" }).last().click();
    await page.getByTestId("let-work-switch").click();
    await expect(page.getByTestId("until-stopped")).toBeVisible();
    await shot(page, "3-let-work");
    await page.getByTestId("approve").click();
    const given = await harness.waitFor((frame) => answered(frame, first), "the person's yes");
    expect(given["event"]).toMatchObject({ decision: "approved", until_stopped: true });

    // The server took it.
    const next = await ask("ls build");
    const reply = await harness.waitFor((frame) => answered(frame, next), "policy");
    expect(reply["event"]).toMatchObject({ decision: "approved", resolved_by: "system" });

    // Its card says so, and opens its own page.
    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByTestId("agent-working")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("agent-working").click();
    await expect(page.getByTestId("permissions-headline")).toHaveText(
      new RegExp(`^${agent.name} is working without asking in `),
    );
    await expect(page.getByTestId("permissions-let-work")).toHaveCount(0);
    await shot(page, "4-working");

    // The room's band: its words lead back to the page.
    await page.goto(`/spaces/${owner.space}`);
    await expect(band(page)).toContainText(`${agent.name} is working without asking`, {
      timeout: 20_000,
    });
    await shot(page, "5-band");
    await page.getByTestId("let-work-open").click();
    await expect(page.getByTestId("permissions")).toBeVisible();
    await page.goto(`/spaces/${owner.space}`);
    await expect(band(page)).toBeVisible({ timeout: 20_000 });

    // ×, Undo.
    await page.getByTestId("let-work-close").click();
    await expect(band(page)).toContainText("Hidden for now");
    await expect(band(page)).toContainText("Disable banner");
    await shot(page, "6-hidden");
    await page.getByTestId("let-work-undo-close").click();
    await expect(band(page)).toContainText("working without asking");

    // × for good, across a reload.
    await page.getByTestId("let-work-close").click();
    await expect(band(page)).toHaveCount(0, { timeout: 8000 });
    await page.reload();
    await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
    await expect(band(page)).toHaveCount(0);

    // Its card's row says so, and its page; Show again.
    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByTestId("agent-working")).toContainText("Banner closed for now", {
      timeout: 20_000,
    });
    await page.getByTestId("agent-working").click();
    await expect(page.getByTestId("permissions-closed")).toContainText(
      `Until ${agent.name} is given a new yes`,
      { timeout: 20_000 },
    );
    await shot(page, "7-closed");
    await page.getByTestId("permissions-show-again").click();
    await expect(page.getByTestId("permissions-closed")).toHaveCount(0);

    // Disable banner.
    await page.goto(`/spaces/${owner.space}`);
    await expect(band(page)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("let-work-close").click();
    await page.getByTestId("let-work-disable").click();
    await expect(band(page)).toContainText(`Banner off for ${agent.name}`);
    await shot(page, "8-off");
    await expect(band(page)).toHaveCount(0, { timeout: 6000 });
    await page.goto(`/agents/${agent.id}`);
    await expect(page.getByTestId("agent-working")).toContainText("Banner off", {
      timeout: 20_000,
    });

    // The switch on its page, back on.
    await page.getByTestId("agent-working").click();
    await expect(page.getByTestId("permissions-banner-row")).toContainText(
      `Off for ${agent.name} only`,
    );
    await shot(page, "9-page-off");
    await page.getByTestId("permissions-banner-switch").click();
    await expect(page.getByTestId("permissions-banner-row")).toContainText("Same as");

    // The harness's switch, with Undo.
    await page.getByTestId("permissions-harness").click();
    const row = page.getByTestId("harness-banners-row");
    await expect(row).toContainText("On for its agent");
    await shot(page, "10-harness");
    await page.getByTestId("harness-banners-switch").click();
    await expect(row).toContainText("Off for its agent");
    await expect(page.getByTestId("undo-pill")).toContainText("Banners off for its agent");
    await shot(page, "11-harness-off");
    await page.getByTestId("undo-pill-undo").click();
    await expect(row).toContainText("On for its agent");

    // Stop from the page.
    await page.goto(`/agents/${agent.id}/permissions`);
    await expect(page.getByTestId("permissions-stop")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("permissions-stop").click();
    await expect(page.getByTestId("permissions-headline")).toHaveText(
      `${agent.name} decides when to ask. You decide the answer.`,
    );
  } finally {
    harness.close();
  }
});

test.describe("at a tablet's width", () => {
  test("Permissions opens its harness's from the agent's card, and Back returns to it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1194, height: 834 });
    const owner = await registerSpecialist("Linnet", undefined, [HARNESS_CAPABILITIES.agents]);
    const agent = await ownAgent(owner);
    await pair(page);
    await page.goto(`/agents/${agent.id}`);
    await page.getByTestId("agent-permissions").click();
    await expect(page.getByTestId("perms-chips-row")).toBeVisible({ timeout: 20_000 });
    await shot(page, "12-tablet");
    // The browser's window has no third column (`useThirdFits`), so it stands in the card's place;
    // beside the card is the iPad simulator's to show.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("agent-permissions")).toBeVisible();
  });
});
