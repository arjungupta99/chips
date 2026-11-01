# 0133. A message found opens at its line, with the words marked

Date: 7 October 2026
Status: Accepted, 7 October 2026. Phone (Phase 3 of `docs/proposals/search-plan.md`). Follows
ADR 0132; leaves ADR 0130's room motion as it was (see Consequences).

## Context

Arjun asked for search where a message's tap "takes to exact message on the space", and the plan's
third pick (§1) is that the words searched for are marked in the bubble on landing. After Phase 2 a
message found opened its room at the line, flashed, but not at once. Filmed on the simulator
(Release, iPhone 17 Pro, iOS 26.5, a copy of his workspace, "design test space", 293 messages):

- **A line near the foot** (about 4 rows up, "Kryptonite"): the room came in at its foot and glided
  about 250 points up to the line while it slid in.
- **A line far up** (about 174 rows, "waterfall"): the room came in at its foot, jumped to a rough
  place, then scrolled for about two seconds through the history, arriving as the flash faded.

Why: the room asked the list for the row, animated, as it mounted. A list with no `getItemLayout`
ends its content at the last row it has measured, and draws a few rows past it at a time, each
guessed at the height of the ones it has: here 1,374 points a row, from the long replies at the
foot. So the list climbed about five rows a step, in view.

## Decision

1. **A room opened on a line it has is placed there unseen** (`useLanding`, `SpaceView.tsx`). Its
   list is held unseen (`ColourList`'s `shown`) until the room is built (its foot measured).
   The line is then asked for with `scrollToIndex({ animated: false })`, again each frame until the
   list has measured it, and three frames more while the rows round it are measured
   (`useRowScroll`). The list then fades up over the 200 ms a landing line fades, with the line
   in the middle of the glass, flashed (`Flash`, unchanged). Everything is asked from an effect or a
   frame callback, never inside a mount (ADR 0130).
2. **To a line past the first rows, every row is drawn at once.** While it places the line, the
   list keeps every row from its foot drawn to the line and eight past it (`initialNumToRender`,
   `reach`), and lets the rows between go 2.5 s after it shows. No rough jump is made while placing
   unseen: the rows are being drawn.
3. **That drawing waits for the room to begin coming into view** (`inView`, from the stack's
   `transitionStart`, in `app/spaces/[id].tsx`). The bar's name and its way back are laid out
   natively and committed through JavaScript. Drawn the moment the room mounted, about half a second
   of rows kept both off the screen for the whole slide (filmed, and probed: the bar's height came
   in only after the rows). By the slide's start both are in. A line in the first twelve rows does
   not wait. A room that does not slide in, opened as the app starts, counts as in view after
   600 ms.
4. **However far it got, the room is shown after 1.5 s**, and goes to the line from there in view.
5. **A link followed in a room already open goes there in view, on a glide**, as before: a file's
   *Go to message*, or a pane on a wide screen landing again. The room and the media viewer share
   one way to a row (`useRowScroll`): ask, and on a miss go roughly there and ask again next frame.
   It replaces the fixed 120 ms wait the miss used to have.
6. **The words searched for travel with a message's link** (`words`, `hitHref` in
   `search/items.ts`). Search adds the text typed. The room's route passes it on, and on its
   wide-screen redirect to the Spaces tab's pane. A voice note's link does not take it, because its
   words were heard and are not drawn in its bubble. Nor does a step's, because its run lands on the
   line that closed it. A file's *Go to message* clears it.
7. **The landed line marks them** (`Markdown`'s `marks`). The terms are core's `searchTerms`.
   `wordMarks` splits the bubble's plain, bold and italic runs and its mentions with the server's
   rule: whole words for the earlier terms, a prefix for the last, case and accents folded. Each
   mark is drawn as a result row draws it (`MarkedParts`, moved to `ui/Marked.tsx`). Code and links
   are left as they are. The marks clear 2.5 s after the room shows (`MARKS_MS`), once the flash
   has faded. They clear as a flip, not a fade: a nested `Text` cannot fade on the native driver.
   This is the mock's one departure.

## Measured

Same room and build, by JavaScript probes from the room's mount (the film's timestamps are not
used for durations: `simctl io recordVideo` is variable frame rate and shortens still stretches):

| | Before | After |
|---|---|---|
| Line about 4 rows up | glides ~250 pt from the foot as it slides in | placed 71 ms, shown 79 ms, during the slide; no move after |
| Line about 174 rows up | ~2 s through the history from the foot | in view 253 ms, placed 761 ms, shown 778 ms; no move after |

The marks cleared 2,517 ms after the line was placed. The bar is on the screen from the slide's
first frame in both cases.

## What is left out, and why

- **`getItemLayout`.** Rows vary in height, from a word to a page.
- **`initialScrollIndex`.** It would draw only the rows round the line, and guess the rows below it.
  The room's own place-keeping (ADR 0130) would then be correcting those guesses under the reader
  for the rest of the visit.
- **Drawing the rows a chunk a frame, or a chunk each time the last was measured.** Tried. A chunk
  a frame still held the bar off the screen, and a chunk per measure ran past 1.5 s, since iOS hands
  JavaScript what it has measured only when its main thread rests.
- **A line far up in a room already open** still climbs in view, as before.
- **Rounded marks**, as ADR 0132 says.

## Consequences

- ADR 0130's room moves as it did. A room opened far up keeps every row to the line drawn for
  2.5 s after it shows, then windows its rows as ever. The list keeps the measurements of rows it
  lets go, so its spacer is exact and nothing on the glass moves.
- A room opened far up is blank under its bar for about half a second after the slide begins: the
  rows to the line are drawn then.
- `Markdown` takes `marks`; `Line` and `SpaceView` carry them. `ColourList` takes `shown`.
  `SpaceView` takes `words` and `inView`. `RoomPane` takes `words`.
- No server change, no protocol change, no migration. Going live is `pnpm phone build`.
- On his iPhone (iOS 27.0.1) since 7 October 2026, 00:41 PDT; he searched and said "all fine"
  (Phase 4). Not walked: Android, the iPad (the redirect with `words`), and a voice note found by
  its heard words (the copy of his workspace has none).
