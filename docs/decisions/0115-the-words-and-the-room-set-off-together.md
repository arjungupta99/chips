# 0115. The words and the room set off together

Date: 4 October 2026
Status: Accepted. Amends 0071 and 0072; builds on 0074 and 0075.

## Context

Arjun, on the send in a room on his iPhone: "The text turns into bubble, and animates to the chat
scrolling list. I am noticing it does not look completely smooth, still noticing some minor
jerkiness. Make it completely smooth and polished."

The send was measured on the simulator before anything changed. A probe in the flight's frame
callback sent every frame's time, the flight's clock and the words' place to a listener on the Mac.
The runs were filmed with `simctl io recordVideo` and traced frame by frame down columns of the
screen. The room was a scratch copy of the live database with a scripted harness that answers like
Jacobian: its run starts 0.35 s after a message, and its words come 2.5 s after, or 0.3 s after
for "quick". Four faults were found, none of them on the phone's frame budget.

1. **The flight's clock leapt whenever the room drew again.** `useFrameCallback` registers its
   callback afresh whenever it is handed a new function. The flight's was an inline worklet, and
   the room draws the flight again on every event the store hears while the words are in the air:
   the server's answer, the line's time, a harness starting its run. The first frame of a callback
   registered again carries no `timeSincePreviousFrame`, so the step fell back to its most, 20 ms.
   That happened four or five times a send. At 60 Hz it is 3 ms too many; at 120 Hz it is a leap of
   2.4 frames' worth in one frame, and how many came depended on what the harness did meanwhile.
   That fits "not every message".
2. **The words set off after the room.** They waited for `onLayout` to tell them their own size, and
   the bubble's watch waited for its `onLayout` before it measured. Both are round trips through
   JavaScript, which is busy drawing the room just after a send. The words stood still for 180 ms
   while the room started rising at 90 ms without them.
3. **A tick at the end.** The words were put on the bubble from up to 1.5 points away, then
   dissolved into it over 120 ms. The bubble was shown by a render on the JavaScript thread, so on a
   busy phone the copy could fade before the bubble under it had been drawn.
4. **The room dipped before it rose.** Sending empties the composer: a field of three lines closes to
   one, and a photo's strip of staged chips goes. The room's foot follows the composer's height down
   a frame or two before the store has the line. The room dropped 6 points under a three-line
   message and 26 under a photo, then rose for the line.

## Decision

- **The flight keeps its own time from the frames' timestamps.** The frame callback is made once
  per flight, so a render never registers it again. It moves the clock by what each frame took
  (`info.timestamp` less the last one it saw), never by more than `STEADY_MS`. A stall is still a
  pause and never a jump.
- **Sizes and places are measured on the UI thread from the frame a view is in the tree**
  (`ui/measured.ts`). An animated ref reaches the UI thread as React commits it, and the layout is
  known by then. The copy's size, the route copy's size and the bubble's watch (`BubbleWatch`) no
  longer wait for `onLayout`.
- **The words wait for the room, then go with it.** They stay where they were typed, with the
  bubble's colour coming up under them, until the room draws their line. The room starts rising in
  that frame, and the words set off in it too, on the room's spring. Room and words move as one
  body from one start. If the room has not drawn the line within 250 ms, they go for the field's
  reckoning and turn when the room says.
- **The landing is exact, then a swap.** The words arrive within half a point and still. They are put
  on the bubble, and the room shows the bubble and removes the copy, in that order. The hold is let
  go through the landing store, which React draws at once. The flight goes through state, which is
  drawn with that or after it. For no frame is neither there, and nothing fades, so nothing is seen
  to change. Lines held back while the words fly (0072) land when the flight goes.
- **The room's foot does not drop with the composer until the line is in** (`useSendFoot`). It
  takes the composer's new height in the render that draws the line. The room then moves once: up
  by what the line takes, less what the composer gave up. Anything that makes the composer taller
  is taken at once.

## Consequences

- Filmed on the simulator, with keys down and with keys up: the flight's clock steps exactly one
  frame per frame through every redraw. The words set off in the frame the room does, about 105 ms
  after the tap, while their colour finishes coming up. The swap leaves no pixel changed. A
  three-line message and a photo make the room rise once, with no dip. A reply 0.3 s after the send
  still waits for the words and then lands on the room's spring.
- The beat before the words move is the room drawing the new line: about 85 ms of JavaScript from
  the store hearing it to the row's mount on the simulator. A faster room render would start the
  whole send sooner. It is not done here.
- What is left of the send is the room's own motion afterwards. When the harness's run starts within
  a few hundred milliseconds, its thinking bubble rises in about 0.2 s after the words land, and the
  room moves a second time (0.8 s after the run begins, as before). A photo's copy can still show
  nothing for a frame as the chip goes, because its image view draws a frame late.
- On the phone, what each frame costs is unchanged: one Fabric commit for the flight's animated
  styles. Only an Animation Hitches trace from the phone, with Arjun driving, can say whether
  anything is still dropped at 120 Hz.

## Amendment, 4 October 2026: a photo's copy draws its picture from the first frame

The photo's copy drew the room's thumbnail from its file (expo-image, warmed under the chip).
Filmed, the chip went at the tap and the copy showed nothing for a frame or two before its picture
came, however warm the file was. The copy now draws the thumbnail already decoded. The staging
hook decodes it as it arrives (`Image.loadAsync`, at most 1,024 points wide) and keeps it with the
staged photo, not in a view, because the chip that showed it is gone the moment the copy needs it.
Filmed after: a picture on the screen in every frame, the chip's until the tap and then the copy's.

A native image cannot be handed to a worklet. The flight's frame callback used to capture the list
of pictures, which now carries one, and Worklets refused it ("Cannot copy value of type `Image`"),
which crashed the app on the first photo sent. The frame's worklets now know only how many
pictures fly.

## Amendment, 17 October 2026: "within half a point" becomes half a pixel (PH-19)

"Within half a point" was meant to be less than a pixel, so the putting would not be seen. On a
phone's 3× screen it is a pixel and a half. Filmed, the words crept the last of the way across a
quarter of a pixel a frame, stood on one pixel for four frames, and then stepped two onto the
bubble. The words now land within half of one of the screen's own pixels (`0.5 / PixelRatio`), the
pictures and the route as well, so the copy is on the bubble's pixels before it goes. The spring
takes about a tenth of a second more to come that close, and the words move a pixel or so in that
time. The beat before the thinking bubble and the lines held back (0072) count from the landing, so
they come that much later too. Filmed after, for one word and for two paragraphs: nothing on the
screen changes in the frame the copy goes. A probe read the words 0.15 points off their bubble when
they were put on it, at 1.02 s for one word, where half a point would have put them there at 0.89 s.
The room's own rows still come to rest with a step of about half a pixel (core's `springAt` lets a
spring go within a fifth of a point), as they did before; at that size it is not seen.

## Amendment, 20 October 2026: where the bubble will stand includes the room's lift (PH-21)

A send from a little above the foot now takes the list down to it, on the room's spring, as the
words go (0130's addendum of this date). The bubble rises with the list, so the words go for where
the room says the bubble is, less what the lift has yet to move it, rather than for where it is at
each frame. They still land only once the bubble has stood still.
