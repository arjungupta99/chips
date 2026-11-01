# 0090. A room's face says it is working

Date: 1 October 2026
Status: Accepted. Extends "the ring is state" (blueprint, Look) past harness-named rooms, and
ends the reading-out of a harness's own task-bubble markup in a list row.

## Context

A turn that runs out of a harness's own queue has no run to draw on, so Jacobian sends one
message and edits it as the work goes: `💭 what it is thinking`, a `▸ tool · what it was given`
for each of the last calls, and a receipt at the end. It is the same text it sends to Telegram,
Slack and Discord. The room reads it and draws it as work (`taskWords.ts`, `TaskBubble.tsx`), but
a list row said the message instead — `💭 Working… ▸ browser · https://www.kayak.com/flights/…`,
another channel's markup standing in a Chips list (Arjun, 1 October 2026, with a screenshot of
his Spaces tab).

The row had no other way of saying it. A ring round a face is this app's sign for state, and it
was a still border on one kind of row only: a room called after its harness wore blue while its
run went, and a room with a title of its own — which is most of them — wore nothing at all. A
list of fifty rooms said nothing about which of them was busy.

Four motions were mocked at phone width on 1 October: a gear turning a tooth at a time, a gear
still inside an arc going round it, a gear turning under a gold glow, and the motion round the
room's own face with a quiet gear naming it in the line. He took the fourth.

## Decision

1. **A room is working when it has a run of its own going, or a queued turn still writing its
   message** (`spaceWorking`, core). The two do not overlap: a run draws the room's thinking
   bubble, and a queued turn has no run at all. A turn that has ended says so in its own message
   — a receipt, no thought — and the light goes out. Waiting is not working: a room that needs an
   answer says so in words with the amber dot beside them, as it did.
2. **The light runs round the room's face, in the working tone.** The still ring is what travels,
   so a face wears one ring or the other and never both. It is blue, because status is a colour
   *and* a word and gold is not one of status's colours (`vocabulary`): the brand stays out of
   state, on every screen that says it. Every face kind wears it — a circle round a person, a
   squircle round a harness, a rounded square round a channel — and an agent is left alone,
   because an agent says its own work in its pins (ADR 0089).
3. **It follows the face's own shape without a path for each.** The band is what a clip of the
   face's shape leaves of an arc turning behind an opaque face: the phone turns a fat arc inside
   that clip with a rotation and nothing else, which is what the native driver can carry under a
   scrolling list (`BusyRing.tsx`, `ChipPulse.tsx`, ADR 0061); the desktop turns a conic gradient
   masked to the band's padding, the angle animated as a registered property so the box itself
   never rotates (`avatar.css`). With Reduce Motion on, both are the same ring, lit and still.
4. **The row says a queued turn in the room's own register** (`lastWords`, core): what it is
   thinking and the call it has in hand — `Reading the news · web search · Starship Flight 14` —
   or the receipt once the turn is over. No thought-bubble emoji, no triangle, the runtime's own
   prefix read off the tool's id, as the bubble in the room already does. The headline stays in
   the room: a row has one line, and what the turn is doing now is the news in it. A message that
   merely opens with that emoji is not one of these and is said as it is, as before.
5. **A gear stands where the emoji was**, quiet. It is a new mark in the design system's set,
   `cog`, and the first drawn as a shape rather than a line: a gear's teeth are its outline, and
   the set's own `gear` is a wheel with eight spokes, which at thirteen pixels is a sun. That one
   is what Settings wears and is left as it is. Both clients draw the one path, with the drift
   test already between them (`icon.tsx`, `icons.ts`). The gear names the state in the line; the
   light round the face is what carries down a long list.

## Consequences

- Every list row on both clients now reads the last line through `readTaskBubble`. It is a
  strict read that gives up cheaply, so a harness that stops sending that shape costs nothing.
- A queued turn whose receipt never arrives — a harness that died mid-turn — leaves a row lit for
  as long as that message is the last one. The room's own bubble has always had this, and shows
  it the same way.
- `busy` is a prop on both Avatars and is drawn behind the face, so the face must be opaque.
  Every face either client draws is.
- The desktop's sweep wants `@property` for the animated angle (Safari 16.4, and every browser
  that has shipped since). Without it the ring is a still arc rather than a travelling one.
