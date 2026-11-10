# @chipschat/harness

Agent Connect for a harness you control. Import the client, emit events from inside your loop,
and hear messages, decisions and steering on a callback. It depends on `@chipschat/protocol` and
nothing else; Node 22's own `WebSocket` carries it.

```sh
npm install @chipschat/harness
```

```ts
import { connect } from "@chipschat/harness";

const token = process.env["CHIPS_HARNESS_TOKEN"] ?? "";
const chips = await connect({ url: "http://127.0.0.1:4431", token });

chips.on("message.new", async (message) => {
  if (message.from.kind !== "person") return;
  const run = await chips.runs.start({ spaceId: message.space_id ?? "", goal: message.text });
  await run.status("Reading PO #4471…");
  await run.step({ tool: "drive.read", summary: "Read PO #4471" });

  const decision = await run.approval({
    action: { kind: "email.send", input: { to: "dana@northwind.com" }, external: true, irreversible: true },
    question: "Send this email to dana@northwind.com?",
    preview: { format: "markdown", body: "Hi Dana, confirming PO #4471." },
    risk: ["external_communication", "irreversible"],
  });
  if (!decision.allowed) return run.fail({ error: "The email was not approved." });

  await run.executed(decision.approvalId, "executed");
  await run.complete({ summary: "Confirmed PO #4471 with Northwind." });
});

process.on("SIGINT", () => chips.close());
```

The docs page, `/connect/sdk/`, is the reference: what each call takes, what a decision is, how
a restart resumes by id.


## What it holds

| Module | What it is |
| --- | --- |
| `connect.ts` | One socket: hello, subscribe, resume with `since`, reconnect with backoff, ping. `post` and `runs.start`. |
| `run.ts` | A run: `status`, `plan`, `step`, `approval` and `question` as promises, `task` for a lane, `context`, `usage`, `checkpoint`, `executed`, `complete`, `fail`; what a person does to it on `on("steer" | "pause" | "resume" | "cancel" | "message")`. |
| `lane.ts` | A lane from the lead's side: where it is once acknowledged, its news on `on("updated")`, `result` when it ends, `work()` for a lane the lead works itself. `chips.runs.accept(requested)` is the specialist's side. |
| `chips.on("feedback")` | A thumb or a note on one of the harness's messages, with who gave it. Only the harness whose message it is hears it. |
| `asks.ts` | Rooms a person asked the harness for: each handed to `onSpaceAsked` once, with its first words, heard live or read at a catch-up; `claimSpace` gives one the harness's key. |
| `outbox.ts` | Every send waits here until the server acks or refuses it; a socket that opens sends the unanswered ones first. |
| `events.ts` | What can be listened for, typed from the protocol. |
| `project.ts` | A room's project for one agent (ADR 0221): `chips.project({ spaceId, agentId, name, folder })`, a copy at `<folder>/room`, `pull()` before a turn and `push({ words })` after it, which commits as the agent, replays over whoever sent first, and leaves a clash marked for the next turn. |

## Invariants

| Invariant | Protected by |
| --- | --- |
| Connecting says hello, learns the harness's id and policy from the server, and subscribes; a bad token is a refusal, not a hang. | `src/connect.test.ts`, "connecting" |
| Every send is acknowledged or refused with the server's reason; a refusal rejects the promise. | `src/connect.test.ts`; `src/outbox.test.ts` |
| An approval or a question is a promise that resolves with the decision, whoever made it — a person, or the policy engine at once. | `src/connect.test.ts`, "asks for approval", "the policy engine's answer" |
| A run hears steer, pause, resume and stop; `whenRunning` waits out a pause. | `src/connect.test.ts`, "hears a person" |
| A message is heard as `message.new` with who said it, and can be answered by id. | `src/connect.test.ts`, "messages" |
| Feedback on one of its own messages is heard as `feedback`, with who gave it and their role. | `src/connect.test.ts`, "hears a thumb or a note" |
| `since` replays what happened while the harness was down. | `src/connect.test.ts`, "replays from since" |
| A task is acknowledged with where the lane is, or as flattened; the lead hears the lane's result, the specialist takes up its run, and a cancel reaches both. | `src/connect.test.ts`, "lanes (M3.5)" |
| A room asked of the harness is handed over once with its first words, live, at connect, or after a reconnect, and those words are not `message.new` too; a claim takes the harness's key and title, a retry finds it, and a room nobody asked for is refused. | `src/connect.test.ts`, "rooms a person asks for" |
