# 0060 — An Activity is a publisher's versioned snapshot, not an open run

**Status:** Withdrawn, 17 September 2026, by [ADR 0062](0062-the-activity-card-is-withdrawn.md). Accepted for implementation on 16 September 2026; the feature shipped for a day and was removed entire. Kept as the record of what was decided.

## Context

Arjun approved the Activity and chat refinement mocks and requested implementation. Work can
outlive a conversational run, and keeping a run open would change message queueing. Chips
exposes generic hooks; each harness owns its adapter (ADR 0051). No harness-specific data
access, text parsing or workflow model belongs in Chips.

## Decision

`activity.updated` publishes a complete snapshot under a stable `act_` ULID, scoped to one
space and its authenticated harness publisher. It needs no run. A positive safe-integer
`revision` is durable publisher state. Higher revisions replace every optional field; omitted
fields clear. Terminal work may reopen with a higher revision. Separate work gets another ID.

The snapshot holds title, state, optional summary, ordered items with stable IDs, concurrent
current-item IDs, display attribution, outcome text/message references, attention references
to real Chips asks, source timestamp, and an optional fallback message ID. States are queued,
working, waiting, review, blocked, completed, failed and cancelled. There are at most 48 items,
16 attention/outcome references, 160 title characters, 4,000 summary characters, 600 characters
per item description, and 64 KiB of accepted event JSON (including its envelope). Outcome
messages can carry attachments. IDs and cross-references are validated.

Ownership, revision and fallback binding are checked inside the event append transaction.
An exact revision retry is a no-op even under a new transport key. A conflicting equal or stale
revision is rejected. Existing idempotency keys still return their original receipt after
later revisions. An activity cannot change space, publisher or fallback message. The fallback
must belong to that publisher in that space; if it has not arrived yet, clients bind only once
the matching authored message arrives. No other message is hidden or guessed from its text.

The normal event log, WebSocket replay, SQLite/browser cache and core fold are the sole delivery
path. The server has a rebuildable current-snapshot projection; there is no polling endpoint.
Core keeps bounded recent changes (20), and all three mobile surfaces read the same projection.
Removing space access clears its Activities along with the rest of that space.

An Activity's initial row is anchored to its first accepted event, or its explicit fallback
message once available. Subsequent revisions keep its position. Linked messages follow normal
message read rules; unlinked Activities and all Activity updates are quiet: no unread count,
notification or room sorting bump. Existing asks retain their own attention/read rules.
Counts mean completed items out of known items, never effort percentages or an ETA. Cancelled
items are counted separately. No items means no progress meter.

Needs you comes only from unresolved, visible references the viewer can actually answer using
existing authorization. A review state alone is not Needs you. Connection state and source
update time are separate. Working animation stops offline, offscreen, in background and under
Reduce Motion; a quiet source does not become failed just because time passed.

The handshake advertises `activities.v1`; the SDK checks support. Old clients ignore unknown
events, so publishers targeting them send a plain-text fallback and link its message ID. The
new mobile client renders the rich card; the web client retains a readable text representation.
No legacy status text is backfilled. The generic example proves the feature without any other
harness repository. External adapter adoption is a separate release step.

The approved Orbit/card/detail composition remains. Review/waiting are still neutral,
blocked/failed use explicit text plus a warning mark, cancelled is muted, offline says cached,
empty has a quiet entry point, and several Activities open a list before detail. Unknown totals
omit the meter; long titles wrap in detail. These extend the existing mock's state vocabulary
without changing its layout or adding actions that the protocol cannot perform.

## Consequences

Publishers must persist IDs/revisions and republish on meaningful source changes and recovery.
Chips does not observe a harness's database or infer work from chat. New server migration and
client builds are required; a legacy live harness continues to show its original text until
its own adapter adopts the public hook. Live service restarts remain separate operations.
