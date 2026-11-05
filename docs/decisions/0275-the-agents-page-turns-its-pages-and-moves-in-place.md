# 0275. The Agents page turns its pages, and what changes on it moves in place

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's word the same day ("everything should have smooth
transitions and look highly polished", for the web and Chips for Mac). Each part follows the
phone, or what Chips already does somewhere else on the desktop.

## Context

The Agents page, walked in WebKit (Playwright's, Chips.app's engine) on the Demo, 1280 and 900
wide, light and dark:

- **A page over the list was simply there.** An agent's page, a harness's, View all, and the pages
  a harness's page opens (its Connection group's, ADR 0273) replaced what was under them in one
  frame, and going back did the same.
- **Going back lost the list.** The list was drawn again from its top, with the archived folds
  shut: an agent opened from far down the list came back to the head of it (scrolled 100 points
  down, back at 0).
- **Words changed in a frame.** A tile's line ("1 agent", "Working", "Can't answer"), an agent's
  line, a value at a row's right ("3 of 9 · heard now"), the counts under the page's name.
- **What came and went jumped.** A harness that connected, or an agent made, was there at once and
  pushed what was after it; the archived folds opened and shut in a frame; the Tokens page drew
  nothing until its list came and then pushed Issue a new token down; a token issued, or an error,
  pushed the list down.
- **No control moved on hover or press.** Tiles, rows, folds, cards and the back link changed
  colour in a frame, and nothing gave under a press.

## Decision

1. **Pages turn** (`Turns.tsx`). The page coming comes in over the page going on `--motion-base`
   and `--ease`, from 16 points to the right when it is opened over, from the left when it is gone
   back to, and in place when it takes the list's own place: the list over its blank, and the list
   over the empty page's gallery as the first harness comes. Only its opacity and transform move.
   The page going is the page itself, left as it was drawn, under the one coming until it has come:
   no frame is blank, and nothing of it is drawn again (a still copy of it, tried first, cost WebKit
   a second frame on every turn). While it goes it is inert and hidden from assistive technology,
   and nothing in it answers to a test id or an id. Each page that comes is drawn anew. A turn takes
   no clicks away: the page coming is pressed as soon as it is there, unlike the section crossfade
   (ADR 0274), which is why this is not a view transition.
2. **A page gone back to is where it was left**, as the phone's stack keeps the page under: its
   scroll is kept while it is read and put back before it is drawn again, and the archived folds
   stay as they were. A page opened anew starts at its top.
3. **Words crossfade where they stand** (`Swap`, as the room's strip and You's rows do): a tile's
   line, the Connect tile's name and line (its minutes simply count), an agent's line, a row's
   value, the page's counts.
4. **What comes grows into its place** (`Arrive.tsx`), on `--motion-base`: a harness's tile on the
   shelf, an agent's row on the list (one that moves between the list and the archived ones lands
   as Select's does, ADR 0182), what the archived folds hold, opening and shutting, a token issued
   and an error on the Connection pages. The Tokens page holds its list's place with a blank row
   until the list lands there (`useLands`, ADR 0238). The owner's tick comes to the person chosen;
   the checklist's lines light rather than switch on.
5. **Hover and press are on `--motion-fast`**, as the app's own Button: a row or a fold deepens a
   step under the pointer and again when pressed; a tile, a card, View all and the face on an
   agent's page give a little when pressed, as `.cw-pill` and `.person-space` already did.
6. **Connect's dialog stands apart from the pages**, so a page that turns under it, as the list
   takes the gallery's place when the first harness comes, leaves it as it was.
7. **A tile is named by what it shows** (Lighthouse's label-content-name-mismatch: "click Scout"
   by voice found nothing). A harness's tile and its card under View all take their names from
   their words, the harness's name first ("Scout 1 agent", "Scout No live sessions · 1 space"),
   and leave the face out, since it says the name again. Connect's tile is named by its words too,
   and while its link waits, by what it is for after them, unseen ("Waiting 14:59 left, to connect
   a harness"). A label could not pass: the face's initial is on screen, so no label held the words
   shown. The phone speaks core's labels, as before.
8. **Reduce Motion is still** (`motion.ts`, as `base.css` asks everywhere): no turn, no page going,
   no crossfade, nothing growing in; the page, the words and the rows are simply there. So is a test
   with no screen to ask.

## What was left as it is

- **The frame that draws a page** costs what it did: in WebKit, a turn in two or three has one frame
  of 21 to 27 ms as the page coming is drawn, before and after alike. The turn adds nothing to it
  (14 ms from the press to the next frame, before and after) and its own frames hold at 16 to 18 ms.
- **A tile or a row that goes** because something elsewhere removed it goes at once. The ones this
  device archives, unarchives or deletes go as Select's do (ADR 0182).
- **A dialog of the page going**, should the page go under it (a harness removed while its Remove
  asks), goes with the page when the turn ends rather than at once.
- **The section crossfade, the dialogs' motion and the Mac's window** are ADR 0274's.

## Consequences

- Measured in WebKit on the Demo, dark, 1280 wide, ten turns each: the frames over 20 ms are the
  press's own, as before (6, 5, 3 and 3 turns of 10 against 5, 4, 2 and 3), and none during a turn.
- Under the page coming there is, for 200 ms, a second page in the document, inert and hidden, with
  no test ids or ids: a test that looks by test id or by role finds only the page coming. One that
  looks by text alone may find the page going too, for that moment.
