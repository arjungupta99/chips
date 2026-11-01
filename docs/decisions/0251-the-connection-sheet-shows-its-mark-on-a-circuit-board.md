# 0251. The connection sheet shows its mark on a circuit board

Date: 30 October 2026
Status: Accepted, 30 October 2026, on Arjun's "Build C" and "proceed with implementation" after the
mock. Changes the sheet behind the connection's mark (`ui/Connection.tsx`); the mark in the bar,
its settle and its green beat (ADR 0131) are unchanged.

## Context

Arjun, 30 October 2026: "the loading screen that opens when we tap the loading chips button on the
top right needs polish, it needs to look cool. And the chips icon over there also looks pixelated.
Make mocks first".

The sheet showed the twenty-point `ChipPulse` from the bar, made four times bigger with a
`scale: 4` transform. The body is drawn by react-native-svg into a picture the size of its
layout, and iOS stretched that picture rather than drawing it again, so the body's edges came out
soft and stepped; the pins, plain views, stayed sharp. And when the connection came back while the
sheet was up, the sheet dropped at once, so the green the bar's mark wears for a beat was never
seen there.

The mock (<https://claude.ai/artifact/P7CGFJ5ZMrEQPtPHN9Tpf9>) showed today's sheet beside three
ways to polish it, each with the mark drawn at its size: A, today's layout with each pin glowing as
the light passes it; B, the mark on top with its own outline rippling out each lap; C, the mark on
a circuit board, a trace from every pin to a pad and a spark down each trace as its pin lights. He
picked C, and asked to see it fail and succeed before it was built.

## Decision

1. **The mark is drawn at the size it is shown.** `ChipPulse` takes a `size`, works its body and
   pins out for that square, and draws them there; twenty points, beside a line of words, stays
   the default. Nothing scales a mark up any more.
2. **The sheet opens on the board, the words centred under it.** `Circuit` draws the mark at 108
   points in the middle of a 360 by 264 board: from each pin a trace runs out, bends once or twice
   at forty-five degrees, and ends in a pad, over a faint dotted ground. The traces start where the
   pins end, worked out from the outline (`traces.ts`); where each one bends was drawn by hand in
   the mock. The board stands at the top of the sheet's scroll at one height whatever the words
   under it say, so it never moves as the state changes, and big text pushes it up rather than
   squashing the words. The title, centred, takes over from the sheet title; the words, the facts
   and the button are what they were.
3. **The board says what the sheet says, at once.** Connecting: a spark leaves each pin as the pin
   lights, runs down its trace with two fainter ones trailing it, and its pad flashes as it lands.
   Not connected, for any reason: the board goes dim under a red mark, which shakes once if it turns
   red while the sheet is open (not when the sheet opens red). Connected: every trace fills with
   green from its pin out, the pads light, and every pin is lit. The bar's mark still waits out a
   blink before it changes; the sheet, which somebody opened to look at, does not.
4. **The sheet holds the green before it goes.** When the connection comes back while the sheet is
   up, it says Connected, green, for `BACK_MS` (the bar mark's own beat), and then goes down. A
   connection lost again inside the beat keeps it up.
5. **What moves all the time moves on the native driver.** The sparks and pads are plain views read
   off the pins' own clock: `useRound` is the clock `useTurns` already ran, now its own hook, and
   the board starts it in the same commit as the pins'. Each spark's way down its trace is an
   interpolation of that clock, worked out in `traces.ts`; the last pins light late in the round,
   so their sparks land in the next one, and a track may run over the clock's end and finish at its
   start (`loopTrack`). The green fill is a stroke's dash, which the native driver cannot move: it
   runs once, for half a second, on the JavaScript driver, when nothing else on the board moves.
6. **Reduce Motion stills it**: no sparks, no shake, the mark resting as it does everywhere, and
   the green simply there.

## Consequences

- The spark is gold on a dark sheet and the gold sunk a step (OKLCH lightness − 0.1) on a light
  one, where the gold itself is nearly as light as the paper. It is worked out from the gold, not a
  new token.
- Thirty small views and ten pads move while the sheet is open and connecting, and nothing while it
  is not; a spark's glow is iOS's shadow, so elsewhere a spark is simply bright.
- The board is 360 points wide, so it fits the narrowest iPhone iOS 26 runs on (375) with room to
  spare; on a wider sheet it stands centred.
- The phone's `asleep` spec now keeps the sheet up while the server comes back and checks it says
  Connected, green, and goes.

## Amended 31 October 2026 — four fifths

Arjun, on the phone: "make this chips + spikes graphic, 20% smaller". The board is shown at four
fifths of the mock's size: 288 by 211 points, the mark at 86. Its geometry is still worked out in
the mock's units (`BOARD` in `traces.ts`), and `Circuit` shows it smaller (`SHOWN`): the traces,
pads and ground through the drawing's `viewBox`, the mark drawn at its size, the sparks and pads'
flashes placed in points. Nothing is drawn large and shrunk, which would blur it as the four-times
mark did. The shake still swings five points: it is a movement, not a part of the drawing.

Under it, the sheet no longer bounces when its words fit: see ADR 0175's amendment of the same day.

## Amended 31 October 2026 — a change of look moves nothing on the JavaScript thread

Arjun, on the phone: "we need more top margin. when the animation switches from yellow to green /
red, there are some significant frame drops". The board stands 24 points down the sheet, so its
top pads sit clear below the X rather than level with it.

The change of look came at the worst moment for the JavaScript thread, which has just heard that
the connection dropped or came back, and the board did most of its work there: the green was a
stroke's dash moved from JavaScript, twenty SVG elements redrawn every frame for half a second,
and the sparks' forty views were mounted and taken away again with each change. Now:

- The green is a still drawing of the traces and pads in green, uncovered by a circle that grows
  from under the mark (`Reveal`): a clip scaled up on the native driver, what it holds scaled down
  by as much again, so the drawing never moves or blurs and only the clip's edge does. It spreads
  out from the mark rather than along each trace.
- The sparks stay mounted while the sheet is up and fade out over a fifth of a second, running
  until they are gone, so one half way down its trace goes out where it is.
- Not connected, the board dims as an opacity on the native driver, rather than an SVG drawn again.
- Green, every pin is lit, as was always meant. A pin's light was the circuit's while it ran and a
  plain number when it stopped, and on iOS a view handed a number in place of a value the native
  driver was moving kept the last one it had been given: only the pin the circuit stopped on was
  lit, on the board and in the bar alike. Now each pin's light is always one sum, the circuit's
  light times a value that says whether it runs, plus where it rests (`ChipPulse`), and a change
  sets those values rather than handing the view anything else.

Measured on a Release build in the simulator (the same app, its JavaScript swapped), filming each
change and timing the frames: going green, a 53 ms stall at the end of the fill before, none after.
Going red, one frame is missed as the look changes, before and after alike, and it is not the
board's: it stays with the Try again button kept mounted too. The simulator is faster than a phone,
so the phone's numbers are worse in both, and only the phone can say how much better it is.

## Amended 31 October 2026 — the sheet stays up once through

Arjun, on the phone: "We do not need to auto dismiss the loading bottom sheet when we connect, if
it was open". Decision 4 is withdrawn: when the connection comes back while the sheet is up, it
says Connected, every trace green, and stays until it is closed, whether or not the connection
had failed first. A connection lost again while it is up turns it back, as before.

The bar's mark stays with it, green, for as long as the sheet is up, and has its beat once the
sheet is closed. A mark that went while its sheet was up would take the sheet with it in a bar that
gives the mark a slot only while it has something to say: the room's, Universe's and Select's
(`useMarking`). So the mark tells the bar when its sheet is up (`onHeld`, handed over as
`markedBy`), and the bar keeps the slot till then.
