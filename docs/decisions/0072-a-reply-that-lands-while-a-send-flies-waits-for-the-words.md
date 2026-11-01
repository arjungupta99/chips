# 0072. A reply that lands while a send flies waits for the words

Date: 25 September 2026
Status: Accepted

## Context

The slower spring and the photo's flight (ADR 0071) were built to Arjun's phone at 17:06 and
came back within the hour: "animation curve is much better. still some jerkiness visible when
sending message (does not happen on every message)". What could be some sends and not all?
The server's log for his sends that hour says what his harness does after each one: Jacobian's
`run.started` lands 0.2 to 0.5 s after the send, its status events at their own times, and the
reply anywhere from a third of a second to twenty seconds later — one of five replies that hour
landed 0.35 s after the send, inside the flight, which lands its words six to eight tenths of a
second after the tap.

That case was made on the simulator with the scripted harness answering 0.3 s after the send,
filmed at 60 Hz and read as strips of colour per frame. The room's rise, otherwise a clean
spring (steps of 10, 18, 20, 16, 18 pixels a frame), took a double step of 64 pixels followed by
a repeated frame exactly where the reply's row went in. A row's mount is the one thing on the
main thread a phone at 120 Hz cannot fit in a frame (ADR 0071); on the simulator it costs one
frame, and the film shows it.

The other things that happen mid-flight were looked at too. The server's confirmation of the
line is a re-render of one row and of the copy's time under its words, no mount. `run.started`
is a re-render, no mount. The thinking bubble comes a beat (800 ms) after `run.started`, which
in practice is after the flight, and holding its input would fold a standing bubble at every
send — the 23 September bug. A three-line send's composer collapsing to one line is absorbed by
the room's settle: its trace is smooth. So the mid-flight mount is the reply, and only when the
harness is quick.

## Decision

While a send's words or pictures are in the air, the room draws what it drew before and the
sender's own lines, and holds back anyone else's line that lands meanwhile. When the copies have
dissolved into their bubble the held lines land, as any line does: they rise in, and the room
settles for them. `heldBack` in `sendLanding.ts` says which lines; `useHeldArrivals` in
`SpaceView.tsx` applies it while the flight's state says something is flying.

## Consequences

- A reply inside the flight lands about 150 ms after the bubble shows — the copy's dissolve
  and a frame. Measured with beacons from the app to a local listener: the hold releases, the
  held rows render 2 ms later and are mounted 17 ms after that. The wait is at most the rest of
  the flight; a flight that never hears where its bubble is lands where it has got to after
  1.6 s, and the hold goes with it.
- A reply that came inside the flight reads as one that came after. The order of lines is the
  server's either way.
- Not held: the thinking bubble (see above), the asks at the foot, and the read mark, which may
  run up to a flight ahead of what is drawn.
- With Reduce Motion, on a wide screen and on the web nothing flies, so nothing is held.
- Not walked on the phone. The jerk he sees may have a cause the simulator does not show at
  120 Hz — the sent line's own mount is in every send — so the question back to him is whether
  it coincides with a reply arriving.
