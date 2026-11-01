/**
 * ADR 0087, Phase 4: an agent is in one room at a time, as a person meets it on the desktop.
 *
 * Tern is a harness whose default agent sits in the direct room it came with. Arjun opens Kiln
 * and adds Tern from its sheet (ADR 0151): Tern is in another room, so the sheet asks, and Move puts
 * it in Kiln; its direct room then says no agent is in it, and where Tern went. Tern starts work
 * in Kiln, and Arjun archives Kiln while it runs: the dialog says Tern's reply will be stopped,
 * the harness hears its run cancelled, and Tern is free. Arjun moves Tern back to its direct room
 * from that room's notice. Unarchived, Kiln says Tern is in another room, with Move back, and Move
 * back brings it. The harness is driven by the test, and hears each move as `agent.attached` and
 * `agent.released`.
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
  sheetBack,
} from "./support.ts";

/** A room in the list, by its id. */
async function open(page: Page, spaceId: string): Promise<void> {
  await page.getByTestId("space-list").locator(`[data-space="${spaceId}"]`).click();
}

test("an agent is in one room at a time: Move, an archive while it works, and Move back", async ({
  page,
}) => {
  const tern = await registerSpecialist("Tern", undefined, [HARNESS_CAPABILITIES.agents]);
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: tern.token, space: tern.space });
  try {
    // Kiln, with nobody asked into it.
    await page.getByRole("button", { name: "Create new space" }).click();
    // Nobody asked: Empty (ADR 0148).
    await pickEmpty(page);
    const name = page.getByRole("textbox", { name: "Name the space" });
    await name.fill("Kiln");
    await name.press("Enter");
    await expect(page.getByRole("main", { name: "Space: Kiln" })).toBeVisible();

    // Its sheet comes up on Add (ADR 0148). Tern's agent is in its direct room, so it is offered
    // in other rooms, and picking it asks before it moves.
    const sheet = page.getByTestId("room-sheet");
    await expect(sheet.getByTestId("room-sheet-add-done")).toBeVisible();
    await sheet.getByTestId("room-sheet-other-rooms").click();
    const offered = sheet.locator('[data-testid^="room-sheet-agent-"]', { hasText: "Tern" });
    await expect(offered).toHaveCount(1);
    const agentId = String(await offered.getAttribute("data-testid")).replace(
      "room-sheet-agent-",
      "",
    );
    expect(agentId).toMatch(/^agt_/);
    await offered.click();
    await expect(sheet).toContainText("Move Tern here?");
    await sheet.getByTestId("room-sheet-move").click();

    const left = await harness.next("agent.released");
    expect(left).toMatchObject({ agent_id: agentId, space_id: tern.space, reason: "moved" });
    const joined = await harness.next("agent.attached");
    expect(joined).toMatchObject({ agent_id: agentId, moved_from: tern.space });
    const kiln = String(joined["space_id"]);
    await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(2);
    await closeSheet(page);

    // The room it left says no agent is in it, and where Tern went.
    await open(page, tern.space);
    const notice = page.getByTestId("no-agent");
    await expect(notice).toContainText("No agent in this space");
    await expect(notice).toContainText("Tern is in Kiln.");

    // Tern works in Kiln; Arjun archives Kiln while it does.
    harness.space = kiln;
    const started = await harness.send("run.started", {
      goal: "Fire the glaze test",
      actor: { kind: "agent", id: agentId },
    });
    expect(started).toMatchObject({ frame: "ack" });
    await open(page, kiln);
    await (await roomSheet(page)).getByTestId("archive-space").click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText("Tern's reply will be stopped.");
    await expect(dialog).toContainText("Tern will be free to join another space.");
    await dialog.getByTestId("confirm-go").click();
    const cancel = await harness.next("run.cancel");
    expect(cancel).toMatchObject({ run_id: harness.runId });
    const archived = await harness.next("agent.released");
    expect(archived).toMatchObject({ agent_id: agentId, space_id: kiln, reason: "archived" });

    // Free now: its direct room's notice says so, and Move back puts it there again.
    await open(page, tern.space);
    await expect(notice).toContainText("Tern isn't in a space now.");
    await notice.getByRole("button", { name: "Move back" }).click();
    const home = await harness.next("agent.attached");
    expect(home).toMatchObject({ agent_id: agentId, space_id: tern.space });
    await expect(page.getByTestId("no-agent")).toHaveCount(0);

    // Unarchived, Kiln does not take Tern from where it is: it says where, with Move back.
    const toggle = page.getByTestId("archived-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await page.getByTestId("archived-list").locator(`[data-space="${kiln}"]`).click();
    await (await roomSheet(page)).getByTestId("unarchive-space").click();
    await closeSheet(page);
    const elsewhere = page.getByTestId("elsewhere");
    await expect(elsewhere).toContainText("Tern is in");
    await expect(page.getByTestId("no-agent")).toContainText("No agent in this space");
    await elsewhere.getByRole("button", { name: "Move back" }).click();
    const back = await harness.next("agent.attached");
    expect(back).toMatchObject({ agent_id: agentId, space_id: kiln, moved_from: tern.space });
    await expect(page.getByTestId("elsewhere")).toHaveCount(0);
    await expect(page.getByTestId("no-agent")).toHaveCount(0);
  } finally {
    harness.close();
  }
});
