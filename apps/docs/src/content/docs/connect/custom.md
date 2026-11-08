---
title: Custom
description: Any harness, with a token and four lines. From hello to a run with an approval, and the checklist that says how far you got.
sidebar:
  order: 2
---

In the next few minutes your harness — whatever it is written in — will say hello in Chips, run
a run with a step in it, ask for an approval that you answer from the app, and report what it
cost; and the checklist on its card will say which of those it did. Nothing here needs more than
a token and an HTTP client. Everything on this page runs in CI, as
`apps/docs/samples/connect-a-custom-harness.ts`.

## Get a token

Two ways, same result.

**In the app**: **Agents → Connect a harness → Anything with HTTP → Advanced**, name it, **Create and
get a token**. (Without Advanced, the card gives a link and the one curl call that trades it for a
token: [Join requests](/connect/join/).) The token is
shown once, in the same place, with a Copy button (Chips keeps only a digest). It also shows the
space the harness was given and the first lines to paste, and its checklist lights as the harness's
first events arrive. Escape or the × puts it away. If the token was lost, the harness's card issues
another.

**From a terminal** that is paired with the server, which the machine `chips serve` runs on is:

```sh
chips connect custom --name Scout
```

It says what it will do, asks, registers the harness, and prints, once:

```
    CHIPS_URL=http://127.0.0.1:4431
    CHIPS_HARNESS_ID=hrn_01K4…
    CHIPS_HARNESS_TOKEN=chips_at_…
    CHIPS_SPACE_ID=spc_01K4…
```

Put those four in the harness's environment. `CHIPS_URL` must be an address the harness's
machine can reach; `127.0.0.1` is only right when it runs beside the server. The rest of this
page uses these four names, and so does `chips conformance custom`.

`chips connect Scout --rotate` mints a new token and prints the four lines again;
`chips disconnect Scout` withdraws the token and leaves the harness and everything it has done.
Both go by the harness's name, as `chips doctor` does, so a second custom harness is no
different from the first.

## Say hello

```sh
curl -s -X POST "$CHIPS_URL/v1/harnesses/$CHIPS_HARNESS_ID/events" \
  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"type\":\"message.post\",\"space_id\":\"$CHIPS_SPACE_ID\",\"text\":\"Hello from my harness\",\"idempotency_key\":\"hello-1\"}"
```

```json
{ "event_id": "evt_01K4…", "seq": 7, "duplicate": false }
```

The message is in the space, from the harness, and the **Messages** row on its card is lit.
Send the same `idempotency_key` again and nothing changes: `200` instead of `201`, and
`"duplicate": true` with the sequence number of the first. That is what makes a retry after a
dropped connection safe, and it is required, not optional — every write carries a key. A key is
yours: another harness's `hello-1` is not your `hello-1`.

Who you can talk to, with their roles:

```sh
curl -s "$CHIPS_URL/v1/participants" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"
```

## Hear what people say

A person's message is an event in the log like any other, and the log is read forward from a
cursor:

```sh
curl -s "$CHIPS_URL/v1/events?since=0&limit=100" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"
```

```json
{ "events": [ { "type": "message.post", "id": "evt_01K…", "seq": 8, "space_id": "spc_…", "actor": { "kind": "person", "id": "usr_…" }, "text": "…" } ], "next_cursor": null }
```

Keep the last `seq` you saw and ask from there next time: a restart loses nothing. `next_cursor`
is where the next page starts, and `null` once this page reached the end of the log. The read is
scoped by membership — the harness sees the spaces it is in, and nothing else.

For a stream instead of a poll, open [the WebSocket](/connect/websocket/), with a `since` that
replays what you missed. It does not send the same events: the log holds what a person posted,
`message.post`, and the socket gives a harness [`message.new`](/reference/events/message-new/),
with the sender's name and role and a URL for each attachment. A harness that catches up over
HTTP and listens on the socket rebuilds the one from the other:

| `message.new` | From the logged `message.post` |
| --- | --- |
| `message_id` | The event's `id` with `evt_` changed to `msg_`: `evt_01K…` is `msg_01K…` |
| `from.participant_id`, `from.kind` | `actor.id` and `actor.kind` |
| `from.display_name` | [`GET /v1/participants`](/reference/http/), by `actor.id`, read again when a [`person.renamed`](/reference/events/person-renamed/) says somebody changed theirs |
| `from.role` | Not in the log |
| `attachments[].url` | Not in the log: fetch `GET /v1/attachments/:id` with the bearer, which a member of the room may do |
| `text`, `mentions`, `reply_to`, `session_ref`, `space_id` | As they are |
| `addressed_to` | As it is: Chips wrote it on the `message.post` as it arrived |
| `message.overheard` rather than `message.new` | When `addressed_to` is there and does not hold your harness's id |
| `context` | Not in the log: [read the room](#what-youre-told-with-a-question) before the message's `seq` |
| `room` | Not in the log: [`GET /v1/participants`](/reference/http/) and the room's members say who is there; the note's words are `renderRoomNote` in `@chipschat/protocol` |

Skip what the harness posted itself: its own `message.post` has its own id as `actor.id`. Take a
turn only on a message whose `addressed_to` holds your harness, or has none — a message from before
Chips said who a message is for, which was for every harness in its room. The rest is context:
what was said in the room while it was somebody else's to answer (ADR 0081).

To address another harness, @ it, reply to it, or name it in `to` on your `message.post` (by id,
or `"all"`). Without one of those, what a harness says is for the people, and that includes an
answer to a harness that asked: let your model's @ decide whether the asker should act on it, or
two harnesses answering each other by `to` trade thanks until the guard stops them.

An @ reaches a participant by their whole name with the spaces left out, `@OpenClaw2` for
"OpenClaw 2", which always wins; a first word reaches one only where nobody else in the room has
it (ADR 0091). No two agents in a workspace share a name: Chips numbers one whose name is taken.

## What you're told with a question

On the socket, a `message.new` for your harness carries `context`: the room's lines since it last
spoke there. It carries `room` too: who is in the room, with the handle that reaches each, and a
note for each agent taking the turn, to put first in its turn (ADR 0092).
[The WebSocket](/connect/websocket/#what-youre-told-with-a-question) has the shapes and the budget. The log holds no `context`, since it is worked out at delivery, so a harness that
catches up over HTTP reads it from the room:

```sh
curl -s "$CHIPS_URL/v1/spaces/$CHIPS_SPACE_ID/context?limit=20" \
  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"
```

```json
{ "lines": [ { "seq": 8, "at": "2026-09-02T14:20:02.004Z", "kind": "said", "from": { "id": "usr_…", "kind": "person", "name": "Arjun" }, "message_id": "msg_01K…", "text": "…" } ], "since_seq": 0, "truncated": false, "before": 8 }
```

It answers with the newest `limit` lines of the room, oldest first. Pass `before`, a line's `seq`
or the answer's own `before`, for the ones older than that. For a message at `seq`, what the socket
would have handed you is `?before=<seq>`, keeping the lines after your own last `message.post`
there. It reads only a room your harness is in, and refuses a person's credential.

## A run

A run is what a harness does about a message: a goal, steps, an approval or two, what it cost,
and how it ended. Every event of it names the run, and the run's own route need not repeat the
space. Ids are yours to mint — a prefix and 26 characters of Crockford base32 — so a retry after
a restart names the same run:

```sh
newid() { printf '%s%s' "$(LC_ALL=C tr -dc '0-7' </dev/urandom | head -c 1)" \
  "$(LC_ALL=C tr -dc '0-9A-HJKMNP-TV-Z' </dev/urandom | head -c 25)"; }
RUN="run_$(newid)"
post() { curl -s -X POST "$CHIPS_URL$1" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" \
  -H "Content-Type: application/json" -d "$2"; echo; }
```

A real ULID starts with the time; any 26 characters from the alphabet whose first is `0` to `7`
are accepted, and Chips orders by `seq`, never by id.

**Start it**, on the harness's route, naming the space:

```sh
post "/v1/harnesses/$CHIPS_HARNESS_ID/events" "{\"type\":\"run.started\",\"run_id\":\"$RUN\",\"space_id\":\"$CHIPS_SPACE_ID\",
  \"goal\":\"Get PO #4471 confirmed with Northwind.\",\"idempotency_key\":\"$RUN-started\"}"
```

The **Runs** row lights, and the space has a run panel with that goal. A `plan` — a list of
`{step_id, title}` — draws the steps as hollow dots to fill in; without one, steps fold into
stretches between the moments that matter.

**Log a step**, on the run's route:

```sh
post "/v1/runs/$RUN/events" "{\"type\":\"step.log\",\"step_id\":\"read-po\",\"tool\":\"drive.read\",
  \"status\":\"done\",\"summary\":\"120 units, delivery 19 September.\",\"idempotency_key\":\"$RUN-read-po\"}"
```

**Steps** lights; the receipt under the run has a line. `status` is `started`, `done` or
`failed`; send `started` first for a step that takes a while, and `done` with the same `step_id`
when it ends.

**Ask before you act.** An approval is the thing a group chat cannot do: an action, a preview,
a risk class, an expiry, and it blocks until a person decides.

```sh
APR="apr_$(newid)"
post "/v1/runs/$RUN/events" "{\"type\":\"approval.request\",\"approval_id\":\"$APR\",
  \"action\":{\"kind\":\"email.send\",\"input\":{\"to\":\"dana@northwind.com\"},\"external\":true,\"irreversible\":true},
  \"preview\":{\"format\":\"markdown\",\"body\":\"Hi Dana, confirming PO #4471 for 120 units.\"},
  \"risk\":[\"external_communication\",\"irreversible\"],\"expires_in\":900,\"idempotency_key\":\"$RUN-ask\"}"
curl -s "$CHIPS_URL/v1/approvals/$APR/wait?timeout=900" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"
```

**Approvals** lights and the card is at the foot of the space, on every device you have
paired. The wait blocks until somebody answers, then returns the approval as it stands:

```json
{ "approval_id": "apr_…", "state": "resolved", "resolution": "approved", "reason": "Send it.", "resolved_by": "usr_…", "updated_input": null }
```

`resolution` is `null` while pending and `approved`, `edited`, `denied` or `expired` once
answered, so a script can loop on one field. `edited` comes with `updated_input`, and the harness
uses what the person wrote. When [policy](/concepts/policy/) decides on the spot — a read at
L2, a rule that denies — the `POST` itself answers with `resolution` and `reason`, and the wait
returns at once. An ask nobody answers within `expires_in` is resolved as `expired` by its
`fallback`, which is `deny` unless you say `allow`.

Then say what you did with the yes:

```sh
post "/v1/runs/$RUN/events" "{\"type\":\"approval.executed\",\"approval_id\":\"$APR\",\"outcome\":\"executed\",
  \"detail\":\"Sent.\",\"idempotency_key\":\"$RUN-executed\"}"
```

The card turns from *approved* to *sent*. It is not required, but without it the card stays at
approved, and `chips conformance` says so.

**What it cost, the answer, and the end:**

```sh
post "/v1/runs/$RUN/events" "{\"type\":\"usage\",\"scope\":\"run\",\"model\":\"opus-5\",\"input_tokens\":82140,
  \"output_tokens\":3402,\"idempotency_key\":\"$RUN-usage\"}"
post "/v1/runs/$RUN/events" "{\"type\":\"message.post\",\"text\":\"Confirmed with Northwind: 120 units on 19 September.\",
  \"idempotency_key\":\"$RUN-reply\"}"
post "/v1/runs/$RUN/events" "{\"type\":\"run.completed\",\"summary\":\"Confirmed PO #4471 with Northwind.\",
  \"changed\":[\"Emailed dana@northwind.com\"],\"idempotency_key\":\"$RUN-done\"}"
```

**Cost** and **Finished** light. A `usage` with no `cost` gets one from the workspace's price
table, so the meter and the audit read the same number; send `cost: { usd, estimated }` when you
know better, and leave out `input_tokens` when your model's runtime does not report them. The answer is a message in the space — a chat in which the harness's answer is only
a summary card is not a chat — and the summary is what the run panel keeps. A summary that
repeats one of your run's messages word for word — the last, or one a few back — is drawn as one
card, not two. A run that goes wrong
ends with [`run.failed`](/reference/events/run-failed/) and `error`.

That is the whole loop: nine calls, and six rows of the checklist lit. The two that are not —
**Questions** and **Context** — are [`question.ask`](/reference/events/question-ask/) for a
question with options, and [`context.usage`](/reference/events/context-usage/) for the ring,
when your harness has a window size to report. Neither is required.

## Check it end to end

```sh
chips conformance custom
```

brings up a fake Chips that speaks the wire, prints the same four lines, waits for your harness
to connect, plays the person through the golden scenario — says *Here's the signed PO. Get it
confirmed with Northwind and update the tracker.*, approves what is asked, answers a question
with its default — and prints the checklist with a note for everything a good harness would have
done differently. [Conformance](/connect/conformance/) has the report and what each note means.

## What a token may do

A token sends what a harness sends — everything under Harness → Chips in
[the reference](/reference/events/) — and nothing that travels the other way. It cannot approve
its own ask for a person, change its own policy, or answer for a person; the answer to trying is `403`
with code `forbidden`, in [the error envelope](/reference/http/#the-error-envelope) every refusal
comes in. It writes only into a space it is a member of, and reads only those; it
writes into a run its own token started, and into nothing that has ended. And it may open a
space of its own kind through one door, `POST /v1/harnesses/:id/spaces`, keyed by whatever its
adapter names a unit of work — a worktree, a Jacobian Space — which is how a harness that has
lost everything finds yesterday's spaces rather than making a second set. [Hooks](/connect/hooks/)
has each rule and what its refusal looks like.

## In TypeScript

Everything above is a dozen lines with [the SDK](/connect/sdk/): `connect({ url, token })`,
`chips.on("message.new", …)`, `runs.start`, `run.step`, `run.approval` — which resolves with the
decision — `run.usage`, `run.complete`. The SDK also keeps the outbox, the idempotency keys and
the cursor for you, and reconnects with `since`.
