# 0110. A sheet glides between its pages

Date: 3 October 2026
Status: Accepted, 3 October 2026. Revised the same evening: pages fade in place (below).

## Context

Arjun, on his iPhone, with the room sheet's Add page open in ASCII Art:

1. "Fix this list issue where I am not able to fully scroll at the bottom."
2. "The agent selector should show the 'lead' label."
3. "The bottom sheet should be smoother and more polished, navigating from screen to screen
   should be super smooth within it."

What was there:

- **The list ran off the screen.** A bounded sheet caps the panel's height, and its pages were
  meant to give way through their scroll view. But the room sheet's pages, and the wrapper that
  slid them, never shrank. So a long Add list laid out at its full height, past the panel and
  under the bottom edge, and its last rows could not be scrolled to. Files had the same column.
- **A change of page jumped.** The new page faded in from 28 points to the right, whichever way it
  went, and the old one was gone in the same frame. The panel took the new page's height at once,
  so its top jumped with it.
- **The lead was only on the sheet.** ADR 0104 put "Lead" on the lead's row in the room sheet.
  The list that picks who a message goes to (ADR 0081) did not say who leads.

## Decision

- **A page is a column that gives.** Each page of the room sheet, and the Files page, shrinks
  (`flexShrink: 1, minHeight: 0`), and so does its scroll view. The other bounded sheets
  (`LineMenu`, `LaneDetails`, `IconSheet`) already did.
- **The panel is laid out at its tallest and drawn at what it holds.** On a phone, `Sheet` lays
  the panel out as tall as a sheet may be, and moves it down by what it does not hold, a
  translation on the native driver. When what it holds changes height, the move springs to the new
  height, with the content riding on the panel's top. Both heights are measured (`onLayout`),
  never worked out from the insets, which a phone can be told late (ADR 0107). A card on a wide
  screen stands clear of the edge, with nowhere to keep the rest, so it keeps its old sizing.
  Animating the height itself was not considered, since a layout changed on every frame drops
  frames (ADR 0061).
- **A page fades into the next where it stands** (`SheetPages`); the only thing that travels is
  the sheet's top, gliding to the new height with the pages riding on it. The page it replaces
  stays at its last height and scroll position, fading out in the first third of the turn while
  the new one fades in. It is hidden from a screen reader and from touches while it goes. The turn
  starts when the new page is first laid out, which is the same moment the sheet learns its
  height, so the fade and the glide run on one spring (`IOS_SPRING`).
  - As first built, pages turned as a stack's screens do: deeper from the right, back from the
    left. Live on his iPhone, Arjun: "the motion looks diagonal". It did, because a slide across
    while the top glides up or down moves the words on a slant. Sliding only after the glide was
    not chosen, because it would make every turn two motions and twice as long. So nothing goes
    sideways now, and `depthOf` is gone with the direction it gave.
- **The room sheet goes back to its first page once it has gone** (`onGone`), so it never opens by
  turning from the page it closed on.
- **The lead wears "Lead" in the address list**, beside its name, as on the sheet (`LeadMark`,
  shared). The Mac's list does the same, styled as Members' tag. A reader hears
  "J1, lead, @J1".

## Consequences

- Every phone sheet now glides to a new height: an error banner appearing, a page loading its
  rows, a menu switching to its reader.
- Walked on the iPhone 17 Pro simulator (iOS 26.5) against a copy of Arjun's workspace (81
  agents):
  - The Add list scrolls to its last row and its People card, above the home indicator.
  - Who → Add, back, Add → Move and Cancel were filmed at 30 fps, before and after the revision.
    After it, nothing moves but up and down; the two pages are seen together for about two
    frames, and the top settles on the spring, with no jump.
  - The lead mark shows beside J1 in the field's list.
- Tests: `SheetPages.test.tsx` covers the page leaving, kept and hidden until the new one is in,
  and that a turn starts the new page unseen where it will stand, with neither page moved across. `SpaceView.test.tsx` and the web `Shell.test.tsx` cover the
  lead's mark in the list.
- While walking this, the simulator app crashed once inside the band record's log writer (ADR
  0107's diagnostic): heap corruption caught by `malloc`. The writer runs on one serial queue and
  uses nothing unsafe, so it may only be where the damage was found. The record came out on 4
  October 2026 (ADR 0107), which removes the question either way.
