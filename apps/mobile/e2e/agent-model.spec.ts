/**
 * ADR 0141: an agent's model and effort on the phone, end to end on the web target. Bobbin is a
 * harness that sends Chips its agents' models and takes changes (`models`), its socket saying
 * `models`; Marten is its agent, on Heron 2 at Steady, the same as Bobbin's default. Arjun opens
 * Marten's card from Agents, opens the sheet, gives Marten Kestrel 1 at Deep and saves: the change
 * goes down Bobbin's socket, Bobbin makes it and sends its copy back answering it, the sheet says
 * Saved and goes by itself, and the row says what Marten runs on now, flashing.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { Harness, newRunId, pair, registerSpecialist, SERVER } from "./support.ts";

const LIGHT = { id: "light", label: "Light" };
const STEADY = { id: "steady", label: "Steady" };
const DEEP = { id: "deep", label: "Deep" };
const CHOICES = [
  { id: "heron-2", label: "Heron 2", efforts: [LIGHT, STEADY, DEEP], effort_default: "steady" },
  { id: "kestrel-1", label: "Kestrel 1", efforts: [LIGHT, DEEP] },
];

function copy(model: string, effort: string, own: boolean) {
  return {
    model,
    effort,
    own,
    default: { label: "Bobbin's default", model: "heron-2", effort: "steady" },
    choices: CHOICES,
    editable: true,
  };
}

test("changes an agent's model and effort from its card, made by its harness", async ({ page }) => {
  test.setTimeout(90_000);
  const bobbin = await registerSpecialist("Bobbin", undefined, [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.models,
  ]);
  const asHarness = (method: string, path: string, body: unknown) =>
    fetch(`${SERVER}${path}`, {
      method,
      headers: { authorization: `Bearer ${bobbin.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const made = (await (
    await asHarness("POST", `/v1/harnesses/${bobbin.id}/agents`, { key: "marten", name: "Marten" })
  ).json()) as { agent_id: string };
  const sent = await asHarness(
    "PUT",
    `/v1/agents/${made.agent_id}/model`,
    copy("heron-2", "steady", false),
  );
  expect(sent.status).toBe(200);
  await pair(page);
  const harness = await Harness.connect(newRunId(), {
    token: bobbin.token,
    space: bobbin.space,
    accepts: ["models"],
  });
  try {
    await page.getByRole("tab", { name: "Agents" }).click();
    await page.getByRole("button", { name: /^Marten, / }).click();
    await expect(page.getByTestId("agent-card")).toBeVisible();
    const row = page.getByTestId("model-row");
    await expect(row).toContainText("Heron 2Steady effort · Bobbin's default");
    await row.click();

    // On the default: Same is on, and Save has nothing to send.
    const same = page.getByRole("switch", { name: "Bobbin's default" });
    await expect(same).toBeChecked();
    await expect(page.getByTestId("model-save")).toBeDisabled();
    await same.click();
    await page.getByTestId("model-choice-kestrel-1").click();
    // Steady isn't Kestrel's, and Kestrel has no default: the nearest lower it has.
    await expect(page.getByTestId("model-level-name")).toHaveText("Light");
    await page.getByTestId("model-level-deep").click();
    await expect(page.getByTestId("model-level-name")).toHaveText("Deep");
    await page.getByTestId("model-save").click();
    await expect(page.getByTestId("model-save-words")).toHaveText("Saving to Bobbin");

    // Bobbin hears the change, makes it, and sends its copy back answering it.
    const frame = await harness.waitFor((each) => each["frame"] === "model.change", "a change");
    expect(frame["model"]).toBe("kestrel-1");
    expect(frame["effort"]).toBe("deep");
    const answered = await asHarness("PUT", `/v1/agents/${made.agent_id}/model`, {
      ...copy("kestrel-1", "deep", true),
      answers: frame["change_id"],
    });
    expect(answered.status).toBe(200);
    await expect(page.getByTestId("model-save-words")).toHaveText("Saved", { timeout: 10_000 });

    // The sheet goes by itself, and the row says what Marten runs on now, flashing.
    await expect(page.getByTestId("model-sheet-panel")).toBeHidden({ timeout: 10_000 });
    await expect(row).toContainText("Kestrel 1Deep effort · its own");
    await expect(page.getByTestId("context-flash")).toBeAttached();
    await page.screenshot({ path: test.info().outputPath("model-saved.png") });
  } finally {
    harness.close();
  }
});
