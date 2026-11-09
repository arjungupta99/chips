# 0268. The room on the Mac and the web reads as the phone's

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's word of 2 November ("I think the desktop app and web
are super behind ... thoroughly walk through each and make sure they are parity with phone, highly
polished"). What the phone has already settled is built here; what it does not settle went to him
as a mock (the right of a Mac window, and the face at the head of the room), and he picked A1 and
B1 on 3 November (points 9 and 10).

## Context

The room was walked on 3 November 2026: the web build of f3a07cef on a scratch server, at a Mac
window's size, dark and light, in the Demo and in a room with a scripted agent raising an approval
and a question; and the phone's room from its code and its web target against the same server.

The phone's room has read like Messages since ADR 0050 (11 September 2026): one author's bubbles
said close together close up into a turn with the time on the last, a line says the day and the
hour over the first message and after a quarter of an hour's quiet, a room of two draws no faces,
the receipt is asked for and never shown, and the thinking bubble waits a beat. That ADR left the
desktop "free" and expected it to follow in its own task. It never did: the web drew a face beside
every bubble of theirs, in a room of two too, a time in every bubble, no day anywhere, and a boxed
`3s · ≈$0.08` in monospace under every reply.

The line menu was a list of Reply, Not right?, Pin to the top, Edit and the deletions; the phone's
lifted menu (ADR 0200) has who said it and when at its head, then Reply, Copy, Select, Edit or
Share, Pin, and under them Not right? with what it does, What the run did with the receipt's line,
and the deletions. The web's field said "Message, or type / to steer, pause, or stop…", cut off
at 1024 points with the run panel open; the phone's says "Message, or /command", and "This space is
closed" in a closed one. The web's question card said "Or type an answer…", "If nobody answers in
1h, Quill will take the default." and Answer; the phone's says "Or say it in your own words",
"It will take “19 November” if nobody answers.", "Lapses in 57 min — then it takes its own
default." and Send the answer. The room sheet closed by its X and by a Done at its foot; the
phone's sheets close by their X alone (ADR 0169's option 2).

Two things the phone does not settle, since it has no right of a window and its bar has no face,
went to Arjun as a mock (`room-mac-choices.html`, 3 November). The run panel stood to the right of
every room that had had a run, ended or not, keeping 300 points to say when an ended run started
and what it cost. The header wore the last run's agent, lit while it worked, and with no run the
name's letters: Tax receipts said TR while its row in the list wore its receipt icon.

## Decision

1. **Turns and the day.** Core's `turnsOf` (`packages/core/src/turns.ts`, the phone's
   `groupLines` moved to where both can read it) gives each line its place in its author's turn and
   whether the day and the hour stand over it; `separatorLabel` says `Today 1:05 AM`,
   `Yesterday …`, `4 September …`. The web's rows are drawn from it: a turn's bubbles stand two
   pixels apart with the corners that meet at five, the name in the first, the time in the last
   (a line still on its way, or refused, says so wherever it stands), and a quiet centred line for
   the day. A route over a message and the agents' talk either side start turns of their own, as
   on the phone. The bubble's tail corner goes: a bubble alone has its full corner all round.
2. **Faces.** A room of two draws none; a room of three or more draws one beside the last bubble of
   a turn, at its foot, and keeps the room beside the others so they line up.
3. **The receipt is asked for.** No receipt under a reply. The menu of the line that closed a run
   with steps or a cost offers What the run did, its receipt's line under it; it opens under the
   bubble as Not right?'s form does: the line, the steps, and the model and tokens when the run
   gave them, with an X. A failed run's status line keeps its receipt where it stands.
4. **The thinking bubble waits 800 ms** from its run's start, and for the reader's newest line to
   be the server's, then stands until its harness stops, whatever is sent meanwhile. Counted from
   the run's own start, a room opened on a run long going shows it at once.
5. **The line menu** has who said it and when at its head, then Reply, Copy (which says Copied a
   beat before the menu goes), Edit and Pin or Unpin; under a rule, Not right? with "Tell Theo, and
   it tries again", What the run did, Delete for me and Delete for everyone. Select and Share are
   a phone's: on a Mac the words select where they stand. Every line with words has a menu now.
6. **The phone's words** for the field (core's `FIELD_PLACEHOLDER`, `CLOSED_FIELD_PLACEHOLDER`) and
   the question card (`QuestionCard` in `packages/ui`): the default it takes, when it lapses and
   what happens then, over Send the answer; the "default" pill beside the option goes, since the
   line says it.
7. **The room sheet closes by its X** on every page, the head of each with it at the right; the
   Done at the foot of the first page, Add and Invite goes.
8. **Files dragged over the room** stand the phone's and the iPad's frame inside its edge (ADR 0256
   §6): a dashed line in the accent over a faint wash of it, and "Drop to add to your message"
   (core's `ROOM_DROP_WORDS`) in the middle, where the web drew only a dashed outline. Only a drag
   that carries files is the room's; words or a link dragged inside the page go where they go, so
   a phrase dragged into the field lands there again. The frame stays through the bubbles inside
   the room and goes when the files leave or land (`room/RoomDrop.tsx`).
9. **The run panel stands beside the room only while a run is going** (Arjun's A1): queued,
   running or waiting on someone (core's `runGoing`). It comes with the run and goes when the run
   ends, and the room has the width; what an ended run did is asked of its reply (point 3). The
   conversation reads in a column of 680 centred in the room, the messages and the field's row
   both, as the iPad's (ADR 0256 §4); the field's rule and ground run the room's width. A space
   with two visits keeps the panel while either's run goes, showing the one picked, so its picker
   can switch back.
10. **The header wears the room's own face** (Arjun's B1): the one its row in the list and the head
   of its sheet wear (`spaceAvatar`), lit while there is work going in the room, as the row's is.

## Consequences

- The web's `MessageList` measures a row's margin by its turn (`data-place`), since a turn's
  bubbles are two pixels apart and every other row twelve.
- The phone still draws from its own `groupLines` and `when.ts`, and still says its field's and
  question card's words itself; switching it to core's is a phone change, left for that side.
- The Steer chip, the run panel while a run goes and the decided approval card under the newest run
  are the web's own and stay. The space's details beside the room, the iPad's column of 320
  (ADR 0256 §6, the mock's A2), were not picked; the room sheet stays a sheet.
- Beside the bubbles of a turn that wear no face, the room kept for it is as wide as the face: an
  agent's pins stand 4 points out past its box (`clearOfPins`), so its gap does too.
- Tests: core's `turns.test.ts` and `readers.test.ts` (`runGoing`); `LineMenu.test.tsx` for the
  order, Copy, the head and What the run did; `room/RoomDrop.test.tsx` for the frame and what it
  takes; `Shell.test.tsx` for turns, faces and names in a room of two and of four, the receipt from
  the menu, the sheet's X, the panel going with the run and the header's face;
  `question.test.tsx` for the words. The Playwright specs that waited for Done wait for the Add
  page's head, or close by the X; those that read an ended run's panel wait for it to go, and the
  approval loop reads its steps from the reply's What the run did.

## Addendum, 3 November 2026: the room moves as the phone's

Arjun, that evening: "everything should have smooth transitions and look highly polished", for the
web and Chips for Mac. Walked frame by frame in WebKit (Playwright's) on the Demo and a scratch
server with a scripted agent. What follows is the phone's way where it has one; the run panel's
motion had no precedent and was mocked (`room-panel-motion.html` in the session's notes, P1 built).

1. **A room opens at its end on its first frame.** `content-visibility: auto` on `.msg` laid the
   first frame out in WebKit with every row at its 60-pixel stand-in, so a room opened short of its
   end and glided down to it as the rows took their real heights (with a 160 ms frame). The list
   keeps only the rows near the window already (`MessageList`), so they are laid out whole.
   Switching rooms stays at once, as the iPad's pane does.
2. **A picture holds its size before it comes.** A photo alone in its album is the phone's size
   (core's `aloneTile`, `tileShape`: its own shape within 3:4 to 1.8:1, at most 200 tall and 240
   wide), said from what the server measured; a picture alone in a message's Markdown is 240 wide at
   its shape once it has come, remembered by address. Both stand on the phone's ground
   (`--surface-3`; the tile's `--bg-2` was no token and stood a light slab in a dark room) and fade
   up once decoded.
3. **A room that fits its glass stands at its foot**, by the field, as the phone's and the iPad's
   inverted lists do: a line that lands pushes the ones over it up on the room's spring.
4. **The run panel slides in and out, and the room glides** (`room/panelMotion.ts`): in from the
   window's edge as a run starts in the open room and back out as it ends, while the column, the
   field and the head's buttons go from where they were drawn to where they are, on `--motion-slow`
   and `--ease`, by transform and opacity: the field's contents, not its band. The panel comes over
   the room's ground. A room opened draws its panel as it is. The panel waits
   the thinking bubble's beat from its run's start (`THINKING_GRACE_MS`, now core's), so a run over
   in less never shows it, where it slid in and straight back out.
5. **The sheet turns its pages as the phone's** (`Pages`, ADR 0110): the page left fades out where
   it stood behind the one that comes, and the height follows the page whenever it changes, not only
   on a turn, a glide that ends short gliding on. Media & files, laid out before its files had come,
   glid to nothing and jumped back.
6. **A jump glides to a line already drawn** (a reply's quote, its Back, a pin), as the phone glides
   its list to a row it has; one up the space not drawn goes at once, as the phone places one
   unseen. **A line of yours sent from up the space takes the room to its end**, as the phone's
   follows yours (`useFollowOwn`): on the spring from within a window, at once from further.
7. **What comes and goes without a rule of its own fades**: the drop frame and a file staged in the
   field, on the motion tokens. The reply strip goes at once on a send, as the phone's.
8. **One vocabulary.** The grow dialog, the sheet's pages, the thinking row's words, the aim menu,
   the reply strip, the room files' older versions and the call strip's chips are on
   `--motion-fast/base/slow` and `--ease`, where they had 120 to 320 of their own; script reads the
   steps from the page (`motionTokens.ts`). The phone's own numbers stay where it moves the same
   thing (the call strip's 220/280/260, the pills' 180), and so does the longer choreography (dust,
   the asking film, Universe). The room's hovered controls change colour on `--motion-fast`.
9. **Reduce Motion stills all of it**, a dialog's backdrop too (`*::backdrop` in `base.css`).
10. **A room catching up on its history stays at its end.** A long room's history comes in pages
    after it has opened, and the list followed each page down on the spring, through nothing drawn
    but the stand-in for rows off the page (ten thousand lines: a blank glide of 600,000 pixels,
    and with rows laid out whole it could stop halfway). A glide from where no row is drawn goes at
    once, as the phone places a row it has not drawn (`roomMotion`'s `wayOf`).
11. **Up the space, a line that changes height moves the lines over it, not those under it**, as
    the phone's list does from its foot (ADR 0167): a line deleted closes the lines over it down
    on its place, and Undo opens them again, while the lines under it stand still. The list held
    the line across the middle of the window, which with a turn's 40-pixel rows was over the line
    deleted, so the lines under it rose and fell by a row (`deleting-place.spec`, failing on main).
    A line under the held one that grows or shrinks in the window takes the scroll with it, its
    space under it too (`MessageList`'s `grownUnder`).

Measured in WebKit on a room of 300 lines: wheel scrolling up and down, no frame over 18 ms; a hard
fling, one of 53; a send and its reply with the panel coming and going, none over 34.

## Addendum, 8 November 2026: only open asks stand under the lines

Arjun, of a room on the Mac: "why are there so many giant permission boxes in mac app? iphone / ipad
dont have them (which is good)". This ADR kept the decided approval card under the newest run as
the web's own. For an hour and Let it work (ADR 0281) made that every command an agent ran. In that
room, 96 of the day's 100 asks had been answered by a standing yes, one run left 29 cards, and none
was waiting on anybody.

1. **The room draws the asks still waiting on somebody, every run's, as the phone does**
   (`RoomAsks.tsx`, the phone's `openAsks`). That ends the web's own decided card. Who answered what
   stays on When it asks you and in the workspace's log. The run panel lists an ask tied to a step
   as that step, without who answered it, and names who answered only the asks tied to no step.
2. **A card that closes while it is drawn says how for 750 ms and folds on `--motion-slow`**, so the
   lines over it glide down. Approve keeps its tick for that time rather than turning into a line,
   as the phone's ask screen holds its ask.
3. **A new ask waits 300 ms to be drawn.** Of those 96, 87 were answered within a frame and 95
   within 300 ms, and the store draws once a frame: drawn at once, a room under Let it work would
   flash a card for most commands. An ask answered inside its beat is never drawn. One already
   waiting as the room opens is drawn at once.

Tests: `Shell.test.tsx` for what a closing card says, the fold, the tick and the beat; the browser
specs now read that an answered card has gone. The card's own words stay covered by the unit tests,
since a browser spec reading them inside a moment of 750 ms would be a race.
