/**
 * An agent's Permissions and the banner (ADR 0286, ADR 0300), end to end on the web and the Mac's
 * WebView: an agent's Permissions row opens its harness's; with the harness's Chips's rules on, the
 * agent is let work from an ask's card and the server takes its next ask on the spot; its card then
 * shows Working without asking, which opens its own page. The band's × closes it for that yes, on
 * every device and across a reload; Disable banner turns it off for the agent; the harness's switch
 * turns it off for all of them, with Undo; Stop brings the asks back.
 *
 * And with the rules off (ADR 0300, addendum of 19 November 2026): the card offers no yes that
 * holds on, the server refuses one from an app that still does, no band and no Working without
 * asking row are drawn, and turning the rules off ends a yes that was holding.
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

/** Its own page, from Working without asking on its card, while a card's yes lets it work. */
async function openPermissions(page: Page, agent: string): Promise<void> {
  await openTab(page, "Agents");
  await page.getByTestId(`agent-${agent}`).click();
  await page.getByTestId("agent-working").click();
  await expect(page.getByTestId("permissions")).toBeVisible();
}

/** Turns the harness's Chips's rules on, on their page beside its Permissions (ADR 0300). */
async function chipsRulesOn(page: Page, harness: string): Promise<void> {
  await openTab(page, "Agents");
  await page
    .getByTestId("harness-shelf")
    .getByRole("button", { name: new RegExp(`^${harness}\\b`) })
    .click();
  await page.getByRole("main", { name: harness }).getByTestId("harness-asks-row").click();
  await page.getByTestId("perms-chips-row").click();
  await page.getByTestId("perms-chips").getByTestId("perms-switch").click();
  await expect(page.getByTestId("perms-chips").getByTestId("perms-switch")).toBeChecked();
}

/** The card's Let it work: the switch over its choices, then its yes (ADR 0281). */
async function letWorkFromCard(page: Page, name: string): Promise<void> {
  const card = page.getByRole("article", { name: /Approval/ }).last();
  await card.getByRole("switch", { name: new RegExp(`Let ${name} work without asking`) }).click();
  await card.getByRole("button", { name: "Approve and let it work" }).click();
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

test("let work from a card; its row, ×, Disable banner and the harness's switch only change what shows", async ({
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

    // Its Permissions row opens its harness's (ADR 0300); its Chips's rules turn on there.
    await openTab(page, "Agents");
    await page.getByTestId(`agent-${agent.id}`).click();
    await page.getByTestId("agent-permissions").click();
    await expect(page.getByTestId("perms-chips-row")).toBeVisible();
    await expect(page.getByTestId("agent-working")).toHaveCount(0);
    await chipsRulesOn(page, owner.name);
    expect((await harness.next("policy.updated"))["policy"]).toMatchObject({ chips_rules: true });
    await shot(page, "1-rules-on");

    // Let it work, from the card of an ask.
    await openRoom(page, owner.space);
    const first = await ask("ls");
    await letWorkFromCard(page, agent.name);
    expect(await answer(first, "the person's yes")).toMatchObject({ until_stopped: true });

    // The server took it: the next ask goes ahead on the spot.
    expect(await answer(await ask("ls build"), "policy")).toMatchObject({
      decision: "approved",
      resolved_by: "system",
    });
    await shot(page, "2-working");

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
    await expect(page.getByTestId("agent-working")).toContainText("Banner off");
    await page.getByTestId("agent-working").click();
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
    await expect(page.getByTestId("permissions-let-work")).toHaveCount(0);
    await ask("ls");
    await openRoom(page, owner.space);
    await expect(page.getByRole("button", { name: "Approve once" }).last()).toBeEnabled();
    await shot(page, "11-asks-again");
  } finally {
    harness.close();
  }
});

/**
 * An app from before the switch still offers For an hour and Let it work (the App Store's 1.3.0).
 * This stands in for one on the page's own socket: while `held` is set, a yes the page sends goes
 * out with it, as that app would send it. What the server refuses is kept in `refused`.
 */
async function olderApp(page: Page) {
  const app: {
    held: Record<string, unknown> | undefined;
    refused: string[];
    /** Every event the server sent this page, as any app hears them. */
    heard: Record<string, unknown>[];
  } = { held: undefined, refused: [], heard: [] };
  await page.routeWebSocket(/\/v1\/ws/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      server.send(typeof message === "string" ? withHeld(message, app.held) : message);
    });
    server.onMessage((message) => {
      if (typeof message === "string") note(app, JSON.parse(message) as Record<string, unknown>);
      socket.send(message);
    });
  });
  return app;
}

/** Keeps what the server said to the page: an answer it refused, and each event it sent. */
function note(
  app: { refused: string[]; heard: Record<string, unknown>[] },
  frame: Record<string, unknown>,
): void {
  if (frame["frame"] === "error") app.refused.push(String(frame["message"]));
  if (frame["frame"] === "event") app.heard.push(frame["event"] as Record<string, unknown>);
  if (frame["frame"] === "events")
    app.heard.push(...(frame["events"] as Record<string, unknown>[]));
}

function withHeld(message: string, held: Record<string, unknown> | undefined): string {
  if (held === undefined) return message;
  const frame = JSON.parse(message) as { frame?: string; event?: Record<string, unknown> };
  if (frame.frame !== "event" || frame.event?.["type"] !== "approval.resolved") return message;
  return JSON.stringify({ ...frame, event: { ...frame.event, ...held } });
}

/** Turns the harness's Chips's rules off again, where they were turned on. */
async function chipsRulesOff(page: Page, harness: string): Promise<void> {
  await openTab(page, "Agents");
  await page
    .getByTestId("harness-shelf")
    .getByRole("button", { name: new RegExp(`^${harness}\\b`) })
    .click();
  await page.getByRole("main", { name: harness }).getByTestId("harness-asks-row").click();
  await page.getByTestId("perms-chips-row").click();
  await page.getByTestId("perms-chips").getByTestId("perms-switch").click();
  await expect(page.getByTestId("perms-chips").getByTestId("perms-switch")).not.toBeChecked();
}

test("with the harness's Chips's rules off no yes holds on: none is offered, one is refused, and turning them off ends one", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { owner, agent } = await ready("Godwit");
  const app = await olderApp(page);
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
  const card = () => page.getByRole("article", { name: /Approval/ }).last();
  /** No band in the room, and no Working without asking row on the agent's card. */
  const noSignOfWorking = async (row: string) => {
    await openRoom(page, owner.space);
    await expect(band(page)).toHaveCount(0);
    await openTab(page, "Agents");
    await page.getByTestId(`agent-${agent.id}`).click();
    await expect(page.getByTestId("agent-permissions")).toContainText(row);
    await expect(page.getByTestId("agent-working")).toHaveCount(0);
  };
  // The specs share one workspace, and the page hears its history from the start: count only the
  // stops in this test's room.
  const stops = () =>
    app.heard.filter(
      (event) => event["type"] === "approval.held_stopped" && event["space_id"] === owner.space,
    );

  try {
    await harness.send("run.started", { goal: "Read the bridge notes.", plan: [], actor });

    // A new harness's rules are off. A loop Chips can't read is a yes or a no: no hour, no
    // switch, and the line says why it has no Always, as one Chips reads would.
    await openRoom(page, owner.space);
    const loop = await ask("for r in acp hermes; do head -30 $r/README.md; done");
    await expect(card().getByRole("button", { name: "Approve once" })).toBeEnabled();
    await expect(card().getByText("For an hour", { exact: true })).toHaveCount(0);
    await expect(card().getByRole("switch")).toHaveCount(0);
    await expect(card().getByTestId("once-only")).toHaveText(
      "This command does more than Chips can read, so there is no Always for it.",
    );
    await shot(page, "off-1-card");

    // An older app's Let it work, then its For an hour: each is refused, in words that say what
    // to do, and the ask still waits on its card.
    for (const [at, held] of [{ until_stopped: true }, { for_minutes: 60 }].entries()) {
      app.held = held;
      await card().getByRole("button", { name: "Approve once" }).click();
      await expect.poll(() => app.refused.length).toBe(at + 1);
      expect(app.refused[at]).toBe(
        "a yes holds on only while the harness's Chips's rules are on: answer this once, or turn them on in the harness's Permissions first",
      );
      await expect(card().getByRole("button", { name: "Approve once" })).toBeEnabled();
    }
    app.held = undefined;
    expect(harness.frames.some((frame) => answered(frame, loop))).toBe(false);
    await noSignOfWorking("Asks you");
    await shot(page, "off-2-refused");

    // A yes once is still a yes, and the next ask comes to the card as every one does.
    await openRoom(page, owner.space);
    await card().getByRole("button", { name: "Approve once" }).click();
    const once = await answer(loop, "the person's yes");
    expect(once).toMatchObject({ decision: "approved", scope: "once" });
    expect(once["until_stopped"]).toBeUndefined();
    await ask("ls");
    await expect(card().getByRole("button", { name: "Approve once" })).toBeEnabled();

    // On, Let it work holds and the room says so.
    await chipsRulesOn(page, owner.name);
    await openRoom(page, owner.space);
    await letWorkFromCard(page, agent.name);
    await expect(band(page)).toHaveText(
      new RegExp(`^${agent.name} is working without asking\\s*Stop$`),
    );
    expect(await answer(await ask("ls build"), "policy")).toMatchObject({
      resolved_by: "system",
    });
    await openTab(page, "Agents");
    await page.getByTestId(`agent-${agent.id}`).click();
    await expect(page.getByTestId("agent-working")).toHaveCount(1);
    await shot(page, "off-3-working");

    // Turned off, the yes ends: Chips writes the stop, the band and the row go, and the next ask
    // comes to the card. Turned on again, it has not come back.
    expect(stops()).toEqual([]);
    await chipsRulesOff(page, owner.name);
    await expect.poll(() => stops().length).toBe(1);
    expect(stops()[0]).toMatchObject({
      space_id: owner.space,
      asker: agent.id,
      actor: { kind: "system" },
    });
    await noSignOfWorking("Asks you");
    await ask("ls -la");
    await openRoom(page, owner.space);
    await expect(card().getByRole("button", { name: "Approve once" })).toBeEnabled();
    await shot(page, "off-4-stopped");
    await chipsRulesOn(page, owner.name);
    await noSignOfWorking("Chips's rules on");
    await ask("pwd");
    await openRoom(page, owner.space);
    await expect(card().getByRole("button", { name: "Approve once" })).toBeEnabled();
    expect(stops()).toHaveLength(1);
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
    await harness.send("run.started", { goal: "Read the bridge notes.", plan: [], actor });
    await chipsRulesOn(here, owner.name);
    for (const page of [here, there]) await openRoom(page, owner.space);
    await ask("ls");
    await letWorkFromCard(here, agent.name);
    await expect(band(here)).toHaveCount(1);
    await expect(band(there)).toHaveCount(1);

    // Closed here, gone there with nothing reloaded.
    await here.getByRole("button", { name: "Close this banner" }).click();
    await expect(band(there)).toHaveCount(0);

    // Stopped and let work again is a new yes, so its banner shows on both.
    await openPermissions(here, agent.id);
    await here.getByTestId("permissions-stop").click();
    await openRoom(here, owner.space);
    await ask("ls -la");
    await letWorkFromCard(here, agent.name);
    await expect(band(here)).toHaveCount(1);
    await expect(band(there)).toHaveCount(1);
  } finally {
    harness.close();
    await here.context().close();
    await there.context().close();
  }
});
