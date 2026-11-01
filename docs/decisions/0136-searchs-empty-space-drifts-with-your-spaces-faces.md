# 0136. Search's empty space drifts with your spaces' faces

Date: 7 October 2026
Status: Accepted, 7 October 2026. Phone, Mac and web; live on 4431's page, the Mac app and his
iPhone at 19:07 the same day. Revised that evening to drift behind the recent searches too
(decision 3). Amended by ADR 0138: your agents drift too, with their pins, every face is in a
breathing glow, there are eighteen places, and the faces are dim but never see-through. Follows ADR 0132.

## Context

With nothing typed, the Search tab shows the recent searches (or one line on what it finds) and then
nothing, down to the tab bar. Arjun asked for "some mild cool animation" there, taking up the
spaces' icons, "cool and not overdone", serving as the background of that section.

Four mocks (a private artifact, kept out of the repo): **A · Drift** (faces rise slowly at three
depths), **B · Orbit** (three rings turning round the middle), **C · Lens** (a lens wandering over
faint grey faces, colouring the ones under it) and **D · Shelves** (rows sliding sideways). He
picked A. Asked how A looks with only a few spaces, a second mock showed one, three, six and no
spaces filled three ways: each face once, faces repeated round and round, or topped up with library
marks in grey. He picked **repeated**. Seeing it live, under the last row, he asked for the faces
under the recent searches as well: "will look fine".

## Decision

1. **The faces of your open spaces, the most recently active first, rise slowly behind the recent
   searches and the empty part of Search under them**, at three depths: 52, 36 and 28 points, at full, 72% and 46% of the backdrop's
   strength, climbing from the foot to the top in 40, 60 and 80 seconds. Each sways nine points each
   way and tips seven degrees as it goes. The faces are the ones the Spaces list wears.
2. **Sixteen places, written out** (`BACKDROP_PLACES`, core's `searchBackdrop.ts`), the same every
   time. Fewer spaces fill them round and round, the most recent in the nearest places. More take
   the sixteen most recent. Closed spaces and threads lend none. No spaces, no backdrop.
3. **A background, never in the way.** It hangs from just under the field, behind the recent
   searches (or the line on what search finds), and thins out to nothing over the 90 points under
   the field. The recent searches are clear at rest, so the faces show through them; a pressed or
   hovered row still fills over them. It is a third of its strength (0.30 on the light page, 0.36
   on the dark), so the rows read over it, hidden from VoiceOver and screen readers, and taps go
   through it.
4. **Gone once you type**, the results in its place: on the phone it fades out in 0.2 s and back
   over 0.45 s, and on the web it comes back over 0.45 s.
5. **Moving only while it can be seen.** On the phone it stops while the tab is behind a room or
   another tab, while the app is in the background and while something is typed, and goes on from
   where it stopped. With Reduce Motion (or `prefers-reduced-motion`) the faces stand where the
   round begins.
6. **The faces hold while you look.** Which face is in which place is taken when the backdrop comes
   into view. A room that moves to the top of Spaces while you watch would otherwise change every
   face at once.

### How each client draws it

- **Core** (`searchBackdrop.ts`): which spaces (`backdropSpaces`), the places and their pace
  (`BACKDROP_PLACES`, `BACKDROP_DEPTHS`, `BACKDROP_ROUND_MS`), and which face each place wears
  (`backdropFill`).
- **The phone** (`search/Backdrop.tsx`, `search/drift.ts`): the list's header, a line of no height
  before the rows with the backdrop hanging below it behind them (the rows are drawn after it), so
  it starts where the field ends without measuring the list. While nothing is typed the list keeps
  views scrolled above the window (`removeClippedSubviews` off), or the header would take the
  backdrop with it. It reaches down to the window's foot, the one thing it measures. Every face reads one clock, from
  nought to one over a four-minute round, looped on the native side as the lights that take turns
  are (`ui/useTurns.ts`): a climb is a straight line between points, the fade is straight once its
  two edges are points of their own, and a sway is a sine sampled eight times a swing. Nothing
  crosses to JavaScript while it runs.
- **The web and the Mac** (`SearchBackdrop.tsx`, `styles.css`): the first thing in the scrolling
  column, laid over the whole of it (`position: absolute; inset: 0`) under the list that follows
  it. Each face is a CSS animation measured in that height (`container-type: size`, `cqh`), its place's
  numbers set on it as custom properties. The top fade is a mask.

## Consequences

- Sixteen faces are drawn once when Search first opens: about as much SVG as sixteen rows of
  Spaces. After that the phone moves them natively and the browser on its compositor.
- A space's face changes in the backdrop only the next time it comes into view.
- Not done: agents' faces (it is your spaces, as asked), tapping a face (it is a background), and
  library marks for a workspace with few spaces (he picked repeated).
- Walked on a Release simulator (iPhone 17 Pro, iOS 26.5) over a scratch copy of his workspace,
  light and dark, with and without recents, the keyboard up and down, typing and clearing; and on
  the web in the app's browser, light and dark. Live at 19:07 on 7 October 2026: 4431's page, the
  Mac app and his iPhone (installed while it was locked, so not opened for him).
