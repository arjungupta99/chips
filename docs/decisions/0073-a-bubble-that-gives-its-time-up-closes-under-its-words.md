# 0073. A bubble that gives its time up closes under its words

Date: 25 September 2026
Status: Superseded by [0074](0074-the-room-moves-on-one-transition.md), 25 September 2026

## Context

The time goes on the last bubble of a turn alone (ADR 0050), so the second message of a turn
takes it from the first. Arjun, on the build with ADR 0071: "where there are 2+ consecutive
messages, the time on the previous one abruptly disappears, and the bubble shrinks, without
animation".

Filmed on the simulator and read by strips, the first bubble lost its time line — about 15 pt —
and the round corner at its foot in one frame, at the tap. A short message ("Wait", "On it.") has
its time as its widest line, so it lost width in the same frame too, and a bubble of yours,
standing on the right, took its words right as it did. It is at every second message of a turn,
yours and anyone else's, and a photo's time under its tile goes the same way.

Three answers were put side by side in a mock, `docs/proposals/time-tuck-mocks.html`: as now;
the foot tucks up (A); every bubble keeps its time, as Telegram does (B), which is one line and
undoes the design's time-on-the-last-alone. A was built.

## Decision

The bubble is laid out at its new size at once, as before. An animated size on the new
architecture is a layout committed every frame, which is where frames went (ADR 0061). What moves
is drawn under and over it (`Motion.tsx`, `useTuck`):

- Under it, the bubble as it was (`TuckSkirt`): its size, its ground, its field. It shrinks to
  the new size from the top corner on the bubble's own side.
- Over it, the time (`TuckTime`), where it stood. It rides the corner that moves and is gone in
  the first two-fifths of the way. Under the bubble, the bubble's own padding would hide the time's
  top half.
- A bubble of yours that narrowed starts where its left edge was and slides home with the skirt's,
  so its words do not jump.
- The foot keeps its round corner until the bubble has closed. The joined corner is sharp, and it
  stood out past the skirt's round one as a notch while the skirt shrank.
- The spring is that of whatever lands below. A send's (`UP`) for yours, so the bubble closes with
  the room's rise and the words' flight. An arrival's (`IOS_SPRING`) for anyone else's.
- A photo's time only fades, under its tile.

The bubble is measured twice. As it was, while React draws the change and before it is
committed. As it is, in a layout effect, before the phone draws it. The new architecture reads
layout synchronously in both places, and what a layout effect sets is drawn in the same frame.
Your bubbles' field under the skirt reads the placement the bubble's own sample keeps
(`FieldSpot`, `ScrollColours.tsx`). With a sample of its own, it showed the flat teal for the frame
before it had measured itself.

## Consequences

- Filmed, a "Wait" closing to its new size after an "ok": its height went 161 → 119 px, 2–4 px a
  frame, over ~0.4 s. Its words stayed put, and there was no notch and no flash. A harness's
  "Answered. 7:22 PM" gave its time up the same way as the next line rose in.
- The size was first kept from every bubble's `onLayout`. On the simulator that fired for every
  bubble on every frame the room moved: a bubble's height wavers by a hundred-thousandth of a
  point with where it stands on the glass. That was dozens of calls into JavaScript a frame, so
  it was dropped for the two measures.
- A second message now mounts two more views in the send's frame: the skirt (for yours, with the
  field's picture) and the time. Across the walks the room's first step after the tap was 4–18 px,
  against 6 px on the film before. That is inside the noise of the stall the send already has
  (33–42 ms), and not measured on the phone.
- With Reduce Motion the skirt and the time fade, and nothing moves across. A bubble that cannot
  be measured changes as it always did.
- Not handled: a line with words and a photo, whose tile under the bubble still steps up by the
  time's height; and the face beside the last bubble in a room of three, which moves to the new
  last bubble in one frame.
- Not walked on the phone.
