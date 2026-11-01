/**
 * An approval asks its question (ADR 0142), in the browser, for each harness that asks one.
 *
 * The test plays each harness over the same socket a real one uses, with the payloads they send:
 * OpenClaw's bridge asking to run a command, Jacobian asking to turn a connector off (a change
 * that holds) and to send an email (its arguments as JSON), and a harness older than ADR 0142
 * that sends no question, whose card is headed by its preview's title. Each card is denied from
 * the card, so the decision is seen to reach the harness and the next ask opens on its own.
 * The live check with the real harnesses is `testing/scenarios/approvals/approval-asks-its-question.md`.
 */

import { expect, type Page, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, pair } from "./support.ts";

interface Shape {
  readonly who: string;
  /** The card's head: the question, else the preview's title. */
  readonly headline: string;
  readonly ask: Record<string, unknown>;
  /** Words the card carries under the head. */
  readonly shows: readonly string[];
  readonly lasts?: "once" | "standing";
}

/**
 * Risky enough that policy hands each to a person (`external`), whatever the workspace's level:
 * a riskless ask may be allowed on the spot, with no card.
 */
const SHAPES: readonly Shape[] = [
  {
    who: "OpenClaw's bridge, a command",
    headline: "Run `date`?",
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
    shows: ["It runs in /workspace.", "Just this once", "date"],
    lasts: "once",
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
      "Its runtime stops and its tools disappear from every Space.",
      "Until you take it back",
      "PROBE: 73 tools.",
    ],
    lasts: "standing",
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
    shows: [
      "It goes from your Gmail with the subject “PO #4471”.",
      "Just this once",
      '"subject": "PO #4471"',
    ],
    lasts: "once",
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

async function start(page: Page): Promise<Harness> {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  await harness.send("run.started", { goal: "Ask four ways.", plan: [] });
  return harness;
}

test("each harness's card asks its question, says what a yes does and for how long", async ({
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

      const card = page.getByRole("article", { name: `Approval: ${shape.headline}` }).last();
      await expect(card, shape.who).toBeVisible({ timeout: 20_000 });
      await expect(card).toContainText("Scout asks");
      for (const words of shape.shows) await expect(card, shape.who).toContainText(words);
      // How long a yes holds is said only when the harness says it.
      await expect(card.locator("[data-lasts]")).toHaveCount(shape.lasts === undefined ? 0 : 1);
      if (shape.lasts !== undefined)
        await expect(card.locator("[data-lasts]")).toHaveAttribute("data-lasts", shape.lasts);

      await card.getByRole("button", { name: "Deny" }).click();
      const form = page.getByTestId("deny-form");
      await form.getByLabel("Reason").fill(`Only a test: ${shape.who}.`);
      await form.getByRole("button", { name: "Deny" }).click();
      expect(await harness.next("approval.resolved"), shape.who).toMatchObject({
        approval_id: approvalId,
        decision: "denied",
      });
    }
  } finally {
    harness.close();
  }
});

test("a command in the question is set as code, so the person reads exactly what runs", async ({
  page,
}) => {
  const harness = await start(page);
  try {
    const approvalId = newApprovalId();
    await harness.send("approval.request", {
      approval_id: approvalId,
      expires_in: 600,
      editable: false,
      ...SHAPES[0]?.ask,
    });
    const card = page.getByRole("article", { name: "Approval: Run `date`?" }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator(".ui-approval__who b code")).toHaveText("date");
    await expect(card.locator(".ui-approval__who b")).toHaveText("Run date?");
    await card.getByRole("button", { name: "Approve" }).click();
    expect(await harness.next("approval.resolved")).toMatchObject({
      approval_id: approvalId,
      decision: "approved",
    });
  } finally {
    harness.close();
  }
});
