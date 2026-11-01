/**
 * The Custom guide's calls, made the way a harness makes them: over HTTP, with nothing but a
 * token. Who is here; hello; a run with a step; an approval, waited on until the person
 * answers; what it cost; the answer; the end. Then the log is read back and the connection
 * checklist worked out from it — the same rows the Harnesses tab lights.
 *
 * Used by: /connect/custom/
 */

import { strict as assert } from "node:assert";
import { CONNECTION_CHECKLIST, newId } from "@chipschat/protocol";
import { startSampleChipsd } from "./lib/chipsd.js";

const chips = await startSampleChipsd({ autonomy: 2 });
const headers = { authorization: `Bearer ${chips.token}`, "content-type": "application/json" };

/** `curl -X POST "$CHIPS_URL/…" -d '{…}'`, as the guide shows it. */
async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${chips.url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const answer = (await response.json()) as Record<string, unknown>;
  assert.ok(response.ok, `${path}: ${JSON.stringify(answer)}`);
  return answer;
}

/** `curl "$CHIPS_URL/…"`. */
async function get(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${chips.url}${path}`, { headers });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

// 1. Who you can talk to.
const { participants } = (await get("/v1/participants")) as {
  participants: { display_name: string; kind: string }[];
};
console.log(
  `here: ${participants.map((each) => `${each.display_name} (${each.kind})`).join(", ")}`,
);

// 2. Hello, in the space the harness was given. This is what lights the Messages row.
const hello = await post(`/v1/harnesses/${chips.harnessId}/events`, {
  type: "message.post",
  space_id: chips.spaceId,
  text: "Hello from my harness",
  idempotency_key: "hello-1",
});
console.log(`hello landed at seq ${hello["seq"]}`);

// 3. A run, and a step in it. Every event on the run's own route names the run and need not
//    repeat the space.
const runId = newId("run");
const onRun = `/v1/runs/${runId}/events`;
await post(`/v1/harnesses/${chips.harnessId}/events`, {
  type: "run.started",
  run_id: runId,
  space_id: chips.spaceId,
  goal: "Get PO #4471 confirmed with Northwind.",
  idempotency_key: `${runId}-started`,
});
await post(onRun, {
  type: "step.log",
  step_id: "read-po",
  tool: "drive.read",
  status: "done",
  summary: "120 units, delivery 19 September.",
  idempotency_key: `${runId}-read-po`,
});

// 4. An approval, waited on. An external email asks at L2; the person answers from the app —
//    here, from the other side of the same server — and the wait returns with the decision.
const approvalId = newId("approval");
const asked = await post(onRun, {
  type: "approval.request",
  approval_id: approvalId,
  action: {
    kind: "email.send",
    input: { to: "dana@northwind.com" },
    external: true,
    irreversible: true,
  },
  preview: { format: "markdown", body: "Hi Dana, confirming PO #4471 for 120 units." },
  risk: ["external_communication", "irreversible"],
  expires_in: 900,
  idempotency_key: `${runId}-ask`,
});
assert.equal(asked["approval_id"], approvalId);
assert.equal(asked["resolution"], undefined, "an external email waits for a person at L2");

const waiting = get(`/v1/approvals/${approvalId}/wait?timeout=30`);
await chips.asPerson({
  type: "approval.resolved",
  space_id: chips.spaceId,
  run_id: runId,
  approval_id: approvalId,
  decision: "approved",
  reason: "Send it.",
  idempotency_key: "arjun-yes",
});
const decided = await waiting;
assert.equal(decided["resolution"], "approved");
console.log(`email.send: ${decided["resolution"]}`);

await post(onRun, {
  type: "approval.executed",
  approval_id: approvalId,
  outcome: "executed",
  detail: "Sent.",
  idempotency_key: `${runId}-executed`,
});

// 5. What it cost, the answer, and the end.
await post(onRun, {
  type: "usage",
  scope: "run",
  model: "opus-5",
  input_tokens: 82_140,
  output_tokens: 3402,
  idempotency_key: `${runId}-usage`,
});
await post(onRun, {
  type: "message.post",
  text: "Confirmed with Northwind: 120 units on 19 September.",
  idempotency_key: `${runId}-reply`,
});
await post(onRun, {
  type: "run.completed",
  summary: "Confirmed PO #4471 with Northwind.",
  changed: ["Emailed dana@northwind.com"],
  idempotency_key: `${runId}-done`,
});

// 6. The log, read back, and the checklist worked out from what the harness sent.
const { events } = (await get("/v1/events?since=0&limit=100")) as {
  events: { type: string; actor: { kind: string } }[];
};
const sent = new Set(events.filter((each) => each.actor.kind === "harness").map((e) => e.type));
const lit = CONNECTION_CHECKLIST.filter((row) => row.types.some((type) => sent.has(type))).map(
  (row) => row.label,
);
console.log(`lit: ${lit.join(", ")}`);
assert.deepEqual(lit, ["Messages", "Runs", "Steps", "Approvals", "Cost", "Finished"]);

await chips.close();
