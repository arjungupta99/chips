# 0067 — A space can be erased, and the log keeps one line saying so

**Status:** Accepted, 22 September 2026. Amends ADR 0004's *events are immutable*. Amended by
[ADR 0069](0069-a-delete-reaches-the-harness-and-its-home-is-always-there.md), 25 September 2026:
a delete reaches the harness, and a harness's home is never erased.

## Context

Arjun asked for Delete beside Archive on the Spaces list (ADR 0066). Two ways to do it were put to
him with their costs:

- **D1**: delete hides the room from every list and from search, and the log keeps what was said,
  the way `message.deleted` does (ADR 0035).
- **D2**: delete erases the room from the server: its events, the rows built from them, its files
  and its search entries.

He chose D2. That is the first time anything takes events out of the log. Until now the log was
the whole truth (ADR 0004): every screen is a projection of it, and a rebuild makes the same
projections again.

## Decision

1. **`DELETE /v1/spaces/:id`**, a person's.
   - Who may: the room's owner, or a workspace owner or admin who is in it. Never a guest, never a
     harness. A person not in the room is told `not_found`, as for a room that does not exist.
   - What may not be erased:
     - a thread, which goes with the space it grew in;
     - a direct space nobody can open again: the one a harness was handed when it was added, or
       two people's. Those are archived instead.
   - A room a harness opened under a key of its own may be erased, direct or not. That covers
     every Jacobian room, J's included.
   - So may a room a person asked a harness for from the + (`asked_of`,
     `docs/proposals/new-space.md`), claimed or not; added 24 September 2026 on Arjun's word. A
     harness that never took it up is no way anybody reaches anybody, and one that claims it after
     the erase is told there is no such room.
2. **One transaction, in the event store** (`erase`):
   - The tombstone's `seq` is taken first, past everything the room held. `seq` is `max + 1`, so
     deleting the newest events would otherwise hand out numbers devices have already passed.
   - The room's events, and its threads', are deleted.
   - So are the rows kept beside the log for them: faces (`space_icons`), pinned visits
     (`session_pins`) and banner claims for its asks (`notification_claims`).
   - The projections are rebuilt from what is left. They then equal what a later replay would
     make, and lanes, spend and attachment rows that crossed into other rooms come out right
     without special cases. On Arjun's log of 4,464 events a rebuild takes 0.2 s.
   - What the room cost is carried in the tombstone's `spent` and put back on each harness's
     account by its projection. A budget is not topped up by erasing where the money went, live or
     after a replay.
   - Uploads nothing refers to any more are removed from `uploads`: no attachment row, and no event
     left in the log (a lane's copy of its files in the lead's room counts). So are those uploads'
     digests that no other upload anywhere shares.
3. **After the commit:**
   - The files for those digests are unlinked. A file cannot be put back if the transaction rolls
     back, so this waits.
   - The search index is merged (`optimize`) so no old segment keeps the words.
   - The write-ahead log is checkpointed and truncated.
   - `secure_delete` is on for the whole erase, so freed pages are zeroed rather than left
     readable.
4. **`space.erased`**, a workspace event, is the tombstone. It carries `erased` (the space and its
   threads) and `spent`, and has no `space_id` in its envelope. An event that names a space
   creates that space on any device that folds it, older clients included. Having none, it goes to
   everyone in the workspace, harnesses included. It is system-only: the door refuses it from any
   sender.
5. **Devices forget the room.**
   - Core folds `space.erased` by forgetting the rooms, their threads and the lanes that lived in
     them.
   - The store drops their events from the cache and from the queue to it, withdraws messages
     still waiting to go into them, and drops their read marks, pinned visits and faces.
   - The store then calls `onErased` with the rooms as they were. The phone uses it to drop the
     room's draft, the files it kept for its attachments, and any lock-screen answer still owed
     into it.
   - A device that was away learns the same thing twice over: the tombstone arrives in its replay,
     and the server's `hello` no longer lists the room.
6. **Lanes do not write into an erased room.** A lane whose lead's room was erased still names that
   room, because the request that opened the lane is the specialist's room's history. Its news
   goes only to rooms that still exist.
7. **A harness's key is freed.** Its next `POST /v1/harnesses/:id/spaces` for the key opens a new,
   empty room. Jacobian's adapter forgets the erased room when the tombstone arrives, and (since
   ADR 0069) deletes the Space behind it.

## Consequences

The log is no longer the complete record. It is a complete record of what is still there, plus a
line for each room erased: which room, by whom, when, and what it cost. `rebuild` still reproduces
the server exactly, and the live-equals-rebuilt test covers an erase.

The erase rebuilds every projection in the workspace, which holds the write lock for the rebuild's
length: 0.2 s for 4,464 events here, and longer as a log grows. A targeted delete would be faster.
But it would have to repeat, table by table, what each projector does across rooms. That is the
drift a rebuild cannot have. Revisit when a workspace's log makes the pause felt.

Since the projections are rebuilt, an erase also settles any drift a live database already had. On
Arjun's database that means `title_by` filled in for rooms opened with a title before migration
0008 wrote it, and the workspace policy's `updated_seq` taken from the policy event the log still
holds.

Backups made before an erase still hold the room: the `.chips/chips.db.bak-*` copies, and anything
`chips export` wrote. So does anything a harness kept of its own.

A room of a live Jacobian Space came back, empty, the next time Jacobian spoke for it or started,
and the way to be rid of one for good was to archive it first. That was the wrong answer: see
ADR 0069, under which Jacobian deletes the Space and a restart brings nothing back.
