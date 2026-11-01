/**
 * The SDK against a local chipsd: connect, start a run, log a step, ask for approval, hear the
 * decision, finish. The server runs in this process, on a port of its own, so this sample is
 * the SDK's contract in miniature and CI runs it on every push.
 *
 * Used by: /connect/sdk/
 */

import { strict as assert } from "node:assert";
import { connect } from "@chipschat/harness";
import { newId } from "@chipschat/protocol";
import { startSampleChipsd } from "./lib/chipsd.js";

// What `chips serve`, pairing and Add harness leave behind: a workspace, a person, a harness
// with a token, and a space they share. L2: ask when it matters.
const chipsd = await startSampleChipsd({ autonomy: 2 });

// ---------------------------------------------------------------- the SDK
const chips = await connect({
  url: chipsd.url,
  token: chipsd.token,
  client: { name: "sample", version: "0.0.0" },
});
assert.equal(chips.harnessId, chipsd.harnessId, "the server says who the token is");
console.log(`connected as ${chips.hello.harnesses[0]?.display_name} at L${chips.autonomy}`);

const run = await chips.runs.start({
  spaceId: chipsd.spaceId,
  goal: "Get PO #4471 confirmed with Northwind.",
  plan: [
    { stepId: "read-po", title: "Read PO #4471" },
    { stepId: "email-dana", title: "Email Dana to confirm" },
  ],
});
await run.status("Reading PO #4471…");
await run.step({
  stepId: "read-po",
  tool: "drive.read",
  summary: "120 units, delivery 19 September.",
});
console.log(`run ${run.id} started, one step logged`);

// A read is allowed on the spot at L2; the promise resolves without a person.
const read = await run.approval({
  action: { kind: "crm.read", input: { account: "Northwind" } },
  risk: [],
});
assert.equal(read.by, "system", "policy decided the read");
console.log(`crm.read: ${read.decision} by ${read.by}`);

// An external email asks. A person — here, Arjun through the door — decides.
// The id is minted here so a retry after a restart is the same ask, and so this sample can
// answer it from the other side.
const approvalId = newId("approval");
const asked = run.approval({
  approvalId,
  action: {
    kind: "email.send",
    input: { to: "dana@northwind.com" },
    external: true,
    irreversible: true,
  },
  // The question the card leads with, what a yes does, and that it is for this email alone.
  question: "Send this email to dana@northwind.com?",
  effect: "It confirms PO #4471 for 120 units.",
  lasts: "once",
  preview: { format: "markdown", body: "Hi Dana, confirming PO #4471 for 120 units." },
  risk: ["external_communication", "irreversible"],
  editable: true,
});
// The ask must be in the log before the answer; the SDK's promise settles once the server acks
// it, so a moment is enough here. A real person takes longer.
await new Promise((resolve) => setTimeout(resolve, 100));
await chipsd.asPerson({
  type: "approval.resolved",
  space_id: chipsd.spaceId,
  run_id: run.id,
  approval_id: approvalId,
  decision: "approved",
  reason: "Send it.",
  idempotency_key: "arjun-yes",
});
const decision = await asked;
assert.equal(decision.allowed, true);
console.log(`email.send: ${decision.decision} by ${decision.by} — "${decision.reason}"`);

await run.executed(decision.approvalId, "executed", "Sent.");
await run.complete({
  summary: "Confirmed PO #4471 with Northwind.",
  changed: ["Emailed dana@northwind.com"],
  costUsd: 0.12,
});
const view = await chipsd.gateway.deps.readModels.run(chipsd.workspaceId, run.id);
assert.equal(view?.state, "done");
console.log("run done");

chips.close();
await chipsd.close();
