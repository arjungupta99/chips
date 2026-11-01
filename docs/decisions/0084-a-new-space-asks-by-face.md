# 0084. A new space asks by face

Date: 28 September 2026
Status: Accepted. Amends the new-space proposal (`docs/proposals/new-space.md`, Phases 3 and 4)
and the OpenClaw test's finding 27 (the + picks several).

## Context

The + window on the phone listed who to ask as a row of chips that shared the card's width. With
five agents the names were cut to "A…", and "Can't answer now" (ADR 0083) broke one letter to a
line. A tap put an agent in beside the one already picked, instead of choosing it, so switching
from one agent to another made a group, and the last one picked could not be taken off. Arjun
called the selection janky and asked for the screen to be more beautiful and to scale as more
harnesses are added.

The desktop's dialog allowed one pick only, as radios that wrapped into a pile. Its Add harness
was a panel in the page: Escape and a click away did nothing, only a Cancel at its foot closed
it, and once the token showed, only a Done under the curl lines. He found it hard to dismiss.

## Decision

1. **Who is asked is a row of faces.** Each agent that takes new spaces is its own squircle face,
   the one it wears everywhere else, with its name under it. On the phone the faces are 52 points,
   five and a half to the card's width, and the row scrolls sideways past that, faded at whichever
   edge has more beyond it. On the desktop they wrap to the dialog's width, and past two rows the
   rest scroll. A picked face wears a gold ring and a check; the rest step back. The row is shown
   even for one agent, so the window always says who will make the room.
2. **The first tap chooses; the taps after it add and take away.** The window opens on one face.
   A first tap on any other face picks that face instead. Every tap after that toggles a face, and
   the last one can come out too. The rule is core's `newSpacePicks`, so the phone and the desktop
   pick the same way.
3. **It opens on whoever was asked last.** It opens on the agent asked for the last room made from
   the +, while that agent is still offered, and otherwise on the first by name. The phone keeps
   this beside the + it remembers across launches (`remembered.ts`). The desktop keeps it for the
   session.
4. **A line says what a send will do.** Under the faces: "Kit sets it up · Lux joins". The one asked
   makes the room and names it; the rest are put in it (finding 27). If the one asked can't answer
   now, the line says that in amber instead. The words are core's `newSpaceLine`. The line keeps
   one height, and so does the row, so nothing in the card moves as faces are picked.
5. **Nobody picked.** On the phone, the line says "Pick who to ask" and nothing sends. On the
   desktop, nobody picked is the room of people that "No one" used to make: the line says so, and
   the field asks for a name. A desktop with no harness that takes new spaces shows no faces.
6. **The desktop picks several, as the phone does.** A group is asked of the first face picked, and
   every face picked is put in it, in the phone's order and through the one outbox.
7. **Every desktop dialog of this kind leaves by any way out.** New space and Add harness are one
   `GrowingDialog`. It grows out of the control that opened it in a fifth of a second with no
   overshoot, and folds back into it. Escape, its ×, or a click outside all fold it away.
8. **Add harness happens in its dialog.** First the name and the autonomy dial. Then, in the same
   dialog: the token with a Copy button, the three curl lines with Copy all, and the checklist
   lighting as the first events arrive. Closing after the token is safe, because the harness's card
   issues another. It will not close while the harness is being made, so a token is never made
   without being shown.

## Consequences

- The phone's Choices row is no longer used by the + window. Other screens keep it.
- The phone's window is titled "New space", as the desktop's is; the + still says "Create new
  space" to a screen reader.
- A first tap on the face the window opened on takes it out, which leaves nobody picked. That is
  deliberate, but it is the one tap that does not choose.
- The desktop's last-asked memory does not survive a reload. The phone's does.

## Addendum, 11 October 2026: a name, not first words

ADR 0149: the window's field names the room ("Name the space") whoever is picked, and the send says
nothing in it. The harness makes its agent on the person's first message in the room, which waits
for it with "What would you like to do?" in its middle. The line under the faces says who joins and
that they wait ("Kit and Lux join · they wait for you"), not who sets the room up.
