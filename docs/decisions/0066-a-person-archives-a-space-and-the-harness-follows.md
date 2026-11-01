# 0066 — A person archives a space, and the harness follows

**Status:** Accepted, 22 September 2026. Amended by ADR [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md), 29 September 2026: a room
following its Space becomes 0087's rules 3, 4 and 9.

## Context

Chips has had `closed` since M3.3: a space off the list, its history and members kept, reopenable.
Until now only a harness used it in practice. Jacobian's adapter closes the room of a Space that is
archived, gone from its registry or deeper than a room, and reopens it when the Space is restored
(19 September 2026). It does that on every 30-second pass where Jacobian's registry has changed.
The apps showed the result as **Closed · N** at the foot of the list.

Arjun asked for archive and delete on the Spaces list, by swiping a row the way iOS does, each
confirmed on a sheet. There were three ways to make archive work, and he was shown what each
would cost in a running mock (`docs/proposals/space-archive-delete-mocks.html`):

- **A0**: the swipe calls the close that exists. Jacobian would reopen the room of a live Space at
  its next registry change, which can be hours away or a minute, so an archive would not stay put.
- **A1**: a person's archive holds, and Jacobian stops undoing it. Chips records who moved a room;
  Jacobian needs no change.
- **A2**: A1, and the archive is carried into Jacobian: the Space is archived there too, and
  unarchiving restores it.

He chose A2.

## Decision

1. **Archived is the word; `closed` stays on the wire.** The phone, the desktop and the room's
   muted line say *archived* and *unarchived*; the foot row says **Archived · N**. `space.updated`
   keeps `state: "open" | "closed"`, so no harness and no stored event changes.
2. **Who moved it is kept.** `spaces.state_by` (migration 0026) is `person` or `harness`: whoever
   last set the state. It works the way `title_by` works for titles. The migration backfills it
   from the log, and a rebuild makes it the same way.
3. **A harness hears it.** `GET /v1/harnesses/:id/spaces` reports `moved_by` for each room where
   anybody has moved it.
4. **Whichever side moved last wins.** Jacobian's adapter now reads its rooms every pass, since a
   person's move in Chips changes nothing in Jacobian's registry. For each room that disagrees
   with its Space:
   - If the Space's own state changed since the adapter's last pass, Jacobian moved last, and the
     room follows as before.
   - If a person moved the room and the Space has not changed since, the person moved last. The
     adapter archives the Space, or restores one that is archived, and leaves the room alone.

   There are exceptions. J is never archived: J's room archived in Chips stays archived. A Space
   gone from the registry, or deeper than a room, has nothing to restore, and its room stays where
   the person left it. On the adapter's first pass after a start it has no memory of the last
   pass, so a person's move is carried rather than undone.
5. **Anybody in the room but a guest may archive it**, as the door already allowed. Unarchive does
   not ask for confirmation; Archive does.

## Consequences

Archive and unarchive happen in Chips at once, and the Jacobian Space follows within a pass, about
30 seconds. The adapter reads Chips' list of its rooms every pass instead of only when its registry
changes: one local request every 30 seconds.

A harness other than Jacobian sees `moved_by` and may ignore it. Nothing in the protocol obliges a
harness to follow a person's archive; Jacobian does because its Spaces and Chips' rooms are one
list seen twice.

The Jacobian half is its own change in `src/channels/chips/`. It was prepared beside Chips and is
landed and restarted on Arjun's word, like every change there. Until it lands, a person's archive
of a Jacobian room holds only until Jacobian's next registry change, as under A0.
