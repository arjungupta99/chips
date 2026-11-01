/**
 * ADR 0087, Phase 6: Fork, on the desktop, against a harness that makes copies.
 *
 * Robin declares `agents` and `forks`, and its agent sits in the direct room it came with. Arjun
 * opens Porch and adds Robin from its sheet: Robin is in another room, so the sheet asks,
 * and he forks it here instead of moving it. Porch says it is forking; Robin hears `agent.fork`,
 * registers its copy `forked_from` Robin with Porch, and the copy joins — called Robin 2 · fork: Robin
 * named it what the original is called, so Chips numbered it (ADR 0091), and the screen says it is
 * a copy. Robin itself stays in its room. Called Robin here, a name no other spec gives a harness,
 * so the numbers are the same whichever specs ran first. Then he forks Robin
 * into Shed, Robin makes nothing, and after a minute Shed says Robin didn't make the copy.
 *
 * Named to run after `approval-loop.spec.ts`, which needs the workspace as the demo left it: the
 * app opens on the newest room, and this spec makes two.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
import {
  closeSheet,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerSpecialist,
  roomSheet,
  SERVER,
  type Specialist,
} from "./support.ts";

/** A new room of Arjun's with nobody else in it, opened from the +, its sheet up on Add. */
async function openRoom(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Create new space" }).click();
  // Nobody asked: Empty (ADR 0148).
  await pickEmpty(page);
  const name = page.getByRole("textbox", { name: "Name the space" });
  await name.fill(title);
  await name.press("Enter");
  await expect(page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
  await expect(page.getByTestId("room-sheet-add-done")).toBeVisible();
}

/** From the open room's sheet (ADR 0151): Robin, in its own room, forked here. */
async function forkHere(page: Page, robin: Specialist, agentId: string): Promise<void> {
  const sheet = await roomSheet(page);
  await sheet.getByTestId("room-sheet-other-rooms").click();
  await sheet.getByTestId(`room-sheet-agent-${agentId}`).click();
  await expect(sheet).toContainText(`Move ${robin.name} here?`);
  await expect(sheet).toContainText("A copy joins");
  await sheet.getByTestId("room-sheet-fork").click();
  await closeSheet(page);
}

/** Robin's own agent: the one in the room it came with, keyed by its id. */
async function robinsAgent(robin: Specialist): Promise<string> {
  const response = await fetch(`${SERVER}/v1/harnesses/${robin.id}/agents`, {
    headers: { authorization: `Bearer ${robin.token}` },
  });
  const { agents } = (await response.json()) as { agents: { agent_id: string; key: string }[] };
  const own = agents.find((agent) => agent.key === robin.id);
  if (own === undefined) throw new Error("Robin has no agent of its own");
  return own.agent_id;
}

test("a fork's copy joins the room it was asked for, and a copy not made is said so", async ({
  page,
}) => {
  const robin = await registerSpecialist("Robin", undefined, [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.forks,
  ]);
  const original = await robinsAgent(robin);
  // The clock is the app's: the minute a room waits for a copy is timed on it.
  await page.clock.install();
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: robin.token, space: robin.space });
  try {
    // Porch, and Robin forked into it.
    await openRoom(page, "Porch");
    const porch = page.getByRole("main", { name: "Space: Porch" });
    await forkHere(page, robin, original);
    await expect(porch.getByTestId("fork-waiting")).toContainText("Forking Robin…");

    // Robin hears the ask out of the room, and registers its copy for it.
    const ask = await harness.next("agent.fork");
    expect(ask["agent_id"]).toBe(original);
    const made = await fetch(`${SERVER}/v1/harnesses/${robin.id}/agents`, {
      method: "POST",
      headers: { authorization: `Bearer ${robin.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        key: "robin-copy",
        name: "Robin",
        forked_from: original,
        space_id: ask["space_id"],
      }),
    });
    expect(made.status).toBe(201);
    expect(((await made.json()) as { attached: boolean }).attached).toBe(true);
    await expect(porch.getByTestId("fork-joined")).toContainText("Robin 2 · fork joined");

    // Shed, where Robin makes nothing: after a minute the room says so.
    await openRoom(page, "Shed");
    await forkHere(page, robin, original);
    const shed = page.getByRole("main", { name: "Space: Shed" });
    await expect(shed.getByTestId("fork-waiting")).toBeVisible();
    await harness.next("agent.fork");
    await page.clock.fastForward(61_000);
    const notMade = shed.getByTestId("fork-not_made");
    await expect(notMade).toContainText("Robin didn't make the copy");
    await expect(notMade.getByTestId("fork-again")).toBeVisible();

    // On Agents, the copy is called Robin 2 · fork, and says what it is a copy of.
    await page.getByRole("button", { name: /^Agents/ }).click();
    const copy = page.locator('[data-testid^="agent-agt_"]', { hasText: "Robin 2 · fork" });
    await copy.click();
    await expect(page.getByTestId("agent-forked-from")).toContainText("Forked from Robin");
  } finally {
    harness.close();
  }
});
