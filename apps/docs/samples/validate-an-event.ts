/**
 * Validating an event, the way the server does at the edge.
 *
 * Used by: /reference/envelope/ and /connect/
 */

import { strict as assert } from "node:assert";
import { newId, parseEvent } from "@chipschat/protocol";

const workspaceId = newId("workspace");
const runId = newId("run");

const event = {
  v: 1,
  type: "run.started",
  id: newId("event"),
  ts: new Date().toISOString(),
  workspace_id: workspaceId,
  space_id: newId("space"),
  run_id: runId,
  actor: { kind: "harness", id: newId("harness") },
  idempotency_key: "scout-run-1",
  goal: "Get PO #4471 confirmed with Northwind and update the tracker.",
  plan: [
    { step_id: "read-po", title: "Read PO #4471" },
    { step_id: "email-dana", title: "Email Dana to confirm" },
  ],
};

const parsed = parseEvent(event);
assert.equal(parsed.ok, true, "the golden scenario's run.started should be valid");
if (!parsed.ok) process.exit(1);

console.log(
  `valid: ${parsed.value["type"]} with ${(parsed.value["plan"] as unknown[]).length} steps`,
);

// An event with a field the schema does not declare loses that field: validation happens once
// at the edge, and what comes out is what the rest of the server trusts. `dropped` names it, so
// a sender can be told; chipsd says so in its log, once per harness and field.
const smuggled = parseEvent({ ...event, smuggled: "payload" });
assert.equal(smuggled.ok, true);
if (smuggled.ok) {
  assert.equal("smuggled" in smuggled.value, false, "undeclared fields are stripped");
  assert.deepEqual(smuggled.dropped, ["smuggled"]);
  console.log(`undeclared fields are stripped: ${smuggled.dropped.join(", ")}`);
}

// A missing required field is reported by path, which is what the error envelope returns.
const { goal: _dropped, ...withoutGoal } = event;
const invalid = parseEvent(withoutGoal);
assert.equal(invalid.ok, false);
if (!invalid.ok) {
  const paths = invalid.error.issues?.map((issue) => issue.path) ?? [];
  assert.ok(paths.includes("goal"), "the failure names the field");
  console.log(`invalid: ${paths.join(", ")}`);
}

// An id with the wrong prefix is refused, so a run id can never arrive where a workspace goes.
assert.equal(parseEvent({ ...event, workspace_id: runId }).ok, false);
console.log("an id of the wrong kind is refused");
