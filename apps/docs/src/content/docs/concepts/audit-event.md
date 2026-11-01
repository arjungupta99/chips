---
title: Audit event
description: An append-only record of every harness action and every human decision. Exportable, never editable; a deleted space leaves one line saying so.
---

The audit log is not a log *of* the application. It **is** the application.

Every Agent Connect event and every human action is appended to a per-workspace `events` table
with a monotonic `seq`. The read models a screen uses — spaces, messages, runs, steps,
approvals — are updated in the *same transaction* that appends the event, and can be dropped and
rebuilt from the log at any time.

Two things follow, and they are the reason for the design.

1. **The audit cannot disagree with the application.** They are the same rows. A conventional
   schema with an audit table written alongside it drifts the moment a write path forgets to log.
2. **A new screen is a replay, not a migration.** Read models are per screen and rebuildable, so
   changing what a screen shows does not mean changing what is true.

## What an event carries

Every event, whatever its type, carries the same envelope: the protocol version, the type, an id,
a timestamp, the workspace, the space and run when it has them, the sequence number the
server assigned, and **who acted**. See [the envelope](/reference/envelope/).

Events are immutable. A correction is a new event, never an edit.

The one exception is an erase ([ADR 0067](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0067-a-space-can-be-erased-and-the-log-keeps-one-line-saying-so.md)):
a person may delete a space, and its events go from the log with everything built from them. The
erase is itself an event — `space.erased`, naming the space and who erased it — so the log still
says that something was there, and when and by whom it went, and a rebuild from it still makes
exactly what the server holds.

## Resuming

`seq` is what makes a stream resumable. A client reconnects with `since` and receives exactly the
events it missed, once — including events appended while its replay was still running. That is a
tested invariant, not a hope.

## What is *not* in the log

Identity and credentials: workspaces, participants, devices and harness tokens are a registry, not
projections. A hashed harness token and an Ed25519 public key are not things an exportable log
should be able to reconstruct, and nothing in the audit story needs them to be — "who did what,
when" is answered by the `actor` on every event.
