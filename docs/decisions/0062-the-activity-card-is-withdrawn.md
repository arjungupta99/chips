# 0062 — The Activity card is withdrawn

**Status:** Accepted, 17 September 2026. Withdraws [ADR 0060](0060-an-activity-is-a-publishers-versioned-snapshot-not-an-open-run.md).

## Context

ADR 0060 gave a harness a second way to say what it is doing: `activity.updated`, a versioned
snapshot with a stable id and a durable revision, drawn on the phone as a card with a detail
screen. It shipped on 17 September 2026 with Jacobian's workflow boards as its first publisher.

The first live card was orphaned the same evening. Jacobian was restarted, its adapter had kept
the card's id in memory, the board moved again, and a second card was made; the first said
*Working* and always would, because only its publisher could end it and its publisher no longer
knew it existed. The proper fix for that class was planned in four phases: a publisher's own key
on every snapshot, a route to list one's own Activities, a structured conflict error, an adapter
that adopts, recovers and reconciles at every hello, an event to close a card by hand, and a
line saying how old a quiet card is. Part-way through the first phase Arjun asked whether all of
it was only to support the card. It was, and he asked for the card to go.

What the card said was already being said. A board's progress reaches Chips as a plain ⚙️
message that Jacobian edits in place, which every client draws, which needs no protocol of its
own, and which cannot be orphaned: it is a message.

## Decision

The Activity feature is removed from Chips entire: the `activity.updated` event and the
`activities.v1` feature string (and the hello's `features` field, which carried nothing else),
the `act_` id, the server's write rules and projection, the core fold and selectors, the phone's
card, header symbol, browser and detail screens, the SDK's `publishActivity`, the scripted
example, the guide and the generated reference. Jacobian's adapter stops publishing them, in its
own repository.

Migration `0023` stays in the list, because databases have applied it, and `0024` drops its
table. `activity.updated` events already in a log stay there, as every event does: the server
has no projector for them and every client ignores an event it does not know.

What landed beside the feature stays: the bubbles' scrolling colour field, the source tints, the
long-press actions, reply provenance, and [ADR 0061](0061-the-room-moves-by-transform-and-redraws-by-difference.md)'s
rules for the room.

## Consequences

A harness reports work the way it did before: a run with its steps and receipts when there is
one, and a message it edits in place when there is not. One thing to build and one thing to
keep working.

The lesson is about proportion. A second channel for state brought a second identity to keep
durable on the far side of a network, and the machinery to make that safe was larger than the
card. The next proposal that adds publisher-held state should say, before it is built, what
happens when the publisher forgets.
