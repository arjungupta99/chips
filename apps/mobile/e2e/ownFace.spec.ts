/**
 * An agent's own face (ADR 0089), end to end on the phone's web target. Wren is a harness with an
 * agent in the room it came with. Arjun presses and holds Wren's row on Agents and gives it a
 * mark on a ground, on the sheet a space's face is chosen on: the server takes it as the agent's
 * face, which Wren's own connection is told too, and the row wears it in the agent's outline.
 * Then from the agent's card, where a tap on the face opens the same sheet, the default goes back.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { pair, registerSpecialist, SERVER } from "./support.ts";

/** Wren's agent as the directory hands it to Wren. */
async function listed(wren: { readonly id: string; readonly token: string }) {
  const answer = await fetch(`${SERVER}/v1/participants`, {
    headers: { authorization: `Bearer ${wren.token}` },
  });
  const { participants } = (await answer.json()) as {
    participants: { kind: string; harness_id?: string; face?: unknown }[];
  };
  return participants.find((each) => each.kind === "agent" && each.harness_id === wren.id);
}

test("an agent is given a face from its row, which everybody is told, and its initials back from its card", async ({
  page,
}, testInfo) => {
  const wren = await registerSpecialist("Wren", undefined, [HARNESS_CAPABILITIES.agents]);
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  const row = page.getByRole("button", { name: /^Wren, Wren · with you/ });
  await expect(row).toBeVisible();
  // Nothing chosen yet: its initial, on the bitten body, which is one path and no mark.
  await expect(row.getByText("W", { exact: true })).toBeVisible();
  expect((await listed(wren))?.face ?? null).toBeNull();

  // A long press is how the sheet is reached; held past the press's own delay.
  await row.click({ delay: 900 });
  const sheet = page.getByTestId("icon-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Wren").first()).toBeVisible();

  const faceCall = (method: string) =>
    page.waitForResponse(
      (answer) =>
        /\/v1\/agents\/agt_[^/]+\/face$/.test(new URL(answer.url()).pathname) &&
        answer.request().method() === method,
    );
  const coloured = faceCall("PUT");
  await page.getByRole("radio", { name: "Navy" }).click();
  expect((await coloured).status()).toBe(200);

  const marked = faceCall("PUT");
  const bird = page.getByTestId("mark-bird");
  await bird.scrollIntoViewIfNeeded();
  await bird.click();
  expect((await marked).status()).toBe(200);
  // The chosen cell is the agent itself: lit, in its own outline.
  await expect(bird.locator("linearGradient")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("sheet.png") });
  await page.getByTestId("icon-sheet-close").click();
  await expect(sheet).toBeHidden();

  // The row wears it, the initial gone; and it is the agent's face, not this phone's view of it.
  await expect(row.locator("linearGradient")).toHaveCount(1);
  expect(await row.locator("path").count()).toBeGreaterThan(3);
  await expect(row.getByText("W", { exact: true })).toHaveCount(0);
  expect((await listed(wren))?.face).toEqual({ icon: "bird", ground: 23 });
  await page.screenshot({ path: testInfo.outputPath("agents.png") });

  // From its card: a tap on the face opens the same sheet, and the default gives the initial back.
  await row.click();
  await expect(page.getByTestId("agent-card")).toBeVisible();
  await page.getByTestId("agent-face").click();
  await expect(sheet).toBeVisible();
  const cleared = faceCall("DELETE");
  const reset = page.getByRole("button", { name: "Use the default" });
  await reset.scrollIntoViewIfNeeded();
  await reset.click();
  expect((await cleared).status()).toBe(204);
  await page.getByTestId("icon-sheet-close").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("agent-face").getByText("W", { exact: true })).toBeVisible();
  expect((await listed(wren))?.face ?? null).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("card.png") });
});
