# 0035. A thread is a space with a parent, a message is changed by events, and search is a projection

6 September 2026 · Status: accepted

Decided in Phase 5 · People, for M5.4 (messaging depth): threads, reactions on anyone's message,
edit, delete, pin, and search over messages and receipts.

## Context

Until M5.4 a message was said once and stood: the blueprint's eleven message kinds, feedback on
a harness's own words (ADR 0031), and a flat room. The plan's M5.4 asks for threads, reactions on
anyone's message, editing, deleting, pinning, and search over messages *and receipts* — fifty
thousand messages, under 200 ms — without breaking the two things every earlier decision leans
on: the log is the truth and the read models are a function of it (ADR 0004), and who may read
what is membership, checked at the door and at delivery (phase-0-review finding 6).

Three questions: what a thread *is*, what happens to the log when a message is edited or taken
back, and where search lives.

## Decision

1. **A thread is a space with a parent.** `space.created` gains `parent_space_id` and
   `root_message_id`; a space with a parent is a thread, and only a thread has one. A thread has
   **no members of its own**: whoever is in the parent is in the thread, and leaves it with the
   parent. The read models resolve a thread's standing through its parent (`memberRole`,
   `membersOf`, `spacesForMember`), the projection writes no membership row for it, and
   `membership.added` into a thread is refused (rule 13). Visibility follows: the event that
   opens a thread is delivered to everyone in the parent, a live session learns the thread from
   it, and a removal from the parent re-reads membership so the parent's threads go with it. A
   thread grows from one message, which roots one thread; it is not opened in a thread, in a
   closed space, or from a message taken back.

   The alternative — replies as messages with a `thread_id` inside the parent space — was
   rejected because every scoping rule, read model and client fold already knows what a space
   is; a thread that *is* one costs a parent pointer, where a thread that is not one costs a
   second membership model.

2. **A message is changed by events, and the log keeps the words.** `message.edited` and
   `message.deleted` are appended like anything else, by the author (rule 12: an edit is the
   author's alone; a deletion is the author's, the space's owner's, or a workspace owner's or
   admin's). The projection patches the row: the latest text with `edited_at`, or `text = null`
   with `deleted_at`, its attachments and its pin gone. The `message.post` that carried the
   original words is not touched — a rebuild reproduces the same rows, and the audit says who
   edited and who took back. Taking back is therefore *not* erasure: the words leave every
   screen and the search index at once, and remain in the log for whoever can read the log. A
   message taken back is left alone afterwards: no edit, no pin, no feedback; a second deletion
   or an unpin of it is a harmless retry.

   `message.pinned` and `message.unpinned` are a person's, in the space, not a guest's; `pins` is
   their projection. A reaction (`feedback` with `kind: "reaction"`) goes on **anyone's** message
   now, and a correction still only on a harness's, since a harness is who reads it (ADR 0031's
   delivery rule is unchanged: feedback reaches the harness whose message it is, and every
   person in the room). The client folds the same reaction from the same person again as taking
   it back — a tap is a toggle — and ignores a re-delivered event.

3. **Search is a projection kept by triggers.** Two SQLite FTS5 tables, `messages_fts` and
   `steps_fts`, hold the text of messages and of steps (a receipt's title and summary) with
   their space, time and author as filter columns; triggers on `messages` and `steps` keep them
   in step, so an edit is findable and a deletion is not, and a rebuild reproduces them because
   the tables they follow are themselves rebuilt. They are *not* external-content tables:
   `messages` is keyed by a text id and the rowid an external-content index hangs on is not
   stable. `GET /v1/search?q=` runs an FTS5 query — every word required, the last a prefix — over
   the caller's spaces, threads included, newest first with a keyset cursor, the match marked in
   a snippet with private-use codepoints. The ceiling is a test: fifty thousand messages in one
   room, four queries, each under 200 ms.

   Postgres (Phase 6) gets its own migration for these — `tsvector`, a generated column and a
   GIN index — behind the same port. The port is the contract; the dialect is the migration's.

## Consequences

- Rules 12 and 13 join the door (`server/src/domain/authorize.ts`); rule 10 is relaxed for
  reactions. The conformance kit's shared-events list gains `message.edited` and
  `message.deleted`, since a harness may change and take back its own words.
- The client's `Space` carries `parentSpaceId`, `rootLineId` and `pins`; a `Line` carries
  `editedAt`, `deleted`, `threadId`, `replyCount` and `lastReplyAt`. A reply in a thread brings
  the parent forward and moves its unread count, since a thread is the room's news. A thread is
  never the room on screen: it opens beside one, in the column the run panel uses.
- The `queued` receipt (Phase 3 review, finding 10) is settled by the harness's next line in the
  space: a room full of answered questions no longer says QUEUED on each.
- Not done here, and known: removing a message's attachments' bytes when it is taken back (the
  blob store keeps bytes by digest, shared across messages; a sweep is Phase 6's), and search
  over attachments' text. Editing carries no new `mentions`.

## Addendum, Gate 5 (6 September 2026)

Decision 3's index was kept in step by triggers that wrote FTS5 inside every append, and found
the row to replace by a column FTS5 does not index. The gate ran the append-and-replay
benchmark the packet had not: ten thousand `step.log` events appended and replayed in 10.7 s
against a two-second budget — the replay alone 9.0 s, a scan of the index per row — where
Gate 3's code did it in 1.5 s on the same machine the same day. Keyed by rowid the scan went
and the run took 3.0 s; FTS5 flushes a segment on every commit, and the index cost more per
event than the log and its projections together.

So the index is off the append path (migration `0012-search-off-the-request-path`; the Phase 5
review, finding 4). A change to a message or a step is a row in `search_queue` — append-only,
one plain insert, a change made twice queued twice — written by the triggers; `drainSearchIndex`
folds the queue's distinct keys into the index in one transaction — before every search, so a
hit is never stale, and on the sweep's timer, so the queue never grows long. A deletion, and a
message taken back, leave the index at once, by rowid. Each index has a map beside it
(`messages_fts_map`, `steps_fts_map`) whose integer primary key is the FTS row's rowid — stable
under VACUUM, which the base tables' own rowids are not, and which is why decision 3 did not use
external-content tables. A rebuild drops the triggers, clears the workspace's index and map rows
in two statements, replays, queues everything in two more and puts the triggers back, all in its
own transaction: ten thousand rows deleted and written again cost no trigger work. The benchmark
reads 1.7 to 2.0 s under a load average of ten, against 1.5 to 1.6 s for Gate 3's code on the
same machine in the same hour; the fifty-thousand-message ceiling holds, with the fold of fifty
thousand queued rows under ten seconds and each query still under 200 ms. What it costs: a hit
is as fresh as the last drain, which a search itself makes now; a drain after a long replay is
one large transaction, which the sweep will usually have taken first.

## Addendum, 15 September 2026: the offer is withdrawn from both clients, for now

Decision 1 stands on the wire: a thread is a space with a parent, the door and the read models
know it, search reads it, and a harness may open one. What is withdrawn is the *offer* — *Reply
in a thread* in both clients' line menus, the desktop's panel beside the room, and the reply
count under a line — on Arjun's call after reading the Chess Game room on his phone. The menu
opened a thread space the moment it was chosen, so a look in and back left an empty thread in
the log and *In a thread* under the message for good; and a room read like Messages, against a
harness that has no such concept, had no use for a second place to reply. A reply to a message
in the same room is the shape he wants, if one is wanted at all, and that is a different feature
(`reply_to`, which the wire already carries). A thread the log already holds still opens from a
link on the phone, named as one, and a search hit in it opens its room on the desktop.
