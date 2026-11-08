---
title: Space
description: Where a harness works, with you in it. A worktree, a JSpace, a room — keyed by the harness's unit of work, and reused for ever.
---

A space is where a [harness](/concepts/harness/) works, with you in it. A harness has as many as
you open, and each one is keyed by whatever that harness calls a unit of work, so the same work
lands in the same space every time:

| Harness | A space is | Keyed by |
| --- | --- | --- |
| Jacobian | J, and each Space directly under J — the ones your tasks are performed in. A worker under one of those, and anything deeper, shows in its task Space's room | The Space's id |
| A custom harness | The direct space Connect a harness gave it, or the ones it opens itself | Whatever it says |
| People | A group, a channel, a thread — mixed membership is the norm | — |

A space is a **read model**. It is built from the log like everything else a screen shows:
[`space.created`](/reference/events/space-created/) and
[`membership.added`](/reference/events/membership-added/) are events, not rows somebody wrote,
which is what lets a whole workspace be replayed from zero and come out identical.

## How one is opened

A person opens a space from the app, and is its first member. A harness opens one through a
single door, `POST /v1/harnesses/:id/spaces`, with the key its adapter names the work by: the
key is stored on the space, unique in the workspace, so a bridge that has lost everything finds
yesterday's spaces rather than making a second set. What the harness gets is a direct space with
itself and its owner in it, opened *for* the owner, which is what makes it appear on their list
with its title — `Chips · main`, *India trip 2026* — rather than as a list of who is in it. That
is the one exception to "a person opens spaces", and the server enforces it, not the adapter.

A key is the harness's own unless the adapter marks it `shared`, which a worktree is: a place
another harness may work in too. **Two harnesses in one worktree share one space** — the second
to open it joins the space the first opened, with its owner beside it if that is somebody else
([ADR 0033](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0033-two-harnesses-in-one-worktree-share-one-space.md)).
That changes what you read, not what the harnesses do to the files: Chips never touches them,
and two harnesses in one checkout can conflict on disk whichever way the spaces go. Give each
its own git worktree, which keeps them apart and gives each its own space. A JSpace — Jacobian's
tree node — keeps a key of Jacobian's own.

## What lives in one

- [Messages](/concepts/message/), of eleven kinds — yours, and the harness's. A prompt typed at
  the harness's own surface is your message too, marked *at* it, so a space reads as a
  conversation rather than a monologue of answers.
- [Runs](/concepts/run/) — a harness's work happens *inside* a space, not beside it — each
  saying which [session](/concepts/session/) it came from.
- [Approvals](/concepts/approval/) and questions, as cards in the flow.
- A strip of the space's sessions, for a harness that has them.
- [Lanes](/concepts/lane/) linked in from a specialist's chat.

## Who sees it

A subscription is scoped by membership: a credential is delivered the events of the spaces it
belongs to, and the workspace-wide events that belong to none, and it writes only into those.
`hello` lists the spaces the connecting credential is in, and the app keeps only those, so a
space you left on another device is gone from this one too.

## Several harnesses and people in one space

A person opens a group space from the gold +, and is its owner. The room sheet — opened from the
space's name, the count in its header on a phone, or **Details** on a computer — lists who is in it and their standing, adds anyone from the
directory, and takes anyone out; `/add @name` and `/remove @name` do the same from the composer.
Somebody added to a room while their app is open reads it from its beginning
(`GET /v1/events?space_id=`), not from the moment they joined.

**Chips says who each message is for.** In a room with two harnesses, only the ones a message is
for take a turn on it; the others hear it as context and stay quiet (ADR 0081). Chips decides as
the message arrives, writes the answer on it as `addressed_to`, and every harness and every screen
reads the same answer. For a person's message the first of these that applies decides:

1. **An @.** `@Ledger` in the text makes it Ledger's; `@all` makes it every harness's; an @ that
   names only people makes it no harness's. A handle is a participant's name without its spaces,
   or its first word — `@jacobian` for *Jacobian · mini* — and the same rule draws the chip.
2. **The composer's choice.** The faces at the front of the field say where the next message
   goes, and the empty field says it in words (*Message Everyone*); a tap on the faces opens the
   field into a list that picks a harness or Everyone, and the pick goes with the message as `to`.
3. **A reply** to a harness's message is that harness's.
4. **The only harness** in a room with one — a harness's own room, every direct room — is who
   every message is for, as it always was.
5. **Where your last message here went.** Before your first, every harness. Everyone stays
   everyone: a harness that joins after a message for everyone is in the next one too, while
   harnesses picked by name stay those harnesses.

A harness's message is for the harnesses it names, chose with `to`, or answers, and otherwise for
the people. The room draws where a message went with the lane's route — your face, an arrow, and
theirs; for someone else's message, whose face is beside it already, the arrow and theirs — over
a message whose address changed from its sender's last. One that went where the last did gets
none, because it changed nothing and the field said so.

**Harness-to-harness traffic is folded.** What Scout says to Ledger and Ledger says back is
collapsed into one row — their faces with a two-way arrow, the count, and the latest line — open
on a tap, never deleted; what a harness says to the room stays in the flow. Collapse by default,
always one tap from inspectable (the blueprint's eleven calls).

**Harnesses talking to each other stop at four.** Once harnesses have addressed four messages to
each other since a person last spoke in the room, the next is still posted and shown, but it is
for nobody and carries `held`; the room says so in the margin under the fold — *Scout and Ledger
have sent each other 4 messages. They'll pick up when you say something.* — and your next message
lets them go on.

## Who may do what in a space

| Standing | May |
| --- | --- |
| **owner** | Everything a member may, remove somebody else, and delete the space. Whoever opened the space. |
| **member** | Talk, add somebody, retitle, archive and unarchive, leave. |
| **guest** | Talk, and leave. |

A harness in a space talks and works; it retitles or closes only a space it opened itself.
Nothing here is a setting: each line is a rule at the door, and a write that breaks one is
refused with the reason.

## Retitling and archiving

`space.updated` retitles a space, archives it or unarchives it — `closed` and `open` on the wire
— and the room shows a muted line saying who did it. An archived space is off the list: the
archived ones sit behind one row at the foot of it, **Archived**, which says how many there are
and shows them when it is pressed. Its history and its members stay, and anyone in it can
unarchive it. On the phone a row pushed left shows **Archive**, or **Unarchive** once it is
archived; on the desktop both are on the room sheet; and `/title`, `/archive` and
`/unarchive` do the same from the composer. Archive asks first; Unarchive only puts a room back.

## Deleting one

Delete erases a space from the server: what was said in it, its threads, its files and its search
entries go, for everyone in it, and cannot be brought back. The log keeps one line in their place,
`space.erased`, naming the space and who erased it and nothing of what was in it; every device
is sent it and forgets the room. What the room cost stays on the harness's account — a budget is
not topped up by erasing where the money went. Delete is the room's owner's, or a workspace
owner's or admin's, and it asks first. A thread goes with its space, and a direct space nobody
can open again — the one a harness was handed when it was added, or two people's — is archived
instead. A room a harness opened by key may be deleted. The harness is told. One that declares
`follows_rooms` deletes its own side too — Jacobian deletes the Space — when the person deleting
owns the harness, and archives it there, for the owner, when somebody else deletes it; it carries
an archive and an unarchive over the same way. The sheet that asks first promises this only for a
harness that declared it, and says nothing on behalf of one that did not (ADR 0077). A harness's
home, the room its lead speaks in, is never deleted or archived (ADR 0069). See [ADR 0067](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0067-a-space-can-be-erased-and-the-log-keeps-one-line-saying-so.md).

A harness archives and unarchives the spaces it opened, with the same event. That is how
something put away in the harness leaves the list here: an adapter reads
`GET /v1/harnesses/:id/spaces` — every space it opened by key, whether each is open, and who
last moved it — and archives the room of whatever it has archived. Jacobian does this for an
archived Space, and unarchives the room when the Space is restored. The other way too: a room a
person archives here, Jacobian archives its Space, and one they bring back, it restores —
whichever side moved last wins ([ADR 0066](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0066-a-person-archives-a-space-and-the-harness-follows.md)).

A harness that opened a space may bring it a better title later — a room opened before the
adapter knew the branch's name should not keep the wrong one for ever — and does so through the
same door it opened it with: `POST /v1/harnesses/:id/spaces` with the key and the new title
retitles the space it finds. A person's rename holds over it afterwards.

A person may also open a room and ask a harness into it, for the harness to make something of
its own for it — an agent, a session, a Space under its lead. The + shows every harness that takes
new spaces as a face. It opens on whoever was asked last. The first tap chooses a face, and each
tap after that adds or removes one. The room is asked of the first face picked, and every face
picked is put in it (ADR 0084). The room's `space.created` names
the harness in `asked_of`, and only a harness that declares `new_spaces` may be asked. The harness
is sent that event, and claims the room through the same door: `POST /v1/harnesses/:id/spaces`
with its own `key`, a `title` if it has one, and the room's `space_id`. The room takes the key
(`space.claimed`), and from then on it is the harness's room as if it had opened it: asking for
the key finds it, and the harness retitles, archives and follows it. Rooms asked of a harness and
not yet claimed are listed as `asked` beside `spaces` in `GET /v1/harnesses/:id/spaces`, so an
adapter that was down catches up when it starts.

## Leaving one

`/leave` in the composer takes a space off your list. It is a `membership.removed` naming you,
so it is in the log like everything else: nothing is deleted, the harness stays where it is, its
history stays, and anyone still in the space carries on. It is the right thing for a worktree
you will not open again. Anyone still in the space can add you back from its room sheet.
