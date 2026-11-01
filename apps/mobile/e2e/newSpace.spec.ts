/**
 * A new space from the + (`docs/proposals/new-space.md`, Phase 3; ADR 0149), against a real chipsd
 * and a harness that takes new spaces: the demo's, which declares `new_spaces`. A person names a
 * room and asks the harness for it; the harness hears it asked of it, by that name, and nothing is
 * said; the room opens by the name, asking what the person would like to do, with the harness
 * waiting in it; the person's first message is the first words the harness hears; and the harness's
 * claim leaves the person's name as it is, in the bar and in the list. The window's motion runs on
 * the web's driver and is the simulator's film to judge; what is proved here is what is on screen
 * at either end of it.
 */

import { expect, test } from "@playwright/test";
import { demo, eventType, type Frame, Harness, newRunId, pair, SERVER } from "./support.ts";

const NAME = "Kitchen remodel";
const FIRST = "Two quotes and a budget, by Friday";

test("a room asked of a harness from the +, by its name, waits for the first message", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const details = demo();
  const harness = await Harness.connect(newRunId());
  try {
    await page.getByRole("button", { name: "Create new space" }).click();
    await expect(page.getByRole("heading", { name: "New space" })).toBeVisible();
    // Scout is the one asked, and waits; or it can't answer if its socket has not been seen yet
    // (ADR 0083).
    await expect(page.getByTestId("new-space-says")).toContainText("Scout");
    await expect(page.getByRole("checkbox", { name: /^Scout/ })).toBeChecked();
    const field = page.getByTestId("new-space-field");
    await expect(field).toHaveAttribute("placeholder", "Name the space");
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
    // It waits there under a first name the room holds for its agent (ADR 0150), not as "Scout".
    const joined = await harness.waitFor(
      (frame) =>
        eventType(frame) === "membership.added" &&
        (frame["event"] as Frame)["space_id"] === spaceId &&
        typeof (frame["event"] as Frame)["agent_name"] === "string",
      "the first name the room holds",
    );
    const held = String((joined["event"] as Frame)["agent_name"]);

    // The phone is in the room, by its name, asking what you would like to do, its agent waiting.
    await expect(page).toHaveURL(new RegExp(`/spaces/${spaceId}`));
    // The tabs stay mounted under a room on the web target, so what is asked about is what shows.
    const shown = (words: string) =>
      page.getByText(words, { exact: true }).filter({ visible: true });
    await expect(page.getByTestId("new-space-window")).toHaveCount(0, { timeout: 20_000 });
    await expect(shown(NAME)).toBeVisible();
    await expect(shown("What would you like to do?")).toBeVisible();
    await expect(shown(`${held} is here and waits for your first message.`)).toBeVisible();

    // The first message is the person's own, and the first words the harness hears there.
    await page.getByTestId("composer").fill(FIRST);
    await page.getByRole("button", { name: "Send" }).click();
    const words = await harness.waitFor(
      (frame) =>
        eventType(frame) === "message.new" && (frame["event"] as Frame)["space_id"] === spaceId,
      "the first words",
    );
    expect((words["event"] as Frame)["text"]).toBe(FIRST);
    await expect(shown(FIRST)).toBeVisible();
    await expect(shown("What would you like to do?")).toHaveCount(0);

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
    await expect(shown(NAME)).toBeVisible();
    await expect(shown("Remodel quotes")).toHaveCount(0);

    // And the list calls it that too.
    await page.goBack();
    await expect(
      page.getByTestId(`swipe-${spaceId}`).getByText(NAME, { exact: true }),
    ).toBeVisible();
  } finally {
    harness.close();
  }
});
