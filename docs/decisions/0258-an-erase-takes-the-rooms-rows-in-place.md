# 0258. An erase takes the room's rows in place

Date: 1 November 2026
Status: Accepted, 1 November 2026, on Arjun's "Yes, fix all three". Amends
[ADR 0067](0067-a-space-can-be-erased-and-the-log-keeps-one-line-saying-so.md), decision 2.

## Context

Arjun, 1 November 2026: "chips seems to freeze when I tried to create this new space", then "a
space deletion is very slow in general".

ADR 0067 erased a room by deleting its events and rebuilding every projection in the workspace
from what was left. It said what that costs: "0.2 s for 4,464 events here, and longer as a log
grows … Revisit when a workspace's log makes the pause felt." The log now holds 27,651 events. On
a copy of it, a rebuild takes 0.53 s of a 0.57 s erase, on a quiet machine. SQLite answers in the
server's own thread, so for that whole time chipsd reads no socket, answers no request and writes
no log line. Across the 114 erases in the server's log, the median was 0.5 s, one in ten took
over 3 s, and the longest took 36 s. On the Mac mini, with swap nearly full, an erase that afternoon
took 19 s. The phone's next Delete waited on it until the relay said the server had gone.

A targeted erase was set aside in ADR 0067 for a good reason: it would have to repeat, table by
table, what each projector does across rooms, and that is where it would drift from a rebuild.

## Decision

1. **The room's events say what they wrote.** Before anything goes, the room's events, and its
   threads', are projected again in memory: the same `project` a replay runs, with nothing
   written. Every change they make is placed:
   - in the room: a row whose room column names it (`space_id`, a lane's `home_space_id`, a
     space's own `id`), or a run's step or session rule;
   - outside it: an agent's row, or a lane homed in another room;
   - nowhere: a patch or delete of a row that does not exist, or a run change naming no run, which
     the writer skips either way.
   On Arjun's log, those two kinds of outside row are all a room's events ever reach, apart from
   the harness's spend.
2. **The room's rows go.** Its words leave the search index inside the transaction, as a rebuild
   takes them, rather than waiting in the queue for the next search.
3. **The rows outside it are made again.** Each is cleared as a rebuild clears it: an agent's row,
   which is the log's, goes, and a registry row (a harness's own) stays. It is then made again from
   the events left that name its id, applying only the changes to that row, in order. That is what
   a rebuild does to it, without touching anything else.
4. **The spend stays where it was.** Each `usage` grows every policy row of its harness, so a row
   begun before the room first spent holds all of the room's cost. A rebuild takes that off and
   puts it back through the tombstone's `spent`, so the row ends as it was. In place it is not
   touched, and the tombstone puts nothing back. What the room cost is learnt by replaying the
   room's events alone, from none of its rows, onto a policy row of each harness that holds only
   that, inside a savepoint undone after. The tombstone carries that figure, so a later replay
   comes out the same, give or take float dust far under a millionth of a cent.
5. **Anything else is rebuilt, as before.** The erase declines to work in place when:
   - a change cannot be placed;
   - an event outside the room is about one of its runs;
   - an event outside the room that names the room writes into its rows (a patch or a delete is
     nothing once the row is gone, as in a rebuild);
   - a policy row of a harness that spent there began after the room first spent, since that row
     held only part of the cost.
   `EraseResult.rebuilt` says which way it went, and the server's "space erased" line logs it with
   the time the erase took.

## Consequences

The live state after an erase is still exactly what a replay of the log makes. The erase tests'
"projections a replay makes again, exactly" now runs in place, and new tests cover an agent's row
made again, the search index, and both ways back to a rebuild. On a copy of Arjun's log, every one
of its 106 rooms was erased and compared with a full rebuild. 104 went in place and 2 were rebuilt
(J's home, which is never erased, and a shared room), with no differences. In place took 57 ms at
the median and 150 ms at the 90th percentile. The largest room, 1,449 events, took 125 ms. An
erase now costs the size of the room, not of the workspace.

A test checks every event the protocol has a fixture for: each change to an agent's or a lane's row
names it by its id. Step 3 finds the events to replay by that id, so a new event that reached such
rows any other way (every agent of a harness, say) would fail that test before it could drift.

An erase in place no longer settles drift the live database already had elsewhere. ADR 0067 noted
that a rebuild did. A rebuild is still there for that (`rebuild`), and still runs when an erase
declines.
