/**
 * ADR 0135, Phase 5: an agent's context on the desktop, end to end. Treadle is a harness that
 * sends Chips its agents' files and takes edits (`context_files`), its socket saying `context`;
 * Plover is its agent. Arjun opens Plover's card from Agents, opens Who it is, changes it and
 * saves: the edit goes down Treadle's socket, Treadle saves it and sends its copy back answering
 * it, the editor says so and goes back by itself, and the row flashes. A file an agent reads from
 * its harness's own set opens on the harness's page, flashing there (Spindle and Sandpiper).
 *
 * The names are this spec's alone, and the harnesses sort after the demo's Scout, so nothing that
 * picks the first harness, or makes an agent by a name, meets these.
 */

import { createHash } from "node:crypto";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { Harness, newRunId, pair, registerSpecialist, SERVER } from "./support.ts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const PERSONA = "# PERSONA.md\n\nBe plain and careful.";
const PURPOSE = "Be this agent for ‹its name›.";

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

const purpose = {
  name: "PURPOSE.md",
  title: "Purpose",
  editable: false,
  shared: "purpose",
  replaceable: true,
};

/** A harness that sends its files, with one agent of its own: each test's, by its own names. */
async function withAgent(name = "Treadle", agent = "Plover") {
  const harness = await registerSpecialist(name, undefined, [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.contextFiles,
  ]);
  const asHarness = (method: string, path: string, body: unknown) =>
    fetch(`${SERVER}${path}`, {
      method,
      headers: { authorization: `Bearer ${harness.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const made = (await (
    await asHarness("POST", `/v1/harnesses/${harness.id}/agents`, {
      key: agent.toLowerCase(),
      name: agent,
    })
  ).json()) as { agent_id: string };
  return { harness, asHarness, agentId: made.agent_id };
}

test("edits an agent's file from its card, saved by its harness", async ({ page }) => {
  test.setTimeout(90_000);
  const { harness, asHarness, agentId } = await withAgent();
  const sent = await asHarness("PUT", `/v1/agents/${agentId}/context`, {
    files: [persona(PERSONA)],
    not_shown: [],
  });
  expect(sent.status).toBe(200);
  await pair(page);
  const socket = await Harness.connect(newRunId(), {
    token: harness.token,
    space: harness.space,
    accepts: ["context"],
  });
  try {
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByTestId(`agent-${agentId}`).click();
    await expect(page.getByTestId("agent-card")).toBeVisible();
    const row = page.getByTestId("context-row-PERSONA.md");
    await expect(row).toContainText("Who it isPERSONA.md · Be plain and careful.");
    await row.click();

    const field = page.getByTestId("context-text");
    await expect(field).toHaveValue(PERSONA);
    await expect(page.getByTestId("context-status-words")).toContainText("Read from Treadle at");
    const edited = `${PERSONA}\n\nBe brief.`;
    await field.fill(edited);
    await expect(page.getByTestId("context-status-words")).toHaveText("Edited · not saved yet");
    await page.getByTestId("context-save").click();

    // Treadle hears the edit, saves it, and sends its copy back answering it.
    const frame = await socket.waitFor((each) => each["frame"] === "context.edit", "an edit");
    expect(frame["text"]).toBe(edited);
    expect(frame["base_hash"]).toBe(sha(PERSONA));
    const answered = await asHarness("PUT", `/v1/agents/${agentId}/context`, {
      files: [persona(edited)],
      not_shown: [],
      answers: frame["edit_id"],
    });
    expect(answered.status).toBe(200);
    await expect(page.getByTestId("context-status-words")).toHaveText(
      "Saved · Plover reads it next turn",
      { timeout: 10_000 },
    );

    // Back by itself, the row flashing with what it says now.
    await expect(page.getByTestId("agent-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("context-flash")).toBeAttached();
    await page.screenshot({ path: test.info().outputPath("context-saved.png") });
  } finally {
    socket.close();
  }
});

test("opens a shared file on its harness's page, and reads it there", async ({ page }) => {
  const { harness, asHarness, agentId } = await withAgent("Spindle", "Sandpiper");
  expect(
    (
      await asHarness("PUT", `/v1/agents/${agentId}/context`, {
        files: [persona(PERSONA), purpose],
        not_shown: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await asHarness("PUT", `/v1/harnesses/${harness.id}/context`, {
        shared: [
          {
            id: "purpose",
            name: "PURPOSE.md",
            title: "Purpose",
            about: "Spindle's default",
            text: PURPOSE,
            hash: sha(PURPOSE),
            editable: false,
            why_read_only: "Built into Spindle",
            used_by: 1,
            for_new_agents: true,
          },
        ],
        not_shown: [],
      })
    ).status,
  ).toBe(200);
  await pair(page);
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page.getByTestId(`agent-${agentId}`).click();
  await expect(page.getByTestId("context-row-PURPOSE.md").getByTestId("tag-shared")).toHaveText(
    "Shared",
  );
  await expect(page.getByTestId("context-foot")).toContainText(
    "Purpose is shared by 1 of Spindle's agents, so it lives on Spindle's page.",
  );
  await page.getByTestId("context-row-PURPOSE.md").click();

  const harnessPage = page.getByRole("main", { name: "Spindle" });
  const shared = harnessPage.getByTestId("harness-context-shared");
  await expect(shared.getByTestId("context-flash")).toBeAttached();
  await shared.getByTestId("context-row-PURPOSE.md").click();
  await expect(page.getByTestId("context-read-only")).toContainText(
    "Spindle's default · Built into Spindle",
  );
  await expect(page.getByTestId("context-used-by")).toContainText("1 agent");

  // Back through Spindle's Context files page, which the shared row opened (ADR 0266).
  await page.getByRole("button", { name: "‹ Context files" }).click();
  await page.getByRole("button", { name: "‹ Sandpiper" }).click();
  await expect(page.getByTestId("agent-card")).toBeVisible();
});
