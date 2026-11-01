# 0130. A long reply opens at its start, and the room keeps a reader's place itself

Date: 6 October 2026
Status: Accepted, 6 October 2026. Amends 0074 (the room moves on one transition) and replaces the
mechanism of its addendum of 5 October 2026 (the answer to your message is followed down). Phone
only, with the room's motion on; Reduce Motion and the web are unchanged.

## Context

On 5 October the room learned to follow the answer to your message down from up the history
(0074's addendum). It said a reply taller than the glass still landed showing its end, and that
landing on its start instead was his call. Arjun: "Show the start of long replies instead."

Building it found three faults underneath, each filmed on the simulator against a copy of his data
with a scripted agent that answered with the real 1,529-character lever reply:

1. **React Native's `maintainVisibleContentPosition` keeps a stale anchor.** The room turned it on
   past `NEAR` and off back inside `BACK`. Fabric's scroll view picks the row it holds only while
   the property is on, and keeps the last one it picked when it is off. Turned on again, the first
   change compared that row with where it had been when last picked and moved the list by
   everything that had landed since: a reply and a question, about a screen, up the history. This
   was in the app before today. It is likely part of what he saw on 5 October: he had scrolled up
   to read the previous long reply, sent from there, then dragged the keyboard away.
2. **Left on, the same property holds the room still at the foot.** Reanimated's layout transitions
   commit each frame. With the property on, each frame's commit moved the list's offset by what the
   held row had moved, so the thinking bubble's arrival pushed the offset from 0 to 52 to 89
   instead of raising the room. A lift was undone frame by frame (offsets 94 then 101, 117 then
   152).
3. **A scroll inside a mount deadlocks the app.** The room's first attempt at keeping a place
   itself moved the offset from the layout transition, which runs inside the mount. The scroll
   view's event woke Reanimated's scroll handler. That flushed its updates as a commit of the
   shadow tree the mount was holding, and the main thread waited on itself (`sample` showed the
   whole chain). The app stopped.

And one that was there before: when the thinking bubble left a few frames after a reply landed,
the reply, still coming in, restarted a frame behind where it was drawn. Reanimated reports an
entering view's position a frame late, so the gap over the reply opened by about sixty points.

## Decision

1. **Somebody else's line taller than the glass rises only until its first line is under the
   bar.** The rows still rise by all of its height, as the layout says. The list's offset goes up
   by the rest from the same instant, on the same spring and the same clock (`Lift`, in
   `RoomMotion.tsx`). A row's place on the glass is its place in the list less the offset, and
   the two are one spring at two sizes, so on the glass it is one rise, shorter. The start is
   where the room's first line stands: under the bar and the pinned strip, with the room's margin
   (`Field.top`), against the glass measured as the line lands, not at the last scroll (the
   keyboard may have gone since). A line that fits ends at the foot, as before. The reader is then
   up the history, at its start, as if they had scrolled there.
2. **What changes at the foot during a lift moves where it goes.** The foot's cell has its own
   transition (`foot`). When the thinking bubble goes after the answer lands, the lift follows the
   line it is going to, at the speed it has.
3. **The room keeps a reader's place itself, and the phone no longer sets
   `maintainVisibleContentPosition`.** Up the history, a change's rows are held where they are
   drawn for the frame of the mount and moved to where they are laid out in the next. In that next
   frame the list's offset moves by what the row across the foot of the glass moved (`keep`), so
   the glass does not change. Nothing moves the offset inside a mount: everything the room scrolls
   is from a frame callback, or a lift whose first step is where the list already is.
4. **What you sent, and its answer, are followed from the UI thread.** The line you send from up
   the history (`sent`) takes the list to the foot, and the first line after it that is neither
   yours nor the system's (`answers`) takes it to its start, or to the foot when it is shorter
   than the glass. Both go on the room's spring, after the place is kept. A scroll asked for from
   JavaScript could land first and be undone by it, which the walk caught. With Reduce Motion the
   room is still scrolled from JavaScript.
5. **A move that takes over from one of the room's springs starts where that spring drew the
   view**, not where the layout reports it, so an arriving row keeps its place in the body.

A finger on the glass stops a lift, and none starts under one or under the coast after it. While a
lift moves the list, the offset is the room's, so it does not count as the reader going up or
coming back. Where they stand is decided when it stops.

## Consequences

- Filmed after the change, the long reply lands at the foot as one rise: 2, 8, 12, 16, 18, 18, 18,
  18, 16, 14, 12, 10 … 2 points a frame. Nothing reverses, there is no dip at the start and no
  drift at the end, and the gap between the question and the reply holds at 43 to 45 points while
  the thinking bubble goes. A short reply lands as before.
- Send from up the history, drag the keyboard away, wait for a slow reply: the room comes down to
  the message and holds the reader's place while the thinking bubble grows below. When the reply
  lands, the room goes to its start.
- One film had a single frame of 2 points between frames of 14 and 12. An earlier film of the same
  code had none, so I take it for the recorder, but it is noted.
- A reader up the history sees a line land below them a frame later than before. Nothing on the
  glass shows it.
- A lift running when another change lands under a reader up the history is moved with it at
  once. If the reader starts a drag at that moment, the lift stops and the finger has the list.
- Not walked on his iPhone (iOS 27, 120 Hz) before going live. Jest mocks the motion, so the room's
  tests check which way each line lands (`rises`, `sent`, `opens`, `answers`) and the scrolls Reduce
  Motion still makes. The simulator walks are the proof of the motion.

## Addendum, 7 October 2026: a room opened at a line (ADR 0133)

A room opened at a line it has (a search result, a link, a push) is now placed there before it is
seen: its list is held unseen, the line is asked for at once from frame callbacks, and the list
fades up with it in the middle of the glass. Nothing here changes. Nothing scrolls inside a mount,
the room keeps a reader's place as above once it is shown, and a link followed in a room already
open still goes to its line in view. A room opened far up keeps every row to the line drawn for a
few seconds; the list keeps the measurements of the rows it then lets go, so nothing moves.

## Addendum, 20 October 2026: a send near the foot goes to the foot, and a row arrives once (PH-21, PH-22)

Arjun: "on rare occasions, the animated bubble and final destination ends up under the message
box, instead of scrolling smoothly and landing above the message box." Two faults, both filmed on
the simulator with a scripted agent before anything changed:

1. **A send from a little above the foot landed under the field (PH-21).** Within `NEAR` the room
   keeps nobody's place: the rows rise by what lands, and the list's offset stays where it is.
   Since 0074 took the send's own scroll away, nothing took a list a little above its foot down
   to it. So a send from 50 points up put its bubble 50 points below its place, half under the
   field, and the words flew down onto the field to meet it. Decision 1 leaves the list exactly
   there whenever a reply is less than `NEAR` taller than the glass. In the walk every long reply
   did, at 37 points, and every send after one landed low. And the flight asked the offset whether
   the room was far (`> NEAR`), while the room asks `far`, which stays up until `BACK`: a send made
   between the two on the way back down flew to a line the room was holding off the glass.
2. **An arrival played again whenever its cell was drawn again (PH-22).** Arrivals are decided
   once per line, but each cell read its line's arrival afresh on every mount. The list lets go of
   cells far outside the glass and draws them again as they come near. So an answer from earlier
   in the visit came in again: `answer` lifted the list to its start, the lift brought older cells
   near, and they did the same. On the film that was about 510 points in one frame, then up the
   history a reply at a time, to an identical reply from 8:32, twice. The probe caught `open`
   asking for offsets of 2,703, 3,136 and 3,569 points.

Decided:

1. **A message you send from near the foot asks the room for the foot** (`homeward`,
   `Field.home`). The change that draws its line takes the list there, flown or not, on the room's
   spring and from the same instant as the rows it moves (`row`). So on the glass the room rises
   once, by the line and by what the list was off its foot. Up the history it is as before
   (`send`). A lift to the foot follows nothing at the foot (`follow`), since nought is the foot
   however the foot changes.
2. **The words go for where the bubble will stand once the list is there:** where the room says
   the bubble is, less what the lift has yet to move it (0115's "where it will stand").
3. **The flight asks the room's own `far`.**
4. **A row arrives once, in the cell first drawn for it.** The cell says when it is in
   (`onArrived`), the list keeps those rows by its own key, and a cell drawn again for one of them
   is drawn where it stands.

Filmed after:

- From 37 points up, the bubble rests at 398.7 to 452.7 points, as a send from the foot does. The
  copy rises from the field with no dip, and nothing changes at the swap. From 87 points up (a
  nudge on top of a long reply), the same. From 90 points on the way back down the send does not
  fly, and its line takes the room down (`send`).
- Ten long replies in one visit, then a nudged send: no move of 60 points or more in one frame
  but the keyboard's. On the probed run, nine exchanges played 18 arrivals once each, and flicking
  up the history played none.
- Not walked on his iPhone. Jest checks which sends fly and that a send near the foot asks for the
  foot. The cells and the motion are the simulator's to prove.
