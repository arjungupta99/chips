/**
 * ADR 0141, Phase 5: an agent's model and effort on the desktop, end to end. Whorl is a harness
 * that sends Chips its agents' models and takes changes (`models`), its socket saying `models`;
 * Wagtail is its agent, on Heron 2 at Steady, the same as Whorl's default. Arjun opens Wagtail's
 * card from Agents and opens the dialog, then does the rest from the keyboard: Space turns Same
 * off, the arrow keys move along the models and along the bars, and Enter saves. The change goes
 * down Whorl's socket, Whorl makes it and sends its copy back answering it, the dialog says Saved
 * and folds back into the row, which says what Wagtail runs on now, flashing, and has the keyboard.
 *
 * The names are this spec's alone, and the harnesses sort after the demo's Scout, so nothing that
 * picks the first harness, or makes an agent by a name, meets these.
 */

import AxeBuilder from "@axe-core/playwright";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { expect, type Page, test } from "@playwright/test";
import { Harness, newRunId, pair, registerSpecialist, SERVER } from "./support.ts";

const LIGHT = { id: "light", label: "Light" };
const STEADY = { id: "steady", label: "Steady" };
const DEEP = { id: "deep", label: "Deep" };
const CHOICES = [
  { id: "heron-2", label: "Heron 2", efforts: [LIGHT, STEADY, DEEP], effort_default: "steady" },
  { id: "heron-2-mini", label: "Heron 2 Mini", efforts: [] },
  { id: "kestrel-1", label: "Kestrel 1", efforts: [LIGHT, DEEP] },
];

function copy(harness: string, model: string, effort: string, own: boolean) {
  return {
    model,
    effort,
    own,
    default: { label: `${harness}'s default`, model: "heron-2", effort: "steady" },
    choices: CHOICES,
    editable: true,
  };
}

/** A harness that sends its agents' models, with one agent of its own on its default. */
async function withAgent(name: string, agent: string) {
  const harness = await registerSpecialist(name, undefined, [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.models,
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
  const sent = await asHarness(
    "PUT",
    `/v1/agents/${made.agent_id}/model`,
    copy(name, "heron-2", "steady", false),
  );
  expect(sent.status).toBe(200);
  return { harness, asHarness, agentId: made.agent_id };
}

async function openCard(page: Page, agentId: string) {
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page.getByTestId(`agent-${agentId}`).click();
  await expect(page.getByTestId("agent-card")).toBeVisible();
}

test("changes an agent's model and effort from the keyboard, made by its harness", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { harness, asHarness, agentId } = await withAgent("Whorl", "Wagtail");
  await pair(page);
  const socket = await Harness.connect(newRunId(), {
    token: harness.token,
    space: harness.space,
    accepts: ["models"],
  });
  try {
    await openCard(page, agentId);
    const row = page.getByTestId("model-row");
    await expect(row).toContainText("Heron 2Steady effort · Whorl's default");
    await row.click();

    const dialog = page.getByTestId("model-dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((each) => (each as HTMLDialogElement).matches(":modal"))).toBe(
      true,
    );
    // On the default: Same has the keyboard, and Save has nothing to send.
    const same = page.getByRole("switch", { name: "Whorl's default" });
    await expect(same).toBeFocused();
    await expect(same).toBeChecked();
    await expect(page.getByTestId("model-save")).toBeDisabled();
    const axe = await new AxeBuilder({ page })
      .include('[data-testid="model-dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);

    await page.keyboard.press("Space");
    await expect(same).not.toBeChecked();
    // Into the models, on the one picked, and down them: Kestrel hasn't Steady, nor a default.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: "Heron 2", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Kestrel 1" })).toBeChecked();
    await expect(page.getByTestId("model-level-name")).toHaveText("Light");
    // Into the bars, and up one.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: "Light" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("model-level-name")).toHaveText("Deep");
    await expect(page.getByTestId("model-save")).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("model-save-words")).toHaveText("Saving to Whorl");

    // Whorl hears the change, makes it, and sends its copy back answering it.
    const frame = await socket.waitFor((each) => each["frame"] === "model.change", "a change");
    expect(frame["model"]).toBe("kestrel-1");
    expect(frame["effort"]).toBe("deep");
    const answered = await asHarness("PUT", `/v1/agents/${agentId}/model`, {
      ...copy("Whorl", "kestrel-1", "deep", true),
      answers: frame["change_id"],
    });
    expect(answered.status).toBe(200);
    await expect(page.getByTestId("model-save-words")).toHaveText("Saved", { timeout: 10_000 });
    await page.screenshot({ path: test.info().outputPath("model-saved-dialog.png") });

    // It folds back into the row, which says what Wagtail runs on now, flashing.
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(row).toContainText("Kestrel 1Deep effort · its own");
    await expect(page.getByTestId("context-flash")).toBeAttached();
    await expect(row).toBeFocused();
    await page.screenshot({ path: test.info().outputPath("model-saved.png") });
  } finally {
    socket.close();
  }
});

test("says the harness is away instead of opening, and opens once it is back", async ({ page }) => {
  test.setTimeout(60_000);
  const { harness, agentId } = await withAgent("Wimble", "Woodlark");
  await pair(page);
  await openCard(page, agentId);
  const row = page.getByTestId("model-row");
  await expect(row).toHaveAttribute("data-quiet", "true");
  await expect(page.getByTestId("model-foot")).toHaveText(
    "Wimble is away. You can see this, not change it.",
  );
  await row.click();
  await expect(page.getByTestId("model-hint")).toHaveText("Wimble is away");
  await expect(page.getByTestId("model-dialog")).toHaveCount(0);

  const socket = await Harness.connect(newRunId(), {
    token: harness.token,
    space: harness.space,
    accepts: ["models"],
  });
  try {
    // The press read it again; the next finds Wimble back.
    await expect(async () => {
      await row.click();
      await expect(page.getByTestId("model-dialog")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("model-dialog")).toHaveCount(0);
    await expect(row).toBeFocused();
    await expect(row).not.toHaveAttribute("data-quiet", "true");
  } finally {
    socket.close();
  }
});

test("the harness card has its Main agent's Model row, which the agents with none of their own follow (ADR 0154)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { harness, asHarness } = await withAgent("Wyvern", "Warbler");
  const main = (await (
    await asHarness("POST", `/v1/harnesses/${harness.id}/agents`, {
      key: "wyvern-main",
      name: "Wyvern",
      lead: true,
    })
  ).json()) as { agent_id: string };
  const sent = await asHarness("PUT", `/v1/agents/${main.agent_id}/model`, {
    ...copy("Wyvern", "kestrel-1", "deep", true),
    followed_by: 3,
  });
  expect(sent.status).toBe(200);
  await pair(page);
  await page.getByRole("button", { name: /^Agents/ }).click();
  // Every harness's card, under the shelf's View all (ADR 0185).
  await page.getByRole("button", { name: "View all harnesses" }).click();
  const card = page
    .getByTestId("harness-card")
    .filter({ has: page.getByRole("heading", { name: "Wyvern" }) });
  const group = card.getByTestId("model-group");
  await expect(group.getByTestId("model-row")).toContainText("Kestrel 1");
  // The agent's name is its own (ADR 0091): "Wyvern 2" beside a harness already named Wyvern.
  await expect(group.getByTestId("model-foot")).toHaveText(
    /^3 agents have no model of their own and use Wyvern( \d+)?'s\. Wyvern is away\. You can see this, not change it\.$/,
  );
  await card.screenshot({ path: test.info().outputPath("harness-model.png") });
});
