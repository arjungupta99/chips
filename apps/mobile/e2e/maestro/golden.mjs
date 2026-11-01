/**
 * The harness the approve, deny, steer and receipt flows need: the demo's Scout, played from
 * here over a raw socket, running the golden run once — PO-4471 read, the CRM checked, an ask to
 * email Dana — and waiting on the ask. Approved, it sends, finishes and leaves the reply
 * `receipt.yaml` presses; denied, it fails and says what was left undone. The sample harness
 * that did this was withdrawn (ADR 0188); this is only what the flows need of one.
 *
 *     node apps/mobile/e2e/maestro/golden.mjs                # the ask stands at once
 *     node apps/mobile/e2e/maestro/golden.mjs --when-asked   # after a person speaks
 *
 * It reads `.chips/demo.json`, which `chipsd` writes in dev mode, or the file `CHIPS_DEMO_FILE`
 * names; or, given `CHIPS_URL`, `CHIPS_HARNESS_TOKEN` and `CHIPS_SPACE_ID`, those, which is how
 * `chips conformance custom` walks it. No dependencies: Node's own WebSocket, the frames as
 * `apps/docs` documents them.
 */

import { readFileSync } from "node:fs";

/** Where to connect, and as whom: the four lines when they are set, else the demo file. */
function address() {
  const { CHIPS_URL: url, CHIPS_HARNESS_TOKEN: token, CHIPS_SPACE_ID: space } = process.env;
  if (url !== undefined && token !== undefined && space !== undefined) return { url, token, space };
  const demo = JSON.parse(readFileSync(process.env.CHIPS_DEMO_FILE ?? ".chips/demo.json", "utf8"));
  return { url: demo.url, token: demo.harness.token, space: demo.space_id };
}

const chips = address();
const socket = new WebSocket(
  `${chips.url.replace(/^http/, "ws")}/v1/ws?token=${encodeURIComponent(chips.token)}`,
);

/** A ULID-shaped id with Chips's prefix, as the web suite mints them: `run_…`, `apr_…`. */
function newId(prefix) {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let id = "01K4ZQPX";
  for (let i = 0; i < 18; i += 1) id += alphabet[Math.floor(Math.random() * 32)];
  return `${prefix}_${id}`;
}

const waiters = [];
function waitFor(match) {
  return new Promise((resolve) => waiters.push({ match, resolve }));
}
socket.addEventListener("message", (message) => {
  const frame = JSON.parse(String(message.data));
  if (frame.frame === "ping") {
    socket.send(JSON.stringify({ frame: "pong", ts: frame.ts }));
    return;
  }
  if (frame.frame === "error") process.stderr.write(`  refused: ${frame.message}\n`);
  for (const waiter of [...waiters]) {
    if (waiter.match(frame)) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(frame);
    }
  }
});

const runId = newId("run");
let sequence = 0;
/** One event into the run, and the server's answer to it. */
function send(type, payload) {
  sequence += 1;
  const key = `golden-${runId}-${sequence}`;
  socket.send(
    JSON.stringify({
      frame: "event",
      event: { type, space_id: chips.space, run_id: runId, idempotency_key: key, ...payload },
    }),
  );
  return waitFor((frame) => frame.idempotency_key === key);
}

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve);
  socket.addEventListener("error", () => reject(new Error(`could not reach ${chips.url}`)));
});
socket.send(
  JSON.stringify({
    frame: "hello",
    protocol: { min: 1, max: 1 },
    client: { name: "golden", version: "0" },
  }),
);
const { event: hello } = await waitFor((frame) => frame.event?.type === "hello");
socket.send(JSON.stringify({ frame: "subscribe", workspace_id: hello.workspace_id }));
// `--when-asked`: wait for a person to say something first, which is how the conformance kit
// plays it. The flows want the ask standing when the room opens, so they start it at once.
if (process.argv.includes("--when-asked")) {
  await waitFor(
    (frame) => frame.event?.type === "message.new" && frame.event.from?.kind === "person",
  );
}

const draft =
  "Hi Dana, confirming PO #4471 for 120 units, delivery 19 September. Shout if anything looks off.";
await send("run.started", {
  goal: "Get PO #4471 confirmed with Northwind and update the tracker.",
  plan: [
    { step_id: "read-po", title: "Read PO #4471" },
    { step_id: "check-crm", title: "Check the Northwind record in the CRM" },
    { step_id: "email-dana", title: "Email Dana to confirm" },
    { step_id: "update-tracker", title: "Update the tracker" },
  ],
});
await send("run.status", { phase: "reading", verb_phrase: "Reading PO #4471…" });
await send("step.log", {
  step_id: "read-po",
  status: "done",
  tool: "drive.read",
  summary: "120 units, delivery 19 September, signed.",
  sources: [{ kind: "internal", label: "Drive" }],
  duration_ms: 1840,
});
await send("step.log", {
  step_id: "check-crm",
  status: "done",
  tool: "crm.read",
  summary: "Dana Whitfield is the contact.",
  sources: [{ kind: "internal", label: "CRM" }],
  duration_ms: 920,
});
await send("step.log", {
  step_id: "email-dana",
  status: "started",
  tool: "email.send",
  summary: "Drafting…",
});

const approvalId = newId("apr");
const decided = waitFor(
  (frame) => frame.event?.type === "approval.resolved" && frame.event.approval_id === approvalId,
);
await send("approval.request", {
  approval_id: approvalId,
  step_id: "email-dana",
  action: {
    kind: "email.send",
    input: { to: "dana@northwind.com", subject: "PO #4471 confirmation", body: draft },
    external: true,
    irreversible: true,
  },
  question: "Send this email to dana@northwind.com?",
  effect: "It confirms PO #4471 with Northwind. An email can't be unsent.",
  lasts: "once",
  preview: { format: "markdown", title: "To dana@northwind.com", body: draft },
  risk: ["external_communication", "irreversible"],
  sources: [{ kind: "external", label: "vendor website" }],
  expires_in: 3600,
  editable: true,
});
process.stdout.write(
  `Run ${runId} is waiting on the ask. Steer it, approve it or deny it on the phone.\n`,
);

const { event: resolved } = await decided;
process.stdout.write(`  ${resolved.decision}\n`);
if (resolved.decision === "approved" || resolved.decision === "edited") {
  const body = resolved.updated_input?.body ?? draft;
  await send("approval.executed", {
    approval_id: approvalId,
    outcome: "executed",
    detail: `Sent: ${body.slice(0, 60)}…`,
  });
  await send("step.log", {
    step_id: "email-dana",
    status: "done",
    tool: "email.send",
    duration_ms: 610,
  });
  await send("message.post", {
    text: "Emailed dana@northwind.com to confirm PO #4471; updating the tracker now.",
  });
  await send("step.log", {
    step_id: "update-tracker",
    status: "done",
    tool: "sheets.write",
    summary: "Row 4471 set to Confirmed.",
    duration_ms: 340,
  });
  await send("usage", {
    scope: "run",
    model: "opus-5",
    input_tokens: 82_140,
    output_tokens: 3402,
    cost: { usd: 1.47, estimated: true },
  });
  await send("run.completed", {
    summary: "Confirmed PO #4471 with Northwind and updated the tracker.",
    cost: { usd: 1.47, estimated: true },
  });
} else {
  await send("step.log", { step_id: "email-dana", status: "failed", error: "Denied in Chips." });
  await send("run.failed", {
    error: "Stopped: the email was not approved.",
    left_undone: ["Update the tracker"],
  });
}
socket.close();
