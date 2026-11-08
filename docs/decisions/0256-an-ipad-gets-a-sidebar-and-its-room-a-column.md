# 0256. An iPad gets a sidebar, and its room a column

Date: 1 November 2026
Status: Accepted, 1 November 2026, on Arjun's picks in the iPad and iPhone Duo mocks. Builds on
ADR 0177 (an iPad is an iPad), which it changes where they differ. Amended by
[0276](0276-an-ipads-tabs-float-and-a-third-level-opens-beside-the-second.md) (the tabs float in a
capsule at the bottom left, never the pill; details and a third level in a column of 420; one
column across a pane).

## Context

Arjun, 1 November 2026: "we need to now make some significant improvements to the iPad layout and
also make it work for new iPhone Duo. The current layout is kind of pushing iPhone design on iPad.
I need this to be a super polished and delightful experience". Mocks first: eleven sections, each
beside today's screen from the iPad Pro 13-inch simulator (`chips-notes/mocks/ipad-duo/`).

What the simulator showed of today's iPad:

- The conversation runs the whole width of the pane. On a 13-inch on its side a reply sits a
  thousand points from the send button, and the composer is as wide as the pane.
- The space sheet rises from the foot of the window as a card over both the list and the room.
- The list's chosen row is a grey band to both edges, a phone's.
- The iPad mini, 744 points upright, gets the phone's one column, because a list beside the room
  left the room 384.
- The + for a new space is UIKit's own item at the end of the pill, not the gold one the iPhone has.

His picks: the gold + on the iPad too ("The + button for adding new space needs to be yellow"), a
sidebar rather than the pill alone ("sorry, ipad side bar is better"), and You as a Settings-style
split (a later part of the same work).

## Decision

1. **Three widths, by the window.** Under 700 points a window gets the phone's screens. From 700 it
   gets the list beside the room under iPadOS's pill. From 1100 it gets a sidebar, the list and the
   room. A room is never narrower than a phone's, which is where 700 comes from: a list of 300 and
   a room of 400. The list is 340 in a window 900 across and 300 under it. The iPad mini upright
   (744) now gets the list beside the room. `wide` (768) of ADR 0177 comes down to `roomy`'s 700,
   and `roomy` keeps its name where a sheet asks whether it is a card. Both still ask for 600 down,
   so a phone on its side stays a phone.
2. **The sidebar is drawn by Chips.** iPadOS's own (`sidebarAdaptable`) lists only the tabs, and the
   sidebar holds more: the four tabs, the pinned spaces (ADR 0240) and the workspaces (ADR 0197),
   with the gold + at its top and a button that folds it away. Where it shows, UIKit's bar is hidden,
   as it is under the iPhone's drawn bar (ADR 0233). Folded, or under 1100, the pill is back.
3. **The gold + is the iPad's too.** UIKit's + in the pill can't be coloured on its own, so on an
   iPad it is hidden and the iPhone's `Plus` stands just right of the pill, or at the sidebar's top.
   The New space window pours out of it and hangs under it (section 8 of the mocks, a later part).
4. **A conversation reads in a column.** Messages and the composer stay within 680 points, centred in
   the room, however wide the pane is. Tables, pictures and the lane card take the column's width.
5. **A room's buttons.** At the bar's left, hide the list: the room takes the window and the sidebar
   folds, and the same button brings the list back. At its right, after the connection's mark,
   details. The mocks' third, find in this space, comes with Search's part (section 5), where a
   search is narrowed to one space; the server's search already takes one (`SearchInput.spaceId`).
6. **Details beside the room.** At 1100 and wider a space's details are a column of 320 on the right,
   holding what the space sheet holds, with its pages pushed inside it: the same `RoomSheet`, its
   `Sheet` standing where it is drawn inside a `SheetDock` rather than rising over the window. A
   sheet opened from inside the column still rises. Opening it folds the sidebar, so the room keeps
   its column, and it stays open from space to space until it is closed, as an inspector does on a
   Mac. The name's capsule opens it too. Narrower, the details button opens the space sheet as a
   card, as the name does; the popover from the capsule comes with the other sheets' popovers
   (section 7).
7. **Rounded selection.** Beside a room, the list's open row, and a row under a finger, is a rounded
   tile set in from the list's edges, with no hairline either side of it.
8. **On an iPad.** The sidebar and the details column are iOS's: the web target keeps its rail at
   every width (`_layout.web.tsx`), and Android its Material bar. The lines, the room's column, its
   buttons and the rounded selection are everyone's.

## Consequences

- What stands around the panes is one context at the app's root (`ui/chrome.tsx`): the sidebar
  folded, details open, the list put away, and whether the room in front folds the sidebar. Only a
  room on Spaces in front folds it (`useFocusEffect`), so another tab has the sidebar as it was left.
  All of it is held in memory: a relaunch opens with the sidebar out, the list in and no details.
- Jest's own window is 750 points across, an iPad's now; the room's suites that are about a phone
  set a phone's window (`SpaceView.test.tsx`, `SpaceScreen.test.tsx`).
- The gold + beside the pill is placed by measuring iPadOS's pill on the iPad Pro 13-inch simulator
  (`PILL_END`, `PILL_TOP`, `PILL_HEIGHT` in `app/(tabs)/_layout.tsx`): its top on the safe area's,
  44 tall, its end 166 points past the window's middle. A pill with other tabs, or a later iPadOS,
  moves it, and it is measured again then.
- A turned iPad is laid out once at its new size before the app hears of it, with the old sidebar
  still standing. A room squeezed for that layout and widened in the next kept its bubbles at the
  squeezed width, cut off, and nothing after moved them (the simulator: landscape with the sidebar,
  then upright; today's build turns cleanly). On iOS the detail beside a list is given its width
  (`Split.tsx`), the window less the list and the sidebar, so the room keeps its width through the
  first layout and changes once.
- Walked on the iPad Pro 13-inch simulator, dark, with the Demo workspace: upright (pill, gold +
  beside it, list 340, room in its column, the open row as a tile, the room's two buttons); on its
  side (sidebar, list, room); details opened in landscape (a column of 320, the sidebar folded into
  the pill, the button lit) and closed (the sidebar back); the list put away (the room has the
  window, its column centred) and brought back; turned both ways with a room open. Not walked: the
  iPad mini, Stage Manager sizes, light mode, a guest or a member (no +), the web target.
- Not in this part: Agents, Search and You as panes (mock sections 4 to 6), popovers and centred
  cards for the other sheets (7), the New space window's new place (8), the first run (9), the menu
  bar, shortcuts and drop (10), and the iPhone Duo (11), which waits for the iOS 27.1 SDK.

## Addendum, 1 November 2026: Agents, Search and You as panes

The second part of the build, mock sections 4 to 6.

1. **Agents.** Beside a room the harness shelf is a grid, two tiles to a row, each with its face
   beside its words, and Connect the last tile; View all goes, since the list has the height for
   every tile (`Shelf.tsx`). An agent's card and a harness's page stand in two columns in a pane 640
   across or wider (`ui/Columns.tsx`): the card's facts, lock, icon and model on the left, its
   heartbeat, window, context and history on the right; a harness's agents and jobs on the left,
   how it is set up and what it has run on the right, and Restart and Remove side by side under
   them. Each column is at most 480, and the page under them is let out to the pair's width, since
   the page's own column of 760 would make each 380. Narrower, and on a phone, they stack in the
   same order. A pane says its width (`useDetailWidth`), which iOS has given it (`Split.tsx`).
2. **Search.** On an iPad a result opens beside the results instead of taking the tab away
   (`search/Found.tsx`): a message its room at the line, the words ringed in gold as Spaces rings
   them; a space its room at its end; an agent its card. The room seen from there has Open in
   Spaces where the list's and details' buttons stand, which goes to the room in Spaces at the same
   line; its details are the sheet, and it folds nothing away (`RoomPane`'s `preview`). An agent's
   card opened from that room stands over it with the way back. The open result is a tile in the
   list, as Spaces' open row is. Before anything is typed or opened the faces drift in the pane
   rather than under the field. ↑ and ↓ through the results come with the keyboard's part, and
   find in this space, the room's third button in decision 5, is not in this part either: Search
   has no way yet to say it is looking in one space.
3. **You.** The list stands beside the page its row opens, as Settings does: People, a person from
   People, Invite someone, Relay, Media on this iPad and Connection open in the pane
   (`you/YouPane.tsx`), and the open row wears the chosen ground. A row asks for its page through
   `usePage` (`you/pages.tsx`), which pushes on a phone. The rows that open sheets still open
   sheets. Media's row says what is kept again when another page opens beside it, since You stays
   in view while Media lets go of files.

What is open beside Search and You is kept by the tabs, as Spaces' room and Agents' card are
(`ui/opened.tsx`).

Walked on the iPad Pro 13-inch simulator, dark, with the Demo workspace, upright and on its side:
the shelf's grid, a harness's page and an agent's card in two columns; Search's faces in the pane,
a found message's room at its line with its row chosen, and Open in Spaces landing on the room in
Spaces; You beside its pane, People and a person from it with the way back, and Relay. Found on
the walk and fixed: the grid's tiles, each worked out at half the list less its margins, wrapped
one to a row, the list's hairline at its right leaving half a point too little for two; they are
rows of two that share the row now. Not walked: the iPad mini (one column under 640), light mode,
a member or a guest, Media and Connection in the pane. In the Demo, Relay's page is blank until a
server answers, as it is on a phone.

## Addendum, 1 November 2026: a choice beside its button, a task in the middle

The third part of the build, mock section 7: what opens from a button opens beside the button.

1. **A popover for a choice.** A sheet can be told what it was opened from (`Sheet`'s `from`): the
   button or the row, measured as the sheet opens. On an iPad such a sheet is a popover beside it
   (`Beside`), its arrow on the button, on whichever side has the more room and across from the
   button's middle as far as the window's edges allow (`ui/beside.ts`). It is at most 380 wide,
   about a phone, since what it holds is the phone's sheet. Nothing dims and nothing pulls it: a
   tap off it puts it away, as its X does. It fades in growing out of its arrow, and goes back into
   it. One that holds a field rises clear of the keys as they come, and a tall one stops with its
   top in sight and the keys over its foot, as a phone's sheet does. The button is looked at each
   frame for half a second after the sheet opens or the window turns, since a turned iPad lays out
   twice. What was opened from is kept until the sheet opens again, so a caller that lets go of it
   as it closes does not change its shape on the way out. A button gone, or out of sight, leaves it
   in the middle with no arrow.
2. **Which sheets.** The composer's + (attach); Select's Archive and Delete, on Spaces and Agents;
   the face picker, from a row pressed and held on Spaces and Agents (a screen reader's Change icon
   too), an agent's face or its Icon row on its card, and your face on You; and a space's details,
   from the room's name, where the window is narrower than 1100 and has no column for them. Who a
   message is for, the mock's fourth popover, already opens upward out of the field (ADR 0081) and
   needed nothing.
3. **A card in the middle for a task.** Every other sheet on an iPad is a card in the middle of the
   window, as iPadOS stands a form, 540 wide: Connect a harness, Pair a computer, Delete your
   account, a new phone for a person, a context file's conflict and the rest. It comes up from the
   foot and goes back down, and a pull takes it as on a phone. The keys push it up from the middle.
   Invite someone, the mock's own card, already opens in You's pane (the second addendum).

On a phone none of this changes: every sheet rises from the foot as it did.

Walked on the iPad Pro 13-inch simulator, dark, with the Demo workspace: a space's details under
its name, upright; attach over the +; Archive over Select's bar, held at the window's edge with its
arrow on the button; the face picker from a row, with the keys up, and turned both ways while it was
open; Connect a harness as a card. Found on the walk and fixed: the arrow had no edge of its own
and read as a gap in the panel's hairline; a popover opened where the finger held a row stood over
half the row, so a row hands over itself rather than the finger's place; with the keys up the face
picker rose until its head left the window; and a popover measured once as the window turned stood
where the row had been before the second layout. Not walked: an agent's face, your face on You, the
iPad mini, light mode, a card with the keys up (the Demo has no account to delete).

## Addendum, 1 November 2026: New space hangs from the gold +

The fourth part, the mock's section 8. The New space window poured out of the gold + at the top of
the window and down across all of it, to stand in the middle at the foot on the keys. Now it hangs
under the + it pours out of, as a popover hangs from its button. Nothing inside it changes.

1. **Under the +.** On a wide window whose + is at the top, the card stands 16 points under it,
   across from its middle as far as the window's edges allow (16 points off each), 560 wide as
   before (`cardUnder`). Its top is laid out where it hangs, so what it holds grows down, away from
   the +. The keys rise under it; it stands on them, as on a phone, only if they would come over it.
   A wide window whose + is at its foot, Android's and the web's, keeps the card in the middle on
   the keys.
2. **A ring on the +.** While the window is up the gold + keeps a ring, gold with a gap of the
   page's colour, as in the mock. The + itself is under the dim, so the window draws a ringed + of
   its own in its place, over the dim and under the window, coming and going with the dim.
3. **It follows the +.** The + is handed to the window with its place, and when the window turns
   the window looks at the + each frame for half a second, as a popover looks at its button (the
   third addendum). Turned from upright to on its side the + moves from beside the pill into the
   sidebar, and the ring, the card and the fold all go with it.

A send fills the room's side and dissolves into the new space as it did, and a fold goes back into
the +. On a phone nothing changes.

Walked on the iPad Pro 13-inch simulator with the Demo workspace: opened upright in dark, the card
at 92 points under the + beside the pill, 560 wide; the keys up under it; turned on its side while
open, the window moving with the + into the sidebar; sent from there, the new space opening beside
the list; opened in light; folded away by a tap off it. Not walked: the iPad mini, a harness's faces
in the window (the Demo's harnesses take no new spaces), the frames of the pour and the fold.

## Addendum, 1 November 2026: the first screen has its ways in beside the film

The fifth part, the mock's section 9. On an iPad the first screen was the phone's: the film in the
middle, Scan a QR code and Skip at its foot, and every way in only once the film had ended. The film
is made at a phone's shape, and on a window wider than a phone the ways in now stand by it from the
start (`app/pair.tsx`).

1. **On its side,** the film stands on the left, as tall as the window, and on the right the mark,
   the film's name and length, then every way in: Scan a QR code, Have an invite link?, Have a
   pairing code?, More walkthroughs, Look around and Watch again. Chips found on this Wi-Fi joins
   them when it is found.
2. **Upright,** the mark and the film's name stay at the top and the film under them, and the ways
   sit under the film in two columns: the three ways in on the left, the films and the two links on
   the right. Chips found on this Wi-Fi comes in under both, and the film gets smaller to make room,
   as on a phone.
3. **Nothing to skip.** Nothing waits for the film to end, so there is no Skip and no Scan a QR code
   at the foot. Where the film ends, That's Chips and its sentence take the frame's place, with the
   ways where they were; Watch again plays it there, and a film from More walkthroughs plays in the
   same frame, its name over it.

The end card's words and its ways are drawn by `EndWords` and `WaysIn`, which the phone's end card
draws too, so they are the same on both. On a phone nothing changes.

Walked on the iPad Pro 13-inch simulator: upright, dark, with Chips found on this Wi-Fi coming in
under the ways; turned on its side; tapped through the film to its end, That's Chips in its frame;
Watch again; a film from More walkthroughs; upright again in light. Not walked: the iPad mini, an
iPhone (the first screen's phone tests run at a phone's width).

## Addendum, 1 November 2026: the menu bar, its keys, and a drop onto a space

The sixth part, the mock's section 10. iPadOS 26 shows an app's menus in a bar at the top of the
screen and lists their keys while ⌘ is held. React Native has no way to add either, so a small
native module does (`modules/menu-bar`), and the commands themselves are JavaScript's
(`src/ui/menuBar.ts`).

1. **View and Space.** At the top of View, the four tabs on ⌘1 to ⌘4. After View, a Space menu:
   New Space (⌘N) and Search Everything (⇧⌘F); Show Details (⌥⌘I) and Hide List (⌃⌘S); Previous
   Space (⌥↑) and Next Space (⌥↓). Every command stands in its place whether or not it can be done,
   dimmed when the screen in front cannot: the details and the list with no room open, New Space
   where there is no gold +. The details and the list are named for what they would do, Hide Details
   while they show and Show List while it is put away.
2. **One holder at a time.** A screen that can do a command holds it while it is mounted and able
   (`useMenuCommand`), and the newest holder is the one it runs. What the menus hold is handed to
   UIKit whole whenever it changes, once a frame's changes are in, and a command chosen, from its
   row or by its keys, comes back by its id. Each acts through one selector that the application
   answers, so it reaches the app wherever the focus is, a field included; ⌥↑ and ⌥↓ go to the
   space before and after even with the caret in the composer, where they would move it a paragraph.
3. **What it does.** The tabs and New Space do what their buttons do, New Space's window hanging
   from the gold + (the fourth addendum). Search Everything opens Search with the caret in its
   field. The details and the list are the room's two buttons. The space before and after is down
   the list as it is drawn, pinned first and hidden ones left out; with none open, the first or the
   last. They are there only where the list stands beside the room.
4. **Esc.** It has keys and no row: it closes what stands over the window, the newest first, then
   what is under it: a popover, a card, a sheet, the New space window. The details as a column are
   not over anything, and stay.
5. **The system's own rows.** iPadOS gives every app a new window, documents, printing, text
   formatting, Find, Customize Toolbar, Show Sidebar and Show Inspector. Chips has none of them: its
   list and details are React's, not a split view's. They are taken out, and with them the system's
   hold on ⌃⌘S and ⌃⌘I. A menu whose keys another already holds is left out whole, which the walk
   found: the Space menu was missing until they went.
6. **A drop onto a space.** Photos and files dragged from another app onto a room are staged in its
   composer, ready to send, as the + stages what it picks (`DropView`, `spaces/RoomDrop.tsx`). While
   something is over the room, a dashed frame in the accent says "Drop to add to your message". The
   mock's words were "Drop to send", but a drop never sends on its own. A room whose composer has no
   + takes no drop, and a drag from inside Chips is not taken.

Before iPadOS 26 there is no menu bar to build, and nothing is. The web and Android have none of
this. The module is native, so the part reaches a phone or an iPad only with a new build.

Found on the walk and fixed in passing: a server's reason that ends its own sentence ("This isn't in
the demo.") ended an upload's error with two stops (`core/attachments.ts`).

Walked on the iPad Pro 13-inch simulator, iPadOS 26.5, dark, with the Demo workspace: the bar's View
and Space menus; each command from its row (the tabs; Next Space with no room open; Show and Hide
Details, the details opening under the room's name upright; Hide and Show List; New Space); keys on
the Simulator's keyboard (Esc closing the New space window and the details, ⌥↓, ⌥↑ with the caret in
the composer, ⌥⌘I, ⌃⌘S, ⇧⌘F and typing straight into Search's field); a photo dragged from Photos
beside Chips into Birthday dinner, the frame over the room and the photo staged in the composer, its
upload refused as the Demo refuses the +'s. Not walked: ⌘1 to ⌘4 and ⌘N by their keys (the
Simulator keeps ⌘1 to ⌘3 for its own window), a file from Files, several at once, a video, the iPad
mini, light mode. Not in this part: Find in Space (⌘F), Mark as Read (⇧⌘U), a pointer's hover on
rows and right-click menus.

## Addendum, 2 November 2026: the iPhone Duo, its column and its fold

The seventh part, the mock's section 11, on the Duo simulator once Xcode 27.2 and iOS 27.2 were
here. On iOS 27.1 the Duo stands an app's bars in a column down the right edge, folded or open, the
status bar at its top, and adds the column to the safe area on that side. Open, the inner screen
folds down the middle.

What the walk found before anything changed: UIKit moves its own bars into the column by itself,
so a room's back button already stood there, under the clock. The tab bar Chips draws (ADR 0233) it
doesn't move. Folded, the bar stood at the foot beside the column; open, `wide` held (951 × 669), and
the bar ran across both pages and over the room's composer, the gold + on the composer, and the
room ran under the column with its top right button under the clock.

1. **Read from the screen.** One view at the root of the window (`modules/duo`, `ui/duo.tsx`) says
   which side the column is on (`verticalBarEdge`), how wide it is (the window's safe area on that
   side) and where the fold is (`reservedRegions(kind: .division)`), whenever the traits, the hinge
   or the layout change. Measured: the column is 84 points, not the mock's guess of 58; the foot
   keeps 34; the fold is 40 points centred on the middle, 475.5 of 951. Open flat, UIKit has the fold
   inactive, since nothing need keep off a flat screen; the pages still meet there, so it is read
   either way. Before iOS 27.1 and on any other phone there is no column and no fold.
2. **The tabs in the column.** Where there is a column, the tabs stand at its foot in a capsule of
   glass, one under another, the chosen one on a pill in the accent, and the gold + under them
   (`ui/SideColumn.tsx`), in place of the bar at the foot. It doesn't shrink while a list is read: it
   stands beside the list, not over it. The lists keep no room for a bar at their foot there.
3. **Open, the pages split on the fold.** A split's list runs to the fold and the room stands on the
   other page, up to the column; with the list put away, the room has both pages up to the column.
   The split paints the page's ground under the column, which nothing else covers there. A split's
   sides keep only the safe area of the edges they stand at: the list kept the column's 84 points
   as padding on its right, at the fold.
4. **A room folded.** Its back button is UIKit's, in the column. The composer floats, so the safe
   area that keeps the lines clear of the column didn't reach it, and it ran under the clock; it now
   stops at the column.

Not as the mock drew it: the room's details and list buttons stay at the top of the room's page,
where its bar is, rather than moving into the column. The column holds what Chips draws for the
window (the tabs and the +) and what UIKit moves there itself.

Walked on the Duo simulator, iOS 27.2, light, with the Demo workspace: Spaces folded and open, a
room folded and open beside the list, You, and the column's tabs and + at rest. Device Hub, Xcode
27's simulator app, opens and folds the Duo; nothing on the command line does, and a fresh boot
starts folded. The module is native, so this reaches a phone only with a new build.

The rest of the walk, the same day, found four more things, and each is now as follows.

5. **The lane UIKit keeps its buttons in.** iOS 27.1 gives a view the region a bar down an edge
   stands in (`edgeInsets(for: .bar(onEdge:))`), and on the Duo it is the lane UIKit puts its own
   buttons in: 48 points wide, 24 in from the screen's edge, under the column's status (the camera,
   the time and the battery) and over the home indicator. Folded it runs from 174 points down, x 394
   to 442; open, from 124. A room's back button stands at its top. The module says it with the rest,
   and the column's tabs and + stand in it, under the back button, where they stood six points
   further right in the middle of the column.
6. **A sheet folded, and New space.** A phone's sheet rose across the whole screen, as UIKit's own
   sheets do on the Duo, with its tiles running on under the column and its X under the battery.
   Its tiles now stand beside the column, 16 points short of it, and its X in the lane, as UIKit
   moves a sheet's buttons there (Contacts' New Contact on the simulator): on the title's line, or
   at the lane's top where the sheet rises above it. The card New space opens from the column's +
   stands on the page beside the column, as the room's composer does, and what a send fills is the
   room's page.
7. **Half open.** UIKit makes the fold active, and keeps what is pressed off it and its 20-point
   margins. The pages stood to the fold's middle, and the list's Select and the room's first button
   and its composer's + reached four to eight points into the margins. Half open, the list now stops
   where the margins begin and the room starts where they end, with the page's ground between and
   no rule; open flat, they meet at the middle as before.
8. **A line of yours, gone after the background.** Sent to the background, Chips is laid out again
   at the open Duo's width for the picture the app switcher keeps, and then at the folded one, with
   no frame drawn between. A bubble of yours moves across its row when its width changes, and
   Reanimated merges a move into one still on its way, value by value. The room's moves named only
   the values that had changed from where the view was drawn, so the second move named nothing and
   the first went on, taking the bubble to its place in the wide row, past the right of its folded
   one: out of sight, in light and in dark, until the room was opened again. A move now names all
   four values of the frame every time (`spaces/roomFrame.ts`), so the last one is the one that
   holds. React never drew the bubble again, and the window's size React Native reports never
   changed; the view tree, read in the debugger, showed the bubble at x 425 in a row 350 wide.

Walked after these: Spaces, a room, its sheet, New space and the keys up, folded, in light and
dark; the Duo half open and open, with a room beside the list; a room sent to the background and
brought back, three times. The keys run under the column, as Apple's do, and the composer stands on
them beside it.

Left as it is: the blur under a room's name ends at the column's edge, which shows as an edge only
while a line is under it; a sheet with a field that rises with the keys can take its X above the
lane's top; and the mock's things opening on the other page (an agent's card, details, a picture).

Walked later the same day, the Duo open and turned upright: the column goes and the bar is at the
foot again, the fold runs across the screen, and Chips is laid out as on a tall phone, with Spaces as
one list, a room on its own and its sheet across the width. Half open so, nothing changed and
nothing pressable sits in the fold: New space's card stands on the upper page and the keys on the
lower. Turned back, the column and the two pages come back as they were. A push's tap and a link
opening Chips were walked on the Duo too (ADR 0259, its addendum).

## Addendum, 2 November 2026, evening: the Duo's top, its pages and its fold

Arjun's recording of Chips on the Duo simulator, open, showed the names against the top of the
screen and You's pages narrow, and Apple's Designing for iPhone Duo was read beside it. Each of
these is now as follows.

9. **The top.** The status bar is in the column, so the window's top inset is 0, and the large
   names, a room's head and the list under them stood at the screen's top edge. UIKit stands its
   own bars 24 points down, folded and open, as on an iPad (`edgeInsets(for: .bar(onEdge: .top))`;
   Contacts' title and Edit stand there). The module says that top with the column, and the window's
   top Chips reads is raised to it (`WindowInsets`); a list under a name is told the 24 points
   iOS leaves out of its own inset (`useRaisedTop`), or its first row ran under the name.
10. **Pages beside the list.** A pane and a page padded themselves with a safe-area view, which pads
    by the window's insets wherever it stands, so a page beside the column kept the column's 84
    points a second time: Invite someone stood a third narrower than its pane. Each now pads with
    the insets of the edges it stands at (`useSides`). A grouped pane's ground runs on under the
    column, where the split's lighter ground stood as a stripe. Connection and Relay open on a
    group with no heading, which sat on the bar's hairline, on a phone too; the gap between groups
    stands above the first.
11. **Back to the tabs.** A room, an agent, a harness and now You's pages, pushed over the tabs, go
    back to them on a wide screen with what they open in the tab's params (`BackToTabs`). A
    `Redirect` there put a second copy of the tabs in the route's place, whose presses chose the
    hidden copy's: after a link or a push's tap, no tab could be chosen. You's pages had no wide
    path at all, and the Duo opened under a pushed Connection kept it across the fold; it opens in
    You's pane now. A space's Media is still pushed over a wide screen, from the room beside the list.
12. **Half open, cards off the fold.** On the Duo open a sheet is a card in the middle, as on an
    iPad, and so is New space's card; half open, the field and a sheet's rows stood across the
    crease. Apple slides its own sheets off the fold. While UIKit keeps the fold, a card now stands
    in the middle of the page beside the column (`pageOffFold`), and goes back to the middle when
    the Duo is opened flat.
13. **The Demo's Devices and Relay.** You's Devices said the server did not answer, and Relay's page
    was empty. The Demo answers both: one device, the one showing it, by the name it would pair
    with; and the relay switch as a server starts it with Chips's relay, off, with that device on
    its network. Turning it on is a write, and not in the demo.

Walked on the Duo simulator, iOS 27.2, light, in the Demo: Spaces, Agents and You open, folded and
half open; Invite someone, Relay and Connection beside the list and pushed; a room link warm and
cold, and the tabs after it; the Duo opened under a pushed Connection; New space and the Decisions
sheet half open and open flat, the sheet moving as the hinge did.

Left as it is: the bar UIKit draws over a pushed page folded begins some points under the top, with
the page's ground above it; the row of spaces on Invite someone stops at the page's margin rather
than the pane's edge; a bubble cut for a moment while the list is put away, and once a room's
composer wider than its page after a link opened Chips, not seen again; and the agent picker's
column of faces (ADR 0229).

## Addendum, 2–3 November 2026: a walk of every screen on the iPad

Arjun's word: "do a full ipad walk in simulator, please go through all screens and make sure they
look polished". Walked on an iPad Pro 13-inch simulator (iPadOS 26.5) in the Demo workspace,
upright and on its side, light and dark, and the first screen and a room on an 11-inch. What did
not look right, and what each now does:

1. **Media on this iPad stood under You's list upright.** It sized its column from the window,
   wider than its 760-point column, so it drew 760 points into the 692 points beside the list.
   It takes the width the split gives its pane (`useDetailWidth`), and its column is at most 760.
2. **The first screen moved under a finger.** Upright, Chips on this Wi-Fi came in under the ways
   in and pushed them up; a tap meant for Look around asked a Mac on the Wi-Fi to let the iPad in
   (withdrawn at once). It now comes in over the ways, as on a phone: the film gets smaller and
   the ways keep the foot. On its side it was already under the ways, which stay where they are.
3. **A space's details opened beside the name, whatever opened them.** Part three's rule is that
   what opens from a button opens beside that button: from the details' button, the popover now
   stands under the button; from the name, under the name.
4. **Spaces' rows kept their chevrons beside the room**, where a row opens beside the list rather
   than onward. Agents' rows have none. Neither does Spaces beside the room now.
5. **Invite someone cut the spaces' names** ("Birthday...") with half the row empty. A name takes
   two lines under its face, as the share sheet names a person, on a phone too.
6. **The details beside the room cut a space's name** ("Birthday dinn..."). It takes two lines.
7. **An agent's card stood twice as tall on the right.** The heartbeat ends the left column
   instead of starting the right: a phone, which stacks the two, reads them in the same order.
8. **Words the Demo showed wrong.** Connect a harness said "Or build your own" over nothing, as it
   does for any server told no gallery: it says "Build your own" then. Relay said devices "can't
   reach This network directly": a device with no server address names it "your server". Remove
   Chips demo said its spaces "go from this phone" on an iPad.

Looked at and left as it is: the Workspaces card stands in the middle (it holds tasks as well as
the choice); You's list wraps a few labels at 340 points beside their values.

## Addendum, 5 November 2026: the agent picker on the Duo folded

Found while taking the App Store pictures for 1.1 on the Duo simulator folded (iOS 27.2): a tap on
the faces at the front of the field drew the list of who a message goes to downward, with no card
behind it, over the field and off the foot of the screen. On the iPhone it opened upward as a card.
The Duo's set left that picture out.

1. **It was not the Duo.** Filmed folded, the room rose for the list, and the field's glass grew a
   frame or two of its 190 points, 15 to 30, and stayed there: the list stood from the glass's top,
   over the words and on down. The glass and the words' row move on Reanimated's layout
   transitions (`ui/growing.tsx`), and a log on each said both had finished. With the Mac at a
   load of 160 to 230 and its swap full, it failed every time; at an ordinary load it opened as it
   should. A 300 ms stall of the UI thread just after the glass began to grow (not kept) failed it
   every time at an ordinary load too.
2. **Reanimated dropped the last frame.** In the frame a layout transition ends, its last progress
   is queued and the transition is marked ended before the frame's flush, and the flush passes over
   a transition that has ended, so where it came to rest was never mounted. With every frame on
   time, the frame before is a fraction of a point short and nobody sees it. With the UI thread held
   past the end (the list mounting and the room laid out again, on a busy machine), the next frame
   is the last, and the view stays where the first one left it. The iPhone and the iPad are open
   to it as much as the Duo.
3. **The fix** is in `patches/react-native-reanimated@4.5.1.patch`, beside ADR 0181's: a finished
   transition ends from the frame's finalizer, after the flush (`endAfterFlush`), so its last frame
   is mounted first. With the same stall the picker opened and closed as it should, every time.
   Every layout transition in Chips now comes to rest where it was laid out, the room's moves
   among them; a view leaving goes a frame later. JavaScript only, but the patched package lives
   at a new path, so the phone build wants `pnpm install` and `pnpm phone pods` first.
4. **The column, cleared twice.** Folded, the room's page pads by the column (`useSides`, item 10
   above), and the foot floats inside it, but the foot still cleared the column itself (item 4
   above). The field, and the card it opens into, stood the column's 84 points short of it, and
   "Message Theo" was cut to "Message...". The foot no longer clears it, and ends where the lines
   do.

Walked with a JavaScript-only build of 1.1.0 with these changes: on the Duo folded the picker
opened upward as a card as wide as the room, picked Milo and closed; on an iPhone 17 Pro and an iPad
Pro 13-inch (iOS 26.5) it opened upward as a card.
