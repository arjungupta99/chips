# 0279. A room takes a new width once, under frost

Date: 5 November 2026
Status: Accepted, 5 November 2026, on Arjun's "Build it" after two rounds of the mock "iPad Room
Resize". Amends ADR 0276's first addendum, decision 2, for the room. The frost is gone since the
third addendum (6 November 2026): the lines' words go instead, and the bubbles stay.

## Context

ADR 0276's first addendum made the panes beside an iPad's list move: the list, the detail and the
third column are boxes whose widths move on one curve, and the detail is laid out again at each
width on the way. A space's details and Universe beside the room move the same way. Arjun, 5
November 2026: "whenever we have the message window resizing, there are major frame drops from all
the message bubble resizing. We need to figure out a solution for this transition, either make the
transition performant, or show a blur overlay while the resizing is taking place. mocks first".

The cause, read from the code: on every frame the room's box has a new width, so Fabric lays the
whole room out again on the UI thread, every row the list has drawn wraps its words again (the list
keeps four screens either side of the glass, `windowSize={9}`), and every row whose height changed
tells JavaScript so. That doesn't fit in a frame, and the columns stall with it.

The mock (`chips-notes/mocks/ipad-room-resize/`, published as
https://claude.ai/artifact/Dv8SdcbeZsPsv3dcaxhHV7) offered three ways: A, the lines frost over and
take their new width once; B, the rows on screen only, laid out at every width; C, a still of the
room dissolving over the room at its new width. His note on v1: "in the frost design the message
still resize abruptly, we need smooth transition everywhere". In v2 each message glides from its old
place and shape to its new one under the frost. He picked A.

## Decision

1. **The room's lines take a change of width once.** On an iPad, where the split says the room's
   width (`useDetailWidth`), the room's box still moves on the panes' curve, and so do its bar, its
   composer and its pins, which are a few views. The lines don't: they stand in a box of their own
   width (`useHeldWidth`), which holds the width they have while the frost comes up, takes the new
   one in one render once the frost says it is up, and lets go once the columns have stopped, when
   it is the room's own width again. A turned window, Reduce Motion, and the room's first drawing take the new width at once,
   as before. That box knows the width it holds itself (`TapAway`), so a change of it draws the box
   again and not the room: drawn again three or four times on its way, a long room kept the details
   from setting off for a quarter of a second.
2. **Each message glides to its new place and shape.** The one layout moves every row and bubble
   whose frame changed, and the room already moves those on Reanimated's layout transition, on the
   UI thread with no layout (ADR 0074). For a change of width the move is the panes' ease out over
   0.48 s on the room's clock (`roomGlide`), not the room's spring, so every message lands together
   and none is still going when the frost clears. A reader up the history keeps their place: the
   list's offset glides with the line across the foot of the glass, on the same curve, rather than
   jumping a frame after (`Lift.slide`).
3. **Frost covers the lines while they move.** A blur with the page's colour over it comes up over
   the lines in 0.06 s, before anything in them moves, and clears from 0.4 s into the glide over
   0.22 s, as they come to rest (`RoomFrost`). The bar, the composer and the columns stay sharp
   above it. The blur comes up by its intensity, never its opacity (ADR 0200), and it is drawn in
   the same render as the change, so it comes up from nothing: asked up once that render had been
   drawn, it had come up before the blur was there, and appeared whole in one frame. It keeps the
   steady clock, which a frame moves by at most a frame and a fifth (`withSteadyTiming`, beside
   the app's steady spring), and waits 50 ms on it before it comes up: the change mounts the
   details' pane too, and reached the screen three frames after the fade had been let go, so the
   first frame drawn with the frost in it was 88% of the way up. Nothing under it moves in the
   wait. The frost says when it is up and when it has cleared, and the lines and its going wait
   for that, not for a timer: on the steady clock a stall holds it back, and taken away on the
   wall's clock it went from frosted to sharp in one frame.

## Consequences

- One layout of the room per change of width, done by React off the UI thread, then only
  transforms of frames until it has landed. How long a room is, and how fast an iPad is, no longer
  decides whether the columns keep their frames.
- Under the frost the words in a bubble are already at their new width while the bubble's frame
  glides to it, so they spill or are cut for half a second. The frost is there for that.
- Rotation already laid the room out once (ADR 0276's `useTurned`), and still does, with no frost.
- The lines' width is said from the split's and the details' widths, not measured: a room laid out
  at a width that is not the room's would stay wrong until the next change. The lines let go of
  their width at rest, so the room is always its own width once still.
- The Agents tab's third column narrows a page of groups, not a room of messages, and keeps moving
  as before.

## Measured

On the 13-inch iPad simulator, 5 November 2026, in a room of 60 long lines (30 sent, each
answered), every change recorded with `simctl io recordVideo`, which writes a frame only when the
screen changes, and the room's pixels compared frame to frame:

- Every frame that moved anything came within 38 ms of the one before, over six openings and
  closings of the details, four of the list going and coming back, and an opening and closing
  from up the history. Today's build, recorded earlier the same evening under a heavier load, held
  frames for 45 to 63 ms in the details' moves and 77 and 148 ms in the list's.
- In one build switching between the two on alternate changes, under the same load, the room laid
  out at every width did not stall either (37 ms at most), so the simulator does not show the drops
  Arjun saw. What it does show: the room is still 0.6 to 0.8 s after the press's first frame
  against 1.05 to 1.1 s on the room's spring, and the first frame moves as soon as before (250 to
  290 ms after the tap against 310, Maestro's tap included). The iPad itself is the measure that
  is left.
- The frost comes up over two or three frames, and was one before the wait; it clears over five to
  seven, and went from frosted to sharp in one frame before it said when it had cleared.
- A reader up the history keeps the line across the foot of the glass where it was; the rows above
  it glide to their new heights over it.

## Addendum, 6 November 2026: every line goes one way

Arjun, on his iPad with the build above: "the blurring screen works, but there is some weird
abrupt bouncing of content underneath whenever left or right columns are collapsed".

Two causes, both seen on the simulator with the frost made clear to see through. On a 13-inch on
its side, the room's lines are a column of 928 standing in the middle of the room, with the list or
without it (ADR 0276's addendums). The box that held their width stood at the room's start. With
the list going away, the column rode the room's start out with the list while the frost came up
(the invite card 446 → 200), then jumped back to the middle in one frame as the box took its new
width (→ 333) and drifted there (→ 276). The column itself is not a view that glides: only rows
and bubbles do, and none of them had changed. And the room's moves were told of the glide from
JavaScript as the lines took the new width, so the layout was sometimes drawn before they heard:
the rows went on the room's spring, the column jumped 22 points with the details closing, and the
rows came to rest 4 points past where they stopped, after the frost had gone.

4. **The lines' box stands where it keeps every line going one way.** In the middle of the room
   where their column is as wide at the new width as at the old, within a point: the column goes
   with the room's middle frame by frame, and none of its rows changes. At the room's edge that
   stays put where the column narrows or widens, its start when the details or Universe come or
   go and its end when the list does: the lines stand still on the glass while the frost comes up,
   and each row glides once, from where it was drawn to where it lands. Kept to the middle there,
   a column narrowing beside the details went the way the room's middle did and came back as it
   narrowed. The box's change of width moves the column's start on the glass at once, by an amount
   said from the two widths; the rows it moves set off from where they were drawn rather than with
   it (`Field.shift`), and only the one layout it is told for takes it (`useHeldWidth`, `RoomMotion`).
5. **The room's moves are told on the UI thread before the lines take the width** (`glideFor`):
   the glide and the shift are written there, and only then are the lines laid out.
6. **The room cuts off the box where it is wider, and the frost covers the room** rather than the
   box, so a box wider than the room on its way is drawn inside it, frosted to its edges.

Measured on the 13-inch simulator, the frost made clear, every frame of the room's change
recorded and the edges of a bubble of yours and the invite card read off each one: the list going
and coming, with the details and without them, and the details opening and closing three times.
Every edge went one way, by up to 398 points, with nothing back past a point of rounding; the card
moved at most 3 points a frame where only the lines moved it; no frame came more than 22 ms after
the one before. With the real frost, the whole room frosts from the list's edge to the details',
under a sharp bar and composer, while the lines stand still and then glide.

## Addendum, 6 November 2026, later: frost, then the move, then clear

Arjun, on his iPad with the addendum above: "the blur appears abruptly, it needs to come and go
away with a transition as well. First blur, then resize then de-blur". The frost came up in 60 ms,
which reads as a blur that appears; the panes set off with it, so the room was moving before it
was up; and it began to clear 400 ms into the lines' glide, while the panes were still moving.

He also sent a room stuck with a band of gold standing halfway across a reply. The reply was the
line a notification had opened the room on, which stays the one lit while the room is open
(`Flash`, in `Motion.tsx`). Its sweep set off again at every change of the line's width, so every
column coming or going sent it across again, under the frost and after it; on the simulator it
crossed the card's line at each of the four changes, and on his iPad one stopped where it was.

7. **One after another.** The frost comes up over 200 ms (`FROST_UP`), seen coming. The panes
   beside the room wait until it is up (`PaneLead`, given by the Spaces tab from `useFrostLead`
   while a room is what its pane shows, and nought elsewhere), on the steady clock as the frost
   does, so a stall holds both back alike; what a column shows is kept until it has gone, wait
   and all. The lines take the new width and glide as the panes set off, and the frost clears over
   240 ms once the panes' 0.52 s is past (`FROST_CLEARS`), when they and the lines have landed.
8. **A lit line's flash is drawn only until it has played.** ADR 0219's addendum of the same day
   plays it once for each time the line is lit, and not again at a new width. On top of that, the
   band crosses the width it set off with, though the line is laid out anew on its way, and the
   light and the band are then not drawn at all, so nothing gold stays beside the line on the
   native driver.

Measured on the 13-inch simulator with the real frost, the details opening: the room sharp at
0 ms, frosting at 200 ms and up by 330 ms with nothing moved; the panes from about 380 ms to 800 ms
under it; the frost clearing from about 880 ms. With the card's line lit by *Go to message*, no
gold through the details opening and closing and the list going and coming.

## Addendum, 6 November 2026, night: the words go, not the room

Arjun, with the frost sequenced as above on his iPad: "I want to try another design, get rid of the
blur. when we tap: hide text (not bubbles), resize, show text".

9. **No frost.** The words in the room's lines fade out and back, and nothing is laid over the
   room. Each bubble's name, words and time stand in a view that takes the room's one value for how
   much of its words are drawn (`Ink`, in `RoomWords.tsx`), and so do the latest line of a fold of
   agents talking, a day's separator and a line in the margin. The bubbles, the cards, the faces
   and the pictures stay drawn. `Ink` is a plain fragment anywhere the room's width does not change
   this way: the iPhone, the web, and Reduce Motion.
10. **One after another, as before.** The words fade out over 150 ms after the same 50 ms wait
    (`WORDS_OUT`, `WORDS_WAIT`); the panes wait for that (`PaneLead`, from `useWordsLead`); the
    bubbles glide to their new frames as the panes move, with nothing in them to wrap again; and the
    words fade back over 200 ms once the panes' 0.52 s is past (`WORDS_BACK`, `WORDS_IN`). The fades
    keep the steady clock and say when they have finished (`gone`, `back`), as the frost did.
11. **The room's list draws past its own frame beside an iPad's panes** (`overflow: "visible"`),
    and the room cuts off what is past its edges. With the frost gone, a bubble gliding in from
    outside the box its lines had taken was cut off at the box's edge: a bubble of yours came in half
    drawn as the details opened (the simulator, 6 November 2026).

Measured on the 13-inch simulator, the details opening: the words fading from about 140 ms and gone
by 280 ms with nothing moved; the details and the bubbles moving from about 300 ms to 750 ms, every
bubble whole; the words back by about 950 ms. The details closing and the list going and coming the
same way.

## Addendum, 6 November 2026, late: what stands round a bubble

Arjun, on his iPad with the addendum above, of a long reply with "1 file changed" under it: "This
1 file changes text bounces oddly between transitions". Only views with a move of their own glide
(decision 2): the row's cell and the bubble. What stands round a bubble in its row is laid out at
the new width at once, so with the bubble a line taller or shorter it stood where the bubble was
going while the bubble glided there: the marks under it, the route and tags over it (which, on a
message of yours, stand at the edge the column moves), the face at a reply's foot and the pictures
hanging under it.

12. **Words round a bubble go with its words** (`Ink`): what the room says under a message (its
    reactions and corrections, "heard this while working", the waits, the replies mark and "1 file
    changed"), its route and its tags, and the time under a line of files alone.
13. **What is not words glides with the bubble** (`Gliding`, in `RoomWords.tsx`): the face at a
    reply's foot, and the box its pictures hang in, a picture of yours as a box of its own at the
    right. Where the room's words go, they move on the room's move (`Moving`), and nowhere else.
    The box that glides is the one the bubble's new shape moves: put round the pictures inside it,
    the move had nothing to do, and the box under it jumped down 22 points in a frame.

Measured on the 13-inch simulator, with "1 file changed" under every line and each reply four
times its length: the marks go with the words and come back in their places with them; the
picture under a reply that grows a line moves one way, up, with the details opening (its top 106,
92.5, 77.5 points, where it went to 128 first), and down with them closing; the face stays at its
reply's foot.

## Addendum, 7 November 2026: upright, with a column beside the room

Arjun, on his iPad upright with a space's details open: "in ipad portrait, when a space is open,
there is no way to view the spaces list, the message bubble transitions we created above basically
do not work", and then "this was happening with third column open in portrait". Upright, the list
steps aside for the details or Universe (ADR 0276), so the room's left edge moves with its right,
and the room starts at the window's edge under the tabs' bar. On the 13-inch simulator upright:

- The words went and the panes moved as decision 10 says, but what stands at the room's foot did
  not wait for them. The bar folded or opened out the moment the column was asked for, and the
  composer took its new clear of the bar at once. Opening the details, the composer jumped a
  hundred points right before anything moved; closing them, it slid under the bar, and the bar
  opened out over it, the gold + over "Message Theo" for 400 ms, before the list came back.
- The list's rows rose thirty points under its name as it set off: it stopped taking touches the
  moment it was told to step aside, and iOS laid its scroll out again for that.
- The list's button put away a list that had already stepped aside, so nothing brought it back.

14. **The bar and the room's foot go with the panes.** The split tells the bar the panes' lead with
    the detail's foot (`Foot.lead`), and the bar waits as long, on the steady clock, where it folds
    or opens out because of that foot; a tab chosen or a press moves it at once. The composer keeps
    clear of the bar in a box of its own round its row whose padding goes with the panes
    (`Clearing`, in `PaneMotion.tsx`).
15. **The field grows up, not sideways.** The field's glass (`GROWS_UP`) and its words' row and Send
    (`RISES`) take a new place and width across at once: moved a little every frame, each frame
    began a transition from where the last had got to, and the field trailed the + beside it and
    was drawn over it, and Send trailed out past the field's edge.
16. **A list stepping aside is a thumb's and VoiceOver's until it has gone** (`useGone`), and theirs
    again at once as it comes back, while its box is still shut.
17. **Upright, the list and the column take turns** (ADR 0276). The list's button says the list is
    away when it has stepped aside, and brings it back by putting the details or Universe away, as
    the details' button steps it aside.

Measured on the 13-inch simulator upright, the details opening, closing, and the list's button
with them open: the words gone by about 250 ms with nothing moved; the list, the column, the bar
and the composer moving together from about 300 ms, the + and the field a constant 8 points apart
and Send inside the field; the list's rows still; the words back by about 1 s. On its side, the
list going and coming: the composer goes with the list, where it jumped 110 points before.

## Addendum, 8 November 2026: the panes go when the lines go

Arjun, on his iPad: "when I open close the 3rd column, the column sometimes overlaps the bubbles,
and then bubbles resize later, which looks off". Decision 10 has the panes wait as long as the words
take to go, and wait there on the UI thread, by the clock. The lines take the new width some way
behind that: the words say they have gone, JavaScript hears, the UI thread is told of the glide,
JavaScript takes the width, React draws it and Fabric lays every row out again. Whenever JavaScript
was busy or the layout long, the column had gone most of its way before a bubble moved: the panes'
curve covers half the distance in its first tenth of a second.

Held up for 300 ms at the moment the words had gone, on the 13-inch simulator upright, the column's
edge came onto a bubble of yours and stood on it (741 and 741, 709 and 709, 688 and 688), and the
bubble only began to narrow under it after that.

18. **The panes set off when the lines are drawn at the new width.** Past their lead the panes, the
    room's foot and the bar go on waiting, on the same clock, until the commit that draws the lines
    at the new width says so (`Told.waiting`, `panesWait`, `SteadyHold`). The hold starts in the
    commit that holds the lines, and it is what the room's state says rather than something told
    once: nothing waits for a room that has closed, a window that has turned, or a room with no
    glide. Nothing waits for more than eight tenths of a second (`PANES_HOLD.most`), so what a
    column shows is kept that much longer, drawn in a box already shut (`useKept`, `useGone`).
19. **The hold is asked for by a worklet, not read as a shared value.** A shared value in a style's
    closure is an input of that style: opening the hold ran the style again, and the panes' timing
    started over, lead and all, 200 ms after the lines had set off.
20. **The words say they have gone for each change.** A width that changes once the words have gone
    found them "going" still, so their fade was not run again, nothing said they had gone, and the
    lines waited for ever with their words away (`HeldWidth.change`).
21. **The lines let go a little later,** 120 ms past the glide rather than 40 (`LET_GO`): the panes
    set off a frame after them now, where they used to be a round trip ahead.

Measured on the 13-inch simulator, a bubble of yours and the column's edge read off every frame of a
recording. The lines and the column set off in the same frame, opening and closing, upright and on
its side, with the bubble's edge a steady 50 points clear of the column's all the way; and the same
held up for 300 ms as above. Every edge went one way.

## Addendum, 10 November 2026: the list draws past its frame only while it glides

Arjun, on his iPad, in OpenClaw main: "I am not able to completely scroll to top, beyond the
'1. Octopus' message, it keeps bouncing back". The room held two replies of eighty numbered lines.
One of them came as a single paragraph, about 3,450 points tall.

Decision 11 gave the room's list `overflow: "visible"` for good. To Yoga a scroll view that does
not clip is not a scroll view: it measures the list's content as if it had to fit the glass, and a
paragraph taller than the glass is counted at about the glass's height. The rows were laid out to
8,720 points while the content box they stand in was 6,491, so the list ended 2,292 points short of
its first line and sprang back from there (the 13-inch simulator, a copy of his room, measured off
the shadow tree). The iPhone was never touched: its list always clipped.

22. **The list draws past its frame only while the lines glide** to a new width, from the render
    that draws them at it until they let go of it (`HeldWidth.gliding`, given the list as
    `DrawsPast` by the room's box). At rest it clips, and Yoga measures it as a scroll view.
23. **While it glides it keeps at least the length it had as the glide began** (a `minHeight` on
    its content). Left short for the glide, iOS pulled the offset in to the short end before the
    room could keep the reader's place: from the top of that room, opening the details put the
    reader 1,830 points down, in the middle of the eighty animals. Held to its length, the list is
    measured to it, so it stays its full length the whole way.

Measured on the 13-inch simulator, that room: the list reaches its first line; from the top,
opening the details keeps the line at the foot of the glass where it was (7,673 to 8,355 as the
rows above it grew, the length 9,787 the whole glide), and closing them brings it back to 7,673,
the top again. Every bubble, yours at the right edge included, is whole in every frame of the
glide.
