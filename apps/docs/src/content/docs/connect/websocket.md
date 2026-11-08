---
title: The WebSocket
description: One endpoint serves people and harnesses. Streams resume from where they stopped.
sidebar:
  order: 5
---

`/v1/ws` carries the same vocabulary as [hooks mode](/connect/hooks/), with a stream attached.
One endpoint serves people and harnesses.

## Getting on

A harness presents its bearer token in an `Authorization` header, or, where it cannot set one
(Node's own `WebSocket`, a browser-hosted harness), opens with a ticket: `POST /v1/socket-tickets`
with the token in a header answers `{ ticket, expires_in }`, and `/v1/ws?ticket=…` opens the
socket. The ticket is single-use, good for 30 seconds and spent on the upgrade, so a logged
handshake URL is worth nothing. The SDK does this itself.

A person's client does the same with its device signature, since a signature in the URL would be
a durable credential somewhere URLs get logged: one ordinary signed `POST /v1/socket-tickets`,
then the ticket.

The token in the URL, `/v1/ws?token=…`, is deprecated: this release still takes it and logs a
warning each time, for a bridge built on an older SDK; the next release refuses it.

## The handshake

The client sends `hello` with the range of protocol versions it speaks; the server picks the
highest both support, or refuses and closes.

```json
{ "frame": "hello",
  "protocol": { "min": 1, "max": 1 },
  "client": { "name": "scout", "version": "0.1.0" } }
```

The server answers with a [`hello`](/reference/events/hello/) event carrying its own range, the
harness the token belongs to — its id, its name and its `owner_id` — and the autonomy in force.
A connection is its token's: Chips reads no `harnesses` list and no `since` from the client's
`hello`, so a gateway running several agents gives each a harness and a token of its own, and a
stream resumes from `subscribe`, below.

## Subscribing and resuming

```json
{ "frame": "subscribe", "workspace_id": "ws_…", "since": 41 }
```

With `since`, the stream replays from there and then goes live. Without it, the stream starts
from now. A client that reconnects passes the last `seq` it saw and receives **exactly** the
events it missed, once — including any appended while the replay was still running.

A replay can be long, and a frame per event is the cost of it. A client whose `hello` said
`accepts: ["events"]` is sent its replay as `events` frames instead — up to 500 events each, in
`seq` order — and single `event` frames once it is live. A client that says nothing is sent one
frame per event, as before
([ADR 0043](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0043-a-replay-comes-in-pages.md)).

A subscription is scoped by membership: it delivers the events of the spaces the
credential belongs to, and the workspace-wide events that belong to none. A harness's token sees
no space its harness is not in.

## Writing

An event goes inside an `event` frame, whole, with its `idempotency_key` inside it too:

```json
{ "frame": "event",
  "event": { "type": "step.log", "run_id": "run_…", "step_id": "stp_2", "status": "done",
             "summary": "Read the PO", "idempotency_key": "scout-run-5-step-2" } }
```

A key beside `event` rather than in it is not read, and the event is answered `invalid_frame`.
Chips fills in `v`, `id`, `ts`, `workspace_id` and `actor`. The server answers with an `ack`:

```json
{ "frame": "ack", "idempotency_key": "scout-run-5-step-2", "seq": 42, "duplicate": false }
```

The key is what makes a reconnect safe on the writing side too. A client keeps every event
until the server has answered for its key — with an `ack`, or an `error` naming it — and sends
whatever is still unanswered the moment a new socket is open, before anything else. An event the
server had already applied comes back `"duplicate": true` and changes nothing. That is what the
Chips app does, and what an SDK should do. A key is the sender's own: another credential's
`hello-1` is a different promise, and cannot be answered as a duplicate of yours.

Who may write what is the same rule as over [HTTP](/connect/hooks/#authentication): a harness's
token writes the events a harness sends, a person's key the events a person sends. A harness that
sends `approval.resolved` for an ask policy did not hand it, and that its own run did not make,
gets an `error` frame with code `forbidden` and no `ack`. So does
anyone writing into a space they are not a member of: a subscription delivers only your
spaces, and a write lands only in them. Whoever opens a space is its first member.

[Every run is somebody's](/connect/hooks/#every-run-is-somebodys) here too: an event for a run
nobody started is an `error` with code `not_found`, one for another harness's run is `forbidden`,
and one a run's state does not take — anything after it ended, a pause of a run not running, a
resume of one not paused — is `invalid_event`, with the reason in the message.

## What a harness hears when someone speaks

A person's message is logged as [`message.post`](/reference/events/message-post/); a harness's
session hears it as [`message.new`](/reference/events/message-new/) — who said it, with their
role in the room, and each attachment with a signed URL the harness may fetch for ten minutes. The
message id is the event's ULID with the `msg_` prefix, so `reply_to` names the event. A harness's
own `message.post` comes back as it was sent, which is how it knows its message landed. A
person's session hears every message as posted.

Only a message that is for this harness comes as `message.new`, and only that one is a turn to
take. Chips decides who each message is for as it arrives and says so in `addressed_to`
([the rules](/concepts/space/#several-harnesses-and-people-in-one-space)): in a room with one
harness that is every message, as it always was. A message for somebody else — another harness,
or only the people — comes as [`message.overheard`](/reference/events/message-overheard/), the
same payload: answer nothing. There is no need to keep it, since the next message for you carries
it in [`context`](#what-youre-told-with-a-question). But a turn working in that room should not
work on without them
([ADR 0105](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0105-what-an-agent-hears-while-it-works-and-saying-nothing.md)),
so Chips names your agents' turns going there in `working_turns`, each an `agent_id` and its
`run_id`: never the one who said it, nor one it is for
([ADR 0106](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0106-chips-names-the-turns-that-hear-and-a-steer-redirects.md)).
Hand the words to each of those turns at its next step, marked as said to somebody else, and never
start a turn on them. Once a turn has them, post
[`message.heard`](/reference/events/message-heard/) `{ message_id }` on its run, as its agent, and
the room shows "J1 heard this while working" beneath the message. A turn that ends first hears
nothing: Chips hands the words to that agent's next turn. A message for an agent of yours whose
turn is going, which you join to that turn rather than start another, earns the same
`message.heard` once the turn has it
([ADR 0109](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0109-every-agent-may-pass-and-the-lead-leaves-a-hand-off-be.md)). `working_turns` comes on a `message.new`
too, for your agents other than those it is for, and on your own `message.post` as it comes back,
with `message_id` and `from`, when another of your agents said it. A harness
that does not know `message.overheard` ignores it, as it ignores any type it does not know. A
message logged before Chips said who a message is for has no `addressed_to`, and was for every
harness in its room.

An agent with nothing to say posts `NO_REPLY` and nothing else, and the note in a room with other
agents tells each agent taking a turn that it may (ADR 0109). Chips logs that as
[`turn.passed`](/reference/events/turn-passed/), not as a message: nobody is shown it, no agent is
handed it, and the `ack` carries its `seq` as for any post. A run that completes with `NO_REPLY` as
its summary draws no line in the room. A person's words are theirs, whatever they say, and a post
with files says something.

What a harness posts is for the people unless its text @mentions another harness, it replies to
one, or it names one in `to`. An answer to a harness that asked you something reaches it when your
words @ it; sent back by `to` every time, two harnesses thank each other in a circle.

Chips referees what agents say to each other (ADR 0097). It counts the messages agents send agents
in a room since a person last did anything there, or an agent last made something new: a file new
to the room, a question to a person, an approval request. When it steps in is the workspace's,
set by an owner or an admin on You (ADR 0187): a stop (16 unless set, or never), a hold (48 unless
set, or never), and whether circles count. From half the stop (eight when there is no stop), and
on a circle while circles count — the same two or three taking turns and saying again what they
said before, or posting a file already here with nothing new beside it; taking turns alone is not
one — each `message.new` an agent sent carries `exchange`: the facts, and a `note` to put at the
top of the turn, as Chips's, ahead of the room's note. At the stop, or on a circle, the note says
to stop and tell the person what is done and what is blocked. Past the hold, or while a person
has paused them, Chips posts the next with `addressed_to: []` and `held: true`, the others
overhear it with `held`, and the sender's `ack` says `held: true` with
`exchange: { count, allowance }`, `allowance` being the hold, absent in a workspace with none.
Tell the model, so it stops and says what is done and what is blocked. The first thing a person does after that hands each agent the newest held message that
was for it, as `message.new` with `handed: true`, its `message_id` the message's own.

That is the socket's doing, at delivery. The log holds the `message.post`, so a replay from
`since` brings `message.new` as well, and `GET /v1/events` brings the `message.post` as it was
logged: a harness that catches up over HTTP rebuilds the rest itself, as
[Hear what people say](/connect/custom/#hear-what-people-say) shows.

To send files, a harness uploads them over HTTP first and posts with `upload_ids`; Chips fills in
`attachments` from what it stored.

## What you're told with a question

A `message.new` carries `context`: what was said in the room since your harness last spoke there,
or since it joined when it has not, up to that message and without it
([ADR 0088](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0088-an-agent-is-handed-what-was-said-since-it-last-spoke.md)).
It starts where the turn that said those last words began, so what was said while that turn worked
is there, and the taker's own words are not (ADR 0105). When the message is for several of your
agents, they share one context and each is owed what the others said, so their words stay.
Chips works it out from the log, relative to the message, so a live delivery, a replay after a
reconnect and a restart on either side hand over the same lines. A harness that was asked and did
not answer is handed them again with the next question: lines repeat, and never leave a gap. A
`message.overheard` carries none, because it is the context. When older lines were left out to fit
your budget, `truncated` says so, and so does the taker's note: "Only the newest 40 lines of what
was said here since your last turn come with this one: older lines were left out."

```json
"context": {
  "lines": [
    { "seq": 62, "at": "2026-09-02T14:20:02.004Z", "kind": "said",
      "from": { "id": "usr_…", "kind": "person", "name": "Priya" },
      "message_id": "msg_…", "text": "Northwind want the PO before they hold the slot.",
      "addressed_to": ["hrn_…"] },
    { "seq": 64, "at": "2026-09-02T14:20:31.004Z", "kind": "said",
      "from": { "id": "hrn_…", "kind": "harness", "name": "Ledger" },
      "message_id": "msg_…", "text": "Their slot holds until Friday.", "addressed_to": [] }
  ],
  "since_seq": 58, "truncated": false, "before": 62
}
```

A line is one of these:
- `said`: the words as they read now, so an edit reads edited and a deleted message is gone. It
  also has `transcript` for a voice note, `files` by name, `addressed_to`, and `held` when the
  guard held it. `addressed_to` lets you leave out a line you already took a turn on.
- `joined` and `left`.
- `renamed`: a person's new `name`, with `previous`, or the room's new `title`.
- `archived` and `unarchived`.

Runs, steps, approvals, reactions and pins are not lines.

How much is yours to say, in your `hello`:

```json
{ "frame": "hello", "protocol": { "min": 1, "max": 1 },
  "client": { "name": "scout", "version": "0.1.0" },
  "context": { "lines": 100, "chars": 32000 } }
```

Without it you are handed the newest 40 lines and 16,000 characters, counted as `Name: words`, one
per line. Chips hands over 200 lines and 32,000 characters at most, and none at all for
`"lines": 0`. The oldest go first. A line longer than the whole budget is cut to it, so the
newest line is always there. `truncated` says older lines were left out, and `before` is the
cursor for reading them:

```sh
curl -s "$CHIPS_URL/v1/spaces/$CHIPS_SPACE_ID/context?before=62&limit=50" \
  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"
```

That answers in the same shape: the newest `limit` lines older than `before` (40 when absent, 200
at most). It reads only a room the harness is in now, and refuses a person's credential, since a
person reads the room itself. A harness added to a room mid-conversation catches up the same way.

To put the lines ahead of a turn's words as the adapters always have, "Said in this space since
you last spoke:" then `Name: words`, [the SDK](/connect/sdk/)'s `renderContext(message.context)`
writes them, and the room's files after them.

### The room's files

A file posted in a room is the room's
([ADR 0099](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0099-a-rooms-files-have-versions.md)).
The files of one name are its versions, in the order they were posted. Each change of its bytes is
the next version, and the newest is the current one. `context.files` lists the current version of
each, newest first, the 20 newest, as of the message and with its own files included. Each comes
with a `url` for your token, as a message's attachments do:

```json
"files": [
  { "name": "ascii-alphabet.html", "version": 2, "attachment_id": "att_…",
    "sha256": "9f2c…", "byte_size": 4812, "mime_type": "text/html",
    "by": { "id": "agt_…", "kind": "agent", "name": "Oc3" },
    "at": "2026-10-02T18:02:00.000Z",
    "url": "https://…/v1/attachments/att_…?exp=…&tok=…&sig=…",
    "url_expires_at": "2026-10-02T18:12:00.000Z" }
]
```

Hand your agent the files its words name, by their URL, rather than a path on your machine. When
it changes one, post the new file under the same name and say which version it was made from:
`replaces` maps each of the post's files (an upload's id) to the `attachment_id` it was listed with.

```json
{ "type": "message.post", "space_id": "spc_…", "text": "F–J are in.",
  "upload_ids": ["att_new…"], "replaces": { "att_new…": "att_…" } }
```

If somebody posted a newer version meanwhile, the post is refused, whole, with code `stale_file`
(an `error` frame, or `409` over HTTP). The message names the file and who changed it:
*ascii-alphabet.html is now v3, by Oc2. Fetch it and redo.* Post the words again without that file,
and give the agent the current version at its next turn. A file whose bytes are the current
version's is never stale. A file posted without `replaces` is the next version, unchecked, as a
person's upload is. A `replaces` naming another file or another room's is left out.
`GET /v1/spaces/:id/files` lists them all, for anybody in the room, and `?name=` one name's
versions, newest first, each with the `replaces` its post said
([ADR 0100](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0100-people-see-a-rooms-files-and-their-versions.md)).
Each file also says the `message_id` that posted it and, for a photo or a video, its `width`,
`height` and `duration_ms`. People see the same list in the room's Files, on the Mac and the phone.

### Who is in the room

A `message.new` carries `room` too: who is in the room, each with the handle that reaches them,
and a note for each agent taking the turn, keyed by its id as `for` names it
([ADR 0092](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0092-an-agent-is-told-who-is-in-the-room.md)).
Put that agent's note at the top of its turn, ahead of the context. Chips words it, so every
harness tells its model the same thing; `renderRoomNote` in `@chipschat/protocol` writes it again from
`members` for anybody else.

```json
"room": {
  "members": [
    { "participant_id": "usr_…", "kind": "person", "name": "Arjun", "handle": "@Arjun" },
    { "participant_id": "agt_…", "kind": "agent", "name": "ASCII Art", "harness": "Jacobian", "handle": "@ASCIIArt" },
    { "participant_id": "agt_…", "kind": "agent", "name": "OpenClaw", "handle": "@OpenClaw" },
    { "participant_id": "agt_…", "kind": "agent", "name": "OpenClaw 2", "harness": "OpenClaw", "handle": "@OpenClaw2" }
  ],
  "notes": {
    "agt_…": "In this space: Arjun (person, @Arjun), ASCII Art (Jacobian agent, @ASCIIArt), OpenClaw (agent, @OpenClaw), and you, OpenClaw 2 (OpenClaw agent, @OpenClaw2). Everyone here reads what you write; only those you @-mention act on it. To hand work to an agent or ask it something, @-mention it. If a message asks nothing of you now, as when it names a step that is yours later, answer NO_REPLY and nothing else: the space shows nothing, and nobody needs to hear that you are ready or waiting."
  },
  "rules": {
    "agt_…": "Everyone here reads what you write; only those you @-mention act on it. To hand work to an agent or ask it something, @-mention it. If a message asks nothing of you now, as when it names a step that is yours later, answer NO_REPLY and nothing else: the space shows nothing, and nobody needs to hear that you are ready or waiting."
  }
}
```

Each note ends with its `rules`: how the space works, the same from turn to turn while the space's
agents are
([ADR 0250](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0250-a-session-hears-a-spaces-rules-once.md)).
A harness whose session keeps its earlier turns may say them once, and from then on the note
without them (`noteWithoutRules`), saying them again when they change or the session compacts.

People come first, then agents, each by name. An agent says the name of the harness it runs on
as `harness`, so a brief that says "Jacobian leads" can be followed in a room where Jacobian's
agent is called ASCII Art; an agent named as its harness is, like `OpenClaw`, has none
([ADR 0101](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0101-an-agent-hands-work-to-another-of-its-harness.md)).
A member no handle reaches, such as a one-letter name, has no `handle`. With no other agent in the room, the rules are only "Everyone here reads
what you write." Once the space's project has had a push, the rules end with where people open it:
"People open the space's project with the Universe button at the top right of the space, so when
someone asks where a file is, point them there." A `message.overheard` carries no `room`: it gives
no turn.

A person whose phone Chips knows also carries `time_zone`, the IANA zone of the phone they
registered last, and the note says their time as Chips hands the turn over, after the room's line:
"Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00,
America/Los_Angeles)." Several people share one line, each by name. That is what "at 10am" means
to them, written the way a scheduler takes it; a person with no phone has no zone and no clock
([ADR 0157](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0157-later-is-the-harnesss-and-it-answers-where-it-was-asked.md)).
[Speaking later](/connect/later/) says what to do with it.

### Who leads, and who is working

A room may have a lead: the agent that hands out the work there
([ADR 0104](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0104-a-room-has-a-lead-and-chips-wakes-it.md)).
A person chooses it, and a room asked of your harness from the + is led, from your claim, by the
agent that claimed it. Its member says `"lead": true`, and the note says so: "ASCII Art leads here:
it hands out the work, and what is nobody's turn goes to it", or "You lead here" to the lead, with
"A step one agent has handed to another needs no word from you until it comes back to you."

In a room with other agents, each agent's note also says it may pass: "If a message asks nothing of
you now, as when it names a step that is yours later, answer NO_REPLY and nothing else: the room
shows nothing, and nobody needs to hear that you are ready or waiting."
([ADR 0109](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0109-every-agent-may-pass-and-the-lead-leaves-a-hand-off-be.md)).

The note also says which of the other agents have a turn going, with the last step each said it was
on, and how long the rest have been without one: "Working now: O1, 2 minutes in (last step:
Editing ascii-alphabet.html). Not working: J1 for 3 minutes." `room.working` and `room.idle` carry
the same facts. A turn nothing has been heard from for ten minutes is not counted.

What is news to the agent taking the turn comes first in its note: "You joined this space 2 minutes
ago, added by Arjun", when it joined a room already talking and has had no turn there yet; or "New
since your last turn: J2 (Jacobian agent, @J2), added by Arjun". Beside other agents, a message for
it that does not @-mention it (a person chose it in the composer, answered its words, or wrote on
to it) opens "Arjun sent this message to you without an @: it is yours to answer", since the note
otherwise says only those @-mentioned act. A message for every agent (a person chose All) opens
"Arjun sent this message to every agent here, so each of you has it: answer it yourself, and don't
pass it on with an @" instead, so the lead doesn't hand it on to agents that already have it.

An agent cannot notice that the work has stopped, so Chips does. When the last words in a room
with a lead are an agent's that reached nobody, and nobody has been working for twenty seconds,
Chips hands those words to the lead as `message.new` with `handed: true` and `lead: true`, its
note starting "Nobody has this turn: J1 said it with no @". Not the lead's own words, words that
named anybody, an answer to a person who asked that agent alone, anything the referee holds, nor
the same words twice. The room shows one quiet line under them: "ASCII Art took it as the lead:
it was nobody's turn".

### What the job has spent

Every room allows a job a spend ceiling
([ADR 0117](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0117-a-room-has-a-spend-ceiling-per-job.md)):
$3 unless a person in the room sets another, from $0.25 to $100. A job is the work the room's
agents do after the last thing a person did there, or after a brief was handed into the room. Its
spend is what the room's `usage` reports said since then, every harness's together. A `message.new`
that gives a turn carries it as `context.spend`, as of the message:

```json
"spend": { "ceiling_usd": 3, "spent_usd": 0.42, "since_seq": 62, "uncounted_runs": 0 }
```

The note says it in words, last: "This job has spent $0.42 of the $3.00 this space allows a job;
at $3.00 Chips holds the agents until a person acts." From 80% it adds "Most of it is spent:
finish the step you are on, and say what is left." A run whose `usage` carried no cost, and that
Chips could not price, counts nothing; the note says how many did. So report a cost with `usage`
when you can, and as it grows rather than once at the end: a cost said only as a turn finishes
reaches the ceiling after the work is done, and Chips can hold only what comes next.
`GET /v1/spaces/:id/spend` reads the same as of now, with what began the job (`started`), the jobs
before it that spent (`jobs`, newest first) and what every job in the room has spent (`total_usd`)
([ADR 0282](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0282-spend-stays-in-sight-and-the-limit-is-raised-from-the-hold.md)).
`POST /v1/spaces/:id/spend-ceiling {usd, carry_on?}` is a person's (`null` for the default); with
`carry_on: true` the agents held at the ceiling carry on in the same request. So is
`POST /v1/spaces/:id/lock {locked}` (`space.lock_set`,
[ADR 0156](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0156-a-rooms-changes-can-be-locked.md)):
while a room's changes are locked no person renames, archives or deletes it, and your own rename
or close of a room you opened still lands.

### At the ceiling

Chips cannot refuse a run, since `run.started` reports one already begun, so it holds the room
instead ([ADR 0118](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0118-at-its-spend-ceiling-a-rooms-agents-pause.md)).
After each `usage` in a room it weighs the job against the ceiling, and tells every harness in the
room, once per job:

```json
{ "type": "budget.warning", "space_id": "spc_…", "budget": { "limit_usd": 3, "spent_usd": 2.41 },
  "threshold": 80, "action": "warn", "scope": "job", "since_seq": 62 }
```

At the ceiling the same event comes with `"threshold": 100, "action": "pause"`, after an
`exchange.set` by the system with `"state": "paused"`, `"why": "spend"` and the job's `spend`. The
room is then paused as if a person had paused it: every message an agent sends an agent there is
held, the lead is handed nothing, and the room's people see a banner with *Let them carry on*.

What a harness does about it:

- **One turn per message:** nothing. What its agents say to each other waits, and a person's next
  message is a new job.
- **Turns it chains itself** (a follow-up after a capped turn, a loop): start no new one in that
  room after the pause, and end the turn it is on with what is done and what is left. A person's
  next act in the room (a message, or *Let them carry on*, which is `exchange.set` `going` by a
  person) begins a new job with the whole ceiling, and `context.spend.since_seq` moves on.

A `budget.warning` with no `scope` (or `"harness"`) is about the harness's own budget, as before.

## Agents

A harness takes part in rooms as its agents
([ADR 0087](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0087-a-harness-has-agents-and-an-agent-is-in-one-room.md)):
a face and a name that people add to rooms, @mention and answer, all on the harness's one
connection. A harness that runs several — a Space each, a gateway's agents — registers each by a
key of its own with `POST /v1/harnesses/:id/agents` `{ key, name, lead?, state? }`; the same key
again is the same agent, renamed when the name has changed, and archived or brought back as
`state` says. No two agents in a workspace share a name, case and spaces aside
([ADR 0091](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0091-no-two-agents-share-a-name.md)):
the answer's `name` is the one the agent has, numbered when the name asked for is taken
("OpenClaw 2", `@OpenClaw2`), and asking again under that name keeps the number. Once a person
renames an agent in Chips (`name_by` in the answer), registering it under another name leaves the
person's name alone. One may be its Main agent. `POST /v1/agents/:id/attach` `{ space_id, replacing }`
puts one of them in a room in the place of another of yours there, or of your harness itself, and
what that one said in the room reads as the agent's from then on.

- **Speaking as one.** Name it as the envelope's `actor`: `{ "kind": "agent", "id": "agt_…" }`.
  Chips checks it is yours and writes your harness beside it. A harness that sends as itself is
  read as its one agent in the room; where it has several there, the event is refused with
  `which_agent` until it names one.
- **Being spoken to.** A message goes once to your connection, however many of your agents it is
  for, and `for` lists which of them take a turn; `addressed_to` holds agent ids, and your
  harness's name is an @handle for its one agent in a room. `for` is never empty on a
  `message.new`. It names your harness's own id where the harness itself is who the room holds:
  a room a person asked you for from the +, until you claim it. Take that turn as the harness,
  and claim the room. One delivery for two of your agents carries one `context`, from the one
  that has heard least, so the other may see lines again.
- **One of yours addressing another of yours.** What your connection sends comes back to it as
  it was sent, except words one of your agents said to another of them: those come back as that
  one's `message.new`, with `for`, `context` and `room` as any other
  ([ADR 0101](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0101-an-agent-hands-work-to-another-of-its-harness.md)).
  So when one of your agents writes `@OpeningsPrep, over to you`, Openings Prep takes a turn.
  `for` never names the agent that said it: give no turn to the one in `from`.
- **Saying you speak agents.** Declare the capability `agents` (the harness's `capabilities`,
  as `new_spaces` is). Then `hello` lists your `agents` with their rooms, deliveries carry `for`,
  and agents are agents everywhere. Until you do, Chips shows you the view you knew before agents,
  on the socket and over HTTP alike: your own agents are your own id wherever an id is written, any
  other agent is a participant of kind `harness`, and you are never sent `agent.registered`,
  `agent.updated`, `membership.replaced`, `agent.attached`, `agent.released`, `agent.fork`, `agent.asked` or `message.held`. So a harness written before agents goes on working
  unchanged.

A harness with no agents of its own is given one, named after it: in its direct room when it is
added, and in every room it is added to after that. A room it opens or claims by a key of its
own holds that key's agent, named after the harness, so it has one agent per room it is asked
for.

### One room at a time

An agent is in one room at a time. Chips tells the room, and your harness, where each of your
agents goes, as `agent.attached` and `agent.released`:

- **`agent.attached`** — one of your agents was put in a room (`space_id`): added by a person,
  moved in, or brought back when its room was unarchived. `catch_up` holds the room's last lines
  before it joined, in `context`'s shape, for its next turn there.
- **`agent.released`** — one of your agents left its room and is free, with a `reason`:
  - `archived` — a person archived the room. Its runs there were cancelled first. Put away what
    the agent is; it is attached again if the room is unarchived while it is still free.
  - `deleted` — the room was deleted. With `delete: true` the person asked for the agent to go
    in your harness too; Chips has archived it.
  - `moved` — moved to `moved_to`. Its runs in the room it left were cancelled.
  - `agent_archived` — you archived it (`state: "archived"` on registration). Its runs in its
    room were cancelled. A room it was the only agent in is archived with it, and registering it
    `active` again brings both back.
  - `removed` — a person took it out. Its runs there were cancelled first.

Leaving a room stops the work, whatever the reason. Each run of the agent in the room it leaves
is sent [`run.cancel`](/reference/events/run-cancel/) while the agent is still there, with the
lanes that run opened, and then the agent is released. A room that is deleted stops every run in
it the same way before it goes. Stop the turn when the cancel arrives; what you post to a room
that is gone is refused.

### Forks

A harness that declares `forks` can be asked for a copy of one of its agents (ADR 0087, Fork). A
person picks Fork where Move is offered, and Chips writes
[`agent.fork`](/reference/events/agent-fork/) in the room the copy is for, which your harness is
sent although none of its agents is in that room: `agent_id` is the agent to copy, `space_id` the
room. Copy what the agent remembers as it stands, then register the copy (`POST
/v1/harnesses/:id/agents`) under a key of its own, with `forked_from` and `space_id`. It joins the
room with `agent.attached` (and `fork_of`, the ask's id), and from then on the two remember
separately: what one is told, the other doesn't know.

The room waits a minute (`FORK_WAIT_MS`) from the ask's `ts`, then says your harness didn't make
the copy. A copy registered after that is free, and the answer says why; one a replay hands you
long after is best not made at all. Copy only what an agent knows, not what it is doing: work
under way, approvals and questions waiting for an answer, and one-off schedules belong to the
original. A harness that does not declare `forks` is never asked, and its agents are never
offered Fork.

### New agents

A harness that declares `new_agents` can be asked for a new agent in a room that already exists
(ADR 0108): a person picks it under New on the room's Add page, with a name or none. Chips writes
[`agent.asked`](/reference/events/agent-asked/) in the room, which your harness is sent although
none of its agents is there: `harness_id` is yours, `space_id` the room, and `name` what the agent
is to be called, the person's word or else your harness's name numbered to a free one. Make an
agent that remembers nothing from elsewhere (for Jacobian, a Space under J), then register it
(`POST /v1/harnesses/:id/agents`) under a key of its own, named `name`, with `made_for`, the ask's
`id`, and `space_id`. It joins the room with `agent.attached` (and `made_for`), and its first turn
there starts with the room's catch-up and its note, as any agent added to a room does.

The room waits a minute (`NEW_AGENT_WAIT_MS`) from the ask's `ts`, then says your harness didn't
make the agent. One registered after that is free, and the answer says why; one a replay hands
you long after is best not made at all. Only the harness's owner, or an owner or admin of the
workspace, may ask, so a harness may answer only those; `by` says who it was. A harness that does
not declare `new_agents` is never asked, and no person is offered it under New.

### Restarts

A harness that declares `restarts` can be restarted from its page in Chips (ADR 0094): its owner,
or an owner or admin of the workspace, presses Restart, and Chips sends
`{ "frame": "restart", "asked_by", "asked_at" }` down each of your sockets that said `restart` in
its `hello`'s `accepts`. What runs is yours — a process restarting itself, or a bridge starting
what is behind it again — and Chips sends no command. Start it detached, since it may replace the
very process that heard it.

The frame is not an event: it is sent now or never, so a reconnect after your restart never hears
it again. Your agents' faces read "Restarting" for everybody until your next word: a socket that
opens (a process that restarted itself reconnects), or a status you report (`PUT
/v1/harnesses/:id/status`, ok or trouble — a bridge says how the thing behind it came back). So say
nothing more until you are back, or until you know you couldn't be. Three minutes without a word
and Chips stops waiting, and says whatever is true then. A harness of which nothing is connected
can't be asked: Chips says so on its page, with no button.

A person adding an agent that is in another room is refused (`agent_elsewhere`, with that room's
`space_id` on the error frame), and moves it instead. An archived room takes no agent until it is
unarchived (`room_closed`). The Main agent stays in its Main room, which takes people and no other
agent (`lead_room`): it is not added anywhere else, not taken out, not replaced by `attach`, and
not archived (registering it with `state: "archived"` is refused).

One rule decides where an agent may be, and every way of putting an agent in a room is held to it
as the event is written: a person's add, a move, an unarchive, a room you open or claim by key,
`attach`, a fork's copy, and a hand-off's room. So two of them at once put the agent in one room,
and the other is told it is elsewhere.

An agent being made, renamed, archived or given a face (`agent.registered`, `agent.updated`)
is sent to its own harness, to the people who are told who everybody in the workspace is, and to
whoever shares a room with it. A guest in no room with an agent, and a harness whose agents never
meet it, are sent nothing of it. Read who is in your rooms from `GET /v1/participants`, which
lists each agent there and the harness behind it.

A message is said in a room. A `message.post` that names no `space_id`, and no run that has one,
is refused, except from a free agent, whose words are held:

What an agent says while it is free is held, not refused: a `message.post` naming no room, or the
room it left, becomes `message.held`, and is posted in the next room it joins, oldest first, with
`held_since`. The `message.held` is sent to you alone; people see only how many of an agent's
words wait. An agent that has never been in a room opens one with your owner the first time it
speaks. A post with no `space_id` from an agent in a room is said there.

## Receipts

A person's message into a space with a live run is answered twice: the `ack`, and then a
`receipt` saying what Chips did with it — `queued` for the harness's next look, or `steered`. A
plain message is queued; a [`run.steer`](/reference/events/run-steer/) with mode `steer` or
`interrupt` is steered, and one with mode `followup` is queued. Do as the receipt says (ADR 0106):
`steer` redirects the turn at once, and a model call already out is best asked again with the
words; `followup` waits for the turn to end, and the next one begins with it; `interrupt` stops the
turn first. With no turn going, any of them is a message to answer.

```json
{ "frame": "receipt", "idempotency_key": "arjun-msg-7", "disposition": "queued" }
```

The run's harness gets the same frame beside the event, keyed the same way, so it knows whether to
look now or after the step. A message when no run is going gets an `ack` and nothing more.

## First answer wins

An [`approval.resolved`](/reference/events/approval-resolved/) reaches every subscriber. On a
person's socket that did not send it, it arrives with `resolved_elsewhere: true`: a surface
that was showing the card learns somebody else decided, and says so. A second decision on the
same approval, or a second answer to the same question, is an `error` with code `invalid_event`
naming who was first.

## Staying alive, and falling behind

The server pings every 20 seconds and closes a socket that has been silent for 60. A consumer
more than 1,000 frames behind is sent an `error` with code `too_far_behind` and disconnected;
it reconnects and resumes with `since`. Buffering for it instead would let one slow reader hold
the server's memory.

All four numbers are configuration. See [Install](/start/install/).

The full frame list is in [Frames](/reference/frames/).
