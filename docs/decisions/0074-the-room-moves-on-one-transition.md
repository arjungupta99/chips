# 0074. The room moves on one transition

Date: 25 September 2026
Status: Accepted. Supersedes 0070 and 0073. Amended by 0075, by the addendum of 5 October 2026
(the answer to your message is followed down), and by 0130 (a long reply opens at its start, and
the room keeps a reader's place itself, which replaces that addendum's mechanism). The web and the
Mac move their rooms on the same model since 0242, whose numbers are core's (`roomMotion.ts`).

## Context

Arjun, on the build with the time tuck (ADR 0073): "transitions are still [broken]. two
consecutive replies, the previous message bubble changes shape abruptly. consecutive replies
come in abruptly. This is very visible where there is a loading bubble." And: why is it taking so
many iterations; step back, find out whether it is over-complicated, a performance problem, or
something underneath; the architecture must be impeccable.

Filmed on the simulator (build of 1da1f89e, a scripted harness posting three replies while its
thinking bubble stood):

- The frame a reply was drawn, the thinking bubble dropped a reply's height, under the composer,
  and the new reply stood faded where it had been. The room then held still for about 65 ms
  before it began to rise and bring the bubble back.
- The bubble above gave its time up in about 35 ms and had closed in about 60: animated, and read
  as a snap.
- When the run ended with an answer, the thinking bubble went and the whole room dropped about
  13 points in one frame, the largest single-frame change in the film.

None of that was a slow phone. Each was a seam between mechanisms, and there were four, each
hiding one kind of snap after the layout had already made it:

1. The list held a line still while something was put in under it
   (`maintainVisibleContentPosition`), and a spring on the list's offset took the room back
   down to the new foot (`RoomSettle`, ADR 0070). It told a landing from a scroll by watching the
   offset: moves under 20 points were taken back in the same frame (the 13-point drop), moves
   over 100 points from the foot were left, and whether the foot rode or held was guessed from
   how its height had changed. Its loop was woken through the JavaScript thread, which is busy in
   exactly the frame something lands (the 65 ms).
2. The foot was held against that spring by a transform, a frame late because a UI-thread style
   reaches the view at the next commit (`HeldFoot`). A reply was made to ride instead, so it
   pushed the thinking bubble down.
3. A bubble giving its time up was measured twice and its old self drawn under it, closing on
   its own spring (ADR 0073).
4. The thinking bubble's growth and its fold on the way out were heights sprung from JavaScript:
   a layout on every frame, against ADR 0061's first rule.

Three animation systems (React Native's native driver, its JavaScript driver, Reanimated), four
springs and a timing curve, starting in different frames. Every iteration fixed one seam and the
next case found another. The underlying reason: the room was laid out anew at every change and
then disguised, rather than animated from where it was drawn to where it is.

That is what a layout transition is, and Reanimated has one: a view whose frame changes in a
mount is taken from its old frame to its new one on the UI thread, each frame set in the mounting
layer — no React render, no Yoga, no commit — started from the mount, so the JavaScript thread
cannot start it late. It had not been tried in this app.

## Decision

The room moves on one transition (`apps/mobile/src/spaces/RoomMotion.tsx`):

- The list is Reanimated's `FlatList` with the room's transition on every row
  (`itemLayoutAnimation`), and every bubble moves on the same transition (`Moving`,
  `MovingBubble`). Whatever changes at the foot is laid out once; every row and bubble whose
  frame changed goes from where it was to where it is, together, on the room's spring
  (`ROOM_SPRING`, 130/19, the one the words of a send rise on).
- A row that has just landed rises in from below with the rows above it, from as far down as
  they move up — its height and the gap over it — fading up as it comes (`Rising`). The rows
  move as one body and nothing passes through anything.
- What goes fades where it stood, on the UI thread, while the room closes over it: the time a
  bubble gives up (`Leaving`, inside the bubble, which clips it as it closes), the thinking
  bubble when the run ends (`Coming`). It is out of the React tree at once; there is no leaving
  state to wait on.
- The foot — the thinking bubble and the asks — is the list's first row, always there and empty
  when there is nothing, rather than the list's header. A header is laid out outside the rows
  and stood still while they moved; a row put in under the lines renumbered every row above it
  and drew each again in the frame the thinking bubble came. It stands over the rows
  (`CellRendererComponentStyle`), so a reply rising under it comes out from behind it. It does
  not move when a reply lands above it.
- At the foot nothing holds the list's place, so a landing moves rows, not the offset. Past
  `NEAR` (100 points) up the history the list holds the reader's place and the transition goes at
  once; back inside `BACK` (60) the room moves again (`ColourList`). With Reduce Motion, and on
  the web, the list keeps its place the platform's way, as before.
- The spring keeps a clock of its own, which a frame moves by 20 ms at most
  (`withSteadySpring`, moved from the media viewer to `ui/steadySpring.ts`, so the viewer's
  flight and the room share it). On the wall clock the spring ran on through what the mount that
  set it going cost — 50 ms on the simulator for the thinking bubble's first frame — and the
  frame after a stall carries the timestamp of the vsync it missed, so the room's first steps on
  the glass were 3 and then 17 pixels where the spring's own are 3 and 8. A stall now costs a
  pause, never a jump: the rule the viewer and the send's flight already kept.
- A bubble's corners round or sharpen as it joins a turn or leaves one on a CSS transition of
  their radii, over 320 ms.
- The send's words no longer step the room: the rows rise on the same spring from the frame the
  line is drawn, and the bubble the words go for is measured where it will stand, since a
  transition does not move a view's layout.

Gone: `RoomSettle.tsx` and everything that fed it (the offset heuristics, the woken loop, the
held foot, thirteen shared values on the room's field), the tuck's two measures, skirt and time copy
(`Motion.tsx` keeps the flash alone), `Arrive`, the thinking bubble's leaving state, fold and
JavaScript growth, and the growth `TaskBubble` shared with it.

## Consequences

- Filmed on the simulator (the same harness, five replies 350 ms apart): the thinking bubble's
  arrival moves the room 3, 8, 10, 12, 13, 13, 13, 12 … 4, 3 pixels a frame at 3×, and a
  detector for a frame that changes more than twice as much as the frames either side of it
  finds none in the film. In the film of the build before, it found the run's end. The thinking bubble
  stays put while replies land above it. Five replies 350 ms apart each land while the last is
  still gliding, with no jump. A run ending with an answer fades the bubble where it stood while
  the answer rises through it. A send's words fly to their bubble as before, over the thinking
  bubble, with the room rising under them. Scrolled up the history, two replies and the
  thinking bubble landed below and the glass did not move by a pixel.
- 964 lines in and 1,769 out across the app and its tests.
- A move that lands while another is going starts from where the rows are, from rest: it keeps
  their place, not their speed. On film it reads as the glide slowing and picking up again.
  (ADR 0075 keeps the speed too, and it was not only a look: grouped bubbles ran into each other.
  It also found the transition up the history never drawn at all.)
- A bubble of yours keeps the colour field of where it will stand while it glides there: the
  field is placed by a measure of the layout, which the transition does not move. Over a glide
  of a line or two, the difference is a few per cent of the field.
- The stall a landing's mount costs is still there (about 50 ms on the simulator for the
  thinking bubble's first frame, 33–42 ms for a send's). It is a pause now, and worth its own
  look.
- Scrolling still costs one Reanimated commit a frame for the colour field's samples. Reanimated
  can set transforms and opacity straight onto the views without a commit
  (`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`, a build-time flag); not taken up here, since it needs a
  native build and changes every Reanimated style in the app.
- Not walked on the phone.

## Addendum, 5 October 2026: the answer to your message is followed down

Arjun, in Beginner Espresso Machines on his iPhone: "It does not scroll to the latest message …
when the reply came, it scrolled to the message before the message I sent."

Walked on the simulator against a copy of his data, with a scripted agent answering as Jacobian
had (a run, "Writing…", a preview, then 1,529 characters 9 s after the send): left alone, the room
lands on the end of the reply; so it does after a tap puts the keyboard away, and after a send
made from up the history. What breaks it is the hand. Dragging the room down to put the keyboard
away while the agent works is a scroll up an inverted list's history by the length of the drag
(about 440 points in the film; a 170-point nudge does it too), which is past `NEAR`. The room took
the reader to be reading, held its place, and the reply landed out of sight below, with the reply
before his on the glass and nothing to say the answer had come.

The room already followed its person's own message wherever they were (Arjun, 12 September 2026,
as `SpaceView.tsx` puts it: the room follows you where you put something, and follows nobody
else). It now follows the answer to it
too: after a message is sent, the first line said in the room that is neither theirs nor the
system's takes the room to the foot, on the same animated scroll a send from up the history makes
(`useFollowOwn`, in `SpaceView.tsx`), from however far up. Once only: a reader who then goes up to
read the answer from its start is left there by the next line. At the foot nothing changes: the
room rises with the answer on the transition, as before. Anybody else's line, and a line after a
command, still leaves a reader up the history where they are.

Filmed on the simulator after the change: the same drag, and nine seconds later the room scrolls
down in one move to the end of the new reply; the nudge with the keyboard up lands there too. The
room is not taken to the start of a reply taller than the glass, at the foot or after the follow:
that would be a change to where every long answer lands, and is his call.

The mechanism above was replaced the next day by 0130: the room follows your message and its
answer from the UI thread, on its own spring, and keeps a reader's place itself rather than
through `maintainVisibleContentPosition`.
