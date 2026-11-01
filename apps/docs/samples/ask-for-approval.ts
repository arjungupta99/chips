/**
 * Building the approval request from the golden scenario, and reading the decision.
 *
 * Used by: /concepts/approval/ and /connect/hooks/
 */

import { strict as assert } from "node:assert";
import { newId, parseEvent } from "@chipschat/protocol";

const workspaceId = newId("workspace");
const spaceId = newId("space");
const runId = newId("run");
const approvalId = newId("approval");
const scout = newId("harness");
const arjun = newId("person");

const envelope = {
  v: 1,
  workspace_id: workspaceId,
  space_id: spaceId,
  run_id: runId,
  ts: new Date().toISOString(),
};

const request = parseEvent({
  ...envelope,
  type: "approval.request",
  id: newId("event"),
  actor: { kind: "harness", id: scout },
  idempotency_key: "scout-approval-1",
  approval_id: approvalId,
  step_id: "email-dana",
  action: {
    kind: "email.send",
    input: { to: "dana@northwind.com", subject: "PO #4471 confirmation" },
    external: true,
    irreversible: true,
  },
  question: "Send this email to dana@northwind.com?",
  effect: "It confirms PO #4471 with Northwind. An email can't be unsent.",
  lasts: "once",
  preview: {
    format: "markdown",
    title: "To dana@northwind.com",
    body: "Hi Dana, confirming PO #4471 for 120 units, delivery 19 September.",
  },
  risk: ["external_communication", "irreversible"],
  sources: [{ kind: "external", label: "vendor website" }],
  expires_in: 3600,
  approvers: ["owner", "role:ops_lead"],
  editable: true,
});

assert.equal(request.ok, true, "the approval request in the docs should be valid");
if (!request.ok) process.exit(1);

// The schema fills in the defaults the prose describes, so a hook need not send them.
assert.equal(request.value["fallback"], "deny", "an unanswered approval denies by default");
assert.equal(
  request.value["question"],
  "Send this email to dana@northwind.com?",
  "the card asks it",
);
console.log(
  `asked: ${(request.value["action"] as { kind: string }).kind}, fallback ${request.value["fallback"]}`,
);

// A decision carries more than yes or no.
const resolved = parseEvent({
  ...envelope,
  type: "approval.resolved",
  id: newId("event"),
  actor: { kind: "person", id: arjun },
  idempotency_key: "arjun-approve-1",
  approval_id: approvalId,
  decision: "approved",
  scope: "once",
  reason: "Looks right. Send it.",
  resolved_by: arjun,
  resolved_at: new Date().toISOString(),
});

assert.equal(resolved.ok, true);
if (!resolved.ok) process.exit(1);
assert.equal(resolved.value["resolved_elsewhere"], false, "the first answer wins");
console.log(
  `decided: ${resolved.value["decision"]}, scope ${resolved.value["scope"]}, by ${resolved.value["resolved_by"]}`,
);

// Risk classes are a closed set, so the policy engine has something to match on.
assert.equal(parseEvent({ ...request.value, risk: ["vibes"] }).ok, false);
console.log("a risk class the policy engine does not know is refused");
