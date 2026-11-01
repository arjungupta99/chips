---
title: Conformance
description: Walk an adapter through the golden scenario and get the checklist the app shows.
sidebar:
  order: 8
---

`chips conformance <adapter>` runs an adapter against a fake Chips that speaks the wire — the
routes, the socket, the handshake, the replay — and checks every event it sends with the
protocol's own schemas. It plays the person through the golden scenario, then prints the
connection checklist a harness's page under Agents lights, row for row, so the app and the kit cannot say
different things about what your harness has earned.

```
chips conformance custom
```

`custom` is for a harness you start yourself: the command prints where the fake Chips is and the
harness's token — the same four lines any harness is given — waits for your harness to connect,
and plays the person from there. A harness whose adapter lives in its own repository — Jacobian's
— is walked from there: the kit is a package this repository publishes, `@chipschat/conformance`,
not a command that knows the harness. The kit's own tests walk a harness on the SDK through
every row (`packages/conformance/src/scenario.test.ts`).

## What it plays

1. The person says, in the direct space between them and the harness: *Here's the signed PO. Get
   it confirmed with Northwind and update the tracker.*
2. Whatever the harness asks, the person answers. An approval is approved, with the reason "Go
   ahead."; a question takes its default, or its first option.
3. That goes on until the run ends, or until nothing more arrives within the timeout — ten
   seconds by default, `--timeout <s>` to change it.
4. For a harness that declares `new_spaces`, and only for one: the person opens a room, asks the
   harness into it and says what it is for, *Plan the kitchen remodel: two quotes, a budget and a
   start date.*, as the + by the tab bar does. The harness must claim the room under a key of its
   own within the timeout, and is expected to name it and answer there ([New
   spaces](/connect/new-spaces/)).
5. Then each other capability the harness declares is checked, one by one, and only those it
   declares:
   - **`forks`:** the person asks for a copy of the agent it played as, in a room of theirs. The
     copy must join that room.
   - **`new_agents`:** the person asks for a new agent, *Nova*, in a room of theirs. An agent
     registered for that ask must join it.
   - **`context_files`, `models`, `heartbeats`, `context_windows` and `jobs`:** the harness must
     have sent a copy for one of its agents (for context files, of its own set will do; for jobs,
     of its own jobs).
     - The person then changes the setting to what the copy already says: the same model, the
       same heartbeat, the same limit, a file saved with its own text, a job switched as it
       is. So answering changes
       nothing.
     - A socket of the harness must have said the word in its `hello`, and the harness must
       answer within the timeout. Saving and refusing both count; a refusal is noted with its
       words.
     - A copy that is all read-only is asked nothing.
   - **`restarts`, last:** the person presses Restart. Within three timeouts, the harness must
     connect again or say it is fine. Saying it is in trouble instead is a restart that failed.

   `agents`, `follows_rooms` and `autonomy` can't be seen from outside the harness: whether it
   reads `for`, carries an archive to its own side, or asks by the dial. The report says they are
   declared, not checked.

Then the log is read: which rows lit, how many of each event arrived, and what the harness got
wrong on the way.

## Levels

Under the rows, the report says how far the harness got:

| Level | What it takes |
| --- | --- |
| **Talks** | The Messages row lit |
| **Supervised** | Every required row lit |
| **Lives in Chips** | Of six: `agents`, `new_spaces`, `forks`, `new_agents`, `follows_rooms`, `restarts` |
| **Managed from Chips** | Of six: `context_files`, `models`, `heartbeats`, `context_windows`, `jobs`, `autonomy` |

A capability counts toward its level when its check passed, or when no check can see it. One
declared and failed counts for nothing, and it fails the run, as a refusal does:

```
    ● Talks
    ● Supervised
    ◐ Lives in Chips       3 of 6: agents · not checked, new agents ✓, restarts ✓
    ◐ Managed from Chips   4 of 6: context files ✓, models ✓, heartbeats ✓, context windows ✓
```

The [gallery](/connect/gallery/) lists each connector and the level it reaches.

## The report

A harness on the wire, started by hand against the address printed:

```
  Conformance · custom
  ────────────────────

  Point your harness at this Chips and let it hear a message:

      CHIPS_URL=http://127.0.0.1:57883
      CHIPS_HARNESS_ID=hrn_01M564DMSP0W9TBPX5HYW46SRR
      CHIPS_HARNESS_TOKEN=chips_at_…
      CHIPS_SPACE_ID=spc_01M564DMSP0W9TBPX5HYW46SRS

  The scenario plays when it connects, or when it first speaks over HTTP. Waiting up to 120 s.

  · Waiting for the harness to connect (up to 120 s)…
  · The harness is here.
  · You: Here's the signed PO. Get it confirmed with Northwind and update the tracker.
  · You approved email.send.
  · The run completed.

    ● Messages    sent message.post
    ● Runs        sent run.started
    ● Steps       sent step.log ×5
    ● Approvals   sent approval.request
    ○ Questions   send question.ask for a question card with options
    ○ Context     send context.usage for the context ring
    ● Cost        sent usage
    ● Finished    sent run.completed
    ○ Lanes       send task for a route card, and a task card where the work goes

    ● Talks
    ● Supervised
    ○ Lives in Chips       0 of 6
    ○ Managed from Chips   0 of 5

    12 events in 1.1 s

  Each unlit row links to the page that lights it:
    Questions   https://chipschat.ai/reference/events/question-ask/
    Context     https://chipschat.ai/reference/events/context-usage/
    Lanes       https://chipschat.ai/reference/events/task/

  Passed. Every required row is lit and nothing was refused.
```

**Passing** means Messages, Runs, Steps, Approvals, Cost and Finished are lit and nothing the
harness sent was refused. Questions, Context and Lanes are reported and not required: a harness
with no question to ask, no window size to report and nothing to route is complete without them.
A lane to another harness is a task to a second harness, and the fake does with a
[`task`](/reference/events/task/) what the router does as far as one harness allows: a task the
harness routes to itself opens a lane in the room it named, acknowledged with where the lane is,
and any other target is flattened into a step — so a lead whose lanes go to other harnesses
leaves its Lanes row dark here, and it is not required. The command exits zero
on a pass and one otherwise, so a job can gate on it; `--json` prints the report as JSON and
nothing else.

The notes under the checklist are the part a human wants:

| Mark | What it says |
| --- | --- |
| `x` | Chips refused an event, or a claim, and why — the same rule and the same words `chipsd` would use. A refusal fails the run, and so does a room asked of a harness that declares `new_spaces` and never claims it. |
| `!` | Something a good adapter does that this one did not: an event that belongs to a run sent without one; a yes with no [`approval.executed`](/reference/events/approval-executed/) after it; a step still `started` when the run ended; a run left running; a new room claimed and left silent; a field the protocol does not declare, which Chips drops and `chipsd` says once in its log (ADR 0162). |
| `·` | Worth knowing, not wrong: a `usage` with no cost, which Chips prices from its own table; a run that ended in `run.failed`, with its error; a new room claimed without a title. |

A new room lights no row. The rows are events a harness sends, and a claim is not one: it goes
through the space door, which writes [`space.claimed`](/reference/events/space-claimed/) itself.

## What the fake is, and is not

It is the real routes and the real frames, field for field: `POST /v1/harnesses/:id/spaces` and
its claim, `GET /v1/harnesses/:id/spaces` with the rooms asked of the harness,
`POST /v1/harnesses/:id/events`, `POST /v1/runs/:id/events`, the approval long poll, uploads and
attachments, `GET /v1/events` (for one space too), the settings copies (`PUT
/v1/agents/:id/context`, `/model`, `/heartbeat` and `/context-window`, and `PUT
/v1/harnesses/:id/context`, each checked against the protocol's schema), `PUT
/v1/harnesses/:id/status`, and `/v1/ws` with `hello` (its `accepts` read), `subscribe`, `event`,
`ack`, `receipt`, `ping`, `pong`, `restart` and the four settings frames. Every event is filled in and validated the way the
server does it — the clock and the actor are Chips', a decision is attributed to whoever made it
— and refused by the same rules: the workspace, the direction, the idempotency key, the run's
life, membership, first answer wins, who may change a space or who is in it, and that a room is
asked only of a harness that declares `new_spaces`.

What follows an event is held to the server by test. A set of scenarios is played against both
the real server and the fake, with the same harness on the wire, and what the harness's socket was
sent has to be the same, line for line: an agent added and taken out with a run going, a room
archived and unarchived, a move, an agent archived in its harness, a room asked for and claimed,
held words, a fork, a room deleted, a lane cancelled with its lead's run, and a harness's Main
room. The rules a scenario cannot share that way are the protocol's own functions, which both
call: who sends each event, where an agent may be, who is sent an event, and who takes a turn.

It is not the policy engine. Nothing in the fake decides a card on the spot; every approval waits
for the person, which is what "ask first" means and what its `hello` reports as the autonomy
level. It does not price a `usage`, and it does not sniff an upload's bytes — the mime type comes
from the filename. So an adapter that passes has spoken the protocol; what a real server's dial
would have allowed unasked is that server's business, and the adapters' own integration tests
cover it against `chipsd`.

## A custom harness

```
chips conformance custom
```

prints four lines to put in your harness's environment:

```
CHIPS_URL=http://127.0.0.1:52341
CHIPS_HARNESS_ID=hrn_01K4…
CHIPS_HARNESS_TOKEN=chips_at_…
CHIPS_SPACE_ID=spc_01K4…
```

and waits up to two minutes for the harness to connect — a socket subscribed, or anything at
all said over HTTP. The scenario begins with the person's message, so a harness should hear it
before it starts its run: over the socket that is `message.new`; in hooks mode, read
`GET /v1/events` until a person has spoken. A run started before the message is not the answer
to it, and the report says the run never ended. They are the same four lines
`chips connect custom` prints for a real server, so a harness built against
[Custom](/connect/custom/) needs no change to be checked. A
harness on [the SDK](/connect/sdk/) needs nothing more than `connect({ url, token })`; one in
[hooks mode](/connect/hooks/) posts to the URL with the token. The space is the direct one
between you and the harness, where the person's message lands. `--port <n>` fixes the port when
the harness's configuration wants one written down.

## From a test

The kit is a package, `@chipschat/conformance`, and an adapter's own test suite runs the same thing
the command does:

```ts
import { runConformance, type Subject } from "@chipschat/conformance";

const subject: Subject = {
  name: "my-adapter",
  start: async (chips) => {
    // bring the adapter up against chips.url with chips.token
  },
  stop: async () => {
    // and take it down
  },
};

const report = await runConformance({ subject });
expect(report.passed).toBe(true);
```

A subject that answers a message by itself needs only `start` and `stop`. One whose harness
cannot act in a test — an adapter that hears the message, but with no model behind it — gives a
`turn` as well, and the kit calls it with the person's message so the subject can play the
harness's side: the events a real turn would send. A subject's `capabilities` are what its
harness declares; with `new_spaces` among them the kit asks it for a room after the golden
scenario, and it must claim that room on its own, and with `forks` it asks for a copy of an agent.
From the CLI, `chips conformance custom --capabilities new_spaces,forks` says the same for a
harness in any language.

## In CI

Every push runs `chips conformance` for each adapter in this repository, one job per adapter,
beside the suite. That job is what the adapter gallery's badge will read.
