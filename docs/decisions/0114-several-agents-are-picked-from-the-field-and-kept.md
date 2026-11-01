# 0114. Several agents are picked from the field, and kept

Date: 4 October 2026
Status: Accepted, 4 October 2026. Changes ADR 0113's words for four or more named.

## Context

Arjun, once ADR 0113 was live: "I can no longer select 2+ individual agents as the list dismisses
as soon as I select any one". The list never could. Since ADR 0081 it has held each harness and
Everyone, and a pick closed it, on the phone and on the desktop alike; several agents could be
reached only by naming each with an @.

The mock ("Picking Several Agents", a private Artifact) drew two ways: A, a tap on an agent adds
or takes it out and the list stays open; B, a tap on an agent's name picks it alone and closes the
list as before, and a tap on the circle at its right adds it. It also drew "Message 4 agents" for
four or more, since "Message O1, J1 and 2 more" (ADR 0113) does not fit beside the mark and was
cut to "Message O1, J1 and …". Arjun: "go with B, and 4 agents".

Built as B, it went live, and on his phone a tap on a name closed the list, as B has it. Arjun:
"make tapping anywhere on the row add it": A, after all, with the circle kept as the mark of who
is in.

And the next day: "I want to retract the option where tapping the name 'selects' the agent, the
selection should happen with the check box only. If possible increase it's touch area a bit".

With the name doing nothing, asked what a tap on it should do: "Name picks one, closes". So B
after all, with the bigger circle.

Then: "the selections should be sticky. If I make a certain type of agent(s) selection, they
should remain selected when I come back to space". A pick lived in memory: on the phone for as
long as the app ran, which iOS ends in the background; on the desktop until a pick was made in
another room.

## Decision

- **A name picks one, a circle adds.** A tap on an agent's name or faces picks it alone and
  closes the list, as it always did. A tap on its circle adds it, or takes it out, and the list
  stays open. The circle is filled while it is one of who the message goes to, and its target is
  a thumb's square round it with some slop past that (44 points and 6 to 10 more; the circle
  alone was 24). Everyone is still one tap, and closes the list. The faces in the field, a tap on
  the room, or typing close it too.
- **Adding starts from what the field says** (core's `addedTo`). Under Everyone, picked or as the
  room's default, the first agent tapped is that agent alone; otherwise it joins whoever the
  field says, picked or by default. Taking every one out is no pick, so the field goes back to
  where your last message here went.
- **A list stays a list** (core's `aimsAtEveryone`). Tapping in every agent says "Everyone" and
  sends as everyone, but its rows stay checked and a tap takes one out. Turning it into Everyone
  made the next tap start afresh: in a room of two, Scout to Tree took two taps on Tree.
- **To a screen reader** an agent's row is a menu item that picks it alone, selected while it is
  one of who the message goes to, with the circle as its action ("Add to who it goes to", "Take
  out of who it goes to"). On the desktop the list is a listbox of several, each agent selected
  while it is one of them; a click on the name or Enter picks one, a click on the circle or Space
  adds or takes out, and Escape or Tab closes.
- **Four or more say how many**: "Message 4 agents", in core's `aimWords`, for a pick and for an
  @ alike. The mark and its number stand beside them; the list and a route's sheet say who.
  A screen reader hears "To 4 agents".
- **A pick is kept for coming back to.** The phone keeps each room's pick in its own settings
  (`spaces/picks.ts`, read once at launch), the desktop in its window's storage. A send lets the
  room's pick go, as before: where the message went is then the room's default, read from its
  history, so the field goes on saying the same. Unpairing the phone forgets them, and erasing a
  room forgets its own.

## Consequences

- Nothing changes on the server, the protocol, Jacobian or the bridge. A pick of several is sent
  as those agents, as a pick of one always was.
- A pick is the device's: another phone, or the Mac, keeps its own.
- An @ still decides over a pick, as before.
- Going from one agent to another alone is one tap on its name, as before ADR 0114. Several is a
  tap on each circle, then a tap to close.
