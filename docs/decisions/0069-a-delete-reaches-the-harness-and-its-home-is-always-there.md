# 0069 — A delete reaches the harness, and a harness's home is always there

**Status:** Accepted, 25 September 2026. Amends ADR 0067's seventh point. Amended by
[ADR 0078](0078-a-harness-can-be-removed-and-its-history-keeps-its-name.md), 27 September 2026:
a home stops being one when its harness is removed from the workspace. Amended by ADR [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md),
29 September 2026: the home becomes the Lead room, and a delete reaches the harness only when the
sheet says so.

## Context

ADR 0067 made Delete erase a room from the server. For a room a harness had opened under a key,
the harness forgot the room when the tombstone arrived, and the thing it held for the room stayed
live. The ADR said the room would come back, empty, the next time the harness spoke for it or
started. It said the way to be rid of one for good was to archive it first, then delete it.

Arjun deleted rooms he had made from the + and saw them come back as new, empty rooms. Jacobian
opens a room for every live Space as it starts, and it restarted twice that morning (06:11 and
06:56 UTC). Six Spaces he had deleted were back on his list each time. Nothing on the sheet had
told him to archive first.

Archiving the Space when its room was deleted was built first and then withdrawn. It kept the
room gone, but on Jacobian's side Delete and Archive then did the same thing. Arjun asked why it
could not delete properly, and said J is never deleted or archived.

## Decision

1. **A delete reaches the harness.** A harness told by `space.erased` that a room it opened under
   a key is gone deletes what it held for that room. For Jacobian that is the Space, with its
   memory, its files, its schedules and the Spaces under it, through the same `deleteProject`
   its dashboard uses for a permanent delete. Only the harness's owner deletes a Space from
   Chips. When somebody else erases the room (a workspace owner or admin who does not own the
   harness), Jacobian archives the Space instead, for its owner to decide. The tombstone's actor
   says who erased it.
2. **The sheet says so.** Delete's sheet tells the harness's owner *It's deleted in Jacobian too*.
   Anybody else is told *Jacobian archives it on its side, for its owner to delete there*. The
   words are core's (`eraseAsking`), so the phone and the desktop say the same thing.
3. **A harness has a home.** `space.updated` gains `home`: the room the harness's lead speaks in,
   which is always there. It is `spaces.home` (migration 0028). The harness that opened the room
   sends it. So may a harness in a direct room it did not open: the room it was handed when it
   was added. A harness never sends it for a group room, since it does not keep people's rooms on
   their lists.
4. **Nobody archives or erases a home.** The door refuses a person's `state: "closed"` for a home,
   and refuses to erase one. The apps offer neither: `mayArchive` and `mayErase` say no. A home
   somehow put away may still be brought back. A person cannot name a home.
5. **Naming a home is quiet.** It adds no line to the room, does not bring the room to the top of
   the list, and adds nothing to the unread count.
6. **Jacobian names J's room its home** once per room, at its start, by the key `home-<room>`, so
   Chips takes it once however often Jacobian restarts. A Chips too old for the word refuses it,
   and Jacobian asks again at its next start.

## Consequences

Delete means gone on both sides, and a restart does not bring anything back. Archive stays the
way to put something away and keep it.

Deleting a Space in Jacobian cannot be undone, and Jacobian's dashboard asks for a preview before
it does so. Chips' sheet is the preview here: it names the room, says the history is erased, and
says the Space goes too. It does not list the Spaces under it. Those are never rooms in Chips, and
a person deleting a task Space from Chips means the task, whatever its workers were.

One gap stays. Jacobian knows which Space a room was only from what it holds while it runs. A room
erased while Jacobian is down reaches it in the replay as an id it has never seen. Its Space stays
live, and its start opens the room again, once, empty; deleting it again deletes the Space.
Closing the gap would mean the tombstone naming each room's key. That is cheap, but not worth
doing until it happens.

J's room was archivable and erasable here until now. An install that did either before this build
keeps what it did. J's room comes back empty the next time J speaks, and from then on it is a
home.
