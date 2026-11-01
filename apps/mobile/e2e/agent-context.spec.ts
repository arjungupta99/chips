/**
 * ADR 0135: an agent's context on the phone, end to end on the web target. Lathe is a harness
 * that sends Chips its agents' files and takes edits (`context_files`), its socket saying
 * `context`; Sorrel is its agent. Arjun opens Sorrel's card from Agents, opens Who it is, changes
 * it and saves: the edit goes down Lathe's socket, Lathe saves it and sends its copy back
 * answering it, the editor says so and goes back by itself, and the row flashes with the new
 * words. Sorrel, not Scout: the demo's own agent is Scout, and another of that name makes it
 * "Scout 2" for every spec after this one.
 */

import { createHash } from "node:crypto";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { Harness, newRunId, pair, registerSpecialist, SERVER } from "./support.ts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const PERSONA = "# PERSONA.md\n\nBe plain and careful.";

function persona(text: string) {
  return {
    name: "PERSONA.md",
    title: "Who it is",
    role: "identity",
    text,
    hash: sha(text),
    editable: true,
  };
}

test("edits an agent's file from its card, saved by its harness", async ({ page }) => {
  test.setTimeout(90_000);
  const lathe = await registerSpecialist("Lathe", undefined, [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.contextFiles,
  ]);
  const asHarness = (method: string, path: string, body: unknown) =>
    fetch(`${SERVER}${path}`, {
      method,
      headers: { authorization: `Bearer ${lathe.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const made = (await (
    await asHarness("POST", `/v1/harnesses/${lathe.id}/agents`, { key: "sorrel", name: "Sorrel" })
  ).json()) as { agent_id: string };
  const sent = await asHarness("PUT", `/v1/agents/${made.agent_id}/context`, {
    files: [persona(PERSONA)],
    not_shown: [],
  });
  expect(sent.status).toBe(200);
  await pair(page);
  const harness = await Harness.connect(newRunId(), {
    token: lathe.token,
    space: lathe.space,
    accepts: ["context"],
  });
  try {
    await page.getByRole("tab", { name: "Agents" }).click();
    await page.getByRole("button", { name: /^Sorrel, / }).click();
    await expect(page.getByTestId("agent-card")).toBeVisible();
    const row = page.getByTestId("context-row-PERSONA.md");
    await expect(row).toContainText("Who it isPERSONA.md · Be plain and careful.");
    await row.click();

    const field = page.getByTestId("context-text");
    await expect(field).toHaveValue(PERSONA);
    await expect(page.getByTestId("context-status-words")).toContainText("Read from Lathe at");
    const edited = `${PERSONA}\n\nBe brief.`;
    await field.fill(edited);
    await expect(page.getByTestId("context-status-words")).toHaveText("Edited · not saved yet");
    await page.getByTestId("context-save").click();

    // Lathe hears the edit, saves it, and sends its copy back answering it.
    const frame = await harness.waitFor((each) => each["frame"] === "context.edit", "an edit");
    expect(frame["text"]).toBe(edited);
    expect(frame["base_hash"]).toBe(sha(PERSONA));
    const answered = await asHarness("PUT", `/v1/agents/${made.agent_id}/context`, {
      files: [persona(edited)],
      not_shown: [],
      answers: frame["edit_id"],
    });
    expect(answered.status).toBe(200);
    await expect(page.getByTestId("context-status-words")).toHaveText(
      "Saved · Sorrel reads it next turn",
      { timeout: 10_000 },
    );

    // Back by itself, the row flashing with what it says now.
    await expect(page.getByTestId("agent-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("context-flash")).toBeAttached();
    await page.screenshot({ path: test.info().outputPath("context-saved.png") });
  } finally {
    harness.close();
  }
});
