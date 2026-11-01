# 0089. An agent has a face of its own

Date: 1 October 2026
Status: Accepted. Extends 0087 (agents) and 0064 (the Folded marks). Amends "squircles are
harnesses" from the blueprint's Look: a squircle is a harness, and an agent has an outline of its own.
Amended the same day: the pins are always out (point 3, and the amendment below). The outline's
numbers and its ten pins were redrawn by 0096, which makes the logo and the outline one drawing.

## Context

A space can wear a mark from Chips' library on a chosen ground (ADR 0064), picked by pressing and
holding its row. An agent could not. Since ADR 0087 an agent is a participant in its own right,
with a row on the Agents tab, a card, and a place beside every line it says. It was drawn as its
harness is, a squircle with its initials on the hue its name lands on. On Arjun's workspace four
agents are called OpenClaw, so four rows read "O" on the same terracotta.

He asked for icons for agents, changed the way a space's is, in a shape that could be the Chips
logo's, and smaller than a space's. Four outlines were mocked on 1 October: the logo with its pins
always out, the logo's body alone, a ridged crisp, and today's squircle wearing a mark. He took
the recommendation: the body alone, 44 points in the list, and one face for everybody. Once it
was live he moved to the logo with its pins always out (the amendment below).

## Decision

1. **An agent's outline is the Chips mark:** a rounded square with one bite out of its top right
   corner, and the mark's ten pins round it. A circle is a person, a squircle a harness, a square
   a channel, and the bite and the pins say agent; at 20 points beside a line of words, where
   there is no room for pins, the bite says it alone. The mark's own bite meets its
   edges at two sharp points; on a face they are eased. The numbers are fractions of the face's
   side and are kept twice, for the phone and the design system, with a test that fails when they
   differ (`outline.ts`, `outline.vitest.ts`).
2. **It wears a mark from the library on one of the grounds, or its initials.** The same 189 marks
   and 27 grounds a space's face has, drawn as the same folded paper on the same lit ground, a
   little smaller and a little away from the bite. With none chosen it wears its initials on the
   hue its name lands on, in the same outline. A ground alone is a choice, as it is for a space.
3. **Its state is in its outline, and nothing is drawn round it.** Its ten pins are always out,
   lit and still. While it works a light runs round them, the circuit the working mark already
   runs beside a task. A face under 32 points has no room for pins and wears a green dot in the
   bite while it works. An amber dot in the bite says it can't answer (ADR 0083), in place of the
   mark on a harness's corner. Waiting on a person is said in words, on its row and its card, and
   not on its face.
4. **The face is the agent's, one for everybody.** A space's face is each person's own
   (`/v1/me/space-icons`), which suits a room: nobody else is looking at your list. An agent
   speaks in rooms other people are in, and its face stands beside its words there, so two people
   seeing two faces would be two people unsure they mean the same agent. The face is the log's:
   `agent.updated` carries `face`, `{icon, ground}` or `null` when it is taken back, the agent's
   row keeps it (migration 0034), a rebuild puts it back, and `GET /v1/participants` says it.
   Every connection is sent the event, and the apps read the directory again, as they do for a
   rename.
5. **Anybody but a guest may change it**, with `PUT` and `DELETE /v1/agents/:id/face`. A face
   changes nothing the agent does and takes it out of no room, so it is not kept to its harness's
   owner as a move is. A harness does not set one. The same face again records nothing.
6. **It is changed where a space's is, and on its card.** Pressing and holding an agent's row on
   the Agents tab opens the sheet a space's face is chosen on, with the agent as the row at its
   head and the chosen mark's cell drawn in the agent's outline. A long press is easy never to
   find, so a tap on the face on the agent's card opens the same sheet. A tap applies, and *Use
   the default* gives the initials back. The app changes the face at once and tells the server
   after; a refusal puts the old face back and says why. The desktop shows the faces and has no
   sheet, as it has none for a space's.
7. **An agent's row is a room's.** 56 points on the Agents tab, pins and all, in a row 80 points
   tall, as a room's on Spaces, so the two lists read alike; its card wears it at 56 too. Where a
   face wears its pins they stand inside its box: the body stands back from the edges by as far
   as they stand out (a body of 46⅔ at 56), so an agent is the size any other face is in the same
   place. It was built at 44
   in 68, smaller than a room's because a room is where you go and an agent is who is in it, and
   Arjun asked for the two lists to match the same day.
8. **A lane's ends wear the agent's own face, and the room's when it has none.** A route row drew
   the face the reader chose for the room at each end (ADR 0064). It draws the agent's face now,
   and falls back to that room's face for an agent nobody has chosen for, so a lane loses nothing
   it wore before.
9. **Rooms and harnesses keep their outlines.** A room with one agent in it still wears a
   squircle on Spaces and the face its reader chose for it; a harness keeps its squircle, its
   initials and its ring on its card and wherever a room is asked of it. Only where the agent
   itself is drawn does the outline change.

## Consequences

- An agent's face and its room's are separate choices. On Arjun's workspace most agents are
  Jacobian Spaces whose rooms carry their names, and a face he chose for a room does not become
  the agent's. A lane still shows the room's face until the agent has one (point 8).
- A fork's copy starts with its initials, not the original's face.
- A harness that hears `agent.updated` hears one with only `face` in it. Jacobian and the OpenClaw
  bridge read a name and a state from that event and nothing else, so neither changes.
- An installed app older than this draws agents as squircles with initials and ignores `face`.
  A server older than this answers the route with 404, which the sheet says in words.
- The desktop draws an agent at 32 pixels on its Agents page, at a room's head and beside
  *Forked from*, all with the pins; beside a line of words and in a lane, at 24, it wears the bite
  alone, and the green dot at work. The phone has no face between 28 and 36 points, so the line at
  32 changed nothing there.
- Nothing was walked on an Android device.

## Alternatives considered

- **The logo's body alone, its pins out only while it works.** Built first and live for an hour:
  a long list stayed calm and the pins said work. Refused once seen on the phone, because at rest
  the body read as a space's rounded square with a nick out of it (the amendment below).
- **A ridged crisp**, the snack half of the name. The furthest from the logo, and hard to tell
  from a person's circle at 20 points.
- **Today's squircle wearing a mark.** The smallest change, and an agent and a one-agent room
  would still share an outline.
- **Each person's own face for an agent**, a copy of what spaces have. A smaller build, refused
  for the reason in point 4.

## Amendment, 1 October 2026: the pins are always out

The first build drew the body alone at rest and put the pins out only while the agent worked.
Live on his phone, Arjun found it "looking too similar to space icon": a space's face is a rounded
square too, and at rest the bite was all that told them apart. He asked for the logo with its
pins out, the outline mocked as A. Now every face with room for pins wears them (32 points and
over: on the phone the Agents tab, a card and the picker's chosen cell; on the desktop the Agents
page's rows, a room's head, a card and *Forked from*; he moved the line from 36 to 32 for the
desktop's 32-pixel rows), and work runs the light round them
rather than bringing them out. The pins no longer come out or go in, so that motion is gone from
both clients, and waiting on a person is no longer drawn on the face. Nothing on the server
changed.

Later the same morning he asked for the Agents rows to be exactly Spaces' and the agent, pins
and all, the size of a space's face. The rows were already 80 points, but the pins stood out of
a 56-point body, so the face spanned 67. The pins now stand inside the box on both clients
(`BODY_WITH_PINS` in `outline.ts`), and the picker's chosen cell, which shrank the face to fit its
pins, takes the whole cell as a space's does.
