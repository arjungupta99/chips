# 0174. A face is changed where its space or agent is described

Date: 15 October 2026
Status: Accepted, 15 October 2026, on Arjun's "Go with A, build it" on the mock. Adds a way in to
the face picker of ADR 0064, ADR 0089 and ADR 0139; the picker itself is unchanged.
The room sheet's Icon row is the face in the sheet's head since ADR 0202.

## Context

Arjun, 15 October 2026: "I want to be able to edit the Space icon / color and Agent icon / color
from their detail pages. Make a special section in the sheets".

A space's face was chosen only by pressing and holding its row on Spaces, and nothing on the
screen says a long press does anything. The space's own sheet (tap the name at the top of a room,
ADR 0087) did not show the face at all. An agent's card opened the picker from a tap on its face
(ADR 0089), with nothing to say so.

The mock (<https://claude.ai/artifact/RgULX9JPsyY9Yp9qzVDF2w>) drew today's screens beside three
ways: A, a section of one row in both places; B, the same with the colours in the section (nine in
the space's sheet, all 27 on the card); C, no section, the face beside the space's name with a pen
badge on both faces. He took A.

## Decision

1. **The space's sheet has an Icon row of its own, under its title and before who is in the
   room** (`RoomSheet`'s first page). It wears the room's face as its Spaces row does
   (`RowAvatar`, at the size of the sheet's other rows' marks) and says what the face wears in
   words: *Cup on Teal*, *AB on Navy*, *Teal* for a colour on its own, *Default* for none
   (`spaces/faceWords.ts`). Anybody in the room has it, a guest too, because a space's face is a
   person's own setting and the server takes it from any person.
2. **The row turns to an Icon page inside the sheet** (`spaces/RoomIcon.tsx`), as Files and Lead
   do, with Back at its left. The page is the picker the long press opens, with the room as its
   head. Each tap saves at once, and a refusal is said in the picker's banner. Back and the sheet's
   X both save letters typed and not yet saved, as the picker's own sheet does when it closes.
3. **The picker is one component in both places** (`spaces/FacePicker.tsx`). `IconSheet` is now
   the sheet around it. The picker takes an inset: its own sheet stands it in from the sheet's
   edge, and a page of the space's sheet puts its edges on the page's other cards'.
4. **The agent's card has an Icon section under Room, Since and Now**: a heading and one row with
   the face at a row's mark size and its words, which opens the same sheet a tap on the face
   opens. It is shown only to whoever may change the face (`mayFace`: anybody but a guest), since
   for anyone else it would be a row that does nothing. The tap on the face stays.
5. **A space's face is drawn by `spaces/RowAvatar.tsx`**, moved out of the Spaces list, so the
   sheet, Search's results and Media on this phone draw a room's face without bringing the Spaces
   screen with them.
6. **Phone only.** The Mac and web choose no face anywhere yet; a picker there is a job of its own.

## Consequences

- The space's sheet is a row taller (58 points), so a busy room's member list shows one row
  fewer before it scrolls.
- Nothing changed on the wire or the server; nothing to restart.
- Test ids: `room-sheet-icon`, `room-sheet-icon-back`, `agent-icon`. The picker keeps its own
  (`ground-N`, `mark-<name>`, `face-letters`, `icon-failed`) in both places. End to end on the
  phone's web target: `apps/mobile/e2e/faceFromDetails.spec.ts`.
- The phone's test snapshot (`testing/fixtures.ts`) now carries `spaceIcons`, as the store's always
  does.

## Addendum, 16 October 2026: the page opens at once, and Back is a whole target

Arjun, on his iPhone: "opening the icon section take a noticible delay and the touch area of back
button feels too small".

Measured on the simulator, on a Release build: from the tap on the Icon row to the page's first
frame took 502 ms, and the grid laid itself out again at 612 ms; a colour tapped took 225 ms to
show. The picker drew all 189 marks, each an SVG of folded paper, at once, and drew every one of
them again at each colour or mark tapped, because each cell was handed a new function on every
render.

1. **The grid draws a family at a time** (`FacePicker`'s `Marks`): the first with the page, each
   of the others a frame after the one before, once the grid knows how wide a mark is. A family
   not yet drawn holds its place at its exact height (its heading is set to the point), so the
   sheet stands at its full height from the first frame and a family chip still jumps to a family
   not yet drawn.
2. **A family, and a mark in it, is drawn again only when what it shows changes** (`memo`, and one
   function for the life of the picker): a colour tapped redraws the chosen mark alone.
3. Measured again, twice: the first frame at 46 and 50 ms, the whole library drawn by about
   650 ms, below the fold; a colour tapped shows in 55 to 67 ms.
4. **Back is one component on every inner page of the space's sheet** (`ui/PageBack.tsx`): a
   44-point target reaching from the sheet's edge to where the page's name starts, the chevron
   dimming while it is pressed. It was the chevron with eight points round it, 38 by 38. Its line
   stands over the hint below it, which, drawn later, took the target's lower third. The chevron
   and the name stand where they did.
5. A test has no layout, so it gives the grid a phone's width and waits for the last family
   (`testing/picker.ts`, `drawLibrary`).
6. **The page's name goes back too** (Arjun, 16 October 2026, on his iPhone: "Tapping on the
   "icon" text should also take nav back"), as the name beside a back arrow does on iOS. It is a
   press of its own that shares the arrow's: either pressed dims both, and the name's reaches a
   full target's height and on past its end. A screen reader is not given a second Back: the
   name's press is left out of what it reads, so it still hears a button, Back, and the name as
   the page's heading.

