# 0126. The thinking bubble wears lit dots, and the face beside it stays still

Date: 6 October 2026
Status: Accepted, 6 October 2026. Changes the phone's thinking bubble (ADR 0050 and its amendments,
`Thinking.tsx`), which has worn the working mark (`ChipPulse`) since 20 September 2026. Narrows ADR
0089 in one place: an agent's face beside its own thinking bubble keeps its pins lit and still.
Amended by [0147](0147-the-thinking-bubble-holds-still.md), 10 October 2026: points 3 to 6 are
replaced (a fixed bubble with a label, a detail and a strip; no sheen); the dots and the still
face stand.

## Context

On 6 October 2026 Arjun sent two rooms, Chinatown Walking Tour and Cholesterol, and asked for the
loading bubble to look cooler, with smaller text. In a room of two agents each of them had two
spinners going: the gold chip running its pins inside the bubble, and the agent's face beside it
running its own (ADR 0089, "light runs round them while working"). He asked for the yellow spinner
to go in favour of a cool version of the three dots, and for anything else that would help.

Three were mocked, phone width, live, two agents working (kept out of the repo): **A**, three dots
in the agent's colour with the light running across them; **B**, a shimmer through the words; **C**,
no bubble, a caption line. Then A with a vertical ⋮ and three treatments of the words. He picked A:
"Go with A. disable the agent icon spinner when spinner is going on in bubble".

## Decision

1. **Three dots, lit, in the colour of the agent's face** (`ui/Dots.tsx`, `lit`): the light runs
   across them as it runs round a chip's pins, each lit quickly and let go slowly, a little larger
   while lit, on one native clock (`useTurns`). In a room of two, whose thought is whose shows in
   the dots as it does in the face. Reduce Motion leaves them lit and still.
2. **The face beside the bubble is still.** Its pins stay out and lit, and no light runs round them
   while the bubble shows the work: one sign for one agent at work.
3. **Dots alone until the harness says something.** The word *Thinking* beside them said what they
   say; the bubble is the dots in a bubble of their own size, and a screen reader still hears "is
   thinking".
4. **Smaller words.** A thought is set at 15 points (`TEXT.md`), a size down from a message's 17,
   at the phone's leading, three lines at most as before.
5. **The call is drawn, not spelled** (core's `stepParts`): a terminal, a globe, a glass or a page
   where `shell ·`, `browser ·`, `web search ·` and the file tools were written out, and what it was
   given in a monospaced face, an address without its `https://www.` or its last slash. A tool of no
   kind (`memory recall`) keeps its words. The count is a quiet number beside it, not a number in a
   circle. A screen reader hears the step whole.
6. **The sheen stays**, fired when the words change.

## Consequences

- One spinner per agent: two in a room of two where there were four.
- The queued turn's bubble (`TaskBubble.tsx`, ADR 0090) follows, on his word the same day
  ("switch the queued-turn bubble to the dots too"): lit dots in the face's colour while it works,
  the thought at 15 points, its calls drawn with the same pill (`CallPill`), the call in hand lit
  on the wire in the face's colour rather than gold, and no dots at all on the receipt it ends as.
  The working mark (`ChipPulse`) is left to the connection banner.
- The Mac and the web follow, on his word the same day ("do the Mac thinking bubble too"): what a
  harness is doing was a status line there (a status pill, the call in mono, a number in a
  circle), and is now a bubble under the harness's face as on the phone — its face still, lit dots
  in its colour, the thought a size down from a message's (12.5 px), the call drawn by its kind
  (`Doing.tsx`) and a quiet count, the dots alone until it has said anything. A queued turn's
  bubble there does as the phone's does. The globe and the terminal join the design system's icons,
  which the phone's drift test now checks too.
- JavaScript only on the phone: a phone build, no server change.
