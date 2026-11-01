# 0167. A message can be deleted for oneself, and breaks into dust

Date: 14 October 2026
Status: Accepted, 14 October 2026, on Arjun's three calls ("1-3 Sound good. go with your
recommendations"). Amends ADR 0024's message actions (M5.4): *Delete* becomes *Delete for
everyone*, beside a new *Delete for me*.

## Context

Arjun, 14 October 2026: "I want a message deletion feature in Chips. Telegram has this 'delete for
me' option. I want the same." And, before anything was drawn: "deletion should have a cool
animation and the whole flow should be polished."

Until now a message could only be taken back for everyone (`message.deleted`, M5.4): your own, or
anyone's for the space's owner and the workspace's admins, leaving *Message taken back* in its
place. The phone offered nothing at all. There was no way to clear a line from your own room while
leaving everyone else's alone, which is the thing Telegram's *Delete for me* is for.

A phone-width mock (artifact 1eY7GDQEEBKqFbQrmsYFP1) put three calls to him: the animation (dust,
a fold, a drift), where *for me* is kept (an event only the actor is sent, or this device only),
and whether the phone deletes for everyone too. He took the recommendation on each.

## Decision

1. **Delete for me is an event, seen by the person who did it and nobody else.** `message.hidden`
   and `message.shown` (`packages/protocol`, direction `workspace`, sender `person`, payload
   `message_id`) go in the log like any other, and `canSee` sends them to the actor's own devices
   alone (`SELF_EVENTS`); the event store's replay predicate says the same in SQL. So it follows
   the person to every device they pair, survives a reinstall, and nobody else, person or harness,
   ever learns it happened. No migration: they are two more event types.
2. **Anyone in the room may delete any message for themselves**: anyone's, a tombstone too, a
   guest as well. The door (rule 12, `authorize.ts`) checks only that the message is in the space
   named; a harness may not. Core says the same (`mayHide`): not a system line, not one still on
   its way.
3. **The fold keeps the set; the snapshot leaves the lines out.** Each space carries the message
   ids hidden for the reader (`space.hidden`, only from events whose actor is the reader). The
   store's snapshot drops those lines and their pins (`withHidden`), and search finds none of them.
   The events are quiet: they move neither the room's last activity nor its unread count. Hiding
   and Undo show at once and stand until the server has answered and the fold agrees, so an answer
   arriving before its event, or an Undo before the hide's event, never flickers; a refusal puts
   the line back and says so.
4. **Delete for me asks nothing; Undo is offered for five seconds.** It changes nobody else's room,
   so a question would be in the way. A capsule over the room's foot, just above the field, says
   *Deleted for you* with a ring counting the seconds down and *Undo* beside it (`UNDO_MS`). A
   second deletion while it is up starts it again for that one. On the phone it is the room's
   glass, and comes and goes on a spring of its scale, never its opacity; on the desktop the same
   capsule in the desktop's glass, and Escape lets it go.
5. **Delete for everyone asks first, in core's words, on both.** *Delete for everyone?* — *It
   leaves every screen in this room, yours too, and a line says it was taken back.* — and, in a room
   with an agent in it, *The agents here have read it already and keep what they read. This can't
   be undone.* (`deleteForEveryoneAsking`). On the phone the line's sheet turns to that page; on
   the desktop the menu does. The phone now offers it, where it offered no deletion at all.
6. **The line breaks into dust.** A wipe crosses the bubble from its left edge in 520 ms, and as it
   passes each of 220 specks of the bubble lets go and drifts up and to the right, fading and
   shrinking; the last is gone 1.59 s from the start (`packages/core/src/dust.ts`: one set of
   numbers, so both platforms move the same way). The specks wear the bubble's own colours: its
   ground a little lighter or darker, some the words' ink, and on your own bubbles the room's field
   at the height they stand. A soft haptic ticks five times as it goes, on the phone.
   - **For you alone**, the room closes over the line once the wipe has crossed it, while its dust
     is still in the air, and the line goes.
   - **For everyone**, the wipe stands until the tombstone comes back from the server, and the
     tombstone comes up in its place; turned away, the words form again from their dust.
   - **Undo** is the same clock run backwards: the room opens the line's place, the specks fly in,
     and the bubble forms again from its right edge.
   - **With Reduce Motion** there is no dust: the bubble fades, and the room closes at once.
7. **How each platform draws it.** On the phone an eraser in the room's ground grows across the
   bubble inside it (mounted only while it breaks, so no row carries an animated view otherwise),
   and the specks are views in a layer over the room, like the send's flight, measured on the UI
   thread. On the desktop the bubble is wiped by a CSS mask set on it each frame, and the specks
   are painted on one canvas over the window, drawn into `document.body` as the line's menu is.

## Consequences

- A person can clear a line from their own room on every device they have, and nobody is told.
  The agents in the room keep what they read either way; only *for everyone* says so, because only
  it claims to take something away from them.
- The log grows by two event types nobody else is sent. A reader's export or audit of their own
  log shows them; the room's does not.
- A deleted-for-me line still counts in nobody else's view; the room's last line in the Spaces list
  is drawn from what the reader still has.
- What the walk found, and the rules it left (14 October 2026):
  - **A line leaving the room goes whole.** Fabric keeps whatever holds a view with an exiting
    animation while it fades; the eraser's and the time's fades kept the bubble's empty ground
    standing over the place the room was closing on. A row and a bubble now skip their children's
    exits when they go (`Whole`, and `MovingBubble`, in `RoomMotion.tsx`); the row is never
    flattened, since Reanimated reads that from the row's own node.
  - **Nothing on the UI thread calls itself from a frame.** The dust looked for a box not laid out
    yet by a worklet asking itself again a frame later; when a tombstone's eraser did that for a box
    already gone, the app ended. Retries are asked from JavaScript now, and a tombstone has no
    eraser: it comes up out of the room's ground instead.
  - **On the desktop, a mask is left alone once its line is over.** React draws the tombstone in
    the very element that was wiped; the dust still in the air had kept wiping it, out of sight.
- Tests: protocol, door, store and fold, core's dust numbers and their phone twin
  (`dustMath.vitest.ts`), the phone room (Jest), the web menu and shell (Vitest), and end to end
  `apps/web/e2e/deleting.spec.ts`; the phone was walked on a simulator
  (`testing/scenarios/rooms/delete-a-message.md`).

## Addendum, 15 October 2026: the room moves round a deletion as one

Arjun, on his iPhone after the go-live: "When I delete and undelete message the scrolling moves
abruptly." Filmed on the simulator and read frame by frame (DM-4 to DM-7 in `testing/findings.md`):

- **Up the history, the reader's own change moves on the room's spring.** There the room's
  transition goes at once, so that lines landing below never move what a reader is reading
  (ADR 0074). A line the reader deleted there was held the same way: the rows over it shut in one
  frame, and Undo opened them in one. What the reader does in the room is theirs to see move:
  deleting for them, Undo and taking a line back mark the next mount that moves the rows as their
  own (`madeHere`, `Field.own`), and it moves on the spring, as at the foot. Lines landing below
  are still held.
- **A turn's gap moves with its row.** A line deleted or brought back joins the turns either side
  of it or parts them, and the line under it gains or loses a turn's gap. The gap is a `Moving`
  view now, on the same spring and clock as its cell; as a plain margin it changed at once while
  the cell grew or shrank, and in an inverted list the bubble jumped twelve points and slid back.
- **On the desktop the list holds a row by itself.** Up the space it keeps the row across the
  middle of the window still, and held it by its place in the list: a deletion over it moved every
  place on by one, and the list scrolled back a whole row as the line went, and again as it came
  back. Its own scrolls no longer re-note the row it holds, which had put back only half of each
  frame's closing.
- **On the desktop a row closes to nothing, and opens to itself.** The rows are spaced by a margin
  under each, not a gap: the close took it to minus twelve pixels, and the rows either side jumped
  apart when the line went. An opening measures the row as it stands of itself, so one asked twice
  (React's strict mode) opens all the way, and it ends when its transition does.

On the phone the rows over the line move and the rows under it stand still, up the history as at
the foot. On the desktop, at the end, the same; up the space, the row in the middle of the window
stands still, so a line deleted below it closes upward, as a page does. Tests:
`apps/web/e2e/deleting-place.spec.ts` reads every painted frame and fails on the old code; the
phone was filmed again (`testing/scenarios/rooms/delete-a-message.md`).
