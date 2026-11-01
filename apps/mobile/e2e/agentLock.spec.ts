/**
 * ADR 0199 on the phone, end to end on the web target. Wicket is a harness that speaks agents, and
 * Finch is its agent, free. Arjun opens Finch's card from Agents and locks its changes: the switch
 * holds, a padlock stands where the name's pen was, Archive and Delete go from the foot, and the
 * foot says why. Let go, they come back.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { pair, registerSpecialist, SERVER } from "./support.ts";

test("locks an agent's changes from its card, and lets them go", async ({ page }, testInfo) => {
  const wicket = await registerSpecialist("Wicket", undefined, [HARNESS_CAPABILITIES.agents]);
  const made = await fetch(`${SERVER}/v1/harnesses/${wicket.id}/agents`, {
    method: "POST",
    headers: { authorization: `Bearer ${wicket.token}`, "content-type": "application/json" },
    body: JSON.stringify({ key: "finch", name: "Finch" }),
  });
  expect(made.ok).toBe(true);

  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  await page.getByRole("button", { name: /^Finch, / }).click();
  const card = page.getByTestId("agent-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("agent-archive")).toHaveText("Archive");
  await expect(page.getByTestId("agent-delete")).toBeVisible();

  // Locked: the switch holds, the padlock stands in the pen's place, and the foot says why.
  const lock = page.getByRole("switch", { name: "Lock changes" });
  await expect(lock).not.toBeChecked();
  await lock.click();
  await expect(lock).toBeChecked();
  await expect(page.getByTestId("agent-name-locked")).toBeVisible();
  await expect(page.getByTestId("agent-archive")).toHaveCount(0);
  await expect(page.getByTestId("agent-delete")).toHaveCount(0);
  await expect(card).toContainText(
    "Changes are locked. Unlock them to rename, archive or delete it.",
  );
  await page.screenshot({ path: testInfo.outputPath("locked-card.png") });

  // Let go: Archive and Delete come back, and the pen.
  await lock.click();
  await expect(lock).not.toBeChecked();
  await expect(page.getByTestId("agent-archive")).toHaveText("Archive");
  await expect(page.getByTestId("agent-delete")).toBeVisible();
  await expect(page.getByTestId("agent-name-locked")).toHaveCount(0);
});
