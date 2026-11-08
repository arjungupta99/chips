/**
 * ADR 0091 and ADR 0092's acceptance, on the desktop. Osprey is a harness that speaks agents.
 * Two more of its agents registered under its own name come back numbered, "Osprey 2" and
 * "Osprey 3". On the Agents page Arjun renames Osprey 3: "Osprey" is refused with who has it, and
 * "Merlin" is taken. In a room with Osprey 2 and Merlin, the field's list says each one's @, and
 * "@Osprey2" reaches Osprey 2 alone, with the room note naming everyone by the @ that reaches them.
 *
 * Named to run after `approval-loop.spec.ts`, which needs the workspace as the demo left it: this
 * spec makes a room, and the app opens on the newest.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
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

/** One more agent for a harness, and the name Chips gave it. */
async function register(
  harness: { readonly id: string; readonly token: string },
  key: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, name }),
  });
  if (response.status !== 201) throw new Error(`registering an agent answered ${response.status}`);
  const made = (await response.json()) as { agent_id: string; name: string };
  return { id: made.agent_id, name: made.name };
}

/** Arjun says something; the room draws a mention as a chip with the name, so look for the rest. */
async function say(page: Page, text: string, rest: string): Promise<void> {
  await page.getByRole("textbox", { name: /Message/ }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText(rest);
}

test("agents are numbered, renamed on their page, and reached apart by their @", async ({
  page,
}) => {
  const osprey = await registerSpecialist("Osprey", undefined, [HARNESS_CAPABILITIES.agents]);
  // Its default agent is called Osprey: the next two are numbered.
  const two = await register(osprey, "two", "Osprey");
  const three = await register(osprey, "three", "Osprey");
  expect([two.name, three.name]).toEqual(["Osprey 2", "Osprey 3"]);

  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: osprey.token, space: osprey.space });
  try {
    // Osprey 3, renamed on its page: a name another agent has is refused, with who has it.
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByTestId(`agent-${three.id}`).click();
    await expect(page.getByRole("heading", { name: "Osprey 3", level: 1 })).toBeVisible();
    const field = page.getByRole("textbox", { name: "Name" });
    await expect(field).toHaveValue("Osprey 3");
    await field.fill("osprey");
    await field.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("An agent here goes by Osprey already.");
    await field.fill("Merlin");
    await field.press("Enter");
    await expect(page.getByRole("heading", { name: "Merlin", level: 1 })).toBeVisible();
    await expect(page.getByTestId(`agent-${three.id}`)).toContainText("Merlin");

    // A room with Osprey 2 and Merlin.
    await page.getByRole("button", { name: "Create new space" }).click();
    // Nobody asked: Empty (ADR 0148).
    await pickEmpty(page);
    const title = page.getByRole("textbox", { name: "Name the space" });
    await title.fill("Aerie");
    await title.press("Enter");
    await expect(page.getByRole("main", { name: "Space: Aerie" })).toBeVisible();
    await expect(page.getByTestId("room-sheet-add-page")).toBeVisible();
    await addMember(page, { id: two.id });
    await addMember(page, { id: three.id });
    await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(3);
    await closeSheet(page);

    // The field's list says the @ that reaches each.
    await page.getByTestId("aim").click();
    const menu = page.getByRole("listbox", { name: "Where the next message goes" });
    await expect(menu).toContainText("@Osprey2");
    await expect(menu).toContainText("@Merlin");
    await page.keyboard.press("Escape");

    // "@Osprey2" is Osprey 2's turn alone, with the room as Chips words it.
    const text = "@Osprey2 which nest is closest?";
    const delivered = harness.waitFor((frame) => {
      const event = frame["event"] as Frame | undefined;
      return event?.["type"] === "message.new" && event["text"] === text;
    }, text);
    await say(page, text, "which nest is closest?");
    const event = (await delivered)["event"] as Frame;
    expect(event["for"]).toEqual([two.id]);
    const room = event["room"] as { notes: Record<string, string> };
    // Each agent with the harness it runs on (ADR 0101), itself included.
    expect(room.notes[two.id]).toContain(
      "Merlin (Osprey agent, @Merlin), and you, Osprey 2 (Osprey agent, @Osprey2).",
    );
    expect(room.notes[two.id]).toContain("only those you @-mention act on it");
  } finally {
    harness.close();
  }
});
