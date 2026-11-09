# 0285. A room at work wears the pins

Date: 8 November 2026
Status: Accepted, 8 November 2026, on Arjun's pick of E in the mock "Busy ring options". Replaces
decisions 2 and 3 of ADR 0090, and the part of its first consequence about `busy` being drawn
behind the face stays true of the pins.

## Context

Arjun, 8 November 2026: "the loading spinner on iPad looks terrible, let's brainstorm a new design
... Design would go for all platforms". He meant the light that runs round a space's face while
there is work going in it (ADR 0090). Reading what drew it:

- The tail was three flat steps, at 100%, 55% and 25%, and the joins could be seen going round.
- On the phone the bright end was at the back of the arc, the faint end leading. The web had it
  the right way round.
- The band was 2 points wide against the face: 4 pixels on an iPad, 6 on an iPhone.
- The web animated a registered property through a conic gradient, so it repainted every frame.

A mock put five replacements beside today's ring at real size: a corner chip, a smooth sweep, a
ripple, a band of light across the face, and pins. He took the pins: "it matches what we already
have for agent icons". And then: "have them come out and go back in as well".

## Decision

1. **A room's face wears the agent's pins while there is work going in it.** The same pins, as
   thick and as long (`PINS`), in the face's own colour, resting dim, on metal in light (ADR 0192),
   with the agent's light going round them in the agent's time. They are the sign of work
   everywhere now: the mark, an agent, a room.
2. **Twelve, because a room has no bite to take any.** Three to each side of a square at its
   quarters, as the mark's are, or one to every thirty degrees of a circle. `workingPinsOf` is in
   the outline both clients keep, under the test that holds the two copies equal.
3. **The face draws in to nine tenths while it wears them**, the pins with it, so they stand about
   where the ring stood and a row's layout does not change.
4. **They come out and go back in.** When work starts the face draws in and the pins slide out from
   behind it one after another, clockwise, each going a little past and settling. When it ends they
   go back in the same way, last out first in, a little quicker, and the face grows back. A face
   drawn already working has them out with nothing played, so a list that remounts does not ripple.
5. **Only transform and opacity move.** On the phone a pin is a plain view, its light an opacity on
   `useTurns`' clock, its journey a translation on one clock per face (`pinTravel.ts`), all on the
   native driver. On the web the same journey is CSS transitions in the same numbers.
6. **With Reduce Motion on, the pins are out, dim and still**, and arrive and leave at once.
7. **The still ring stays what it was**, and a face wears one or the other, never both.

## Consequences

- A room's face no longer says working in blue, the status colour. The pins say it in the face's
  own colour, and the row's gear and words go on saying it in words, as ADR 0090 asked of any state.
- "The bite and the pins say agent" now reads as the bite and pins at rest: a room wears pins only
  while it works. A round face wearing them looks a little like a sun, which the mock showed.
- A busy phone face is about 24 small views, which is what two agents' faces cost, and on the web a
  face keeps its twelve pins in the page from its first work onward, so they have something to go
  back in with. A face that has never worked carries none.
- On the phone `busy` left out means the face can never wear pins, and is drawn with no wrapper.
  A list row passes it either way, so a change of state does not remount the face.
- A web face that starts working brings its pins out with `@starting-style`. A browser without it
  (WebKit before 17.5) shows them at once, and still takes them away with motion.
