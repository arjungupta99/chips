# 0004. An append-only event log is the truth

2 September 2026 · Status: accepted

## Context

The blueprint promises an audit log that is append-only, exportable and never editable, and a
supervision story where every agent action and every human decision can be replayed. A
conventional mutable schema with an audit table written alongside it drifts the moment a write
path forgets to log.

## Decision

An append-only `events` table per workspace with a monotonic `seq`. Every Agent Connect event
and every human action is an event. Projections — conversations, messages, runs, approvals —
are updated in the same transaction that appends the event. The audit log is a read of the
events table, never a separate write. `rebuild(workspace)` drops projections and replays.

## Consequences

- The audit log cannot disagree with the application state, because it is the same rows.
- Read models are per screen and rebuildable, so a screen can change shape without a migration
  of historical truth.
- A property test generates random valid event sequences, applies them, rebuilds from zero and
  asserts identical projections. That test is the contract.
- Events are immutable: a correction is a new event, never an edit.
