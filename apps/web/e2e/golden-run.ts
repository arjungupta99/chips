/**
 * The golden run — PO-4471, Appendix A of the technical plan — played by the demo harness on
 * `@chipschat/harness`, in the test's own process. The sample harness that used to play it was
 * withdrawn (ADR 0188); the specs that want a whole run from a real SDK client, rather than one
 * event at a time from `Harness` in `support.ts`, play it here with the same calls and words.
 */

import { type Chips, connect } from "@chipschat/harness";
import { demo, SERVER } from "./support.ts";

export const GOAL = "Get PO #4471 confirmed with Northwind and update the tracker.";
export const DRAFT =
  "Hi Dana, confirming PO #4471 for 120 units, delivery 19 September. Shout if anything looks off.";
export const SUMMARY = "Confirmed PO #4471 with Northwind and updated the tracker.";

const PLAN = [
  { stepId: "read-po", title: "Read PO #4471" },
  { stepId: "check-crm", title: "Check the Northwind record in the CRM" },
  { stepId: "email-dana", title: "Email Dana to confirm" },
  { stepId: "update-tracker", title: "Update the tracker" },
];

/** The demo harness, connected with the token `demo.json` holds. */
export function connectDemoHarness(): Promise<Chips> {
  return connect({
    url: SERVER,
    token: demo().harness.token,
    client: { name: "e2e-golden", version: "0.0.0" },
  });
}

/**
 * One golden run: the PO read, the CRM checked, an ask to email Dana that waits on a person,
 * and — approved — the email sent, the tracker updated, and the run finished with its cost.
 * Denied or expired, the run fails and says what was left undone.
 */
export async function playGolden(
  chips: Chips,
  spaceId: string = demo().space_id,
): Promise<"completed" | "failed"> {
  const run = await chips.runs.start({ spaceId, goal: GOAL, plan: PLAN });
  await run.status("Reading PO #4471…");
  await run.step({
    stepId: "read-po",
    tool: "drive.read",
    summary: "120 units, delivery 19 September, signed.",
    sources: [{ kind: "internal", label: "Drive" }],
    durationMs: 1840,
  });
  await run.step({
    stepId: "check-crm",
    tool: "crm.read",
    summary: "Dana Whitfield is the contact.",
    sources: [{ kind: "internal", label: "CRM" }],
    durationMs: 920,
  });
  await run.status("Drafting the email…");
  await run.step({
    stepId: "email-dana",
    status: "started",
    tool: "email.send",
    summary: "Drafting…",
  });

  const decision = await run.approval({
    stepId: "email-dana",
    action: {
      kind: "email.send",
      input: { to: "dana@northwind.com", subject: "PO #4471 confirmation", body: DRAFT },
      external: true,
      irreversible: true,
    },
    question: "Send this email to dana@northwind.com?",
    effect: "It confirms PO #4471 with Northwind. An email can't be unsent.",
    lasts: "once",
    preview: { format: "markdown", title: "To dana@northwind.com", body: DRAFT },
    risk: ["external_communication", "irreversible"],
    sources: [{ kind: "external", label: "vendor website" }],
    expiresIn: 3600,
    editable: true,
  });
  if (!decision.allowed) {
    await run.step({ stepId: "email-dana", status: "failed", error: "Denied in Chips." });
    await run.fail({
      error: "Stopped: the email was not approved.",
      leftUndone: ["Update the tracker"],
    });
    return "failed";
  }

  // An edited decision carries the person's words, and they are what is sent.
  const body = (decision.input as { body?: string } | undefined)?.body ?? DRAFT;
  await run.executed(decision.approvalId, "executed", `Sent: ${body.slice(0, 60)}…`);
  await run.step({
    stepId: "email-dana",
    tool: "email.send",
    summary: "Sent to dana@northwind.com.",
    durationMs: 610,
  });
  await chips.post({
    spaceId,
    runId: run.id,
    text: "Emailed dana@northwind.com to confirm PO #4471; updating the tracker now.",
  });
  await run.step({
    stepId: "update-tracker",
    tool: "sheets.write",
    summary: "Row 4471 set to Confirmed.",
    durationMs: 340,
  });
  await run.context({ usedTokens: 82_000, limitTokens: 200_000, model: "opus-5" });
  await run.usage({ model: "opus-5", inputTokens: 82_140, outputTokens: 3402, costUsd: 1.47 });
  await run.complete({
    summary: SUMMARY,
    changed: ["Emailed dana@northwind.com", "Tracker row 4471 set to Confirmed"],
    followUps: ["Chase an acknowledgement if none arrives by Thursday"],
    costUsd: 1.47,
  });
  return "completed";
}
