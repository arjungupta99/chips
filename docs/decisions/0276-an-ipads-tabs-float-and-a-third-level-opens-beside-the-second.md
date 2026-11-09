# 0276. An iPad's tabs float, and a third level opens beside the second

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's "Build it" after six rounds of the mock "iPad: a
floating sidebar". Amends ADR 0256 where they differ: its sidebar, the pill it folded into, the gold
+ beside the pill, the details column of 320, and the two-column card of its first addendum.

## Context

ADR 0256 gave a wide iPad Chips' own sidebar, which folded into iPadOS's tab pill at the window's
top when a room's details opened or the list was put away. Arjun, 3 November 2026: "the ipad layout
where we shift the left section (you, agents, Search, You, + ) to the top bar looks off, I think
that menu should always be on the left as floating (accessible through hamburger menu)". In the same
message: You's rows "open in popup, that could open in the right panel", and "whenever we go inside
Agent detail, harness detail their details should open in one column".

The mock (`chips-notes/mocks/ipad-sidebar/`, published as
https://claude.ai/artifact/6Sj1tZtdpvHb5TWaU1mY7z) went through six rounds on his words:

1. The tabs fold into a capsule at the top left, and ☰ opens the sidebar out of it.
2. "the tab left section should always 'float' and not specifically occupy left column", "as then
   we do not have to worry about the third column becoming too thin when it shows".
3. "make the minimized tab bar at the bottom left".
4. "have the right side content take up the full right section width".
5. "a level 3 detail section could show up as third column, with middle section then compressed a
   bit".
6. "show mock of space details as well showing in the 3rd column".

## Decision

1. **The tabs are a capsule at the bottom left, never iPadOS's pill.** On an iPad wide enough for a
   list beside what it opens, the tabs stand in a capsule of glass at the window's bottom left, 16
   in from the edge and 8 above the safe area: ☰, a hairline, the four tabs' marks, and the gold +
   a gap past its end (`ui/Sidebar.tsx`). Its foot is level with a room's composer. UIKit's own bar
   is hidden at every width the capsule shows, as it is under the iPhone's drawn bar (ADR 0233).
   The narrow part of a split screen keeps iPadOS's bar, as a phone's window does.
2. **☰ opens the sidebar, and it floats.** The glass grows up out of the capsule into a sidebar
   from under the status bar to the capsule's foot, over the list, with a scrim beside it: the four
   tabs with their names, just above ☰ and the +, where the finger is; the pinned spaces (ADR 0240)
   and the workspaces when there are two (ADR 0197) above them. A tab, a pinned space, a tap beside
   it or ☰ puts it back. It never takes a column, so the list, the detail and a third column keep
   their widths whatever it does. One motion: 0.52 s on iOS's ease out, each mark travelling from
   its slot to its row a frame after the one before, the names fading in once the glass is round
   them (`ui/SidebarMotion.tsx`).
3. **Over a narrow room at the window's edge, the capsule folds to ☰.** Where the list is put away
   or has stepped aside, the detail starts at the window's left under the capsule. There the
   room's composer starts past the capsule and the +, and when the detail is under 700 the capsule
   folds to ☰ alone so the composer keeps its width. Each tab's split says where its detail
   stands (`setFoot`), so the capsule follows the tab in front.
4. **A detail beside the list is one column across the whole pane.** An agent's card and a
   harness's page read in the phone's order down the pane, as wide as the pane: the two columns of
   ADR 0256's first addendum go (`ui/Columns.tsx` is removed). So does the 760 column inside a pane
   (`useColumn`) and the room's 680 column beside the list (`useRoomColumn`); groups keep their
   margins and a bubble its own width. On a phone and in a window with no list beside, nothing
   changes.
5. **A third level opens in a third column.** A page one level below the detail stands in a column
   of 420 at the window's right, under a bar whose × goes back to the detail alone, and the detail
   narrows for it (`Split`'s `third`): an agent's message history and the harness page its
   Instructions open; a harness's own job and the pages its page opens (ADR 0252, ADR 0254); a person
   opened from People, their row chosen beside them. A fourth level pushes inside the column with a
   way back. Where the detail would be left under 540, the list steps aside for it: on a 13-inch
   iPad on its side the list stays (340, 616, 420), and upright, or an 11-inch on its side, the list
   steps aside (612, 420). Where no third column fits (narrower than 960, an iPad mini upright, the
   iPhone Duo), the third page has the detail's place and its × becomes the way back.
6. **A space's details are the room's third column.** Opening them stands them beside the room at
   420 rather than 320, with their pages pushed inside, and the list steps aside where the room
   would be under 540, as in decision 5. They no longer fold the sidebar away, since nothing is
   folded. They stay open from space to space, as before. Search's room keeps its sheet.
7. **You's sheets are pages beside the list.** Your face, Decisions, Quiet hours, Agents, the
   attachment limits, the messages between agents, Allowed always, Send feedback (with a Main agent),
   Pair a computer and Delete your account open in the pane, their row chosen, as People, Relay and
   Connection already did. Each sheet and its page draw one body, held by the same state as the row
   (`useYou`), so a row says what its page has just changed. A form's Save stands in the pane's bar.
   Media on this iPad fills the pane. Workspace and Connect a harness stay sheets: Spaces' name and
   the Agents shelf's last tile open them too. Questions before something that cannot be undone
   stay alerts.
8. **The New space card opens in the middle.** With the + at the foot, the card that hung under the
   + at the top of the window (ADR 0256, decision 3) stands in the middle on the keys, as it does
   under Android's and the web's + at the foot. A send still fills the room's side beside the list;
   the sidebar takes nothing from it.

## Consequences

- What stands around the panes (`ui/chrome.tsx`) holds whether the sidebar is out, the details
  open, the list put away, and each tab's foot. `folded` and the room's `roomFolds` are gone, and so
  are the pill's measured places (`PILL_END`, `PILL_TOP`, `PILL_HEIGHT`) and the + beside it.
- The capsule's geometry is fixed numbers (`CAPSULE` in `chrome.tsx`), not a measurement of UIKit,
  so a later iPadOS does not move it.
- Reanimated cannot be loaded under Jest here, so the sidebar's motion is its own file, stood in by
  plain views in `jest.setup.js`. The third column's entrance is React Native's `Animated` on the
  native driver, which Jest runs.
- A detail inside Spaces that docks its own column (the details) tells the split how wide it is
  (`docked`), so the capsule knows how wide the room is under it. Found on the walk: without it the
  capsule stayed wide over a room of 612 and squeezed the composer.
- Not in this decision: an agent card's Model and Icon still open as popovers beside their rows,
  where the mock showed them in the third column; the iPad mini and the 11-inch were worked out,
  not walked.
- Walked on the iPad Pro 13-inch simulator, dark, in the Demo workspace, with this build's bundle
  in a Release app: upright, the capsule with Spaces chosen; ☰ opening the sidebar and Agents
  putting it back; Hugo's card in one column; his message history in a third column, the list
  stepped aside and the capsule folded to ☰ and the +, × bringing both back; Birthday dinner's
  details beside the room, Media & files pushed inside them. On its side: the list, the room and its
  details together under the full capsule; You's People with Rosa in a third column; Quiet hours as
  a page; the + opening New space in the middle. Not walked: pinned spaces and a second workspace
  in the sidebar (the Demo has neither), light mode, a member or a guest (no +), the iPad mini, the
  11-inch, Stage Manager sizes, the web target (which keeps its rail).

## Addendum, 3 November 2026: Settings' margins, columns that move, an agent inside the details

Arjun, on build 202611040609 on his iPad, the same night: "the right section content needs some
margin on left and right, similar to how ipad settings have"; "the third column appears without any
transition, abruptly, please make it smooth transition"; and "space detail section, tap agent, you
enter agent detail page abruptly, ideally content opens in the third column itself when it is opened
from there".

1. **A page beside the list has Settings' margins.** Measured on the iPad Pro 13-inch simulator,
   iPadOS 26.5: Settings' cards are never wider than 896 and stand in the middle of its pane, and
   never nearer an edge than 16. Upright that is 16 either side of a pane of 702; on its side, 75
   either side of 1046. A page in the detail or the third column now does the same (`useColumn`,
   `PANE_GROUP`): a group of 896 at most, centred, its own margin of 16 inside the column. On a
   13-inch on its side a page beside the list has 70 either side; upright, 16. This replaces decision
   4's "as wide as the pane" for what is wider than 928. A room keeps the whole pane, as decision 4
   says: a line of chat keeps its own width.
2. **The columns move.** The list, the detail and the third column are each a box whose width moves
   on the sidebar's timing (0.52 s on iOS's ease out, `PaneMotion.tsx`), all three on one curve, so
   they add up to the window at every frame and the detail is laid out at each width between. The
   third column holds its page at 420 at the box's left, so it slides in from the window's edge as
   the box grows, and out as it shrinks, its page kept until it has gone. The list holds itself at
   the box's right, so where it steps aside it slides out to the left, and back. A space's details
   beside the room move the same way (`Sheet`'s docked column), so do the list and the room as they
   open upright. A turned window takes its new widths at once, as UIKit turns it. Where it steps
   aside the list stays drawn, out of reach of a tap and VoiceOver, rather than `display: none`.
3. **An agent opened from a space's details opens inside them.** Where the details stand in a
   column beside the room, an agent's row pushes its card inside the column under "‹ Milo", with
   its message history a page further (`RoomAgent.tsx`); the details stay open, and nothing stands
   over the room. Where the details are a sheet, a row still closes it and opens the card over the
   room. An agent named in the room, outside the details, still opens its card over the room.

Walked on the 13-inch simulator in the Demo: Quiet hours on its side (group 410 to 1306 in a pane
from 340); You's People with Rosa coming in and going out on its side and upright (the list sliding
out and back); Birthday dinner's details opening and closing upright, the room's bubbles and composer
laid out at its new width afterwards; Milo's card and history inside the details, and back; and a turn
with the details open. Recorded and read frame by frame; not walked on a device.

## Second addendum, 3 November 2026: the room's margins, an agent's choices and Universe beside

Arjun, on build 202611040651: "we need the same left right margins for message window as well in a
space"; "When we tap option in the Agent tab --> agent details, all options should open in the third
column instead of popup"; "Space--> Universe section --> open in third column".

1. **A room beside the list has Settings' margins too.** Its lines and its foot stand in the page's
   column (`useRoomColumn`, `PANE_COLUMN`, now in `Split.tsx`): at most 928 with a line's own margin
   inside, in the middle. On a 13-inch on its side the room's lines run from 410 to 1305, as a page's
   groups do; with the list put away, from 240 to 1135. This replaces the first addendum's "a room
   keeps the whole pane". Where the column stands in the middle at the window's edge, the composer's
   room for the capsule is less by how far in the column already stands.
2. **An agent's card opens its choices in the third column.** On the Agents tab, a sheet opened from
   the card (Icon, Model, Put in, Move to and Copy to another space, Heartbeat, a context file's
   conflict) stands in the third column under its X instead of beside its row or over the window
   (`Split`'s `sheetsBeside`, `useThirdHost`; `Sheet` shows itself there as it does docked beside a
   room). It comes and goes on the columns' motion; one opened while another stands there takes the
   column and the other closes. Where no third column fits, it is the sheet it was. Questions before
   something that cannot be undone stay alerts. This settles the first walk's "Model and Icon still
   open as popovers". Not yet for a harness's page.
3. **A space's Universe is the column beside the room.** It stands where the details do, at 420,
   and one puts the other away (`chrome.tsx` holds which); the list steps aside for it upright as
   for the details. Leaving the space puts it away. Seen from a search, and where no column fits, it
   is the sheet it was.

Walked on the 13-inch simulator in the Demo: Birthday dinner's room on its side beside the list and
with the list put away; Milo's card with Model and Icon each in the third column and each taking the
column from the other (which found two sheets drawn in one go closing each other, now taken only as
a sheet opens). Universe was not walked: no space in the Demo has a project; a test stands it beside
a room.

## Third addendum, 4 November 2026: Universe's head, its button, history over a choice, the room's margins

Arjun, on build 202611040732: "top header for universe section is overlapping stuff"; "tapping the
universe button again should close the universe view if it is already open"; "agent tab --> agent
detail --> message history, it can open under another section opened in the third column"; and "in
Space, when 3rd column is open and 1st column is collapsed... it is missing the same margins we show
when messages are in right section".

1. **Universe's tabs stand under its name in the column.** On an iPad its Phone and Desktop tabs stood
   on the name's line, 280 across, which a column of 420 has no room for: they ran over the name and
   the X. A sheet docked beside a room or standing in the third column now says it is the third side
   (`ThirdSide`), and Universe there lays its tabs out under its name, as on a phone.
2. **Universe's button puts it away again**, as the details' button does.
3. **History takes the column from a choice.** An agent's message history and its harness's pages,
   opened from the card while one of its choices stands in the third column, close the choice and
   take the column (`ThirdHost.dismiss`), rather than opening underneath it.
4. **A room's margins are in proportion to it.** The second addendum gave a room a page's column in
   the middle: 70 either side beside the list on a 13-inch on its side, but 14 at the window's edge
   beside its details there (956), and 16 upright. Its lines now take 89.6% of the room, up to the
   page's 928 (`ROOM_SHARE`): 70 beside the list on its side, 66 at the edge beside the details, 52
   beside the list upright, 48 at the edge beside the details upright. In proportion, so it changes
   with the room at every width the columns move it through, and the composer's room for the capsule
   is less by as much. Pages keep Settings' column.

Walked on the 13-inch simulator in the Demo, upright: Birthday dinner beside the list (52 either
side) and at the edge beside its details (48), the details sliding in; Milo's Model in the third
column and Message history then taking its place. Universe was not walked (no project in the Demo):
tests stand its tabs under its name in the column and close it from its button.

## Fourth addendum, 5 November 2026: no ☰ and no sidebar, a bigger bar on the composer's line

Arjun, looking at his iPad: "the hamburger icon and floating section needs to go away. The bottom
tab bar needs to become slightly bigger (with the new extra space)", and, picking A from the mocks
(`chips-notes/mocks/ipad-tabbar`), "the + icon alignment is important, in your mocks they align well
with the + in the messages screen. In the current iPad app they do not".

1. **☰ and the sidebar are gone.** The capsule is a bar of the four tabs' marks alone (`PadBar.tsx`,
   which was `Sidebar.tsx`; its motion `PadBarMotion.tsx`). What the sidebar held was already at the
   top of Spaces: the pinned spaces first in the list (ADR 0240), the workspaces from its name (ADR
   0197). `chrome.tsx` loses `open`.
2. **The bar is bigger, across the list's foot.** The bar and the gold + run across the list, 16 in
   from each side, as the iPhone's run across the phone: 56 tall (48 before), the + as tall as the
   bar (44 before), each tab a quarter of what is left (58 on a 340 list, 48 on a 300 one; 44
   before), marks 25 (21 before).
3. **The bar's middle is the composer's.** The capsule stood its middle 32 over the safe area's foot
   and the composer's field 37, so the two +s were 5 points apart, and different sizes. The field's
   height and its foot now live in `spaces/fieldShape.ts`, which the composer and `PAD_BAR.middle`
   both read, so they stay on one line by construction. On the 13-inch simulator both +s measure
   1318.75 upright and 974.75 on its side.
4. **Over a narrow room it folds to the tab in front,** not to ☰: where a detail starts at the
   window's edge under the bar and is under 700 wide (upright with a third column open), the bar
   shrinks to the round of the tab in front, the way iOS 26's own bar does. A press on it opens the
   four out again over the room's foot, on the ground the bar has over the list (through the glass
   alone the composer's + showed between the tabs); a tab, the one in front again, or a tap beside
   them folds them back.

Walked on the 13-inch simulator in the Demo with this branch's JavaScript in a Release build:
Spaces upright and on its side with Birthday dinner open, its details upright (folded to Spaces,
opened out, Agents chosen from it), Milo's Model in the third column upright (folded to Agents),
light and dark; the fold and the opening out recorded frame by frame. Not walked on the 11-inch or
the mini, where the bar is narrower (tests hold its width there).

## Fifth addendum, 7 November 2026: Connect a harness is a page too

Decision 7 kept Connect a harness a sheet. ADR 0284's addendum makes it the pane's page beside
Agents' list and You's alike, its pages held by one provider for both; Workspace stays a sheet.

## Sixth addendum, 8 November 2026: a pane moves when its length changes, and the row lights first

`Widening` and `Clearing` took their first length at once and then, a render later, set off from
there to there for 0.72 s, because the style that started a move ran again for anything it depended
on. A width is a layout, so each frame of that was a commit of the whole tree. A room opened beside
the list has two or three of these boxes. A length is now held in a shared value that moves only
when the length changes (`usePaneLength`). Changing rooms, on the 13-inch simulator with a copy of a
real workspace, went from 53–76 Reanimated commits to 3–4.

The room beside the list is drawn a step behind the one picked (`useDrawnRoom`, on React's deferred
value): the row lights about 70 ms after the tap, where it used to wait for the whole room, and a
room still being drawn is let go for the next one tapped. What a link asks of a room (where to land,
its Add, its sheet) goes only to that room, not to the one still standing while it is drawn.
