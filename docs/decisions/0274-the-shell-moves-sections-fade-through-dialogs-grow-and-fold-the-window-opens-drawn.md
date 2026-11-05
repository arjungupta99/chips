# 0274. The shell moves: sections fade through, dialogs grow and fold, the window opens drawn

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's word the same day ("everything should have smooth
transitions and look highly polished", for the web and Chips for Mac). Nothing here is a new
choice: each part follows the phone, a Mac app, or what Chips already does in one place and not
another.

## Context

The shell, walked in WebKit (Playwright's, which is Chips.app's engine) against a scratch
server, frame by frame:

- **A section changed in one frame.** Spaces, Agents, Search and You, by the sidebar, ⌘1 to ⌘4, a
  menu or a link from another section, swapped two to four frames after the click with nothing
  moving. There was no blank frame, but no motion either, and Search and You finished drawing a
  frame or two after they appeared.
- **The asking dialog popped in and vanished.** `ConfirmDialog`, which asks before an archive, a
  delete or a removal from twenty places, had no motion at all, while `GrowingDialog` (New space,
  Add harness, the room sheet) grew out of what opened it on durations of its own (210 ms and
  160 ms, each on a curve of its own), not the design system's.
- **With Reduce Motion a folding `GrowingDialog` stood still for 400 ms after Escape**, waiting for
  the end of a fold that `base.css` had stopped.
- **Chips for Mac's window was shown the moment it was made**, before its page had loaded: WebKit
  draws a window white until its page paints, and the page then drew an empty room for a moment
  while its cache was read.

## Decision

1. **Sections fade through, on the Agents page's turns** (`Turns.tsx`, ADR 0275). The shell is the
   sidebar and one place beside it, where the section turns: the room and its run panel stand in
   that place as they stood in the shell's columns, so they come and go together. The panel slides
   in and out only as a run starts or ends in the room open in Spaces (ADR 0268's addendum); to
   another section and back it fades with the section. Every change that
   takes the window to another section is made at once, and the section coming is live from the
   first frame. The section going is the section itself, left mounted under the one coming as it
   was last drawn, so nothing of it is drawn again. It fades out on `--motion-fast`; the one coming
   fades in on `--motion-base` from half way through that (60 ms), on `--ease`, so the two are never
   seen at once. Only opacity moves. The sidebar is outside the place and holds still, with the new
   section lit from the first frame. The section going is inert, hidden from assistive technology,
   and answers to no id or test id, so a click a moment after ⌘2 reaches what it lands on, even the
   new section while it is still coming in. A change within the section on screen (a room opened
   from Spaces) is made at once, as it was. With Reduce Motion or in a tab nobody sees, the change
   is made at once, and the sidebar's lit row says where you are. Everything a change of section
   carries is made in one go: You's relay card, asked for by the setup card's Away from home, comes
   with You.

   Not the browser's view transition, which the first version used: in WebKit every click made
   while one runs goes to the page itself, whatever `pointer-events` it is given (found by the
   Search session), and the live picture of a named part is not drawn, so nothing in the window
   could be faded apart from the rest. Not a still copy of the section going, which the second
   version faded: the section is still there to fade, and one way for every view that gives way to
   another is less to keep than two.
2. **You's pages beside the list turn the same way** (ADR 0265's addendum): a page swapped for
   another, a person from People, or Nothing open turns in the pane column on You's own moves,
   deeper pushed over the page under it, back popped, anything else across. These were a still
   copy (`you/motion.ts`). What stays a copy is what React hides or has taken away, which a turn
   would draw anew and lose what was typed or scrolled in it: the list where You is too narrow for
   both, a page under the form it opened, and a form opened from the list, which stands in the
   column beside the turns in the same place.
3. **Dialogs grow and fold on the design system's motion** (`dialogMotion.ts`): in on
   `--motion-base`, out on `--motion-base`, both on `--ease`, as `GrowingDialog` already did on
   its own numbers. `ConfirmDialog` grows out of what was pressed to open it: the press is kept
   with where its control stood, since a menu item has gone by the time its dialog opens. When its
   owner takes it away it folds back there as a ghost, a still copy of it drawn in the top layer,
   over any dialog still open under it, for the length of the fold. The copy has no ids, no test
   ids and no clicks. Its owners are not changed. This and You's hidden views are the only copies
   the app draws (`ghost.ts`).
4. **Reduce Motion is still** (as `base.css` asks everywhere): no fade, no turn, no grow, no
   ghost, and a `GrowingDialog` goes the moment it is told to.
5. **Chips for Mac's window opens drawn.** A window just made waits, hidden, until its page says it
   is drawn (`drawn`): anything on the page but the strip under the traffic lights, and not the
   room's place while it is quiet for the cache read (`data-window-waits`). A page that never says
   so is shown after 1.5 seconds all the same. A window that was only hidden is shown at once.

## What was left as it is

- **Zoom** (⌘+, ⌘−, ⌘0) redraws the page at its new size at once, as Safari's does: the shell
  draws it, and there is no picture of the page as it was to fade from.
- **Full screen**: macOS animates the window itself. The strip under the traffic lights goes when
  the shell says the window is full screen, which is expected to be under that animation.
- **A window resized** reflows as it is dragged, as a Mac app's does; the sidebar narrows at its
  breakpoint at once.
- **The room beside Search's results, opened in Spaces,** fades out and in with the rest, so it is
  never seen twice. Carrying it to its place was tried on view transitions and left out with them.
- **A reload in a browser** draws the rail's placeholders and an empty room's place for about two
  frames before the room. The Mac's window waits through them.
- **Opening a long room costs one frame of 100 to 150 ms** in WebKit, coming into Spaces from
  another section, before this change and after it: the room's first drawing (about 10,300
  components for a room of 600 messages), not the fade.

## Consequences

- One more command from the page to the shell (`drawn`), allowed in the main window only (ADR
  0231). Works wherever the page runs, with no view transitions: macOS 13 included.
- For about 260 ms after a change of section, the words of the section going are still on the
  page, hidden from assistive technology. A test that looks for words rather than a role or a test
  id can find them twice in that time.
- Measured in WebKit on the shipped build (`vite build`) against a scratch server holding a room
  of 600 messages with a run going:
  - At rest, every section is drawn exactly as before, pixel for pixel, at 1280 and 900 wide, light
    and dark: Spaces with the long room and its run panel, Search with a result beside it, Agents,
    You with a page beside the list and with a form from it.
  - Each section fades through in about 235 ms; the two are seen at once at most 0.05 of the way.
    A real click 50 ms after a change reaches the sidebar and the new section (Connect on Agents
    opened its dialog).
  - Leaving Spaces on the long room, no frame over 20 ms, as before. The room going is drawn again
    not once by the turn (only its thinking clock ticks on, as it would anyway), and taking the ids
    off it costs under a millisecond.
  - New space grows in 183 ms and the asking dialog in 200 ms; both fold on `--motion-base`
    (200 ms), the asking dialog into what opened it. With Reduce Motion nothing moves.
- Not walked in the installed app: the window's first showing, a change by ⌘1 to ⌘4 and the
  menus, full screen. They need a build of Chips for Mac, which this session left to the one that
  installs it.
