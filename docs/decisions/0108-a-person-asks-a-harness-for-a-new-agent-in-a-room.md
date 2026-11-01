# 0108. A person asks a harness for a new agent in a room

Date: 3 October 2026
Status: Accepted, 3 October 2026. Extends 0087 (Fork, point 6, and the Add page of Phase 4) and
0084 (the +'s faces). Jacobian and the OpenClaw bridge both change.

## Context

Arjun, 3 October 2026: "I want to be able to add 'brand new' agents to a space, instead of only
existing agents".

A room's Add page offered only agents that exist: free ones, ones in other rooms (Move), and a
copy of one (Fork). A brand-new agent came only from the +, which makes a new room. To put a fresh
Jacobian agent beside J1 and O1 in ASCII Art, a person made a + room, waited for its agent, and
moved the agent across.

The mock (a private Artifact, "New Agent in a Room") drew three ways to ask: a row per harness and
then a name (A), one New agent row and then the harnesses' faces (B), and one tap named by the
harness (C). He picked **B**: "go with B, build it". The other calls were left as drawn: the name
may be left empty, the asker's field holds the new agent's @ once it joins, and who may ask is who
may fork.

## Decision

1. **The ask is Fork's with nothing to copy.** `POST /v1/spaces/:id/agents {harness_id, name?,
   key?}` writes `agent.asked {harness_id, name, by}` in the room. The room is sent it, and so is
   the harness asked, live and on replay, although none of its agents is there
   (`ASK_EVENTS`). A harness that has not learnt agents is never handed it (`AGENT_EVENTS`).
2. **The harness answers by registering the agent** with `made_for` (the ask's id) and
   `space_id`. While the ask stands, `NEW_AGENT_WAIT_MS` (a minute, as a fork's), Chips puts it in
   the room: `membership.added` and `agent.attached` carry `made_for`. Later, or for an ask that
   has its agent, the agent is free and the answer says why (`answerAsk`).
3. **Only what a harness declares is offered** (ADR 0077): the capability `new_agents`.
4. **Who may ask is who may fork**: a person in the room, not a guest, who owns the harness or is
   an owner or admin of the workspace, since the agent spends that harness's budget. Never into a
   Lead room, a closed room or a thread. Two asks are two agents; the same `key` is one ask.
5. **The name is the person's, or the harness's own.** Left empty, it is the harness's name
   numbered to the first nobody here answers to (ADR 0091): *Jacobian 2*. A name typed that is
   taken is numbered as well, and the field's line says so as it is typed. The event carries the
   name it settled on, and registration numbers it again if it was taken meanwhile.
6. **The room says it in one line**, worded as Fork's (`askWords` in core): *Asking Jacobian for
   Reviewer…*, then *Reviewer joined* with its face, or after the minute *Jacobian didn't make
   Reviewer* with Try again for whoever may ask. The room list says *Asked Jacobian for Reviewer*
   and then *Reviewer joined*.
7. **The asker's field holds its @** once it joins (`store.takeArrival`): on the device that
   asked, once, and only into an empty field.
8. **On the phone (B):** the Add page has a New heading over one *New agent* row when a harness
   here may be asked. Its page shows those harnesses' faces, as the + window shows them (`Pick`),
   one picked already when there is only one, then the name field, the line under it, and *Add
   Reviewer*. **On the Mac:** the Members panel's *Add someone…* list has a New group, *New Jacobian
   agent…* for each harness, and picking one opens the name in the dialog New space and Add
   harness grow out of (`GrowingDialog`).
9. **The harnesses.** Jacobian makes a Space directly under J with that name and nothing else,
   as a + room's Space is made, and registers it for the room. The OpenClaw bridge registers a
   new Chips agent on its default OpenClaw agent, with a session of its own, as a + room's claim
   is. Both declare `new_agents`. Each answers only an ask its owner made, as each answers a fork.

## Consequences

- An agent made for a room starts with the room's catch-up (ADR 0088) and its note (ADR 0092),
  and nothing from elsewhere: what it is for is said to it in the room, with its @.
- A new agent costs the harness one agent. One a harness makes after the minute is free, on the
  Agents tab, for a person to put in a room or delete.
- The conformance fake answers the ask as the server does, and a parity scene holds them to it.
