# 0202. The room sheet's first page is laid out in tiles

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Go with B, build it" on the mock. Moves the Icon row
of ADR 0174 into the sheet's head, puts ADR 0165's Media row and ADR 0100's Files row into one card
and one page, and draws ADR 0104's Lead, ADR 0117's Spend per job, ADR 0198's Notifications and
ADR 0156's Lock changes as tiles. Who may do what is unchanged.

## Context

Arjun, 18 October 2026, with a screenshot of Largest Hot Desert's sheet from his iPhone: "We need
to make the room detail page bottom sheet layout to look more cooler and organized. We have media
and files separate possibly could be combined. the scrollable agents should show atleast 3 agents
instead of 1.5 here. Icon is occupying a whole row right now, need better organization. Show
mocks first".

The sheet stops at 80% of the window (699 points on an iPhone 17). Its first page was the title,
an Icon row, who is here, a full-width Add agents or people, and a card of six rows: Lead, Spend
per job, Media, Files, Notifications and Lock changes. Everything but who is here held its height,
so the member list was what gave: about 80 points, a row and a half, in a room of any size.

The mock (<https://claude.ai/artifact/5E22qpocayJCPywtBWF6m4>) drew today's page beside three: A, a
tidier list (the face in the head, Add on the members' heading, Media and Files as one row); B, A's
head and members with a Media & files card and the settings as tiles; C, a contact card, one
scroll with a centred face and four buttons. He took B.

## Decision

1. **The head is the room's face beside its name** (`RoomSheet`'s `Head`): the face at a list
   row's size (56 points) with a palette at its corner, then the name, renamed where it stands as
   before (ADR 0112), and who is here under it. A tap on the face opens the Icon page that the Icon
   row opened (ADR 0174), for anybody in the room, a guest too. VoiceOver reads it as *Icon, Cup on
   Teal*. The Icon row is gone.
2. **Who is here has a heading**: *In this room* and how many, with Add at its right as a pill
   (*Add agents or people*, *Add a person* in a Main room, to VoiceOver; none for a guest). The
   full-width Add button is gone. Leave is the last row of the members' card, in red, and scrolls
   with it; it was a button under the settings.
3. **The member list scrolls in what the page leaves it**, as before, and its foot fades into the
   sheet while there is more below it (`Members`). Everything under it is now about half the
   height the rows were, so on an iPhone 17 a room of four agents and a person shows three rows
   and the start of a fourth, and a room of one agent and a person shows both with the sheet
   shorter. No minimum height is set: on a short window the list still gives first, so nothing
   under it is cut off.
4. **Media & files is one card** (`RoomTiles.tsx` `MediaCard`): its name, how many things the
   room's lines carry and how many files it has (*9 · 4 files*, *None yet*), and the newest five
   as squares (a photo's thumbnail, a video's poster and length, a voice note's microphone and
   length, a document's kind) beside a square for the files with their count. It turns the sheet
   to the Media & files page. It replaces the Media row and the Files row.
5. **The Media & files page** (`RoomMedia.tsx`) replaces the Files page. *Media* first: the newest
   eight, four to a row, each square rounded on its own; a photo or a video opens the viewer over
   the sheet on the room's every photo and video, and anything else Quick Look. *See all* and the
   eighth square, when there are more, close the sheet and open the space's own Media (ADR 0165),
   which still holds Delete. *Files* under it, as the Files page listed them, versions and all
   (`RoomFiles.tsx` `FilesList`). One scroll for the page.
6. **The settings are tiles, two to a row** (`RoomTiles.tsx`): Lead, Spend per job,
   Notifications and Lock changes, in that order, on the same conditions the rows had. Each has
   its mark, what it is set to, and its name under that; one that opens something has a chevron,
   and one that opens nothing for you (Lead for a guest, Spend for a member) has none and does not
   press. Spend per job draws a bar of the ceiling the job has used, gold, amber from most of it,
   red at it (ADR 0118); VoiceOver hears the row's words (*This job so far: $0.92*, *Arjun sets
   it*). Notifications wears its level's mark. An odd last tile takes its row's width.
7. **Lock changes keeps the system switch**, at its own size, and flips as the row did
   (`ui/LockRow`'s `useLockFlip`, shared now): On or Off, the padlock shut in gold while it is on,
   and the title loses its pen. The agent card keeps its Lock changes row (ADR 0199).
8. **Phone only.** The web and the Mac draw the same pages in a dialog (ADR 0151) and keep their
   rows until Arjun asks for them to follow.

## Consequences

- Nothing changed on the wire or the server; nothing to restart. Go-live is the phone's build.
- Test ids: `room-sheet-icon` is the face in the head; `room-sheet-media` turns to the page and
  no longer closes the sheet; `room-sheet-files` is gone; `room-sheet-lead`, `room-sheet-spend`,
  `room-sheet-notify`, `room-sheet-lock` and `room-sheet-lock-switch` are tiles and the switch;
  new are `room-sheet-members`, `room-sheet-members-fade`, `room-sheet-media-strip`,
  `room-sheet-spend-bar`, `room-media`, `room-media-all`, `room-media-more`, `room-media-back` and
  `room-media-<attachment id>`.
- The phone's mark set has a palette (`ui/icons.ts`), the phone's own.
- Walked on an iPhone 17 simulator (iOS 26.5) on a copy of Arjun's data, as a Release build with
  this JavaScript: Terra Fab Research (four agents and him) showed three member rows and the
  fade; Media & files turned to its page and back; Lock changes locked the room on the copy's
  server and the title lost its pen; Largest Hot Desert showed both its members.

## Addendum, 19 October 2026: the web and the Mac follow, the tiles in one row

Point 8 no longer holds. The desktop's sheet (ADR 0151) was drawn beside two ways of following the
phone in a mock (<https://claude.ai/artifact/EDTu13J1ocorTqirf1aczE>): **1**, the phone's tiles two
to a row, and **2**, the same with the tiles in one row while the sheet is its own width. The
desktop has three tiles at most, not four, since it sends no per-room notifications (ADR 0198,
point 5); with two to a row, Lock changes took a row of its own. Measured in the mock on a 780 ×
680 Mac window, who is here showed 3.2 rows today, 1.7 in 1 and 3.6 in 2; at a phone's width, 3.9
today and 2.5 in either, because the desktop's rows were already shorter than the phone's. Arjun:
"Go with 2 (three tiles in one row), build it."

1. **The head is the room's face beside its name**, the face its row in the rail wears
   (`spaceAvatar`, at 48 pixels), and who is here under the name. It has no palette and opens
   nothing: the desktop has no face picker (ADR 0174, point 6).
2. **Who is here has a heading**, *In this room* and how many it lists (its agents, a harness in it
   as itself, which only the desktop still lists, and its people), with Add at its right (*Add
   agents or people*, *Add a person* in a Main room; none for a guest). Leave is the members' card's
   last row, *Leave PO-4471* in red, asking first as it did at the foot. The list scrolls in what
   the page leaves it and fades at its foot while there is more.
3. **One Media & files card and page**, as the phone's. What the room's lines carry, newest first,
   and the card's words (*9 · 4 files*, *None yet*) are core's now (`newestFilesOf`,
   `mediaFilesWords`, moved from the phone so both say the same). On the page a photo or a video
   opens the viewer on the room's every one, a page opens in the page view, anything else is saved,
   as Files did; *See all* and the eighth square's *+N* unfold the rest in place, since the desktop
   has no space Media (ADR 0165) to send them to. The Files page is gone; its list is under Media.
4. **Lead, Spend per job and Lock changes are tiles in one row** while the sheet is its 420 pixels,
   and two to a row, an odd last one taking its row, once the window is under 452 pixels and the
   sheet narrows with it. Spend's line (*This job so far: $0.92*, *Arjun sets it*) is said to a
   hover and to a screen reader; its bar is gold, amber from most of the ceiling, red at it. Lock
   changes keeps its switch and flips as the row did (`useLockFlip`, out of `LockRow` now).
5. **The foot keeps Archive (or Unarchive), Delete space… and Done**: the desktop has no Spaces
   swipe.

Nothing changed on the wire or the server. Test ids follow the phone's where the phone has one:
`room-sheet-icon` (the face), `room-sheet-media` (turns to the page), `room-sheet-media-strip`,
`room-sheet-members`, `room-sheet-members-fade`, `room-sheet-lead`, `room-sheet-spend`,
`room-sheet-spend-bar`, `room-sheet-lock`, `room-sheet-lock-switch`, `room-media`, `room-media-all`,
`room-media-more`, `room-media-back`, `room-media-<attachment id>`; new are `room-media-page` and
`room-media-failed`; `room-sheet-files` is gone; Leave keeps `leave-space`. Proved by
`apps/web/e2e/the-room-sheet.spec.ts` (the head, the heading, Leave, the tiles in one row and two
to a row at 390 wide, Lock on and off, the card counting two photos and a PDF and its page opening
the viewer) and the sheet's cases in `Shell.test.tsx`; `the-room-files.spec.ts` reaches Files
through the card. Going live is the web build and `pnpm desktop`; the phone's build is unchanged.

## Addendum, 19 October 2026: a square on the phone's Media & files page is the viewer's tile

Arjun: "when we go to Media & files --> sheet (does not properly show the media viewer zoom
transition) --> See all (uses the zoom transition)". The page opened its photos and videos on
`DeckViewer`, the viewer for a deck with no tile to fly from, so a picture crossfaded in over the
sheet and shrank away at the close. The page now hosts the viewer itself (`MediaProvider`, inside
the sheet, which is where iOS lets it present) and each square is its tile (`useViewerTile`), as
the space's own Media's are: the picture flies out of the square it showed, on that square's
thumbnail and corners, the square stays hidden while it is up, and the close lands it back there.
A picture paged to beyond the eight squares has none to land on and shrinks away as before; the
*+N* square opens See all and is no tile. The flight is clipped to what the page scrolls in. Files'
versions still open on `DeckViewer`: a row is no tile. Phone only; walked on an iPhone 17
simulator on a copy of Arjun's data (the parrots out of their square and back).

## Addendum, 19 October 2026: a square is measured once the sheet has come to rest

Arjun: "Sometimes the first item tap zoom animation starts from center of screen instead of the
item". Turning to Media & files glides the sheet's top down to the shorter page, on React Native's
`Animated` and the native driver, and that driver tells the layout where the panel is only once the
spring reports finished and React has drawn the sheet again. The app's spring looks still about
0.37 s into a 187-point glide but finished, at the default rest thresholds, about 0.8 s in. A square
tapped in between was measured where the page had been: 187 points high on an iPhone 17
(y 342 for a square drawn at y 529), so the picture flew from mid-screen. Only the first tap of a
visit could land there; the next comes after the viewer has closed.

1. **The glide ends where it is seen to stop** (`Sheet.tsx` `GLIDE_REST`: a quarter of a point and
   four points a second), so the layout hears the panel's place when the eye does.
2. **A sheet says when it is drawn at rest** (`useSheetRest`): at once unless it is arriving or
   gliding, and otherwise once the move's spring has finished and the sheet has been drawn again,
   which is when React Native hands the layout the panel's place.
3. **A viewer tile on a sheet waits for that before it is measured** (`useViewerTile`), the square
   and the page it clips to alike. Off a sheet nothing waits. A tap during the visible glide opens
   the viewer as the glide ends; any later tap opens at once.

Walked on an iPhone 17 simulator on a copy of Arjun's data with a square tapping itself 100 to
700 ms after the page turned in: before, each measured 187 points high; after, each measured where
it stood, the 250 ms tap waiting about 200 ms and the 700 ms tap not at all, and the parrots grew
out of their square. `Sheet.test.tsx` proves the glide's thresholds and that a measure waits for the
arrival and the glide and not otherwise; it fails with either taken out.

## Addendum, 19 October 2026: the viewer pages Media & files in the page's order

Arjun: "when I open image in media viewer, the image order appears to be reversed". Media & files
lists what the room carries newest first, and opened the viewer on the room's deck, oldest first as
the room's lines run, so the next picture was the square before. It now opens on core's
`newestDeckOf`, the room's every photo and video newest first, beside `newestFilesOf` that the page
lists with, on the phone and on the web and the Mac alike: the next picture is the next square,
and the newest is *1 of N*. The room and the space's own Media keep their orders, which already
ran with what they show.

## Addendum, 23 October 2026: the phone's first page is one scroll under its head

Arjun, with a screenshot of Sudoku mini's sheet from his iPhone: "the rooms detail sheet, needs to
be scrollable, right now its trying to fit the 'in this room' agent/people list in a small height.
Upto 3 should be visible without scrolling". Since a room's project took a tile of its own (ADR
0222), Sudoku mini had five tiles, three rows of them, under Media & files. Everything under the
member list held its height (point 3), so the list gave until it showed one row and the top of the
next.

1. **The head stays put and everything under it scrolls as one** (`RoomSheet`'s `Who`): *In this
   room*, who is here, Media & files and the tiles, in one `SheetScroll`. The face and the name stay
   at the top beside the sheet's X, where renaming in place goes on as before.
2. **Who is here is laid out whole.** It is no scroll of its own and nothing below it takes its
   height, so the rows show before anything is scrolled: on an iPhone 17, the head, the heading and
   five rows, then Media & files and the first row of tiles; the rest are a scroll away. Point 3's
   fade at the list's foot is gone, along with `room-sheet-members` and `room-sheet-members-fade`;
   the page's scroll is `room-sheet-who`.
3. **A pull down from the top still closes the sheet** (ADR 0175): the page is the sheet's own
   scroll, which lets the pull through only while it stands at its top.
4. **Phone only.** The web and the Mac keep their member list scrolling in what the dialog leaves
   it (the addendum of 19 October); their tiles stand in one row, so the list keeps more room there.
5. **Lock changes and Hide share the last row** (Arjun, the same evening: "the 'lock changes'
   section should be half width, and this Hide button should show on the bottom right, next to
   it"). Hide (ADR 0205) was the member list's row above Leave; it is a tile now, *Hide* over *Off
   your list* with the shut eye (*Unhide* over *Back on your list* on a hidden room), with no
   chevron, since it opens nothing and acts at once as before. The two are the tiles' foot
   (`footTiles`, `room-sheet-tiles-foot`): they stand on a row of their own under the rest, half the
   width each, whatever the number above them, so the odd-tile rule of point 6 applies only above.
   Either alone (a guest has no Lock changes) takes the row's width. Leave stays the member list's
   last row, in red. Test ids `room-sheet-hide` and `room-sheet-unhide` and the screen reader's
   *Hide Sudoku mini* are unchanged.

Walked on an iPhone 17 simulator (iOS 26.5) on a copy of Arjun's data, as a Release build with this
JavaScript: Sudoku mini showed Hazel, Wynn, Ottoline, You and Hide under the head, then Media &
files and the Project and Lead tiles; a scroll brought Lock changes into view with the head where it
was; a pull down from the top closed the sheet. `RoomSheet.test.tsx` proves the rows, the card and
the tiles are in the page's scroll, the head is not, and the list has no scroll or fade of its own.
Point 5 was walked the same way: Lock changes and Hide side by side under Spend per job and
Notifications, and Hide closed the sheet and took the room off the copy's list; the tests prove the
two share the foot's row, for the owner and for a member, whose Leave stays in the list.

## Addendum, 23 October 2026: each tile's mark has a colour of its own

Arjun, the same evening: "next, make these sheet icons colorful". The tiles' marks were a line
drawing in grey on a grey square, the padlock alone turning gold while it was shut.

1. **Each mark is a solid square in its own colour with the drawing in the faces' ink**, as
   Settings' rows are on an iPhone (`RoomTiles.tsx` `MARK_GROUNDS`): Project blue, Lead violet,
   Spend per job green, Notifications red, Lock changes teal and, while shut, ochre for the padlock
   in gold, Hide pink. Flat, with no shading.
2. **The colours are grounds a room's face may wear** (`ICON_GROUNDS`, by index), so the faces'
   theme paints them as it paints the faces (ADR 0176): white on the deep grounds in Soothing, dark
   on their lighter sisters in Bright. Their ink clears 4.5:1 on every one, which is why they were
   taken from that list and not chosen afresh.
3. **The pages Lead and Notifications open wear their tile's colour** (Arjun, the same evening:
   "Yes, colour the marks on the Lead and Notifications pages to match their tiles"): Lead's *No
   lead* is violet, and each of Notifications' four levels is red, at a list row's size
   (`RowMark`). The agents on Lead's page keep their own faces. Add's rows keep their grey marks.
   Phone only: the web and the Mac keep theirs.

Walked on an iPhone 17 simulator on a copy of Arjun's data, dark and light: the six marks on
Sudoku mini's tiles, and the padlock turning gold when Lock changes was switched on.
`RoomSheet.test.tsx` proves the four marks of a room with agents are the four colours and the shut
padlock is the gold. Point 3 was walked the same way, Notifications' page and Lead's, and the tests
prove each level is the red and No lead the violet.
