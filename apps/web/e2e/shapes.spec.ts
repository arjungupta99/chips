/**
 * Three harnesses of three shapes in one workspace at once (ADR 0077): the demo's Scout, on the
 * SDK's terms (the dial, new spaces); Tree, which keeps a thing of its own per room and carries a
 * person's archive and delete over to it (`new_spaces`, `follows_rooms` — the shape Jacobian has);
 * and Plain, which declares nothing. What the desk offers and promises for each is what that one
 * declared, and nothing is borrowed from another.
 */

import { expect, type Page, test } from "@playwright/test";
import {
  closeSheet,
  type Frame,
  Harness,
  newRunId,
  pair,
  registerSpecialist,
  roomSheet,
  SERVER,
  type Specialist,
} from "./support.ts";

/** A room the harness opens under a key of its own, as one does for each thing it keeps. */
async function openRoom(harness: Specialist, key: string, title: string): Promise<string> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/spaces`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, title }),
  });
  expect(response.status).toBe(201);
  return String(((await response.json()) as { space_id: string }).space_id);
}

/** What the sheet asking before a delete says under its question, or nothing. */
async function deleteNote(page: Page, spaceId: string, title: string): Promise<string | null> {
  await page.getByTestId("space-list").locator(`[data-space="${spaceId}"]`).click();
  await expect(page.getByRole("main", { name: `Space: ${title}` })).toBeVisible();
  await (await roomSheet(page)).getByTestId("delete-space").click();
  const asking = page.getByTestId("confirm-dialog");
  await expect(asking).toContainText(`Delete ${title}?`);
  const note = asking.locator(".confirm-note");
  const said = (await note.count()) === 0 ? null : await note.textContent();
  await asking.getByRole("button", { name: "Cancel" }).click();
  await expect(asking).toHaveCount(0);
  await closeSheet(page);
  return said;
}

test("three harnesses of three shapes, each offered and promised only what it declared", async ({
  page,
}) => {
  const tree = await registerSpecialist("Tree", undefined, ["new_spaces", "follows_rooms"]);
  const plain = await registerSpecialist("Plain", undefined, []);
  const treeRoom = await openRoom(tree, "tree-garden", "Garden plan");
  const plainRoom = await openRoom(plain, "plain-notes", "Reading notes");
  await pair(page);

  // The + offers the two that take a room a person asks for; never Plain, which would leave the
  // room waiting for an answer that does not come.
  await page.getByRole("button", { name: "Create new space" }).click();
  const dialog = page.getByRole("dialog", { name: "New space" });
  await expect(dialog.getByRole("checkbox", { name: /^Scout/ })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^Tree/ })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^Plain/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Deleting Tree's room offers to delete its agent in Tree too, as Tree declared it follows
  // its rooms; deleting Plain's frees Plain's agent and promises nothing on Plain's behalf.
  expect(await deleteNote(page, treeRoom, "Garden plan")).toBe("It's deleted in Tree as well.");
  // Plain's room holds the agent for its key, named after Plain and numbered past Plain's own
  // default agent, which has the name (ADR 0091).
  expect(await deleteNote(page, plainRoom, "Reading notes")).toBe(
    "Plain 2 will be free to join another space.",
  );
});

/** One of a harness's agents, registered by its own key (ADR 0087). */
async function registerAgent(harness: Specialist, key: string, name: string): Promise<string> {
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key, name }),
  });
  expect(response.status).toBe(201);
  return String(((await response.json()) as { agent_id: string }).agent_id);
}

/** Something the harness says in a room, as one of its agents or, with none named, as itself. */
async function sayAs(
  harness: Specialist,
  room: string,
  text: string,
  agentId?: string,
): Promise<Response> {
  return await fetch(`${SERVER}/v1/harnesses/${harness.id}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      type: "message.post",
      space_id: room,
      text,
      idempotency_key: `tree-${newRunId()}`,
      ...(agentId === undefined ? {} : { actor: { kind: "agent", id: agentId } }),
    }),
  });
}

async function say(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: /Message/ }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("messages")).toContainText(text);
}

function heard(harness: Harness, text: string): Promise<Frame> {
  return harness
    .waitFor(
      (frame) => ((frame["event"] as Frame | undefined)?.["text"] as string | undefined) === text,
      `"${text}"`,
    )
    .then((frame) => frame["event"] as Frame);
}

test("Tree with agents: two agents of one harness in one room, each answering its own @", async ({
  page,
}) => {
  // Tree speaks agents (ADR 0087): it declares it, registers two by keys of its own, and hears
  // on its one socket which of them a message is for.
  const tree = await registerSpecialist("Tree", undefined, ["follows_rooms", "agents"]);
  const oak = await registerAgent(tree, "oak", "Oak");
  const elm = await registerAgent(tree, "elm", "Elm");
  const room = await openRoom(tree, "tree-garden", "Garden plan");
  const wire = await Harness.connect(newRunId(), { token: tree.token, space: room });
  await pair(page);
  await page.getByTestId("space-list").locator(`[data-space="${room}"]`).click();
  await expect(page.getByRole("main", { name: "Space: Garden plan" })).toBeVisible();
  // A person puts both in the room by name.
  for (const name of ["Oak", "Elm"]) {
    await page.getByRole("textbox", { name: /Message/ }).fill(`/add ${name}`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  }
  const sheet = await roomSheet(page);
  await expect(sheet.getByTestId("member")).toHaveCount(4);
  await expect(sheet.locator('[data-testid="member"]', { hasText: "Oak" })).toContainText("Tree");
  await closeSheet(page);

  // "@Oak …" is Oak's turn alone, and "@Elm …" Elm's: one delivery each, saying which.
  await say(page, "@Oak what grows in the shade?");
  expect(await heard(wire, "@Oak what grows in the shade?")).toMatchObject({
    type: "message.new",
    addressed_to: [oak],
    for: [oak],
  });
  expect((await sayAs(tree, room, "Ferns, mostly.", oak)).status).toBe(201);
  await say(page, "@Elm and in full sun?");
  expect(await heard(wire, "@Elm and in full sun?")).toMatchObject({
    type: "message.new",
    addressed_to: [elm],
    for: [elm],
  });
  expect((await sayAs(tree, room, "Lavender.", elm)).status).toBe(201);

  // Each answer is under its own agent's name.
  const row = (text: string) =>
    page.getByTestId("messages").locator("[data-line]", { hasText: text });
  await expect(row("Ferns, mostly.")).toContainText("Oak");
  await expect(row("Lavender.")).toContainText("Elm");

  // With three of its agents here, Tree speaking as itself is asked which.
  const unnamed = await sayAs(tree, room, "Which of us?");
  expect(unnamed.status).toBe(422);
  expect(((await unnamed.json()) as { error: { message: string } }).error.message).toContain(
    "name one as the actor",
  );
  wire.close();
});
