/**
 * ADR 0095's acceptance, on the desktop. Kestrel is a harness that speaks agents, with an agent
 * called Nest alone in a room of its own. From Nest's page it is archived, asking first — its
 * harness hears it, and its room goes with it — then brought back, then deleted with its room:
 * its harness hears that too, Nest is gone from the list, and Kestrel asking for it again is refused.
 *
 * Named to run after `approval-loop.spec.ts`, which needs the workspace as the demo left it: this
 * spec makes a room, and the app opens on the newest.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import {
  addMember,
  closeSheet,
  type Frame,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerSpecialist,
  SERVER,
  sheetBack,
} from "./support.ts";

/** Ask for one of a harness's agents by its key, and what Chips answered. */
async function register(
  harness: { readonly id: string; readonly token: string },
  key: string,
  name: string,
): Promise<{ status: number; id?: string }> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, name }),
  });
  const made = (await response.json()) as { agent_id?: string };
  return { status: response.status, ...(made.agent_id === undefined ? {} : { id: made.agent_id }) };
}

/** The harness hearing an event about its agent, of a type and, for an update, a state. */
function hears(harness: Harness, agentId: string, type: string, state?: string) {
  return harness.waitFor(
    (frame) => {
      const event = frame["event"] as Frame | undefined;
      if (event?.["type"] !== type || event["agent_id"] !== agentId) return false;
      return state === undefined || event["state"] === state;
    },
    `${type} ${state ?? ""}`,
  );
}

test("an agent is archived, brought back and deleted from its page, with its room", async ({
  page,
}) => {
  const kestrel = await registerSpecialist("Kestrel", undefined, [HARNESS_CAPABILITIES.agents]);
  const nest = await register(kestrel, "nest", "Nest");
  if (nest.id === undefined) throw new Error("Nest was not made");
  const nestId = nest.id;

  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: kestrel.token, space: kestrel.space });
  try {
    // Nest, alone in a room of its own.
    await page.getByRole("button", { name: "Create new space" }).click();
    // Nobody asked: Empty (ADR 0148).
    await pickEmpty(page);
    const title = page.getByRole("textbox", { name: "Name the space" });
    await title.fill("Nest");
    await title.press("Enter");
    await expect(page.getByRole("main", { name: "Space: Nest" })).toBeVisible();
    await expect(page.getByTestId("room-sheet-add-page")).toBeVisible();
    await addMember(page, { id: nestId });
    await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(2);
    await closeSheet(page);

    // Archived from its page, asked first: its harness hears a person did it.
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByTestId(`agent-${nestId}`).click();
    await expect(page.getByRole("heading", { name: "Nest", level: 1 })).toBeVisible();
    const archived = hears(harness, nestId, "agent.updated", "archived");
    await page.getByTestId("archive-agent").click();
    const asking = page.getByTestId("confirm-dialog");
    await expect(asking.getByRole("heading")).toHaveText("Archive Nest?");
    await expect(asking).toContainText("archived with it, since no other agent is there");
    await asking.getByTestId("confirm-go").click();
    const update = (await archived)["event"] as Frame;
    expect((update["actor"] as Frame)["kind"]).toBe("person");
    await expect(page.getByTestId("unarchive-agent")).toBeVisible();

    // Brought back without asking: into its room, which opens again.
    const back = hears(harness, nestId, "agent.attached");
    await page.getByTestId("unarchive-agent").click();
    await back;
    await expect(page.getByTestId("archive-agent")).toBeVisible();

    // Deleted with its room: its harness hears it, and the page steps back to a list without it.
    const deleted = hears(harness, nestId, "agent.deleted");
    await page.getByTestId("delete-agent").click();
    await expect(asking.getByRole("heading")).toHaveText("Delete Nest?");
    await expect(asking.getByTestId("confirm-too")).toBeChecked();
    await expect(asking).toContainText("Delete the space “Nest” too");
    await asking.getByTestId("confirm-go").click();
    const gone = (await deleted)["event"] as Frame;
    expect(gone["key"]).toBe("nest");
    await expect(page.getByTestId(`agent-${nestId}`)).toHaveCount(0);

    // Deleted stays deleted: Kestrel asking for it again is refused.
    expect((await register(kestrel, "nest", "Nest")).status).toBe(403);
  } finally {
    harness.close();
  }
});
