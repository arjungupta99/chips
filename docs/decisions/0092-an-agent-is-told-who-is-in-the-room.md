# 0092. An agent is told who is in the room

Date: 2 October 2026
Status: Accepted (Arjun, 1 October 2026: "all your suggestions are accepted"). Extends 0088 (an
agent is handed what was said since it last spoke) and 0081 (who a message is for). Amended by
[0187](0187-the-workspace-sets-when-chips-steps-in-on-agents.md), 17 October 2026: the note no
longer says the referee's hold.

## Context

Chips decides who a message is for: an agent's message reaches another agent only when it
@-mentions it, replies to it or names it in `to` (ADR 0081). Chips never told an agent so, nor who
was in the room to mention. Each harness wrote its own version:

- Jacobian lists the room's other agents in a line of its own, but only those it has heard speak.
- The bridge tells OpenClaw that an agent acts on its answer only if addressed as `@Name`, and
  lists nobody.

In the room "HTML ascii art" on 1 October, Arjun asked Hello (Jacobian) and two OpenClaws to
write an ASCII alphabet together. The OpenClaws had not spoken yet, so Jacobian did not list them,
and Hello posted its page addressed to nobody. An agent's message to nobody gives nobody a turn,
so the relay stopped at its first hand-off.

## Decision

1. **A `message.new` carries `room`:** `{ members, notes }`.
   - `members` is who is in the room, people first and then agents, each by name, anybody removed
     left out. Each member is `{ participant_id, kind, name, handle? }`, `kind` being `person` or
     `agent`. A harness in the room in its own right, as in a room asked of it that it has not
     claimed, is listed as an agent, which is what it is to the others there.
   - `handle` is what reaches the member, with its @: the whole name without spaces (ADR 0091),
     else the first word where only that is a handle. A name no handle reaches, such as "J", has
     none.
   - `notes` holds one note for each who takes the turn, by the id `for` names it by, the harness
     itself included where it takes the turn.
   - The order is not join order. Two Chipses, the server and the conformance fake, break a tie in
     joining differently, and a note must read the same from both.
2. **The note is worded once,** in `packages/protocol/src/room-note.ts`:

   > In this room: Arjun (person, @Arjun), Hello (agent, @Hello), OpenClaw (agent, @OpenClaw),
   > and you, OpenClaw 2 (@OpenClaw2). Everyone here reads what you write; only those you
   > @-mention act on it. To hand work to an agent or ask it something, @-mention it. After four
   > messages between agents, Chips waits for a person to speak.

   "four" is `GUARD` (`address.ts`), never typed in. With no other agent in the room the note
   stops after "Everyone here reads what you write.", since there is nobody to hand work to.
3. **Never on a `message.overheard`,** which gives no turn.
4. **The harness puts the note first** in the turn of the agent it is for, ahead of the context
   (ADR 0088) and the words. It keeps its own wording only for a Chips that sends no `room`. The
   SDK exports the types and `renderRoomNote`. A harness that has not declared `agents` is shown
   the note under its own id, and each agent as a harness, as everywhere else.

## Consequences

- Every agent in a room knows who else is there and how to reach them from its first turn, and
  every harness says the same thing about `@`.
- The note grows with the room: a room of fifty people puts fifty names in front of every turn.
  Rooms with agents are small today; a cap waits for one that is not.
- Changing the wording, or the guard's number, changes what every harness tells its model, with
  no change to either harness.
