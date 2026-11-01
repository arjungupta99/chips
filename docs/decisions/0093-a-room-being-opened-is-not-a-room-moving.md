# 0093. A room being opened is not a room moving

Date: 2 October 2026
Status: Accepted. Amends 0074 and 0075, which say how the room moves; this says when it starts.
Numbers 0091 and 0092 are taken by another session's work on agent names and the room note.

## Context

Arjun, 2 October 2026: "whenever I open a chat the content shifts up when the view is coming in.
Basically the bubbles initially start below the text box, and they shift up."

The room's chrome floats over its lines — the composer on glass at the foot, the bar and the
pinned strip at the top — and the list holds that much of itself clear as padding on its content
(ADR 0070, `ui/Glass.tsx`). How much is measured, because all of it changes while the room is
open: the composer grows with what is typed, with what is attached and with what was refused.

A measure is a frame late. `onLayout` is an event: the foot is laid out, the event is delivered,
the room renders again with the number. So the room's first frame held nought clear at its foot
and drew its newest line under the composer, a hundred and eight points lower than it belonged —
and the correction, being a change to the room, was then carried to its place on the room's own
spring (ADR 0074). Every room opened took its whole conversation up over half a second, from
behind the field, while the screen was still sliding in.

## Decision

1. **The room knows what its foot covers before it draws a line.** Until the foot has measured
   itself the room holds a quiet foot clear: the bar's own padding over and under a field of one
   line, and the band at the bottom of the glass the bar holds clear itself (`quietFoot`,
   `Composer.tsx`). The ordinary room is exactly this, at every text size, because an empty
   field's height is set rather than measured — so for the ordinary room there is no correction
   at all, and nothing to animate. A room whose foot stands taller — a notice over the field
   (ADR 0087), a draft of several lines — is short by that much, and the measure corrects it.
   The strip at the top keeps nought, because it is nothing at all until a line is pinned, and
   the top of an inverted list's content is not where its rows are anchored.
2. **Nothing the room's build changes is sprung to its place.** The room's transition is off
   until the room has been drawn at the height its own foot measured (`built`, `SpaceView`,
   `ScrollColours`): one render after the measure lands, so a correction is drawn where it
   belongs rather than carried there. Nothing in the room has been seen yet for a spring to come
   from. From then on the room moves as ADRs 0074 and 0075 say.

## Consequences

- The floor and the foot's own layout are two statements of one number. The room's test reads
  both off the rendered foot — the bar's padding, the field's height, the band — and fails if
  either moves without the other (`SpaceView.test.tsx`).
- Anything else floated over the room's lines has to keep this rule: a measured inset wants a
  floor, or the room will shift as it opens again.
- A line that lands in the room's first two renders does not rise in. That is the few
  milliseconds between the mount and the foot's measure.
- `built` reaches the cells as a prop rather than a shared value, so the order is React's: the
  render that corrects the geometry is committed before the one that lets the room move. It
  costs one shallow re-render of the room's cells as a room opens.
- The desktop's room is a column with its composer under the lines, not over them, and has
  nothing of this. Its windowed list settles its own estimates, which is a different thing.
- Not walked on a device. The arithmetic and the first frame are tested under Node; what a phone
  draws in the frames of a push is his to see.
