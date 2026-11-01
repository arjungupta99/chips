# 0061 — The room moves by transform, and redraws by difference

**Status:** Accepted, 17 September 2026.

## Context

The phone's outgoing bubbles sample a viewport-anchored violet, blue and teal field as the room
scrolls (ADR 0050's bubbles, the 16 September 2026 refinements). Arjun reported the bubble colour
flickering as a room opened and closed and when a bubble stood at the very top, and frames
dropping as the room scrolled.

Both had one cause. The field was placed on the UI thread by a worklet that returned the field's
`height` as well as its transform. On the new architecture a height is a layout, and Reanimated
4 commits a shadow tree for it, synchronously, on every scroll frame; the commit is where the
frames went, and its race with a render of the row is where the flicker came from. The same
worklet hid the field whenever the bubble could not be measured for a frame — a row mounting, the
list re-laying itself out under a keyboard, a screen on its way out — so the bubble flashed the
static teal beneath and then coloured again.

Beside it, the room redrew every row on every event the store delivered from any space: the
row's handlers were closures made fresh per render, the lanes were rebuilt by the fold at every
flush, and the row component was not memoised.

## Decision

1. **A UI-thread style in the room carries transforms and opacity, never a layout property.**
   The colour field is one tall picture, `FIELD_HEIGHT` points, placed by a translation and a
   scale (`scrollField.ts`, `ScrollColours.tsx`). Anything that must change a view's size goes
   through React, once, not through a worklet per frame.

   Amended 22 September 2026 (Arjun, the media viewer's zoom jerking): the rule is the app's and
   not the room's, and it has a second half. Six of the viewer stage's eight styles handed back a
   `width` or a `left`, and every one of them ran on every frame of every gesture — because a
   worklet is woken by each shared value its closure can reach, and Reanimated walks into a plain
   object to find them (`extractInputs`), so a style written off a set of shared values has
   subscribed itself to all of them. So: a style takes the two or three values it reads out of
   such a set by name, and the style a gesture drives is not the style that moves the same view's
   box (`apps/mobile/src/media/Stage.tsx`). Amended again the same afternoon (Arjun, the first open
   after a cold start jerking): nor is the flight from a tile an exception. It had laid out its
   clip, its picture and the room's glass afresh at every frame; it now lays each out once and
   draws the rect the flight is at by a transform (`transformTo`, `packages/core/src/viewer.ts`),
   a different scale across than down while the clip's shape goes from the tile's to the
   picture's, with the picture inside taking that back out. No style on the stage has a layout
   property now. The jump itself was the clock's: a one-off stall of the UI thread just after the
   flight was let go, which a spring on the wall clock skips past, so the flight keeps a clock of
   its own that a frame moves by a frame's worth at most (`withSteadySpring`).
2. **A sample keeps its last good geometry.** The field is hidden only until its first
   successful measurement and never after; a frame in which the bubble cannot be measured leaves
   it where it was.
3. **Measuring and styling are separate worklets.** A reaction measures and writes the placement;
   the style reads it. One worklet that measured, wrote and read the same value would mark
   itself dirty on every run.
4. **A row is redrawn only for a difference in what it draws.** `Line` is memoised; the room hands
   rows handlers with one identity for the life of the room (`useHandler`); a space's lanes keep
   their array while they read the same (`sameLanes`); a run is found by id; the list keeps
   fewer screens mounted.

## Consequences

The field costs one measurement per outgoing bubble per scroll frame and no layout. A room's
rows are drawn again when their line, lane, run, place or standing changes, and not when a
message lands in another room. The lane comparison is a field-by-field compare in the app,
because the fold cannot cheaply know a lane is unchanged — its labels are read off the spaces
around it; if lanes ever gain a version, the compare should read that instead. Nothing here
changes what the room shows; the Jest suite, the pure tests and the simulator walk say so.

## Addendum, 18 October 2026: the picture is one point wide

The field's picture was drawn as wide as its bubble, and react-native-svg's `Svg` draws itself, so
every sent bubble kept a bitmap 1000 points tall and its own width at the screen's scale: about
10 MB each. A room with twelve sent bubbles had 133 MB of CoreAnimation memory, against 9 MB with
the field taken out (`footprint`, Release build on the simulator). The gradient changes only down
the picture, so the picture is now drawn `FIELD_WIDTH` (one point) wide and stretched by a constant
`FIELD_STRETCH` in the same transform as its translation and scale (`scrollField.ts`). The room now
has 12 MB. The stretch is a constant, so it adds no measuring and no layout, and it is wider than
any bubble, so a phone turned on its side cannot leave the picture short (331facf2). The colours
are CoreGraphics's own, to within one level in 255: the dither that ran along each row is now
the same across it.
