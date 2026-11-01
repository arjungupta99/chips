# 0199. An agent's changes can be locked

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Go with B and your picks for who flips it and what
it holds" after the mock. Amends ADR 0091 (who renames an agent), ADR 0095 (who archives and
deletes one), ADR 0087 rule 5 and ADR 0095 point 6 (a room's one agent deleted with its room) and
ADR 0182 (what Select on Agents picks). It is ADR 0156's lock, for an agent.

## Context

Arjun, 18 October 2026: "we have a lock changes option for spaces, I think we need the same for
agent as well."

A room's changes can be locked since ADR 0156: a switch on its sheet, and while it holds nobody
renames, archives or deletes it. An agent has nothing like it. It is renamed where it stands on its
card (ADR 0091), archived and deleted from the card's foot and from a swipe on the Agents tab (ADR
0095), picked with others in Select (ADR 0182), and deleted with its room when it is the room's one
agent (ADR 0087, rule 5). An agent that matters, with its memory, its files and its history, is one
swipe from gone.

The mock (<https://claude.ai/artifact/YQ6ANm8CB1VZmukczdNQCY>) drew the room's row on the agent's
card in two places — **A**, heading the foot beside the acts it stops, and **B**, in a card of its
own under Room, Since and Now — and asked three things: where on the card, who may flip it, and
what it holds. He picked B, and the mock's picks for the other two.

## Decision

1. **Lock changes is a switch on the agent's card**, in a card of its own straight under its facts
   (Room, Since, Now): a padlock, *Lock changes*, and *Rename, archive, delete* under it, the room
   sheet's row word for word (`ui/LockRow`, which both now use). It is off for every agent, the
   ones there already too, so nothing changes until somebody turns it on. On the web and the Mac
   the agent page has the same row above its buttons.
2. **While it is on, no person renames, archives or deletes the agent.** The pen beside its name
   becomes a small padlock, so whoever reads the card sees why the name will not edit. The card's
   foot loses Archive and Delete (the desktop's Archive and Delete…), and one line says why:
   *Changes are locked. Unlock them to rename, archive or delete it.* An archived agent that is
   locked may still be unarchived: that only puts it back. Its face, moving it, forking it, taking
   it out of a room, its model and effort, its heartbeat, its context window and its files are not
   locked, as a locked room's members, lead, spend and files are not.
3. **A locked agent's row on the Agents tab slides on Locked**: the graphite disc a locked room
   wears (ADR 0178), in place of Archive and Delete (an archived locked agent slides on Unarchive
   and Locked). A tap opens its card, and the lock's row glows once, so the eye finds it. On a wide
   screen the card opens beside the list, as a row's tap opens it. **Select does not pick a locked
   agent**, as Spaces does not pick a locked room (ADR 0181): on the phone its circle is a padlock,
   on the desktop its row steps back and says why when clicked, as a locked room's does, and the
   line under the name says locked agents can't be picked.
4. **A room's delete leaves a locked agent alone.** The sheet does not offer *Delete it in its
   harness too* for a room's one agent that is locked; it says the agent's changes are locked and
   that it stays, free to join another room. The room goes and the agent is freed, as any agent is
   when its room is deleted.
5. **Whoever may archive or delete it may lock it**: its harness's owner, or an owner or admin of
   the workspace (`mayLockAgent`, the old `mayKeepAgent`). The lock guards their acts, so only they
   let it go. Never a guest, never a harness, and there is no switch on a Main agent, which is
   archived and deleted by nobody already.
6. **It is the agent's, on the server.** `agent.lock_set { agent_id, locked }` is Chips's own
   event, written from a person's `POST /v1/agents/:id/lock {locked}`; `participants.locked` holds
   it (migration 0048) and a rebuild puts it back. The directory carries it as `locked`, and the
   event is told to the people who read the whole directory, as `person.face_set` is: an agent's
   harness is never sent it, and a guest, who changes nothing about an agent, reads it the next
   time it reads who is who. Saying what it is already changes nothing. No room is told; the lock
   is the agent's.
7. **The server refuses what it locks**, from a person: a rename (`PUT /v1/agents/:id/name`), an
   archive (`PUT /v1/agents/:id/state {archived}`), a delete (`DELETE /v1/agents/:id`), and a
   room's erase that asks to delete a locked agent with it, refused whole before anything changes.
   Each is `invalid` (422) and says the agent's changes are locked and to unlock them on its card
   first. Unarchive still lands.
8. **A harness is not held.** A harness archiving its own agent (registering it so), or putting
   away the room it opened, still lands, as ADR 0156 lets a harness's own rename or close of its
   room land: refusing it would leave Chips and the harness disagreeing about the same agent.
9. **Both clients ask core.** `mayLockAgent` says who may flip it; `mayKeepAgent` (archive and
   delete), the card's `mayName` and `mayPickAgent` say no while it holds, `mayUnarchiveAgent`
   still brings an archived one back, and `whyNotPickedAgent` and `agentHintWords` say why it is
   not picked, so the phone and the desktop offer the same.

## Consequences

- One event, one migration, one route: a 4431 restart (with a backup of the database first) to go
  live, then the web build, `pnpm phone ship` and `pnpm desktop`. No Jacobian or bridge change:
  the event never reaches a harness.
- A device older than this does not know the lock and still offers the pen, Archive and Delete;
  the server refuses them, and the refusal says why.
- Mocks are out of the repo, as asked on 28 September 2026.
