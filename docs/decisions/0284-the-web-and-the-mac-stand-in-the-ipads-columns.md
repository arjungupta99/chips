# 0284. The web and the Mac stand in the iPad's columns

Date: 7 November 2026
Status: Accepted, 7 November 2026, on Arjun's "Build with your picks" after the mock "Web and Mac
in the iPad's columns". Amends ADR 0264 (the Mac's sidebar), ADR 0265 (You as a split), ADR 0268
(the run panel beside the room) and ADR 0269 (Search beside what it opens) where they differ.

## Context

Arjun, 7 November 2026: "I am looking for the chips web and desktop app become similar to ipad app.
I think the top left section with the tabs, + and title are fine. Everything else should try to
follow iPad, specially the first, second third column designs. Provide mocks first".

The web and the Mac drew a rail of 260 with every room under the tabs, whatever tab was open; each
section then laid itself out in what was left (Search its own two columns, You its own split, the
Agents page one long page), and a room had a bar of its own with its face, "N members" and a run
panel that slid in at its side. The iPad (ADR 0256, ADR 0276) stands every tab in the same columns:
a list, what a row opens, and one level deeper.

The mock (`chips-notes/mocks/web-ipad-columns/`, published as
https://claude.ai/artifact/Jn5zD5hfDzf5Y2BLfm2PHg) put the two side by side, section by section, and
asked two questions, each with a pick marked: a narrow window folds the list to a rail of 76 of the
same top-left items as icons (A), and the type stays the web's own faces (A). "Build with your
picks."

## Decision

1. **The top left stays.** The workspace, its gold + and the four tabs stand where they did, over
   the first column at its width (`Sidebar.tsx`). The rooms leave it: they are Spaces' list. The
   first column starts under it at its measured height (`--kept-h`, measured by its border box, so
   the Mac's bar counts).
2. **Every section is three columns** (`Columns.tsx`). The first is the section's list, 340 wide,
   300 in a window under 1200 (the iPad's `listWidth`): Spaces' rooms, Agents' harnesses two by two
   and its agents, Search's field and results, You's rows. A row's face is 48 there. The second is
   what a row opens. The third, 420 wide, is one level deeper, beside the page it came from.
3. **A room is the iPad's.** No bar: a round button at the top left puts the list away, the room's
   name floats in a capsule in the middle (it opens the details too), and a round Details button
   stands at the top right where "N members" was. The room's face is its row's, in the list. The
   lines and the composer read in one column of 928 at most, 89.6% of the room (`Split.ROOM_SHARE`).
4. **The composer is the iPad's** (`Composer`'s `plus`): one round + before the field, which opens
   Photo or file and Voice note, and the field a pill of 44 that holds Steer and Send. The clip and
   the microphone beside the field go into the +.
5. **A page beside the list is one column.** An agent's card, a harness's page, a page of You's: a
   thin bar with the name in its middle, and the groups one column of 896 at most, centred
   (`PANE_GROUP`). A harness's page loses its two columns; Pause and Remove harness are as wide as
   the groups.
6. **The third column holds what is one level deeper.** A space's details: what a section grew as a
   dialog stands in the column instead (`GrowingDialog` docks, unless it `stays`). An agent's Model,
   Icon and Message history; a harness's Recent runs and the pages its page opens; You's second level.
   The run panel stands there beside a room, but only where all three columns fit, so a run starting
   never moves the list.
7. **The list steps aside, as on an upright iPad.** Where a third column would leave the second under
   540 (a window under 1260), opening it folds the first column to a rail of 76: the mark, the + and
   the four tabs as icons, their names and the counts folded away. Closing the third column brings
   the list back. The round button at the top left does the same at any width: it puts the list away
   and brings it back, and where a third column crowded it out, it closes that column.
8. **Columns move on the iPad's curve.** 520 ms on `cubic-bezier(0.32, 0.72, 0, 1)` (`PadBarMotion`).
   Beside a room the words go first (150 ms, after 50), the columns move, and the words come back
   (ADR 0279's third addendum): a room laid out again at every width on the way reads as jumping
   text. What leaves the third column stays drawn until its column has closed.
9. **A phone's width does not change.** At 640 and under: one column, the rail as the menu over the
   page (now the whole page under the bar), Agents' list and each page over the one under it, and a
   grown dialog stays a dialog, since there is no third column to stand in.
10. **The Mac's window is the same.** The lights' bar is each column's own top border, the list's
    top measured under it, and a page's grey runs up under the lights as a room's ground does.

## Consequences

- `Columns.tsx` holds the columns, the third column's host (`useThird`) and the shell's side of
  them (`useColumnsShellState`): whether the list is away, put away or crowded out, and which
  section's third column is open. The shell draws it as data attributes (`data-away`,
  `data-words`); the stylesheet moves on them.
- The run panel's own slide (`room/panelMotion.ts`) and the shell's `data-panel` go: the column
  moves it now. So do "N members" and its styles, Search's own grid (`.search-split`'s), You's
  measure of its own width (`useSplit`, now the window's phone width) and "in this workspace" after
  the harnesses' count, which pushed Select under the list's caption.
- Agents at a phone's width is the stack it was (`AgentsStack`); beside the list it is
  `AgentsColumns`. Spaces' columns are `SpacesColumns` in `Shell.tsx`.
- Tests: the composer's `plus`; Shell's helpers find a room's row in Spaces' list, the tabs in the
  rail's top and the details from Details; the docked details go on Escape and on Details again; at
  a phone's width the details stay a dialog; You's one-column tests are a phone's width; the voice
  e2e spec opens the +.
- Walked in the web app's demo (Look around) on the dev server in Chromium: 1440 dark and light
  (Spaces, a room, its details, the + menu, the list put away and back, a tab changed while it was
  away, Agents' list, Herald's page and its Recent runs, Hugo's card and his Message history, You,
  Search); 1180 dark (details crowding the list out, the round button bringing it back); 390 light
  and dark (the menu, a room and its +, Agents, Hugo's card, You); and the Mac's window by its
  `data-shell` at 1440 (Spaces, details, the list away, Agents, You, Search).
- Not walked: the built Mac app itself, ⌘+ and ⌘−, a real server rather than the demo, a member or a
  guest, a run going beside a room, Search's room beside its results with details. Not in this
  decision: a person opened from You's People in the third column, as the iPad has it.

## Addendum, 7 November 2026: Connect a harness beside the list, on the iPad too

Arjun, the same evening: "I think this "connect a harness " can also make use of right section
instead of popup. Please fix this in ipad as well, if it has popup as well".

1. **On the web and the Mac, Connect a harness is the second column's page.** The shelf's last tile,
   View all's foot and You's row open it where a row's page stands, not as a dialog over the window:
   the gallery, a card's line and its three steps, and the arrival, on the grouped ground the dialog
   had, in a column of 640. Its tile is the one chosen while it stands there (`ConnectShown`). Escape
   and its × put it away at either step, and a row of the list puts it away as it puts any page away;
   a link it made is still followed and the tile counts it down. `GrowingDialog` gains a third way to
   stand (`inPlace`): a section in the page's place, beside the modal and the docked third column.
   At a phone's width it stays the dialog it was (decision 9).
2. **On the iPad, Connect a harness is the pane's page, in Agents and in You.** This amends ADR 0276,
   decision 7, which kept it a sheet because the shelf's tile opened it too: now both open the pane
   beside their own list, the tile or the row chosen. The pages and the link they make stay held by
   one provider (`ConnectProvider`), which draws them in whichever pane holds them (`ConnectPane`)
   and in its sheet only when none does, so a link made beside Agents is still waited on from You,
   and an iPhone keeps the sheet. As every pane a row opens, it has no × of its own: another row puts
   it away, and Say hello or New agent close it as they closed the sheet. The gallery does not say
   its title under the pane's bar, which says it.
3. **The list's Connect tile on the web.** Beside the list the tile drew "Conn…" and a line under its
   mark (ADR 0284 shipped so): the mark now spans both lines, as a harness's face does.
4. **A card picked in Connect's gallery stands in the third column beside it.** Arjun, later that
   night: "Can we also make use of third column here? Tapping detail item under connect a harness
   can open in third tab". The gallery stays in the second column (the pane on the iPad), the card
   picked in it marked as a list marks its open row, and the card's page stands beside it: a harness
   here already and its question, a card's line and its three steps, Anything with HTTP's Advanced
   and its token, and the arrival. Picking another card turns the column to it. The column's × (and
   Escape on the web) puts the card away and leaves the gallery, so the card has no Back of its own;
   Done, Open space, Say hello and New agent close the whole, as before. A link a card made is still
   followed with the card put away, and opens on it again. On the web the card is the docked third
   column's (`GrowingDialog` inside the in-place one, its name level with the gallery's); on the iPad
   the provider hands the split its third column (`useConnectThird`), which the Agents tab and You
   pass beside the pane. A card picked on the empty Agents page's own gallery (ADR 0261) still opens
   in that gallery's place, which is its way back, and at a phone's width it is all one dialog or
   sheet, as before.

Tests: Shell's tests stand the page in the second column, its tile chosen, put away on Escape and
its × at either step and replaced by a harness's page, open from You beside the list, and keep the
dialog at a phone's width; Connect's tests open the pane, not the sheet, keep following a link the
pane was left on, and put the pane away on Say hello. Walked on the dev server against a scratch
Chips server in Chromium (1440 dark, 1180 light, from You's row, and the Mac's window light and
dark), and on an iPad Pro 13-inch simulator (the Agents tab: the tile chosen, the gallery in the
pane). Not walked: You's pane on the iPad, the pane's margins after the walk's fix, a link followed
to its hello in the pane.

Point 4's tests: Shell's open a card picked in the gallery in the third column, the gallery marking
it, turn the column to another card, and put the card alone away on Escape and its ×, with a card
here already asking first in the third column with no Back; Connect's open a card picked in the
pane's gallery in the split's third column, its row chosen, its × back to the gallery with the link
still followed. Walked on the dev server against a scratch Chips server in Chromium (1440 dark: Your
own harness, OpenClaw, Anything with HTTP, Escape on the card; 1180 light: the list stepping aside
for the column and back, Advanced's form in the column). Not walked: the iPad's third column, and
the Mac's window.

## Addendum, 7 November 2026, later: a bubble goes to its new shape

Arjun, the same evening: "please also make sure the bubble resizing is a smooth transition in both
desktop and ipad. currently y I am seeing some abruptness. everything should look very polished".
Asked which resizing, he picked both: a room whose width changes (details opening and closing, the
list put away and brought back, the run beside a room), and a bubble whose words change where it
stands (a queued turn's bubble, the thinking bubble).

Measured in Chromium at 1440, a space's details opening: the words went and came back as decision 8
has it, but in between the room was laid out again at every width on the way. Bubbles' tops turned
back up to ten times, a bubble's edge jumped 190 pixels in a frame and its width 103, and two frames
took 243 and 363 ms: each step of the shell's state drew the whole app again. The thinking bubble's
strip of calls opened 20 of its 24 pixels in one frame: a grid track of `0fr` cannot be shorter than
a row of a set height. And a queued turn's bubble took its new size in the frame its harness edited
it, while the rows under it went on the room's spring.

1. **The room takes its new width once, and everything in it glides there** (`room/widthGlide.ts`).
   The columns tell a room beside them (`useRoomGlide`): just before they set off, its words already
   gone, it notes where what it draws stands; in the frame they set off, with the width it will
   stand at (the stylesheet's widths, and a closed third column's border), its lines take that width
   and hold it (`.msgs[data-held]`) while its box moves round them. Every bubble, face, picture,
   card and fold glides from where it was drawn to where it lands on the columns' own curve and time
   (520 ms, `cubic-bezier(0.32, 0.72, 0, 1)`), so it goes one way however the room's edges move; a
   line of yours from its right edge. A bubble whose shape changes is laid out in a box that holds
   both shapes, the space under it kept as its new one, and drawn clipped from its old shape to its
   new one at its own corners: nothing is laid out again on the way. Everything is read where it
   lands before anything is drawn off its place (read after the first glides had started, a row was
   measured at its bubble's old height and snapped as the glide let go), and held there until the
   columns come to rest (ended first, a frame showed a box at both shapes unclipped). The room's own
   motion (ADR 0242) stands aside while it goes and starts again from where the rows landed.
2. **The shell's state is drawn apart from the app** (`ColumnsShellFrame`). Whether the list is away,
   a third column open and a room's words going live in the shell's element and what reads them, so
   a step of a move no longer draws every room and list again. The words go in the second column
   alone (`.col-detail[data-words]`), and a line's route, the room's own lines and a fold's latest
   line go with them.
3. **A bubble whose words change where it stands goes to its new shape on the room's spring**
   (`room/bubbleShape.ts`), as the rows under it do: its words laid out at their new shape at once
   and held there, its box from the shape it was drawn at to the new one, on the spring as CSS's
   `linear()` from core's `springCurve` (a Bézier near it where a browser has no `linear()`). A
   change while it goes goes on from where it is drawn. A queued turn's bubble a call longer, its
   receipt folding the calls away, a line its harness edited. With less motion asked for, or in a
   room taking a new width, it is simply its new shape.
4. **The thinking bubble's strip opens on its height**, its own 18, over its 420 ms.
5. **The iPad is as it was.** A room taking a new width there is ADR 0279's sequence, the words out,
   the bubbles gliding and the words back; a bubble whose words change is in the room's layout
   transition (`Moving`, `MovingBubble`), so it goes to its new frame on the room's spring already.

Measured after, in Chromium on the Mac's GPU (Metal: headless Chromium otherwise draws on
SwiftShader, whose frames ran 100 to 270 ms whatever was drawn), frame by frame, each bubble's drawn
box with its clip: at 1440 the details opening and closing and the list away and back, and at 1180
the details crowding the list out and closing. No edge of any bubble turned back, none moved further
in a frame than the curve moves at its fastest (48 pixels), and no frame during a move took over
40 ms; the longer frames, 54 and 65 ms, are the click itself, before anything moves. In the demo's
film, the run opening beside a room takes the same glide, and the thinking bubble's strip opens 4
pixels a frame at most. A queued turn's bubble edited five times
in a page made for it went from 176 by 36 to 351 by 61, and back, over the spring's 550 ms, a pixel
or two past and back, as the rows do. The iPad simulator, upright, a space's details opening and
closing on the main of this evening: the words went, the bubbles moved whole, and the words came back
with nothing moving under them.

Tests: `room/widthGlide.test.ts` (what is noted, the held width, where each bubble glides from, the
box at both shapes and its clip, and the let-go), `room/bubbleShape.test.tsx` (the glide, a change
on the way, less motion, a held room, no change of shape) and `Columns.test.tsx` (the room told
before the column sets off and as it does). Not walked: the built Mac app's WebKit itself, and a
real server.

## Addendum, 7 November 2026, night: the line being read stays, and the folded rail's +

Arjun, later the same night: "the scroll position bounces a lot if I am somewhere in the middle of
page and I resize by adding / subtracting the third column"; and of the rail folded to its icons,
"the chips logo next to + button look off. I think the + button can go below the menu options".

Measured in Chromium at 1300, a room of 25 long lines read from its middle: as the details opened,
the line across the middle of the window was drawn 416 pixels up in the first frame and glided back;
as they closed, 848 pixels down, and it glided to 431 pixels below where it had been read. The list
holds the line being read (ADR 0132's addendum) and moves the scroll with any line under it that
grows (ADR 0167), and both ran a frame after the glide had read where everything lands: every line
was drawn a whole move off at the start, and the second took the scroll down by every line under the
middle getting taller at the new width.

1. **The reader's place is kept as the lines take their new width, before anything glides**
   (`startGlide`'s `keep`). Up the space, the line across the middle of the window is noted at the old
   width and put back where it stood; at the end, the list is at its new end, as before. Everything
   is read where it lands after that, so it glides from where it was drawn to where it is now.
2. **The list moves nothing for the room's new width until it has landed.** What its rows measure on
   the way is noted, so the spacers are right; the hold, the lines under the held one and the window
   wait for the glide, and go again from where the rows landed.
3. **Folded, the rail's top is the mark alone, and the + stands under the tabs.** The mark stays
   where it stands with the list beside it, over the tabs' icons; the + beside the workspace's name
   folds away with the name, and a + of the same gold stands a tab's step under You, on the icons'
   line (`FoldedNewSpace`). It stands beside the rail in the shell's one cell, under the rail's
   measured height, so the rail's box and the first column's top do not move; it comes in on
   `--motion-base` once the list has gone, and fades out as the list comes back. It first hung out
   of the rail's box under `overflow-y: visible`, and the Mac's WebKit cut it in half at the rail's
   foot (Arjun's screenshot: "Do you test your changes?"): Chromium drew it whole, and so did
   WebKit's own snapshot of the page, but not WebKit on the screen. A WebKit page is judged by the
   window as the screen draws it.

Measured after, the same room at 1300 from a fifth, the middle and four fifths down, and at 1500
from the middle: the line being read moved at most a pixel, opening and closing, and no bubble in
sight turned back; the fastest moved 29 pixels in a frame, the curve at its fastest. At the end of
the room the list stays at its end. The rail at 1300 folded and back: the mark did not move, the
top + faded with the name in 100 ms, the + under You came in over 300 ms after the list had gone,
and the first column's top stayed at 206. In a WKWebView with the Mac's stylesheet and a room open,
the window captured from the screen as the rail folded and once folded: the + whole each time.

Tests: `room/widthGlide.test.ts` (the place kept once the lines hold the new width, before any
glide), `Shell.test.tsx` (the + under the tabs while folded, the one beside the name out of reach,
and back). Not walked: the built Mac app's WebKit itself.
