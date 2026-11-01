/**
 * ADR 0199's acceptance, on the desktop. Kestrel is a harness that speaks agents, with an agent
 * called Wren in a room of its own. From Wren's page its changes are locked: Archive and Delete…
 * go, the name will not edit, and the page says why. Kestrel is never told. Let go again, Wren
 * archives as before, and Kestrel hears that.
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

/** Ask for one of a harness's agents by its key, and its id. */
async function register(
  harness: { readonly id: string; readonly token: string },
  key: string,
  name: string,
): Promise<string> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, name }),
  });
  const made = (await response.json()) as { agent_id?: string };
  if (made.agent_id === undefined) throw new Error(`${name} was not made`);
  return made.agent_id;
}

/** Whether a frame the harness was sent is an event of this type. */
const isType = (frame: Frame, type: string) =>
  (frame["event"] as Frame | undefined)?.["type"] === type;

test("an agent's changes are locked from its page, and its harness is never told", async ({
  page,
}) => {
  const kestrel = await registerSpecialist("Kestrel", undefined, [HARNESS_CAPABILITIES.agents]);
  const wrenId = await register(kestrel, "wren", "Wren");

  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: kestrel.token, space: kestrel.space });
  try {
    // Wren, alone in a room of its own.
    await page.getByRole("button", { name: "Create new space" }).click();
    await pickEmpty(page);
    const title = page.getByRole("textbox", { name: "Name the space" });
    await title.fill("Wren");
    await title.press("Enter");
    await expect(page.getByRole("main", { name: "Space: Wren" })).toBeVisible();
    await expect(page.getByTestId("room-sheet-add-done")).toBeVisible();
    await addMember(page, { id: wrenId });
    await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(2);
    await closeSheet(page);

    // Its page offers Archive and Delete…, and the switch, off.
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByTestId(`agent-${wrenId}`).click();
    await expect(page.getByRole("heading", { name: "Wren", level: 1 })).toBeVisible();
    await expect(page.getByTestId("archive-agent")).toBeVisible();
    await expect(page.getByTestId("delete-agent")).toBeVisible();
    const lock = page.getByTestId("agent-lock-switch");
    await expect(lock).not.toBeChecked();

    // Locked: the acts go, and the page says why.
    await lock.click();
    await expect(lock).toBeChecked();
    await expect(page.getByTestId("archive-agent")).toHaveCount(0);
    await expect(page.getByTestId("delete-agent")).toHaveCount(0);
    await expect(page.getByText("Changes are locked.", { exact: false })).toBeVisible();

    // Let go, Wren archives as before, and Kestrel hears that — but it was never told of the lock.
    await lock.click();
    await expect(lock).not.toBeChecked();
    const archived = harness.waitFor(
      (frame) =>
        isType(frame, "agent.updated") && (frame["event"] as Frame)["state"] === "archived",
      "agent.updated archived",
    );
    await page.getByTestId("archive-agent").click();
    await page.getByTestId("confirm-dialog").getByTestId("confirm-go").click();
    await archived;
    expect(harness.frames.some((frame) => isType(frame, "agent.lock_set"))).toBe(false);
  } finally {
    harness.close();
  }
});
