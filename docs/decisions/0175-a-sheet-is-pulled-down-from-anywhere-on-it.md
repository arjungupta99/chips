# 0175. A sheet is pulled down from anywhere on it

Date: 15 October 2026
Status: Accepted, 15 October 2026, on Arjun's ask. Takes the place of the handle as the only place
a sheet is pulled from (`ui/Sheet.tsx`, 10 September 2026); ADR 0169's ring and tick now follow a
pull from anywhere.

## Context

Arjun, 15 October 2026: "next, can we have ability to drag down from anywhere on the sheet? right
now it is only possible from the top edge of the sheet".

Every sheet on the phone is `ui/Sheet.tsx`. Its pull was a `PanResponder` on the handle strip
alone, for two reasons written down at the time: a press on a row that wanders a little should
still be a press, and inside React Native's `Modal` a responder asked only once a touch has moved
was never granted on the simulator, where one that takes the touch as it lands always was. A
responder that takes every touch as it lands cannot be put on the whole panel without taking
every press with it.

Nine of the twenty sheets hold a list that scrolls (the room sheet's pages, the icon sheet's grid,
the route sheet, Decisions' agents, the model sheet, the room picker, the connection sheet, the
message menu, Handoff details). On a list, a pull down and a scroll up are the same finger.
iOS's own sheets settle it this way: the list scrolls until it stands at its top, and from there
a pull down on it takes the sheet.

## Decision

1. **The pull is a gesture on the whole panel**, React Native Gesture Handler's pan, which works
   inside a modal because it is the system's own recognisers rather than the JavaScript
   responder. `Sheet` gives its modal the root a gesture needs, so the room sheet's own root for
   its sliding rows goes.
2. **A finger is a pull once it has come down ten points**, the distance iOS's own pan waits for,
   and is let go of once it has gone up or across ten points first, so a list scrolls, a row's
   swipe slides and a list across turns. The gesture decides this itself, on the system's
   recognisers (its offsets), not in JavaScript. Until a finger is a pull, a row under it is
   pressed as ever; once it is, the press is called off. Let go past a third of the sheet's
   height, or flicked faster than 800 points a second, it goes; let go sooner, it springs back.
   The values it moves are the ones the handle moved, so the X's ring, fill and tick (ADR 0169)
   follow a pull from anywhere.
3. **A list on a sheet is a `SheetScroll`**, a scroll view tied to the sheet's pull by one rule
   that it changes as it crosses its top. At its top, its scrolling waits for the pull to let the
   finger go, so a move down is the sheet's and a move up is the list's the moment the pull lets
   go. Off its top, the pull waits for the list, so a move either way scrolls the list. Outside a
   sheet a `SheetScroll` is a plain scroll view. A list across (the icon sheet's grounds) stays a
   plain one.
4. **The handle stays**, as the mark that says the sheet can be pulled; it no longer takes a
   touch of its own.

## Consequences

- A sheet is pulled from its title, its rows, the room around them, and its lists once they stand
  at their tops. On the simulator (15 October 2026): pulled from the icon sheet's colours and
  from its grid at the top, the room sheet's You row, and the message menu's rows, it followed the
  finger with the X's ring drawing, sprang back short of the line, and went past it or on a
  flick; the grid scrolled up, scrolled back down from off its top without moving the sheet, and
  the grounds strip turned; a tap on a group still jumped the grid, and a pull that began on
  Delete for me deleted nothing.
- A list scrolled off its top and pulled down scrolls back and stops at its top; iOS's own sheets
  hand that finger to the sheet when the list reaches its top, and this one waits for the next.
- A list on a sheet must be a `SheetScroll`, or the pull and the list race for a move down.
- The message menu's text reader, where it shows a reply's source as a read-only field (a text
  view that scrolls itself), keeps the finger: a pull on it scrolls the words.
- Reanimated's Babel plugin makes a worklet of every function a gesture is handed, written in the
  chain or named, and a worklet keeps its own copy of each variable it reads: a finger's start
  set in one callback was never seen by the next. The callbacks share only functions and objects.
- The release is tested through the gesture handler's test events; that a finger is recognised at
  all, and the rule with a list, are the simulator's and the phone's to show.

## Addendum, 18 October 2026: a pull its caller keeps up comes back to rest

Let go past the line, the pull asks `onClose`, and whether the sheet goes is the caller's. Some keep
it up: a hand-off's details go back from Read full reply to themselves, and a sheet doing something
it may not be stopped in (adding an agent, forking one, joining, a confirmation under way) makes
`onClose` do nothing until it is done. The release returned once it had asked, expecting the sheet
to leave, so a sheet kept up stayed where the finger had left it, its lower rows below the screen
(AN-33, seen on the emulator).

- The release now counts that it asked, and once React has applied the caller's answer, a sheet
  still open comes back to rest on the spring a short pull springs back on, its X's ring undrawn.
  A sheet that closed leaves from where the finger let go, as before.
- So `onClose` closes by turning `open` off in the same update. Every caller does: each sets its
  own state. One that closed later, after an await or a navigation, would see the sheet come back
  first and then leave.
- Tested by spying on the spring the finger's value is sent home on (Jest draws no motion), kept
  open and closed. Walked on the emulator: Read full reply pulled past a third went back to the
  details, which stood at rest with Copy reply on screen.

## Addendum, 24 October 2026: let go, it leaves at the finger's speed and at once

Arjun, on the room sheet: "when we dismiss the bottom sheet, it needs to account for the swipe
speed. right now it abruptly dismisses". Recorded on the simulator, the same flick on the room
sheet: the panel followed the finger at about 2,200 points a second, stood still for about 65
milliseconds after it let go, then set off from a standstill on the eased exit and reached 4,600
points a second at the bottom. It stood still because the exit started from the effect that saw
`open` turn off, after React had drawn the caller's answer (here the room screen; 50 to 120 ms in
the recordings). It set off from nothing because the exit is an ease-in, and it travelled the
panel's whole height again from where the finger had left it.

- A pull that closes the sheet starts the exit as the finger lets go, in the gesture's own
  callback, before it asks `onClose`. `go`, when `open` turns off, takes up the exit already under
  way, and the modal goes when that ends. A sheet its caller keeps up after all comes back up on
  the spring from wherever the exit had got to, as AN-33's addendum says.
- A pull closes the sheet when the X would: not while it may not be put away (`closable` off), nor
  where the drag means something else than the X (a reader going back a page: `onCloseButton`
  set to another function). Those ask and wait, as before, and never set off.
- The exit goes from where the finger let go to just out of sight, starting at the finger's speed
  and gathering speed at 12,000 points a second each second (`fall`): from a standstill the room
  sheet's 350 points left take about a quarter of a second, a flick at 1,500 about 150 ms, at
  3,000 about 100 ms. The pull winds down to nought as the exit's own travel takes it up, both
  timed on the one curve, so the panel moves as one thing and the scrim fades with it. Reduce
  Motion keeps its fade.
- Speed decides more of it. A flick back up, faster than `FLICK`, keeps the sheet even past the
  line, as iOS's own sheets do. Let go short of the line, the spring home starts at the finger's
  speed. Opened again before a pull's exit has ended, the pull comes home with the panel; it used
  to stay where the finger had left it.
- Measured from recordings on the simulator (the panel's top edge, frame by frame): after the
  change the panel went on from 2,200 points a second to 3,000 and out of sight, with no frame
  standing still; a slow drag let go at about 150 drifted out and was gone 145 ms later.
- Tested in Jest through the gesture's test events and spies on `Animated`: the exit's curve
  starts at the finger's speed and a faster flick leaves sooner, it starts before the caller has
  answered, a busy sheet and a reader never start it, and a kept-up sheet springs back up.

## Amended 31 October 2026 — a short list stands still

Arjun, on the connection's sheet: "I am able to scroll down (then it spring backs up) the page
even when there is no lower content ... only have it scroll if content is going below the screen
limits". iOS lets a list down the screen bounce whatever its length, so on a sheet taller than its
words a push up moved them over nothing and they sprang back. `SheetScroll` now turns that off
(`alwaysBounceVertical` false): a list on a sheet scrolls only when there is more of it than the
sheet shows, and one that runs past the sheet still bounces at its ends. A pull down at the top
still takes the sheet, as above. A caller can ask for the bounce back; none does.
