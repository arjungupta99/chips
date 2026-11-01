---
title: The envelope
description: The fields every Agent Connect event carries.
sidebar:
  order: 2
---

Every event is an envelope plus a payload. The envelope is the part Chips itself reads.

| Field | Required | Type | What it is |
| --- | --- | --- | --- |
| `v` | yes | `1` | Protocol major version. |
| `type` | yes | `string` | The event type, for example `approval.request`. |
| `id` | yes | `evt_<ULID>` | The event's own id. Stable across a retry of the same event. |
| `ts` | yes | ISO 8601 | When it happened, by Chips' clock. Stamped on the way in. |
| `workspace_id` | yes | `ws_<ULID>` | Which workspace. |
| `space_id` | no | `spc_<ULID>` | The space, when the event belongs to one. |
| `run_id` | no | `run_<ULID>` | The run, when the event belongs to one. |
| `seq` | no | integer | Assigned by the server on append, monotonic per workspace. Absent on the way in. |
| `idempotency_key` | no | `string` | Required on every client-originated write. Sending the same key twice from the same credential is a no-op; a key is the sender's own. |
| `actor` | yes | object | Who acted: `{ kind: "person" | "harness" | "system", id }`. |

## Identifiers

Every id is a prefixed ULID, so it is sortable by creation time and says what it points at:

`ws_` workspace · `usr_` person · `hrn_` harness · `spc_` space · `msg_` message ·
`run_` run · `stp_` step · `apr_` approval · `qst_` question · `lane_` lane · `att_` attachment ·
`evt_` event · `dev_` device · `tok_` token

## What the server fills in

A client may omit `v`, `ts`, `workspace_id`, `actor` and `id`; the server supplies them from the
credential and the clock. It may not *change* `workspace_id` or `actor`: an event may only be
sent by its own sender, into its own sender's workspace, and attempting either is a `403`.

Some fields the server always writes, whatever the client sent, because they say who did
something and when and that is not the sender's to choose: `ts` on every event, and on a
decision the fields that attribute it — `resolved_by` and `resolved_at` on `approval.resolved`,
`answered_by` and `answered_at` on `question.answered`, `by` on `run.pause`, `run.resume` and
`run.cancel`, and `changed_by` on `policy.updated`. A client may leave them out; a value it
writes is replaced with the credential that signed the request and the server's clock.
