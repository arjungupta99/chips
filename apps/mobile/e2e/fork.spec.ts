/**
 * ADR 0087, Phase 6: Fork, on the phone. Robin is a harness that makes copies (`agents`,
 * `forks`), its agent in the room it came with. Arjun opens Robin's card from Agents and forks it
 * into a new room: the room opens at once, named as the copy will be, and says it is forking until
 * Robin's copy, registered `forked_from` Robin with the room, joins it as Robin 2 · fork: a second
 * agent called Robin is Robin 2 (ADR 0091), as the web's `the-fork.spec.ts` says.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { Harness, newRunId, pair, registerSpecialist, SERVER } from "./support.ts";

test("forks an agent from its card into a new room, which its copy joins", async ({ page }) => {
  test.setTimeout(90_000);
  const robin = await registerSpecialist("Robin", undefined, [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.forks,
  ]);
  await pair(page);
  const harness = await Harness.connect(newRunId(), { token: robin.token, space: robin.space });
  try {
    await page.getByRole("tab", { name: "Agents" }).click();
    await page.getByRole("button", { name: /^Robin, Robin · with you/ }).click();
    await expect(page.getByTestId("agent-card")).toBeVisible();
    await page.getByTestId("agent-fork").click();
    await expect(page.getByText("Fork Robin into a space")).toBeVisible();
    await page.getByTestId("picker-new").click();

    // The room opens at once, and waits for the copy.
    await expect(page.getByTestId("fork-waiting")).toContainText("Forking Robin…", {
      timeout: 20_000,
    });
    const ask = await harness.next("agent.fork");
    const made = await fetch(`${SERVER}/v1/harnesses/${robin.id}/agents`, {
      method: "POST",
      headers: { authorization: `Bearer ${robin.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        key: "robin-copy",
        name: "Robin",
        forked_from: ask["agent_id"],
        space_id: ask["space_id"],
      }),
    });
    expect(((await made.json()) as { attached: boolean }).attached).toBe(true);
    await expect(page.getByTestId("fork-joined")).toContainText("Robin 2 · fork joined");
    await page.screenshot({ path: test.info().outputPath("fork-joined.png") });
  } finally {
    harness.close();
  }
});
