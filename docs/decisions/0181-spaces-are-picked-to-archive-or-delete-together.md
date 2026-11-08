# 0181. Spaces are picked to archive or delete together

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's word from the mock ("Looks good. Go with your
recommendations"). Adds to the Spaces list on the phone (`spaces/List.tsx`); the swipe (ADR 0066,
ADR 0067, ADR 0178) and the lock (ADR 0156) are unchanged.

## Context

Arjun, 16 October 2026: "Next, I want a batch select option. It should allow batch delete,
archive. It should also respect locked state. Build a mock first".

A room is archived or deleted one at a time today, by pushing its row aside (ADR 0066, ADR 0067)
and answering the sheet that asks. Clearing out a dozen finished rooms is a dozen swipes and a
dozen sheets. A room whose changes are locked offers neither act and slides on Locked instead
(ADR 0156); the Main room offers nothing (ADR 0069).

The mock (a private artifact, 16 October 2026) walked one way through it and offered two choices:
how picking starts (A, a Select button by the list's name; B, a long press on a row, which would
move changing a face to the room's details only) and how Archive asks (A, once for the batch, as a
swipe asks; B, at once with Undo). He took both recommendations: A and A.

## Decision

1. **Select, at the end of the list's name, starts picking and becomes Done.** It is a capsule of
   the room's glass (`Capsule`), beside the connection's mark when that shows, and stands only where
   there is a room this person could pick. A long press on a row still changes its face.
2. **While picking, each row is a checkbox.** Its words move over for a circle that slides in at its
   leading edge, the rows a beat apart from the top, and its chevron fades. A press picks it: the
   circle pops blue with its tick, the row takes a wash of the blue, and the phone gives the
   selection tick. The swipe is still. The name says "Select spaces", then "3 selected", and a line
   under it says what can't be picked, with Select all (and Deselect all) at its end.
3. **A locked room can't be picked, nor can the Main room or a room this person may do nothing to.**
   A locked row wears Locked's graphite disc (ADR 0178) where the circle would be; pressed, the row
   shakes, the shackle lifts and clicks shut, and a note over the bar says it is locked and to
   unlock it in its details. The Main room wears nothing, and its note says it is always there.
   Core decides who may pick what (`mayPick`): what a swipe would offer Archive, Unarchive or Delete
   on, never a locked room, and so never more than a swipe could do. A locked room archived before
   it was locked can still be brought back by its own swipe; a batch leaves every locked room alone.
4. **The tab bar and the gold + step aside for a bar of two acts**, Archive and Delete, in the tab
   bar's place, each a flat disc of its act's colour with its word and how many of the picked rooms
   it would take (`batchOf`): "Archive 4", "Delete 3" when one of the four is a room only archiving
   can take. A disc is grey while its act would take nothing, and lights with its mark's one move
   when it comes to have something. With every picked room archived, Archive is Unarchive.
5. **Archive asks once for the batch**, on the sheet a swipe's Archive puts up, with the rooms'
   faces stacked at its head and their names under them; core words it (`archiveManyAsking`). The
   rows fold away and picking ends. Unarchive happens at once, as a swipe's does.
6. **Delete asks**, says which picked rooms it leaves ("Dana stays: you can only archive that
   space"), offers one switch for the lone agents of the rooms that have one (ADR 0087 rule 5:
   "Delete their 2 agents too"), and says what each harness does with its side (ADR 0069)
   (`eraseManyAsking`). It asks the server room by room and waits; a room the server refuses stays
   on the sheet with how many went and why the rest did not, to be asked again or left. The
   deleted rows go to dust, as a message deleted for me does (ADR 0167), and fold away.
7. **One room picked is asked about exactly as its swipe asks.** The batch sheets fall back to the
   single room's words.
8. **Reduce Motion** lets every spring, timing and fold jump to its end, which Reanimated does
   itself; the dust becomes a fade, as Delete for me's does.

## Consequences

- No server change: Archive sends the same change for each room that a swipe sends, and Delete the
  same erase, one after another.
- The motion lives in `spaces/SelectMotion.tsx`, which `jest.setup.js` mocks; the controls, the
  sheets and the rules are in `spaces/Selecting.tsx` and core (`putAway.ts`), where the tests reach
  them. The tab bar is asked to step aside through `ui/tabBarAside.tsx`; the system hides its bar at
  once, unanimated, so the bar of acts rises over the moment it goes.
- A row's words move over by a transform, and the row is laid out again only at rest (see the
  addendum), so the time, the unread count and the chevron pinned to its end stay put while the
  face, the name and the last line move.
- The web target's drawn bar steps aside the same way. Web and the Mac app have no batch; Shift-
  and Cmd-click in their list could follow if wanted. (They pick since 17 October: see the
  addendum of that day.)
- Walked on a simulator (16 October 2026; a Release build with this JavaScript, against a scratch
  copy of the live data): Select turned the rows into checkboxes and the tab bar and the gold +
  went; locked rows wore the padlock and, with the Main room, stepped back, and a press on one
  shook it and raised its note; two picks counted "Archive 2" and "Delete 1" where one room could
  only be archived; Archive's sheet asked once for two, and for one exactly as a swipe does, and the
  rows folded once the sheet had gone; three picked archived rooms came back at once on
  "Unarchive 3"; Delete asked with the lone agent's switch, waited for the server, and the two rows
  went to dust and folded; dark mode too. What the walk found, and what changed for it: the line
  under the name was cut short, so it says "Locked spaces and Main can't be picked"; rows that
  can't be picked did not step back, and now do; a fold behind the sinking sheet was never seen, so
  what goes waits for the sheet (`SHEET_OUT_MS`); at Done every row dimmed and the circles vanished
  rather than sliding out, so a row keeps its mark; the sheet's words changed under the spinner as a
  room's agent went with it, so they are held while the server is asked.
- Not walked: Android, where whether `hidden` hides Material's bar and where the floating + goes
  as it steps aside are unverified (the "Android chips testing and polish" session offers the
  emulator walk, `testing/scenarios/devices/android.md`); the iPad; a delete the server refuses
  (the tests cover it); the selection tick, which a simulator cannot make felt.

## Addendum, 16 October 2026: the words move by a transform, and a row's line is short

Arjun, on his iPhone: "I am noticing frame drops in the animation when I tap the select button."
Measured on a simulator of his data (29 open rooms) with a frame probe on the UI thread and
`sample`, before changing anything: from 150 to 600 ms after the tap every frame took 50 to 80 ms,
about fifteen frames a second. Each frame laid every row out again at a new padding, and every
row's one-line name and last line were truncated and drawn again at the new width
(`RCTParagraphTextView drawRect:` and TextKit's truncation were half the main thread's work).

- The face, the name and the last line move by a transform (`Shifted`, `ShiftedText` in
  `SelectMotion.tsx`); the time, the count and the chevron do not move. A row is laid out again
  once each way, in the frame its words start to move over (the transform holding them where they
  were) and in the frame they come to rest back home, so the text is never wider than its room.
- Each row takes its turn on its own beat, from the top of the screen down and then those off it,
  measured on the UI thread: laying all 29 rows out in one frame took 85 ms; one row, 3.
- One row still took 30 to 50 ms each time it was laid out: its last reply was 11,673 characters,
  and a one-line text view lays out all it is handed to cut it to a line. Core's `lastWords`, which
  the phone's rows, the sheets and the web sidebar read, now gives the start of the message, 200
  characters of plain words out of its first 4,000.
- `Row` is memoised, so picking redraws each row's checkbox and not its face; tap to motion went
  from 90–150 ms to 40–100 ms. The tab bar steps aside as React lays the screen out, and the bar
  of acts is drawn from the render that shows it, so it rises from the start of its spring.

Result on the same simulator, the app tapping Select by itself (Maestro's accessibility snapshots
take main-thread time of their own): frames at 17 ms through the motion; about one toggle in two
still drops a single frame near its start, as React's first commit lands, with no one part
(the bar, the line under the name, the tab bar) to blame. The phone runs at 120 Hz, where a frame
has half the time: a probe on the phone itself would say how this lands there.


## Addendum, 16 October 2026: Select comes and goes as one motion

Arjun, after the Agents tab had Select too (ADR 0182): "when the "select all" banner appears the
rows below shift abruptly. Please make everything highly polished", and then "a blur bar needs to
show below the archive and delete buttons at the bottom (similar to nav)". Filmed on the simulator
frame by frame, what changed in a frame was: the rows, thirty points down as the line under the
name came and back up as it went; the tab bar, hidden and shown unanimated; the screen's name and
Select or Done, swapped; and the Select capsule, a few points narrower for Done.

- **The line under the name glides** (`ui/UnderMotion.tsx`, for any screen's `under`, so Search's
  chips too). As it comes, a view at the head of the list takes its height at once and the list
  below is held up by that much and let down on the rows' own spring, while the line fades and
  drops into its room; as it goes, the line fades first and the list is drawn up, the room let go
  in the frame the spring ends. The list moves by a transform (`UnderBody`, which carries the
  list's own content style): opening the room by its height on every frame laid out where every
  row stood on every frame, a dropped frame or two more on each press. The band behind the name is
  drawn at its height with the line and moved by a transform (`UnderBand`). Search's results are
  laid out under its chips at once, as they come with them.
- **The name and Select crossfade** (`ui/Swap.tsx`): "Spaces" to "Select spaces", Select to Done;
  the count in "2 selected" changes in place, as a count does in Photos. The capsule is as wide for
  Done as for Select.
- **The tab bar slides away and back**, as UIKit slides it. React Native Screens 4.26.0 hides it
  with `setTabBarHidden:animated:NO`; `patches/react-native-screens@4.26.0.patch` (the repo's first
  `pnpm` patch) asks for `animated:` once the bar is on screen. A native change: the phone build
  needs `pnpm phone pods` first, since the patched package lives at a new path.
- **The bar of acts stands on blur**: the band the name stands on (`EdgeBand`), at the foot of the
  screen, solid to the bar's top and fading out over the rows above it, risen with the bar by its
  own height and never faded (`RiseBehind`). The note about a row that can't be picked is drawn
  over it. The room the list keeps under its last row for the bar opens and shuts with the bar
  (`PickRoom`), so a list scrolled to its end is not pulled down in a frame on Done.
- **The bar no longer moves with the tab's inset.** `NativeTabs` wraps each tab in a safe-area
  provider of its own, whose bottom is the tab bar's top: it went from 83 to 34 points a quarter of
  a second into the tab bar stepping aside, and back as it returned, and the bar, placed by it,
  jumped 49 points up as it sank on Done. The bar and the note stand on the window's insets, as
  the + does. The floating screen pads its sides itself rather than through a safe-area view,
  which lays all it holds out again whenever any inset changes, the bottom included.
- **A row off the screen is not a spring.** On its beat it is laid out and shown over or back at
  once: every row's moving parts on a spring, Reanimated's commit on each frame was most of the
  main thread's work while the list moved.

Measured on the simulator of his data, the app toggling Select by itself, twelve toggles: 2.5
single dropped frames (33 ms) a toggle, 1.5 over the first six before the Mac's memory filled
(peers were building); the worst frame 37 ms. Before these fixes the same build dropped 3.7, and
the A/B said what each part cost: the line's room by layout about 1.5, the tab bar's inset change
about 1.4. What drops now is one frame as the tab's inset changes, and one as the last of it
unmounts after Done. Walked: Spaces and the Agents tab, in and out, light and dark, filmed.

## Addendum, 17 October 2026: the web and the Mac pick too

Arjun: "add Select to the web and Mac too". The Mac app carries the web build, so one change does
both. The rail picks rooms as the phone's list does, with the same rules and words: who may be
picked and what the dialog says are core's (`mayPick`, `batchOf`, `archiveManyAsking`,
`eraseManyAsking`), and so now are the words for what can't be picked and why, and the sum that
keeps a row going where it stood (`picking.ts`: `hintWords`, `whyNotPicked`, `keepLeaving`; the
phone's `spaces/picking.ts` hands them on).

- **Select stands in the Recent heading, beside the gold +.** While the rail picks, the heading says
  "Select spaces", then "2 selected", Select is Done, and the + folds out of the way. Done or Escape
  ends it.
- **The rows are checkboxes.** A circle opens at each row's leading edge, moving the face and words
  over; a click picks, and a shift-click picks every row that may be picked from the last one
  clicked, as a desktop list does. A locked room and the Main room step back, and a click on one
  shakes it and says why over the bar. The archived rooms, once shown, may be picked too.
- **Select all** is a line under the heading, with what can't be picked; it glides open and shut,
  and the rows glide with it.
- **The bar of acts is a frosted band across the rail's foot**, held there as the rail scrolls and
  flush with the bottom: Archive, or Unarchive where every room picked is archived, and Delete, each
  with its count. Its height opens with it, so it is also the room under the last row.
- **Archive and Delete ask in the confirm dialog** (`select/BatchDialog.tsx`), with the one switch
  for the rooms' lone agents (`ConfirmDialog` now reads `agentsToo` and `roomsToo`). It goes room
  by room; a room the server refuses stays in the dialog, with why, for another go. Unarchive
  happens at once.
- **A row going is held where it stood and folds shut**, or blurs away first when deleted, while
  its copy unfolds in the run it went to (Archived, or the open rooms). Each list tells a row which
  run it is drawn in, since a row held as it goes is no longer where its run would be worked out
  from.

The parts are in `apps/web/src/app/select/` (`usePick.ts`, `PickParts.tsx`, `BatchDialog.tsx`,
`rooms.tsx`, `agents.tsx`) and the "picking" section of `styles.css`. Walked in a browser against a
scratch server (4495) with his data, dark and light, at desktop and phone widths: Select, three
picked, Archive 2 asked and done (the rows folding out of Recent and unfolding under Archived),
Unarchive 2 back, Delete 2 with one picked room staying, the agents' switch off, a locked room's
note. The walk found three things, fixed before this was written: the Select all line kept six
pixels shut (its padding), a row folding stopped at its own padding and snapped shut, and the bar
stood off the rail's foot with rows showing under it (room made with the rail's padding). The
Web Animations API, not frame timing, said what ran: the browser pane was hidden, which throttles
its frames.

## Addendum, 18 October 2026: Read, the bar's first act

Arjun: "In the spaces tab when we tap the select button. I also need an option to mark all spaces
as read". A mock put it in two places, the bar or the line under the name; he picked the bar (A),
and asked whether it would only appear when something is unread: no, "keep in place".

- **Read is the bar's first act on the Spaces list**, before Archive and Delete, as Messages has it
  on an iPhone. With nothing picked it says **Read all** and reads every room: the locked ones, the
  Main room and the archived ones too, which can't be picked but have nothing to fear from being
  read. With rows picked it says **Read** and how many of them have anything unread, as Archive and
  Delete count what they would take. With nothing to read it stays where it is, greyed, so the
  acts beside it never move under a thumb.
- **It happens at once and picking ends**, as Unarchive does. It asks nothing first: no message
  changes, only the counts. There is no Undo, since read marks only move forward, as they do when a
  room is opened.
- **A room is read as far as opening it would read it** (`readMark`). Core's `markSpacesRead` does
  it for many rooms with one save and one render (`Store.markSpacesRead`); read marks stay kept on
  each device, so Read all on the phone leaves the Mac's counts as they are. *(Replaced by ADR 0262,
  3 November 2026: the marks are the person's, kept at the server, and Read all reads the rooms on
  every device of theirs.)* The app icon's number
  is unchanged too: it counts asks waiting on an answer, which reading doesn't give.
- **The counts swell a little and shrink away, down the screen a beat a row** (`Counted`,
  `readWave` in `SelectMotion.tsx`), 40 ms a row for up to twelve rows, and each keeps its room in
  the row until it has gone; then the row closes up, as it does when the room is opened. Where a
  count stands on the screen, asked on the UI thread as it starts to go, says how far down the
  wave it is. A count that goes any other way, its room opened beside the list on an iPad, goes
  without waiting for its beat.
- **On the phone the bar's three acts share it**: the discs go from 38 to 34 points and the words
  from 15 to 14.5, and a long one shrinks its words to fit, since "Unarchive 12" is wider than a
  third of a 402-point phone's bar. Read's disc is the counts' gold, with their ink, and its mark
  is the chat bubble with a tick that drops in as the act lights.
- **On the web and the Mac the rail's bar has Read too** (`select/rooms.tsx`, `PickParts.tsx`),
  each act as wide as its words, which are a point smaller. The rail's counts shrink away the same
  way (`Unread` in `Sidebar.tsx`), down the rail a row at a time after Read (`.side[data-wave]`).

The Agents tab and the Archived page keep their two acts: agents have no unread counts.

Walked on an iPhone 17 Pro simulator (Release app, this JS dropped in) against a scratch server on
a copy of his data, and in a browser at the rail's 260 and 220 pixel widths. The walk found two
things, fixed before this was written: every count went at once, because the place Reanimated
hands an exit is the count's place in its row, not on the screen; and a count left to that exit
was taken out of the row at once and drawn over it as it went, the row's time moving under it.
On the web, "Unarchive 12" fits a third of the 220-pixel rail.

## Addendum, 19 October 2026: the picked look stays gone after a delete

Arjun, on his iPhone after deleting ten rooms from Select: "Deletion flow also took a while and
looked and felt buggy". His screenshot shows the list out of Select by its name ("Primal", Select)
while every row is still drawn picking: circles, the locked rows stepped back, OpenCode and Hermes
ticked, and the + stepped aside.

- **What it was.** Not the picking state: `usePick` had ended it. It was Reanimated 4.5.1's way of
  handing a finished animation's values back to React (its static flag
  `FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS`, on by default). Every 500 ms the JS thread asks
  native for the views whose animated props have not changed for a second, and puts those values
  into the view's React props; native also drops what has not changed for two seconds. It dropped
  first and reported after. An animation that came to rest while the JS thread was blocked for
  more than two seconds was dropped without React ever hearing of it, and React went on holding
  the values it had heard before. Here the rows had slid home as picking ended. Then the deletes
  kept the JS thread busy for over two seconds, so React held the rows as last reported: picked.
  The next time a row was drawn again (a deleted room folding away above it), the picked look came
  back, and stayed. On his phone the stalls come easily: a workspace switch costs some 1.8 s, and
  a collection of Primal's heap up to 2.5 s.
- **Reproduced** on an iPhone 17 Pro simulator (Release) against a copy of his Primal: Select all,
  Delete, and the list drew picked again some 3.5 s after picking ended, twice in two runs. Made
  certain with a 2.5 s JS stall placed 1.2 s after picking ends (not kept): every run.
- **The fix** is `patches/react-native-reanimated@4.5.1.patch`: native reports every update that
  has rested for a second before it drops those over two, so React always hears where a view came
  to rest. Reanimated's own code marks the spot (`TODO: fix bug when threshold difference is
  smaller than 1 second`). The same race left rooms invisible after a workspace switch earlier the
  same day (ADR 0197's fourth addendum), fixed then without relying on it. With the patch and the
  same stall, the list ended with nothing picked, twice. A native change: the phone build needs
  `pnpm install` and `pnpm phone pods` first, since the patched package lives at a new path.

Deleting stays one room at a time. On the copy each room took the server 0.3 to 0.5 s, so ten
take some 4 s, and longer through the relay.

## Addendum, 31 October 2026: Select and a delete move without asking the rows

Arjun: "when I tap the "select" button in agents or spaces tab. the selection circles seem to
cause lots of frame drops. I see the same when a agent or space deletion is done, the animation
causes a lot of frame drops. Please investigate, how can we make this butter smooth and fast".
Measured on an iPhone 17 Pro simulator (Release, 60 Hz) against a copy of his workspace, the app
toggling Select and deleting rooms by itself (a scratch probe counting the UI thread's frames, not
kept), with the main thread sampled.

- **A tap on Select drew every row again before anything moved.** The rows drawn again for
  `picking` were 90 of the tap's 120 ms of JavaScript, and their mount fell in the motion's first
  frames; the rows began to move 105 to 210 ms after the tap. Now the list keeps whether it picks
  in a shared value (`PickMotion`, `usePickMotion`), set in the draw that changes Select, and each
  row's words, circle and chevron follow it on the UI thread. The rows are drawn again for it 700
  ms later (`ROWS_REDRAWN_MS`), once they have come to rest: what a press does, what VoiceOver
  says, whether a row can be pushed aside. A press in between asks the list, which knows (`press`
  in Spaces, the Agents tab and Archived). The rows begin to move some 40 ms after the tap.
- **Rows off the screen wait for those on it.** They were laid out over on their beats while the
  rows on the screen moved, a commit nearly every frame; now they are laid out once those have
  come to rest, nearest first (`UNSEEN_AFTER_MS`). The room under the last row (`RiseRoom`) opens
  and shuts on the bar's spring only where it is seen; below the foot of the screen, at once.
- **Fewer specks.** A row off the screen goes without dust, and the rows deleted together share
  330 specks (`LIST_SPECKS`, at least 48 each): nine rows at a bubble's count were two thousand
  views made at once, and their mount was the delete's longest frames.
- **A room deleted under the pinned rooms no longer jumps above them.** A row going is held at its
  place in its run until it has gone (`keepLeaving`), and its place was counted in the store's
  order, which has no pins first (ADR 0240). As the delete went through and the store let the room
  go, it was drawn above the pins for the dust and the fold, the rows under it shuffled down, and
  the frames read as dropped. Filmed on the simulator, and in the build before these changes too.
  The list now hands Select its rooms as it draws them (`drawn`).
- **Not taken: Reanimated's `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`.** The flag sets every animated
  transform and opacity in the app on the view itself rather than through the shadow tree, and it
  cut the main thread's work over Select and a delete by a third. But it is off by default, and
  Reanimated documents that a `Pressable` in a view it has moved can then lose its press: the
  press is measured where the shadow tree last put the view, here a row a swipe has just let go
  of. It is the lever left, for a change of its own with every pressable row walked.
- **Not taken: the dust on React Native's native driver**, one clock for the eraser and every
  speck, each speck's flight drawn as straight pieces of core's. Tried and measured: the main
  thread did as much work, since the native driver sets each speck's view on its own every frame,
  where Reanimated commits them together. Reanimated's per-frame work for the dust was some 500
  samples of the 3,200 busy over two Selects and two deletes; most of the rest is Select's own
  motion.

Results, three rounds of each build on the same simulator. A tap on Select starts the rows moving
36 to 50 ms after it, from 105 to 210, and the main thread's work over twelve toggles fell from
3,550 samples busy to 1,834. Dropped frames on the 60 Hz simulator moved less than the work: a
toggle dropped 2 to 6 frames before and after, with peers' builds loading the Mac. Three rows
deleted dropped 9 to 17 frames in the 1.3 s after (the worst 60 to 73 ms) and now 7 to 9 (the
worst 34 to 40 ms). What still drops, in every build: a frame or two as the specks are made, and
the rows off the screen laid back after Done, which a delete's dust now meets. Not yet measured on
his iPhone, which draws at 120 Hz.

## Addendum, 31 October 2026: Reanimated's synchronous props stay off

The lever left above was audited and measured on its own: Reanimated 4.5.1's static flag
`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` (`reanimated.staticFeatureFlags` in `apps/mobile/package.json`,
read at `pod install`). It stays off.

What it changes, read in Reanimated's and React Native's sources:

- In a frame where a view's animated props are all transform, opacity, colours or radii, they go
  straight onto the view and the shadow tree is not committed. The shadow tree hears them at the
  next React commit anywhere, or at most about 1.5 s after the view's last frame, when Reanimated
  draws settled values again (every 500 ms, for values a second old). A frame that also moves a
  layout prop commits as before. Layout animations (`entering`, `exiting`, `layout`) and React
  Native's own `Animated` are not touched; the sheets already move on the native driver, which draws
  again when each motion ends.
- A react-native `Pressable`, `Touchable…` or `Button` measures its view in the shadow tree as the
  finger comes down, transforms included, and drops the press if the finger then moves outside that
  rect and 20 pt round it (30 below). A still tap never checks the rect, so a simulator's click
  passes; a finger usually moves a point or two. Gesture handler's `Pressable` and buttons test the
  view itself and are not affected. Reanimated's `measure()` reads the same shadow tree.

Every react-native press inside a view Reanimated moves by those props, and every `measure`:

| Where | Press or read | How far off, for how long |
|---|---|---|
| Long-press menu (`LiftedMenu.tsx`, in `LiftPop`) | Reply, Copy, Select, Edit, Pin, the card's rows | held near scale 0.01: the whole menu, about 1 s after the lift |
| A message just swiped to reply (`ReplySwipe.tsx`) | the bubble's tap and long press, quote, route, attachments, pictures, table rows, voice | 15–50 pt across, about 2 s with the keys up |
| A row just swiped back: Spaces, Agents, Archived, a room's agents, a person's devices (`SwipeRow`, `Devices.tsx`) | the row | 82–152 pt across, to the next commit (not reproduced, below) |
| Select's bar (`Rise`) | Read all | 120 pt down, until the rows are drawn again at 700 ms |
| The tab bar after Done (`PhoneBar.tsx`) | the tabs | 114 pt down, 0.2–0.4 s |
| The + window (`newSpace/Window.tsx`) | the ×, harness tiles, the lead | about 300 pt, until the first key |
| An approval card let go mid-swipe (`NeedsCard.tsx`) | Deny, Approve, Details | up to 72 pt across |
| A row landing in its section or coming back (`Land`, `Going`, `UnderBody`) | the row | 30–417 pt, a few hundred ms |
| `measure` for the + window (`(tabs)/_layout.tsx`) | where the window grows from | the + read about 7 pt wider each side, 11 pt higher |
| `measure` for a lift after a reply swipe (`LiftedMotion.tsx`) | where the lifted copy stands | 55–70 pt to the right |
| `measure` for the viewer from a tile just swiped (`MediaViewer.tsx`) | where the picture flies from | up to 60 pt |

Out of it: the composer, the media viewer's own taps (gesture handler), Markdown's links (text
nested in text has no rect of its own), the room's keyboard room (padding, a layout prop), and the
measures for the send flight, the dust, the face column and the scroll colours.

Walked on an iPhone 17 Pro simulator (Release, a copy of his workspace), every tap a touch that
moves 3 to 6 pt as a finger does (Maestro's driver):

- **Copy, tapped 0.6 s after a long press lifted a message:** copied 5 of 5 times without the flag;
  0 of 5 with it. Still taps copied with it; so did taps 1.2, 2 and 3 s after the lift.
- **A Spaces row tapped 0.35 s after a swipe let it go back,** at 60, 200 and 330 pt across:
  opened 6 of 6 times with the flag, as 2 of 2 without. Something commits before the tap there; the
  reading above did not find what.

Measured on the same simulator (60 Hz), three rounds of each build alternated, the same JavaScript
in both, a frame probe on the UI thread and the main thread sampled:

| | Main thread busy, off → on | Dropped frames, off → on |
|---|---|---|
| Select, 12 taps | 14,966 → 9,987 (−33%) | 440 → 322 |
| Three rows deleted | 3,001 → 2,265 (−25%) | 5 → 2 |
| A message sent, 3 times | 4,670 → 3,456 (−26%) | 76 → 36 |
| A row swiped open, back, then opened | 7,755 → 7,269 (−6%) | 186 → 219 |

**Why it stays off.** It saves a quarter to a third of the main thread's work in these motions and
halves the send's dropped frames on the simulator, but with it the first tap on a long-press menu
is lost for about a second, and the table reaches the bubble itself, the list rows, the tabs and the
+ window. Making it safe is every press above moved to gesture handler's `Pressable`, the bubble's
long press inside the reply swipe among them, and the three measures taken another way. Even then,
the next react-native press put inside a moving view would be lost the same way, and nothing would
say so: Jest swaps gesture handler's `Pressable` for React Native's, and a simulator's click does not
move. Turning it on needs the phone app's presses on gesture handler as one rule with a guardrail
that refuses react-native's, and the gain measured on his iPhone at 120 Hz first.

## Addendum, 5 November 2026: rooms are asked at once

A batch asks the server about every picked room at once, without waiting for each answer (ADR
0182's addendum of the same day, core's `actAll`). "Deleting stays one room at a time" above no
longer holds.
