# 0049. A client resumes from a cursor it recorded, not from what its cache holds

11 September 2026 · Status: accepted

Decided in Phase 4 · Mobile and the relay, after the phone's cache was found to have dropped
whole batches of events (STATUS, 11 September 2026, small hours).

## Context

A client keeps the events it has been sent in a cache — IndexedDB in the browser, SQLite on the
phone — folds them at launch so there is something to show before the network answers, and then
subscribes with `since`, the point from which the server replays what the client has not seen
(ADR 0005). Until now `since` was the highest `seq` in the cache.

On 11 September 2026 the phone's cache was found holding seq 4476 and 4482 with nothing between.
Two batches had been written within milliseconds, the second's transaction failed inside the
first's, and the cache swallowed the failure. The store resumed from 4482, the server replayed
from there, and the five events that ended a run were never asked for again: a finished lane
showed as *Working*, and a thinking bubble stood in a room, after every relaunch. The write was
serialised the same day. The resume rule is what let one lost write last for ever.

The obvious repairs do not work, because a cache is full of gaps that are nobody's fault. The
replay sends a device only the events it may see — its spaces, the membership events that name
it, the approvals that name it (`VisibilityScope`) — and moves its cursor past the rest without a
word, so that a paged replay never looks like a gap (ADR 0043, rule 4). On the development
server the workspace's owner is in 14 of its 58 spaces; 98 of the 662 events in the log are not
his to see, and the first of them is seq 2. "Resume from below the first gap" would replay the
whole visible log at every launch; "drop a cache with gaps" would drop every cache. (The log
itself has holes as well: 662 rows under a head of 4569, after rows were deleted by hand on 9
September.) Nor can the server say more. Its `deliveredSeq` counts the events it skipped, and it
dies with the socket; a per-device cursor kept on the server would say where the server got to,
not what reached the device's disk. The one party that knows whether an event it was sent
reached its disk is the client, and it knows only after the write.

## Decision

1. **The cache records a cursor**: the `seq` up to which every event this device was sent is in
   it. `Cache` gains `loadCursor` and `saveCursor`, a `meta` row beside read state and the outbox
   in both caches. The store subscribes with `since: cursor`.

2. **The store writes one batch at a time and claims the cursor behind it**, only once the batch
   has landed. The claim is the socket's highest delivered `seq` as it stood when the batch was
   taken: by then every event delivered up to it was in the cache, in this batch, or in the batch
   before — which landed first, or was put back at the front of this one.

3. **A batch the cache refuses claims nothing and is written again** with the next flush, ahead
   of what arrived after it. `saveEvents` is the one cache method that lets its failure through;
   every other method still answers with nothing, because a client without storage must still
   run. A cache that reports success and drops the batch is beyond any client's repair.

4. **A cache with no cursor is read from the start, once.** That is every cache from before this
   decision, and every fresh one. The replay is deduplicated on arrival — only what the cache
   lacks is folded and written — and the cursor is recorded at the end of it, so the next launch
   resumes. It is also how a cache that already has a hole heals: the phone's, without being
   dropped.

5. **The cursor is the socket's, not the log's.** A room's history read over HTTP after a live
   join (M3.3) is cached, but its `seq`s do not move the cursor: they are the room's, above and
   below the socket's position, and the socket will deliver — or has delivered — whatever of
   them it owes.

6. **Nothing changes on the server**, and nothing on the wire.

## Consequences

- The invariant is a commit point, not an inference: `since` is never derived from the cache's
  contents. A lost cursor write costs a longer replay next time and nothing else; a cursor ahead
  of the cache is the one thing that cannot happen, short of a cache that lies.
- The first launch of every existing client replays its visible log once — on the development
  workspace some 560 events, two pages, deduplicated on arrival — and records a cursor.
- A replay of events the cache already holds folds nothing and writes nothing, but still
  schedules a flush, since the flush is where the cursor is written.
- The store's own serialisation of writes makes the phone's `inTurn` the second line, not the
  first: two batches can no longer be in flight at once from above it.
- A cache that fails every write holds the cursor at its last good claim for the session and
  keeps the unwritten events in memory — the same objects the fold already holds — for the next
  flush to try again. Nothing is dropped, and nothing is claimed.

## Alternatives considered

- **Resume from below the first gap.** Replays everything, every launch, for any device not in
  every space of its workspace — which is every device but one in a workspace of one room.
- **Drop a cache with gaps at load.** Drops every cache, for the same reason.
- **Have the server say what it last delivered.** Its cursor counts what the device cannot see,
  and a session's memory ends with its socket.
- **Chain events by their predecessor, so the cache shows where a delivered event is missing.**
  A per-event pointer the store writes at ingest. It works for the socket's stream alone; a
  room's history read over HTTP and a space forgotten on the server's word both break the chain
  for legitimate reasons, and the pointer would sit on every cached event.
- **Write the cursor in the same transaction as each batch.** Atomic per batch, but a later batch
  that lands after an earlier one failed still carries the cursor past the hole — unless the
  write also checks the cursor it expects to find, a compare-and-set in both caches, which is the
  rule above with its logic moved into the storage layer twice over.
