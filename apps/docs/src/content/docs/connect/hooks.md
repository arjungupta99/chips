---
title: Hooks mode
description: An approval in one shell script. Each hook makes one HTTP call.
sidebar:
  order: 3
---

For a harness with lifecycle hooks, Chips needs no changes to the harness loop. Each hook makes one
HTTP call, with the four environment variables [Custom](/connect/custom/) starts from:
`CHIPS_URL`, `CHIPS_HARNESS_ID`, `CHIPS_HARNESS_TOKEN` and `CHIPS_SPACE_ID`.

## An approval in one shell script

A `PreToolUse` hook posts an approval request and blocks until a person decides. Chips pushes the
card to their phone meanwhile. A non-zero exit is a refusal to the harness.

```sh
#!/bin/sh
# The harness pipes the tool name and input on stdin. The run's id was minted by the hook that
# started the run and left in $CHIPS_RUN_ID; the approval's is minted here, so a retry is the
# same ask.
payload=$(cat)
newid() { printf '%s%s' "$(LC_ALL=C tr -dc '0-7' </dev/urandom | head -c 1)" \
  "$(LC_ALL=C tr -dc '0-9A-HJKMNP-TV-Z' </dev/urandom | head -c 25)"; }
approval="apr_$(newid)"

id=$(curl -s -X POST "$CHIPS_URL/v1/runs/$CHIPS_RUN_ID/events" \
  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -n --argjson p "$payload" --arg id "$approval" \
    '{type:"approval.request", approval_id:$id, idempotency_key:($id + "-ask"),
      action:{kind:$p.tool_name, input:$p.tool_input},
      risk:["external_communication"], expires_in:900}')" | jq -r .approval_id)

# Block until a person decides.
decision=$(curl -s "$CHIPS_URL/v1/approvals/$id/wait?timeout=900" \
  -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" | jq -r .resolution)

[ "$decision" = "approved" ] && exit 0
echo "Denied in Chips" >&2
exit 2
```

## What each call does

| Call | What happens |
| --- | --- |
| `POST /v1/runs/:id/events` | The event is validated, appended, and its projections updated in one transaction. The response carries the `seq` it landed at, and `approval_id` for an approval request. |
| `GET /v1/approvals/:id/wait?timeout=` | Blocks until somebody answers. It reads before it waits, so a decision made in the gap is returned at once, and it is woken by the log rather than by a timer. On timeout it returns the approval as it stands. |

`resolution` is `null` while pending and `approved`, `edited`, `denied` or `expired` once
answered, so a script can loop on one field without parsing a state machine.

When [policy](/concepts/policy/) decides on the spot — the harness's level allows the action, or a
rule denies it — the `POST` itself answers with `resolution` and `reason`, and the wait returns
at once. An approval nobody answers by `expires_in` is resolved as `expired` by its `fallback`.

## Every write carries an idempotency key

Send the same key twice and the second call changes nothing, returns `200` instead of `201`, and
reports `"duplicate": true` with the sequence number of the first. That is what makes a retry
after a dropped connection safe — and it is required, not optional. The key goes in the event as
`idempotency_key`, or in an `Idempotency-Key` header; either is read. A key is the sender's own:
another harness's `hello-1` is not yours, and a person's key never collides with a harness's.

## Authentication

A harness presents `Authorization: Bearer <token>`. Tokens are 256 bits, shown once, stored only
as a digest, scoped to one harness, and revocable from that harness's profile.

A token sends what a harness sends — everything under [Harness → Chips](/reference/events/) — and
nothing that travels the other way. A harness cannot approve its own ask for a person, change its
own policy, or answer for a person: those take a person's device key, and the answer to trying is
`403` with code `forbidden`. The one answer a harness sends is to its own ask, when a person
answered it in the harness's own tools; see
[Answered somewhere else](/concepts/approval/#answered-somewhere-else). The one thing both send is a message: a person posts `message.post`
from the composer, a harness posts it from a run. Nobody sends what Chips delivers (`hello`,
`message.new`) or works out for itself (`budget.warning`, `lane.updated`).

A credential also writes only into a space it is a member of — the same rule that scopes
what it reads. An event naming any other space is `403` with code `forbidden`, whoever
sends it. Whoever opens a space is its first member.

A harness opens a space through one door, and only its own kind of space:
`POST /v1/harnesses/:id/spaces` with `{ key, title }`, where `key` is whatever its adapter names
a unit of work by — a worktree's path, a Jacobian Space's id. The key is stored on the space,
prefixed with the harness's own id, and unique in the workspace, so the same key finds the same
space every time after: a harness that has lost everything finds yesterday's spaces rather than
making a second set. What it gets is a direct space with itself and its owner in it, opened for
the owner. That is the one exception to "a person opens spaces", and it is enforced on the
server, not trusted to the adapter.

## Every run is somebody's

An event that carries a `run_id` names a run that exists — one that began with
[`run.started`](/reference/events/run-started/), in a space — and, when a harness sends
it, one that harness's own token started. The run's state has a say too: nothing is accepted into
a run that has ended but the answer to something it asked — an approval's decision and what
became of it, a question's answer — a run that is not running cannot be paused, and one that is
not paused cannot be resumed.

Each answer is a status, with the code and the reason in
[the error envelope](/reference/http/#the-error-envelope) every refusal comes in.

| What was sent | Answer |
| --- | --- |
| An event for a run nobody started | `404` `not_found` — a run begins with `run.started` |
| A harness's event for another harness's run, or a run in another space | `403` `forbidden` |
| Anything into a run that has ended, bar an answer to its approval or its question; a pause of a run not running; a resume of one not paused | `422` `invalid_event`, with the reason |

A hook that posts to `/v1/runs/:id/events` need not repeat the space: the run knows it,
and an event that names the run and not the space lands in the run's. A `usage` that
carries no `cost` gets one from the workspace's price table, so the meter and the audit read
the same number; see [Run](/concepts/run/#cost).
