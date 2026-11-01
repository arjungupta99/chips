# 0156. A room's changes can be locked

Date: 13 October 2026
Status: Accepted, 13 October 2026, on Arjun's "I want inverted 'lock changes' default off" after
the mock. Amends ADR 0066 and ADR 0067 (who may archive and erase a room), ADR 0112 (who may rename
one) and ADR 0151 point 7 (the desktop sheet's foot). Locked's colour is graphite since ADR 0178
(16 October 2026), which also redrew the swipe's buttons.

## Context

Arjun, 13 October 2026: "I want to add a new option to the space detail page for 'changes lock' (a
switch). Until the switch is on we cannot edit or delete / archive the space".

A room is renamed in place on its sheet (ADR 0112), archived and deleted from a swipe on the Spaces
list (ADRs 0066, 0067), and on the desktop from the sheet's foot (ADR 0151). A swipe is one
gesture from gone, and a room that matters has nothing to stop it.

The first mock (<https://claude.ai/artifact/6TMdDqHoYkUR43Af4H8HNW>, version 1) drew an *Allow
changes* switch, off for every room, and offered two homes for it:
- **A**: on each device, with nothing on the server. Unlocking on the phone leaves the Mac locked,
  and the server refuses nothing.
- **B**: on the room, on the server, the way Spend per job is (ADR 0117). One switch every device
  and everyone in the room sees, and the server refuses what it locks.

He answered: "I want inverted 'lock changes' default off. Sliding on a locked row, will display a
purple locked icon + label. Upon tap space detail will be opened". He left the home as the mock's
pick, B. Version 2 of the mock draws what he said.

## Decision

1. **Lock changes is a switch on the room sheet's first page**, the last row of the card that holds
   Lead, Spend per job and Files: a padlock, *Lock changes*, and *Rename, archive, delete* under
   it. It is off for every room, the ones there already too, so nothing changes until somebody
   turns it on. The padlock closes while it is on.
2. **While it is on, no person renames, archives or deletes the room.** The name has no pen, the
   Spaces row offers no Archive or Delete, and the desktop sheet's foot loses Archive and Delete
   space…. An archived room that is locked may still be unarchived: that only puts it back.
   An agent's archive or delete does not take a locked room with it either: there is no *delete
   the room too* (ADR 0095), and a locked room whose one agent a person archives or deletes stays
   open with nobody in it, rather than being archived by that other door. The composer's `/title`
   and `/archive` say the room is locked rather than send. Who is in the room, its lead, what a job
   may spend and its files are not locked.
3. **A locked row on the Spaces list slides on Locked**: a padlock and the word, on Archive's
   purple, in place of Archive and Delete (an archived locked room slides on Unarchive and Locked).
   A tap opens the room with its sheet up on its first page, where the switch is, once the room
   has slid in. On a wide screen the room beside the list has no sheet, so Locked opens the room.
4. **It is the room's, on the server.** `space.lock_set { locked }` is Chips's own event, written
   from a person's `POST /v1/spaces/:id/lock {locked}`; `spaces.locked` holds it (migration 0045)
   and a rebuild puts it back. Anybody in the room who is not a guest, there or in the workspace,
   locks it or lets it go, and the room says who in one line: *locked changes to the space*,
   *unlocked changes to the space*.
5. **The server refuses what it locks**, from a person: a `space.updated` with a title or
   `state: "closed"`, an erase, and an agent's delete that would take the room with it, refused
   whole before anything changes. Each is `invalid` (422), as a harness's home's refusals are, and
   says the room's changes are locked and to unlock them in its sheet first.
6. **A harness is not held.** A harness's own rename or close of a room it opened still lands:
   Jacobian follows its Spaces (ADR 0077's `follows_rooms`), and refusing it would leave Chips and
   Jacobian disagreeing about the same room. The lock holds people's hands.
7. **Both clients ask core.** `mayLock` says who may flip it; `mayRename`, `mayArchive` and
   `mayErase` say no while it holds, so the phone, the desktop and search offer the same.
   `maySetSpend` no longer leans on `mayRename`, so a lock leaves Spend per job alone.

## Consequences

- One event, one migration, one route: a 4431 restart (with a backup of the database first) to go
  live, then the web build, `pnpm phone` and `pnpm desktop`. No Jacobian or bridge change: a
  harness in the room is sent `space.lock_set` as it is sent `space.spend_ceiling_set`, and passes
  over a type it does not know.
- A device older than this does not know the lock and still offers Archive, Delete and the pen; the
  server refuses them, and the refusal says why.
- Mocks are out of the repo, as asked on 28 September 2026.
