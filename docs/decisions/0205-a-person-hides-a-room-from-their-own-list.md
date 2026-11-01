# 0205. A person hides a room from their own list

Date: 19 October 2026
Status: Accepted, 19 October 2026, on Arjun's "Do B" on the mock. Follows ADR 0204's addendum (the
workspace's owner is not offered Leave). Archive (ADR 0066) and the Spaces list's Select (ADR 0181)
are unchanged.

## Context

Arjun, 19 October 2026, on Foodie's sheet, which offered him **Leave Foodie**: "owner should not be
offered to 'leave room' … Maybe we have a 'hide room' option later which groups these rooms in a
special section similar to archived rooms, notification for these rooms would be suppressed."

Leave went from the owner's sheet that day: his agents answer the room, and Jacobian answers a room
only while one of its owners is in it, so his leaving would end the room's answers for everybody
else. He had no way left to put aside a room he is only a guest of in spirit. Archive is not that
way: it puts a room away for everybody in it, and Jacobian archives the Space too (ADR 0066).

The mock (<https://claude.ai/artifact/L1C3M6xjZV3h71BSgitvow>) ran three layouts on Foodie: A, a
Hide disc beside Archive and Delete with a Hidden heading at the list's foot; B, Hide on the row
pushed the other way, right, with the same heading; C, Hide as in A and a Hidden row at the head
of the list opening a page of its own. It drew the room's sheet, the same in all three, and a table
of rules for all three. He took B.

## Decision

1. **Hide is a person's own, kept beside their room faces.** `hidden_spaces` (migration 0049) holds
   one row per person per room, as `space_icons` does, so two devices never write over each other.
   `GET /v1/me/hidden-spaces` answers `{ spaces }`, the ids this person hid; `PUT` and `DELETE` on
   `/v1/me/hidden-spaces/:spaceId` hide and unhide one, for a room the caller is in (`not_found`
   for any other). Nobody reads or writes another person's, an owner included. The store reads them
   from the device's cache as it starts and from the server at every hello, as it reads faces, and
   carries them on the snapshot (`hiddenSpaces`). A hide changes the list at once; one the server
   refuses is put back and said.
2. **A row pushed right offers Hide** (his B). What is only yours is on the row's left; what
   everybody sees stays on its right as it was: Archive and Delete, Unarchive and Delete, Locked. A
   hidden row pushed right offers **Unhide**. The disc is slate (`actTone`), a colour of its own
   beside Archive's violet, Unarchive's blue and Locked's graphite. Neither asks first: only the
   person's list changes, and the other undoes it in one press, as Unarchive does.
3. **Hidden is a heading at the list's foot**, **Hidden · N**, above **Archived · N**, closed until
   asked, as Archived is; the room open beside the list on a wide screen keeps it open. A hidden
   row wears a closed eye before its time, and its unread count is grey where an open room's is gold.
   The two headings say Show and Hide no more: a chevron turns instead, since "Hidden · 1  Hide"
   reads as an order. The web and the Mac draw the same heading in their rail.
4. **The room's sheet offers it too.** On the phone, **Hide Foodie** is a row of who is here, in
   ink, with a line under it: "Off your list, and quiet. The others here carry on." For the
   workspace's owner it stands where Leave stood; for anybody else, above Leave. Pressed, the sheet
   goes and the room goes back to Spaces, as Leave's does. A hidden room's sheet says **Unhide
   Foodie** there, which stays put, and its Notifications tile reads **Off while hidden**. A hidden
   room's name says **Hidden** under it. On the web and the Mac, Hide and Unhide stand at the
   sheet's foot beside Archive (`hide-space`, `unhide-space`), as the desktop has no swipe.
5. **Who may hide** (`mayHideRoom`, core): anybody in the room, a guest too. Not a Main room, which is
   always there (ADR 0069), nor a thread. A locked room may be hidden: the lock stops changes for
   everybody, and Hide changes nothing for anybody else. An archived room is not offered Hide; one
   hidden and then archived shows under Archived, offered Unhide there, and goes back to Hidden when
   it is unarchived.
6. **A hidden room pushes no message to its hider**, an @ and a pick in the field included
   (`notify-message`, `messageRecipients`'s `hidden`). A decision still reaches them, and so does
   the agents' pause (ADR 0097), as from a room set to Off: an agent waiting on their Approve should
   not wait on a choice about a list. The room's own level (ADR 0198) is kept, and is what it says
   again after Unhide.
7. **Nothing else changes for anybody.** The person stays in the room, so its agents keep answering
   it (ADR 0204); the others' lists, sheets and pushes are as they were, and nothing on the log says
   it. Search still finds the room, and a decision's push still opens it. Select picks a hidden row
   where it shows, as it picks an archived one; a Hide in its bar of acts can come later.

## Consequences

- One more table beside the log, which a rebuild does not touch, and which an erase clears with the
  room's faces and pins. A person taken out of a room, or who leaves it, keeps their row: brought
  back, the room comes back hidden, as they left it.
- A hide made on the phone reaches the Mac at its next connect, as a face chosen there does. Until
  then the Mac still lists the room, and the phone already stays quiet: the server decides pushes.
- The web's narrow bar no longer counts a hidden room's unread in its dot.
- A server older than this answers the routes `404`: the hide is put back, and the phone says the
  server is older than the app, as a face does.
- Proven by the server's route, notifier and migration tests, core's store and rules, the phone's
  list and sheet tests, the web's Shell tests, and two specs against a real server:
  `apps/web/e2e/the-hidden-room.spec.ts` (Hide from the sheet's foot, Hidden in the rail, a second
  browser of the same person reading it from the server, Unhide) and
  `apps/mobile/e2e/hiddenRoom.spec.ts` (Hide from the sheet, back to Spaces, Hidden opened by its
  chevron, Hidden under the name, Off while hidden, Unhide). `the-room-sheet.spec.ts` still
  expected Leave for the workspace's owner after ADR 0204's addendum; it expects Hide at the foot
  now. The swipe itself, and its slate disc, are the simulator's to walk.

## Addendum, a room slides away (20 October 2026)

Arjun, on the build: "Please make the hide unhide more polished with transition. Right now it just
moves out abruptly". A hidden room left the open rooms in the frame of the press, and Hidden
appeared with nothing to say where it had gone. From the room's sheet it was worse: the room had
moved while he was in it, so it was already gone when Spaces came back. Archive, Unarchive and
Delete from a swipe vanished the same way. The mock showed three ways for the row to go and come
back (A, fold in place; B, slide away; C, drop into Hidden's eye). His words: "Do B, and give
Archive and Unarchive from a swipe the same motion", then "give delete the motion as well".

1. **A room that goes carries on off the edge its act is pushed towards, then its place folds
   shut.** Hide and Unhide, which a row offers pushed right, go off the right edge; Archive,
   Unarchive and Delete off the left. The row goes from wherever the swipe left it, gathering
   speed (280 ms), its tray fading a beat behind it, and the gap closes after (300 ms), as Mail's
   row does when a swipe's button is tapped.
2. **Where it lands, its place opens and it slides in from the other edge.** Under an open
   heading, or among the open rooms, the new row's place opens as the old one folds, and the row
   slides in a beat after (440 ms on the curve a pushed screen settles on). Under a heading that
   is put away, the heading's count changes as the gap closes, and Hidden's shut eye blinks.
3. **A heading comes and goes with its first and last room**: it opens into its place, and folds
   away with the last row under it, instead of appearing and vanishing.
4. **One mechanism, worked out from what moved.** Core's `roomMoves.ts` sets where each room
   stands beside where it stood at the list's last draw, and names the move: hide, unhide,
   archive, unarchive or delete. So a room moves the same whatever moved it: a swipe, the room's
   sheet, Select's Unarchive on the phone, another of the person's devices, or somebody else. Rows
   Select holds as it folds them away or turns them to dust are its own (ADR 0181), and are left
   to it. A room that moves again before it has landed, as one put back by a refusal does, stands
   where it now is, its fold or slide turned back.
5. **A room is always seen going.** A move waits, its row where it stood, while the list can't be
   seen: on the phone while a room is open over it, until the room has slid back off, and while
   the sheet that asked about an Archive or a Delete sinks; on the web and the Mac while a dialog
   stands over the rail. A room hidden from its sheet waits for Spaces to come back, then goes.
6. **Reduce Motion moves rows at once**, as before.

### Consequences

- Phone: `useRoomMoves` (`spaces/roomMoves.ts`) works the moves out as the list is drawn, so a row
  that has moved is never drawn gone for a frame; `SwipeRow`'s `going` carries the row off
  (`Going` in `SwipeDiscs.tsx`, which fades the tray); `Fold` can be turned back; `Land` and
  `Blink` are new in `SelectMotion.tsx`. A swiped row that goes is no longer the one the next press
  closes. Web and Mac: `useRailMoves` (`app/roomMoves.ts`) and the `data-move` rows and
  `.side-put` headings in `styles.css`; a row whose animation never ends is let go after 1.6 s.
- On the web, a room unhidden or unarchived from the sheet moves on the rail once the sheet is
  closed, not behind it.
- A landing row is measured lifted out of the run (`Land`). Reanimated leaves what a style last
  set on the view after the style is taken away, so the motion has to end on the row's true
  height; measured inside its place while that was still nothing tall, the row measured nothing
  too, and on the simulator an unhidden room never appeared among the open ones.
- Proven by core's `roomMoves.test.ts`, the phone's list tests (an archived room held until its
  sheet has sunk, a deleted one let go), the web's Shell tests, and the specs above, the web one
  now closing the sheet before it looks for the unhidden room among the open ones. Walked on an
  iPhone simulator against a copy of the live data: Hide, Unhide, Archive and Unarchive from a
  swipe, and Hide from the room's sheet.
