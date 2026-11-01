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
