---
title: Frames
description: The WebSocket frames, and what each one is for.
sidebar:
  order: 3
---

Frames are the envelope around events on `/v1/ws`. They carry the handshake, subscription,
acknowledgement and liveness that the event vocabulary itself does not.

| Frame | Direction | What it does |
| --- | --- | --- |
| `hello` | client → server | Announces the protocol range the client speaks, who it is, the frames beyond the base set it understands (`accepts`; a name the server does not know is ignored, not refused, so a newer client is still answered by an older server), and, for a harness, how much of a room it is handed with a question (`context: { lines, chars }`, 40 and 16,000 when absent; ADR 0088, ADR 0249). Answered with a [`hello`](/reference/events/hello/) event naming the token's one harness. A `harnesses` list or a `since` in it is ignored: a connection is its token's, and a stream resumes from `subscribe`. |
| `subscribe` | client → server | Starts a stream, by workspace or by space, optionally from a `since` cursor. |
| `event` | both | Carries one Agent Connect event. |
| `events` | server → client | A page of up to 500 events of a replay, in `seq` order. Sent only to a client whose `hello` said `accepts: ["events"]`; live events are always single `event` frames. |
| `ack` | server → client | `{ idempotency_key, seq, duplicate }` — what happened to a write. |
| `receipt` | server → client | Whether a mid-run message was `queued` or `steered`. |
| `presence` | server → client | A harness's state changed: `{ participant_id, state: { connected, since, trouble?, restarting? } }`. Sent only to a person's socket whose `hello` said `accepts: ["presence"]`, and never to a guest's (ADR 0083). `restarting: { since, by }` while a restart a person asked for stands (ADR 0094). |
| `restart` | server → harness | A person asks the harness to restart: `{ asked_by, asked_at }` (ADR 0094). Sent only to a harness's socket whose `hello` said `accepts: ["restart"]`, now or never: it is not in the log, so a reconnect never hears it again. Run your own restart. |
| `join` | server → client | A join request is waiting, or changed: `{ request: { request_id, kind, state, started_by, code?, name?, software?, machine?, from_addr?, wants, capabilities, url, … } }` (ADR 0122). Sent only to an owner's or admin's socket whose `hello` said `accepts: ["join"]`, now or never; `GET /v1/join` reads what is waiting after a reconnect. Never carries the secret. |
| `context.edit` | server → harness | A person changed a context file: `{ edit_id, harness_id, agent_id?, name, text, base_hash, asked_by, asked_at }` (ADR 0134). Sent only to a harness's socket whose `hello` said `accepts: ["context"]`, now or never. Answer with the copy, `answers` or `refuses` naming `edit_id` ([Managed from Chips](/connect/managed/#context-files)). |
| `model.change` | server → harness | A person changed an agent's model or effort: `{ change_id, harness_id, agent_id, model, effort, asked_by, asked_at }`, `model: null` for the default (ADR 0140). Sent only to a socket that said `accepts: ["models"]`, now or never. Answer with the agent's copy. |
| `heartbeat.change` | server → harness | A person switched an agent's heartbeat or changed how often it beats: `{ change_id, harness_id, agent_id, on, every, asked_by, asked_at }` (ADR 0143). Sent only to a socket that said `accepts: ["heartbeats"]`, now or never. Answer with the agent's copy. |
| `context_window.compact` · `context_window.change` | server → harness | A person asked an agent to compact now, `{ change_id, harness_id, agent_id, asked_by, asked_at }`, or changed the limit it compacts itself at, the same with `at` (ADR 0146). Sent only to a socket that said `accepts: ["context_windows"]`, now or never. Answer with the agent's copy, and for a compaction again when it is done. |
| `ping` | both | Heartbeat, every 20 seconds. |
| `pong` | both | The answer, echoing the timestamp. |
| `error` | server → client | A closed set of codes, so a client can branch without parsing prose. |

## Shapes

What a client sends:

```json
{ "frame": "hello", "protocol": { "min": 1, "max": 1 }, "client": { "name": "scout", "version": "0.1.0" }, "accepts": ["events"] }
{ "frame": "subscribe", "workspace_id": "ws_…", "since": 41 }
{ "frame": "event", "event": { "type": "message.post", "space_id": "spc_…", "text": "On it.", "idempotency_key": "scout-msg-7" } }
{ "frame": "ping", "ts": 1790000000000 }
```

An `event` frame carries the event whole, and its `idempotency_key` goes inside `event`, not
beside it: an event with no key of its own is answered `invalid_frame`. Chips fills in `v`, `id`,
`ts`, `workspace_id` and `actor` from the credential and its own clock, so the event needs its
type and its fields, and the space or run it belongs to.

What comes back:

```json
{ "frame": "event", "event": { "type": "message.new", "seq": 42, "message_id": "msg_…", "from": { "participant_id": "usr_…", "kind": "person", "display_name": "Dana" }, "text": "…" } }
{ "frame": "ack", "idempotency_key": "scout-msg-7", "seq": 43, "duplicate": false }
{ "frame": "error", "code": "forbidden", "message": "…", "idempotency_key": "scout-msg-7" }
```

An `error` names the key of the frame at fault when there was one, so a client can drop that
event from what it resends. `apps/docs/samples/write-and-catch-up.ts` sends these to a real server
on every push. The schema for every frame is in
[`packages/protocol/src/frames.ts`](https://github.com/arjungupta99/chips/blob/main/packages/protocol/src/frames.ts).

## Error codes

`protocol_unsupported` · `unauthorized` · `forbidden` · `not_found` · `invalid_event` ·
`invalid_frame` · `rate_limited` · `too_far_behind` · `budget_exhausted` · `internal`

`too_far_behind` is the one that is not a mistake: it means reconnect and resume with `since`.
