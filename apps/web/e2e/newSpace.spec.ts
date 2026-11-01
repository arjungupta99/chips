/**
 * A new space from the + on the desktop (`docs/proposals/new-space.md`, Phase 4; ADR 0149), against
 * a real chipsd and a harness that takes new spaces: the demo's, which declares `new_spaces`. The
 * phone's `apps/mobile/e2e/newSpace.spec.ts`, at a desk: a person names a room and asks the harness
 * for it; the harness hears it asked of it, by that name, and nothing is said; the room opens by
 * the name with the harness waiting in its middle; the person's first message is the first words
 * the harness hears; the harness claims the room under a key of its own; and the person's name
 * holds, in its header, the rail and search.
 */

import { expect, test } from "@playwright/test";
import { demo, eventType, type Frame, Harness, newRunId, pair, SERVER } from "./support.ts";

const NAME = "Kitchen remodel";
const FIRST = "Two quotes and a budget, by Friday";

test("a room asked of a harness from the +, by its name, waits for the first message", async ({
  page,
}) => {
  await pair(page);
  const details = demo();
  const harness = await Harness.connect(newRunId());
  try {
    await page.getByRole("button", { name: "Create new space" }).click();
    const dialog = page.getByRole("dialog", { name: "New space" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /^Scout/ })).toBeChecked();
    await expect(dialog.getByTestId("new-space-says")).toHaveText(
      "Scout joins · waits for your first message",
    );
    const field = dialog.getByRole("textbox", { name: "Name the space" });
    await expect(field).toBeFocused();
    await field.fill(NAME);
    await field.press("Enter");

    // The harness hears the room asked of it, by its name, though it is not in it yet.
    const created = await harness.waitFor(
      (frame) =>
        eventType(frame) === "space.created" &&
        (frame["event"] as Frame)["asked_of"] === details.harness.id,
      "the room asked of the harness",
    );
    const spaceId = String((created["event"] as Frame)["space_id"]);
    expect((created["event"] as Frame)["title"]).toBe(NAME);

    // The dialog has gone and the room is open by its name, nothing said in it, Scout's waiting.
    await expect(page.getByTestId("new-space-window")).toHaveCount(0);
    const room = page.getByRole("main", { name: `Space: ${NAME}` });
    await expect(room).toBeVisible();
    await expect(room.getByRole("heading", { level: 1 })).toHaveText(NAME);
    const waiting = room.getByTestId("waiting");
    await expect(waiting.getByRole("heading", { level: 2 })).toHaveText(
      "What would you like to do?",
    );
    // Scout's agent-to-be, by the first name it is held under (ADR 0150).
    await expect(waiting).toContainText(/\w is here and waits for your first message\.$/);
    const row = page.getByTestId("space-list").locator(`[data-space="${spaceId}"]`);
    await expect(row).toHaveAttribute("data-active", "true");
    await expect(row).toContainText(NAME);

    // The first message is the person's own, and the first words the harness hears there.
    const composer = room.getByRole("textbox", { name: /^Message/ });
    await composer.fill(FIRST);
    await composer.press("Enter");
    const words = await harness.waitFor(
      (frame) =>
        eventType(frame) === "message.new" && (frame["event"] as Frame)["space_id"] === spaceId,
      "the first words",
    );
    expect((words["event"] as Frame)["text"]).toBe(FIRST);
    await expect(waiting).toHaveCount(0);
    await expect(page.getByTestId("messages")).toContainText(FIRST);

    // The harness claims it under its own key, with a name of its own; the person's holds.
    const claim = await fetch(`${SERVER}/v1/harnesses/${details.harness.id}/spaces`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${details.harness.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ key: `brief:${spaceId}`, title: "Remodel quotes", space_id: spaceId }),
    });
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({ space_id: spaceId, claimed: true });
    await harness.waitFor(
      (frame) =>
        eventType(frame) === "space.claimed" && (frame["event"] as Frame)["space_id"] === spaceId,
      "the claim",
    );
    await expect(page.getByRole("main", { name: `Space: ${NAME}` })).toBeVisible();
    await expect(row).toContainText(NAME);
    await expect(row).not.toContainText("Remodel quotes");

    // And search calls it that too.
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByLabel("Search spaces, agents and messages").fill("quotes and a budget");
    await expect(page.getByTestId("search-hit").first()).toContainText(`in ${NAME}`);
  } finally {
    harness.close();
  }
});

test("a room made empty from the +, by its name, opens with Add in front (ADR 0148)", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "Create new space" }).click();
  const dialog = page.getByRole("dialog", { name: "New space" });
  await expect(dialog).toBeVisible();
  await dialog.getByText("Empty", { exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Empty space" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^Scout/ })).not.toBeChecked();
  await expect(dialog.getByTestId("new-space-says")).toHaveText(
    "An empty space · you add agents next",
  );
  const field = dialog.getByRole("textbox", { name: "Name the space" });
  await field.fill("Japan trip");
  await field.press("Enter");

  // The room opens by its name, with nobody in it but you, nothing asked of anybody, and its
  // sheet up on Add (ADR 0151), the first thing to pick taking the keyboard.
  await expect(page.getByTestId("new-space-window")).toHaveCount(0);
  const room = page.getByRole("main", { name: "Space: Japan trip" });
  await expect(room).toBeVisible();
  await expect(room.getByText("Nobody's here yet")).toBeVisible();
  const sheet = page.getByTestId("room-sheet");
  await expect(sheet.getByRole("heading", { name: "Add to Japan trip" })).toBeVisible();
  await expect(sheet.locator(".sheet-scroll :focus")).toHaveCount(1);
  // Done puts it away, and the room takes the keyboard's next words.
  await sheet.getByTestId("room-sheet-add-done").click();
  await expect(sheet).toHaveCount(0);
  await expect(room.getByText("Nobody's here yet")).toBeVisible();
});
