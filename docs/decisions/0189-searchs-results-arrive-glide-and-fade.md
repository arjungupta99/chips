# 0189. Search's results arrive, glide and fade

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's "please make them appear gracefully with animation".
Adds to ADR 0132 (Search is a tab), ADR 0136 (its backdrop) and ADR 0132's second addendum (Cancel
and the chips).

## Context

Search's list was swapped in a frame. The first letter replaced the recent searches with results;
each letter after it added and dropped rows, and every row under a change jumped to its new place;
the two ghost rows that stand for messages on their way were replaced by the messages in one frame;
a chip changed the whole list at once. On 17 October 2026 Arjun wrote: "the loaded results in the
search appear abruptly, please make them appear gracefully with animation, The whole experience
should look polished and delightful".

## Decision

1. **Which rows arrived is core's** (`packages/core/src/searchArrival.ts`): `searchArrivals(before,
   after)` gives each row whose key the list did not have its place in a wave, counting down the
   list. A row is the same row while its key is (`SearchItem.key`), so the spaces a letter keeps
   stay where they are. Nothing arrives on the first draw. The pace is core's too
   (`SEARCH_ARRIVAL`), the same on the phone and the web.
2. **A row that arrives** fades up over 200 ms and rises 12 points into its place, 32 ms after the
   row above it. Only the first eight are a beat apart; the rest come with the eighth, so a long
   page is never waited for.
3. **A row that stays glides** to its new place when rows above it come or go.
4. **A rise and a glide are on UIKit's spring**, the app's `IOS_SPRING` (stiffness 320, damping 32):
   they start gently and land softly. The first build used a Bézier that started fast, and a row
   going three hundred points was most of the way in two frames, which read as a jump. A fade is a
   Bézier (0.2, 0.8, 0.2, 1).
5. **A row that goes fades where it stands** over 140 ms, from as strong as it was drawn, so a row
   typed away while still fading up does not flash whole first.
6. **While results are listed, each row stands on the page's own colour**, and a later row is drawn
   over an earlier one. A row sliding down to make room covers the row arriving there and uncovers
   it as it goes, and a row closing up covers the one fading where it stood. With clear rows the
   two were drawn through each other for a tenth of a second. The recent searches stay clear, over
   the backdrop's faces (ADR 0136).
7. **The ghost rows breathe**, dimming to half and back every 1.4 s, the second 200 ms after the
   first, until the messages take their place.
8. **On the Mac and the web the backdrop fades away** over 200 ms as the first letter is typed (it
   went in a frame; the phone's already faded), wearing the faces it had, and **the chips come in**
   fading and settling 6 pixels, as on the phone.
9. **With less motion asked for, nothing travels**: rows fade in and out where they stand, a row
   that stays is simply in its new place, and the ghosts are still.

### On the phone

`apps/mobile/src/search/ResultsMotion.tsx`, on Reanimated, so every frame is set on the UI thread:

- The list is Reanimated's `FlatList` (`MovingList`, through `UnderNameList`'s new `List` prop),
  whose cells glide on the spring (`itemLayoutAnimation`, `LinearTransition.springify()`).
- A row that arrives rises and fades on two shared values of its own (`Rising`). Reanimated tells an
  exit where a view stands but not how strong it is drawn; the row's exit reads its shared value, so
  it fades from where its arrival had got to. A row already listed fades out from whole (`Listed`).
  Which of the two a row is, is decided as it is first drawn.
- Reanimated's own `useReducedMotion` is read: it answers before the first frame, where the app's
  hook answers a moment later and a row would already have risen.

### On the Mac and the web

`apps/web/src/app/searchMotion.ts`, by the Web Animations API:

- After each change, each row in view is played from where it was to where it is. A glide is added
  to any still running (`composite: "add"`), so a second change mid-glide carries on from where the
  rows are drawn.
- The spring is drawn as CSS's `linear()` from core's new `springCurve` (`viewer.ts`), its share of
  the travel every frame until it settles; a browser without `linear()` gets a Bézier close to it.
- A row that goes is drawn once more where it stood, a copy that cannot be reached, in a layer
  under the list that React never draws into.
- The list's rows are laid out only near the window (`content-visibility: auto`), and a row not yet
  drawn stands at a guessed 56 pixels until the frame is painted. Rows measured on that guess
  glided from the wrong place and jumped once drawn. So the rows a change brings among the first
  sixty are laid out in full before anything is measured, and where every row stands is read again
  whenever the list changes size.

## Consequences

- Nothing on the server or the wire changes; no new dependency.
- Jest stands in for `ResultsMotion` (`jest.setup.js`), as for the app's other Reanimated files:
  the list is a plain list, a row is simply there and gone. jsdom has no Web Animations, and the web
  module draws the list as it is there. The motion is the simulator's and the browser's to show
  (`testing/scenarios/rooms/search.md`).
- A row on the phone that arrived keeps a shared value and an animated style while it is drawn; a
  row already listed has neither.
- Walked on a simulator (a Release build with this bundle, over a copy of his data) and in a
  browser (frame by frame). Not walked: his iPhone at 120 Hz, the Mac app's WebKit, Reduce Motion.

## Addendum, 3 November 2026: nothing on the Mac and the web changes in a frame

Arjun: "everything should have smooth transitions and look highly polished", for the web and Chips
for Mac. Walked in Playwright's WebKit on the Demo at 1280 and 900 wide, light and dark, with each
frame logged by `requestAnimationFrame`. What still changed in a frame, and what cost frames:

- **The list moved under what was fading.** The chips come under the field with the first letter
  and go with the last, so the whole list moves 36 pixels in that frame. The rows going and the
  backdrop jumped with it while they faded. Now `searchMotion.ts` keeps where the list stood on the
  screen (`at`: the scrolling column's place, less its scroll). A row that stays, a row that goes
  and anything over the list marked `data-leaving` are taken from where they were seen, not where
  they were in the list.
- **"Nothing for …" flashed between letters.** One letter in All looks at names alone, so a letter
  no name starts with said nothing was found. The next letter swapped that line for the messages
  on their way (3 frames, measured). While the messages are still to be asked for (`idle` or
  `waiting`), the line is held (`data-hold`). It arrives once typing has paused as long as the
  messages wait (`SEARCH_PAUSE_MS`, 200 ms), so a quick next letter takes it away unseen. Once the
  server has answered, it comes at once.
- **The chips went in a frame.** As the field empties, a copy of them fades where they stood
  (`--motion-fast`), the chip that was chosen still chosen. The copy can't be reached and isn't
  read out, and the room under the field has already closed. They come in with the phone's 6-point
  settle on `--motion-base` and `--ease`. That happens only when typed on this visit: Search opened
  on words typed before shows the chips as they were, under the shell's change of section (ADR
  0274).
- **Hover, press, the lit row and the open row snapped.** Each now changes on `--motion-fast`. A
  chip not chosen dims to 0.7 when pressed, as on the phone. See all and Clear dim to 0.6, as the
  phone's See all does. A row pressed goes a step stronger, to the open row's colour. Open in
  Spaces presses in as the room's pills do. The arrows scroll to the row they light rather than
  jumping (`"auto"` with less motion asked for).
- **The backdrop was drawn afresh each time the field emptied.** It was unmounted after its fade
  and built again: 18 faces with SVG silhouettes, 30 to 63 ms over two or three frames (23 ms at
  most with the faces hidden). Now it is kept once drawn, as the phone keeps its own. It rests out
  of sight with its faces still (`data-resting`, `visibility: hidden`, animations paused) and fades
  up from nothing when the field empties: 24 to 36 ms. What remains is the faces' first paint. Kept
  at opacity 0 instead was worse (up to 76 ms).
- **Timings come from the design system.** The chips, the backdrop's fade out and "Nothing open"
  use `--motion-fast`/`--motion-base` and `--ease`. The backdrop's 450 ms fade up stays: it is the
  phone's `SHOW_MS`.
- **With less motion asked for**, `base.css` stops every CSS animation. The chips' copy and a
  leaving backdrop are hidden at once rather than standing whole until their fade would have ended.

Not changed: the placeholder rows arriving take one frame of 21 to 24 ms when typed at a normal
pace, with or without their breathing. Frames over 30 ms come only when fast typing stacks changes,
on a machine under load.
