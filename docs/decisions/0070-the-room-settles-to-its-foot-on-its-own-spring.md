# 0070. The room settles to its foot on its own spring

Date: 25 September 2026
Status: Superseded by [0074](0074-the-room-moves-on-one-transition.md), 25 September 2026

## Context

The phone's room is an inverted list that keeps its place by measuring
(`maintainVisibleContentPosition`): when something is put in at the foot — a line sent, a
reply, the thinking bubble coming up, a card — the platform holds the first line where it was
on the glass and takes up the difference in the offset, then, for a reader at the foot, eases
the room down to the foot with an animation of its own, a quarter of a second and slow at both
ends.

Since 24 September the words of a send fly from the field to their bubble on a spring
([send animation A](../proposals/send-animation-mocks.html)), and the room was made to rise
with them on the same spring while they were in the air (25 September, small hours), because
on the platform's ease it set off later and slower than the words and they passed through the
bubble above. That left every other landing on the platform's ease. Arjun, on his phone the
same day: the send still looked jumpy with the thinking bubble showing, and "the previous
bubble abruptly moves up when a new bubble is coming in".

Two things were behind it. With the thinking bubble at the foot, the list holds the first
*line* — the bubble sits below it — so the frame a line was put in above the bubble, the
bubble stood a line's height lower, and came back up with the room: a jerk at every send and
every reply while the harness worked. And a reply's landing on a quarter-second ease, beside a
send on a half-second spring, reads as a lurch.

## Decision

The room settles to its foot on one spring, the words' own, for everything that lands there
(`apps/mobile/src/spaces/RoomSettle.tsx`). The list's own ease is off on a phone; it stays for
Reduce Motion and the web. The list keeps holding its place by measuring — that is still the
platform's job — and the room's scroll handler is where a move by nobody's hand shows: an
offset the list reports that no finger, no momentum and no scroll asked for from JavaScript
set. Near the foot, a move of a line or more is settled on the spring; a move of a few points
(the thinking bubble growing a line) is taken back in the same frame, so the lines above move
with the change as they always did. Far up the history the reader keeps their place.

The foot of the list — the thinking bubble, the cards — holds its place on the glass while the
room settles when a send's words are going above it, and when the change was the foot's own
(a card coming in stands where it will stand, and the room opens above it). It rides with the
room when a reply lands: the reply takes the bubble's place on the same side of the room, and
the bubble comes up again under it rather than showing through it.

The spring is stepped a frame at a time on the flight's clock. While a send's words are in the
air, the flight steps it from its own frame callback, after the words, so the two move as one
body; a loop in the list steps it the rest of the time, and only while there is something to
settle, so a room at rest asks for no frames.

## Consequences

- One motion for everything that lands at the foot: a send, a reply, the thinking bubble, a
  card. The send's words, the room and the reply all move on the same spring.
- The list's `maintainVisibleContentPosition` no longer carries `autoscrollToTopThreshold`
  on a phone; the room's own near-the-foot rule (`NEAR`, the same hundred points) decides.
- Every scroll asked for from JavaScript — a link's landing, the viewer's answers, a follow
  from far up — goes through `steer`, which marks the list on the UI thread first, so the move
  is not taken for a landing and settled back. A scroll asked for without it would be.
- The foot's hold and the reply's ride are decided on the UI thread from what the list can
  see there: whether a send's words are in the air, and whether the foot's own height changed
  by what the list moved. Nothing is sent from JavaScript for it, because a value set from
  JavaScript reaches the UI thread a frame after the mount that needs it.
- The list is held by the line above the newest (`minIndexForVisible: 1`; the list counts its
  header before that): the newest line's time moves to the bubble that joins it, and held by
  the newest the whole room dropped the time's height for a frame.
- The foot is drawn a line lower for one frame at a send over it, eight milliseconds on the
  phone: a style set on the UI thread reaches the view a commit later on Fabric, and
  Reanimated's same-frame path is a build flag (`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`) not taken
  up. Left as is.
- Not walked: Android, the keyboard up, a card coming in under a thinking bubble, and a reply
  over a bubble that stays — the bubble follows the latest run, and a reply ends it.
