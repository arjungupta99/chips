/**
 * An approval asks its question (ADR 0142), on the phone, for each harness that asks one.
 *
 * The test plays each harness over the same socket a real one uses, with the payloads they send:
 * OpenClaw's bridge asking to run a command, Jacobian asking to turn a connector off (a change
 * that holds) and to send an email (its arguments as JSON), and a harness older than ADR 0142
 * that sends no question, whose card is headed by its preview's title. Each is denied from the
 * card at the foot of the room, so the decision is seen to reach the harness and the next ask
 * opens on its own. The live check with the real harnesses is
 * `testing/scenarios/approvals/approval-asks-its-question.md`.
 */

import { expect, type Page, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, pair } from "./support.ts";

interface Shape {
  readonly who: string;
  /** The card's head as it reads: the question (code spans read as their words), else the preview's title. */
  readonly headline: string;
  readonly ask: Record<string, unknown>;
  /** Words the card carries under the head. */
  readonly shows: readonly string[];
  /** The pill's words, when the harness says how long a yes holds. */
  readonly lasts?: string;
}

/**
 * Risky enough that policy hands each to a person (`external`), whatever the workspace's level:
 * a riskless ask may be allowed on the spot, with no card.
 */
const SHAPES: readonly Shape[] = [
  {
    who: "OpenClaw's bridge, a command",
    headline: "Run date?",
    ask: {
      action: { kind: "shell.exec", input: { command: "date" }, external: true },
      question: "Run `date`?",
      effect: "It runs in /workspace.",
      lasts: "once",
      preview: {
        format: "markdown",
        title: "OpenClaw wants to run a command",
        body: "```sh\ndate\n```",
      },
      risk: ["external"],
    },
    // No "Just this once" on a command: it is once by its nature, and Approve says how far it reaches.
    shows: ["It runs in /workspace."],
  },
  {
    who: "Jacobian, a connector turned off",
    headline: "Turn off the robinhood connector?",
    ask: {
      action: { kind: "jacobian.kit_write.kit_write_connectors_robinhood_yaml", external: true },
      question: "Turn off the robinhood connector?",
      effect:
        "Its runtime stops and its tools disappear from every Space. Its stored sign-in stays until you disconnect it.",
      lasts: "standing",
      preview: {
        format: "plain",
        title: "Kit edit: connectors/robinhood.yaml",
        body: "Disable connector 'robinhood': once approved, its runtime stops.\n\nPROBE: 73 tools.",
      },
      risk: ["external"],
    },
    shows: [
      "Its runtime stops and its tools disappear from every Space. Its stored sign-in stays until you disconnect it.",
    ],
    lasts: "Until you take it back",
  },
  {
    who: "Jacobian, an email",
    headline: "Send this email to dana@northwind.com?",
    ask: {
      action: {
        kind: "jacobian.gmail.send",
        input: '{"to":"dana@northwind.com","subject":"PO #4471"}',
        external: true,
      },
      question: "Send this email to dana@northwind.com?",
      effect: "It goes from your Gmail with the subject “PO #4471”.",
      lasts: "once",
      preview: {
        format: "json",
        title: "gmail · send",
        body: '{\n  "to": "dana@northwind.com",\n  "subject": "PO #4471"\n}',
      },
      risk: ["external_communication", "external"],
    },
    shows: ["It goes from your Gmail with the subject “PO #4471”."],
    lasts: "Just this once",
  },
  {
    who: "a harness older than ADR 0142",
    headline: "Bind App workroot",
    ask: {
      action: { kind: "jacobian.workroot_config.workroot_bind", external: true },
      preview: {
        format: "markdown",
        title: "Bind App workroot",
        body: "Grant this App access to ~/JacobianSpaces/lab.",
      },
      risk: ["external"],
    },
    shows: ["Grant this App access to ~/JacobianSpaces/lab."],
  },
];

const asks = (page: Page) => page.getByTestId("room-asks");

/** Paired, in the demo room, with Scout's run started there. */
async function start(page: Page): Promise<Harness> {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  await harness.send("run.started", { goal: "Ask four ways.", plan: [] });
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: /PO-4471/ }).click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
  return harness;
}

test("each harness's ask is headed by its question, with what a yes does and for how long", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    for (const shape of SHAPES) {
      const approvalId = newApprovalId();
      expect(
        await harness.send("approval.request", {
          approval_id: approvalId,
          expires_in: 600,
          editable: false,
          ...shape.ask,
        }),
        shape.who,
      ).toMatchObject({ frame: "ack" });

      const headline = asks(page).getByTestId("ask-headline").last();
      await expect(headline, shape.who).toHaveText(shape.headline, { timeout: 20_000 });
      await expect(asks(page).getByText("Scout asks").last()).toBeVisible();
      for (const words of shape.shows)
        await expect(asks(page).getByText(words).last(), shape.who).toBeVisible();
      if (shape.lasts === undefined) {
        await expect(asks(page).getByTestId("ask-lasts"), shape.who).toHaveCount(0);
      } else {
        await expect(asks(page).getByTestId("ask-lasts").last(), shape.who).toHaveText(shape.lasts);
      }

      // Denied from the card itself, as a person does at the foot of the room.
      await asks(page).getByRole("button", { name: "Deny" }).last().click();
      expect(await harness.next("approval.resolved"), shape.who).toMatchObject({
        approval_id: approvalId,
        decision: "denied",
      });
      await expect(
        asks(page).getByTestId("ask-headline").filter({ hasText: shape.headline }),
      ).toHaveCount(0);
    }
  } finally {
    harness.close();
  }
});

test("Details reads the question in full, and the preview's own title over the preview", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      expires_in: 600,
      editable: false,
      ...SHAPES[1]?.ask,
    });
    await expect(asks(page).getByTestId("ask-headline").last()).toHaveText(
      "Turn off the robinhood connector?",
      {
        timeout: 20_000,
      },
    );
    await asks(page).getByRole("button", { name: "Details" }).last().click();
    await expect(page.getByText("Turn off the robinhood connector?").last()).toBeVisible();
    await expect(page.getByText("Kit edit: connectors/robinhood.yaml").last()).toBeVisible();
    await expect(page.getByText("PROBE: 73 tools.", { exact: false }).last()).toBeVisible();
    await expect(page.getByText("Until you take it back").last()).toBeVisible();
    await page.getByRole("button", { name: "Deny" }).first().click();
    await page.getByTestId("deny-input").fill("Only a test.");
    await page.getByTestId("deny-form").getByRole("button", { name: "Deny" }).click();
    expect(await harness.next("approval.resolved")).toMatchObject({
      approval_id: approvalId,
      decision: "denied",
    });
  } finally {
    harness.close();
  }
});
