# 0262. How far a person has read follows them between devices

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's "Follow me everywhere". Replaces the "read marks
stay kept on each device" line of ADR 0181's addendum (Read all), and the "kept by their own
device" of ADR 0097 and ADR 0197.

## Context

Arjun, 3 November 2026, pairing a new iPad as himself: "I am bombarded with unopened message
numbers on the space list when I pair new device, even though those messages have been read".

How far a room had been read was a map of `seq`s kept on each device and nowhere else (core's
`read-state.ts`, the phone's SQLite and the browser's IndexedDB). A device paired for somebody who
was already here started with an empty map, so every line of every room it was sent counted as
unread. The same map kept apart on the iPhone and the Mac meant a room read on one still had its
count on the other. The server has had a `read_state` table since migration 0001, one row per
person per room, reserved for this and never written.

Two ways were put to him: the person's marks kept at the server and followed by every device of
theirs, or each device's own as before with a newly paired one starting with every room read. He
took the first.

## Decision

1. **The marks are the person's, kept at the server** in `read_state`: one row per person per
   room, the `seq` read up to, moved only forward. It is a registry table now, not a projection
   (ADR 0018), as `pinned_spaces` is: no event says it, so a rebuild leaves it alone, and erasing
   a room forgets its rows with the other rows kept beside the log.
2. **`GET /v1/me/read`** answers `{ spaces: { <space id>: <seq> } }`, the caller's own. **`PUT
   /v1/me/read`** with the same shape moves each forward, for the rooms the caller is in; a room
   they are not in, or a mark not ahead of the one kept, is passed over rather than refused, since
   a device can hold a mark for a room its person has since left. A mark past the workspace's last
   `seq` is held to it. `204`. A person's alone, a guest's too: a harness is `forbidden`.
3. **Their other devices hear it at once.** A mark that moved goes to every socket of that person
   that said `reads` in its `hello`, as the `read` frame, `{ frame: "read", spaces }`. It is not
   on the log, so a device that was away hears it at its next connect instead.
4. **The store keeps the device's copy and the person's in step.** The cache still holds the
   marks, so a room is counted from the first frame. At launch and at every hello the store reads
   the person's, and the higher of the two wins in each room; any of its own ahead of the server's
   (read while out of reach, or before the server kept marks) is sent up then. A room opened or
   Read all moves the marks here at once and sends what moved, one write at a time, gathering what
   moves meanwhile. A send that fails is owed to the next hello. A `read` frame moves the marks
   the same way, never back.
5. **A device with no marks of its own waits for the person's before it greets**, for at most a
   second and a half: a newly paired device's history is replayed onto marks it already has, so
   it never shows a room it has read as unread. Out of reach, it greets on time and catches up.
6. **An older server, which has no such route**, is a `404`: the device counts from its own marks
   as before and sends nothing more until it starts again.

## Consequences

- Reading a room on the iPhone clears its count on the iPad and the Mac, and Read all (ADR 0181)
  reads the rooms on all of them. The app icon's number is unchanged: it counts asks waiting on an
  answer, which reading doesn't give.
- A device that has not yet had this build counts from its own marks and sends none, so a person's
  marks become whole once each of their devices has started once with it.
- ADR 0097's exchange facts still say nothing about who has a room open: a mark says how far a
  person has read, not whether they are looking.
