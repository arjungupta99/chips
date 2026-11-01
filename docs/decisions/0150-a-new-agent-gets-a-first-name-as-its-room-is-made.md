# 0150. A new agent gets a first name as its room is made

Date: 11 October 2026
Status: Accepted, 11 October 2026, on Arjun's "keep old names, any letter, build it". Amends ADR
0091 (no two agents share a name) and ADR 0149 (a space from the + is named, and waits for the
first message).

## Context

Arjun, 11 October 2026: "Need better agent names assignments for the new agents added to space."

A harness proposed its agent's name and Chips only numbered a clash (ADR 0091). Jacobian named its
agent after the Space it made from the person's first message ("Breakfast Today", "Cholesterol",
"Robot Vacuum & Mop"), and renamed it whenever that Space was renamed. The OpenClaw bridge asked
for "OpenClaw", so its agents were "OpenClaw 2", "OpenClaw 3", "OpenClaw 4". In "Test space" the
room said "Jacobian and OpenClaw are here and wait for your first message", and a second after the
first message they were "Breakfast Today" and "OpenClaw 4". The @-names were `@BreakfastToday` and
`@OpenClaw4`.

Three ways were offered: the harness's name inside the room and the room's name elsewhere (A); a
short first name Chips gives each new agent, with its harness under it (B); a name for its part,
chosen by the harness (C). He liked B, asked when the name is picked (at the room's making, so
nothing changes name on the first message), what happens when the names run out (a number, as ADR
0091 numbers any clash), and asked for men's names only. Mock and list:
<https://claude.ai/artifact/36Fgez4TQ1ijmqivTBATdN>. He then said "keep old names, any letter,
build it".

## Decision

1. **A room asked from the + holds a first name for each harness's agent.** When the + adds a
   harness to a room asked of it (`asked_of` or `also_asked_of`, ADR 0087's addendum), the
   `membership.added` carries `agent_name`. The person's device proposes it, so the room is drawn
   with it at once; Chips keeps a proposal nobody has, and otherwise picks one. A harness added to
   any other room is its default agent, as before, and holds nothing.
2. **The names are a list.** 273 men's first names, three to six letters, in
   `packages/protocol/src/first-names.ts` (`AGENT_FIRST_NAMES`). Left out: the names of AI products,
   names that are everyday words, and the harnesses' own. A name is picked at random among the free
   ones (`pickAgentName`), with a first letter nobody in the room has while there is one, so the
   faces differ. Any letter: a harness's own letter would have given Jacobian 12 names for its 22
   active agents.
3. **A held name is taken.** While its room is open and its harness waits there, no other room
   holds it and no agent is given it (`takenNames` counts `heldNames`). An archived or deleted room
   holds nothing. With every name taken, a numbered one, "Milo 2" (ADR 0091).
4. **The room calls the waiting harness by it.** Its middle says "Milo and Theo are here and wait
   for your first message", with each name under its face and the harness under the name. Its list
   of who a message is for says "Milo · Lead" with "@Milo · Jacobian" under it. `@Milo` reaches the
   harness, and so does `@Jacobian`, on the server (`membersOf`'s `held_name`) and on the devices.
   The devices read a room's names through `roomDirectory`/`roomSnapshot`, the directory with the
   room's held names over its waiting harnesses, so every name the room draws is the held one.
5. **The agent takes it.** When the harness claims the room or answers in it, its agent is made or
   found under that name, written as named by the person who added the harness (`agent.updated` by
   that person, so `name_by` is theirs). Its harness asking for another name later changes nothing,
   as with any name a person gave (ADR 0091, decision 4): Jacobian's Space name no longer renames
   it. A name somebody took meanwhile is numbered. The membership's hold is cleared as the agent
   takes the harness's place.
6. **Old names stay.** Agents made before this keep their names. An agent a lead or a person asks
   a harness for by its job (ADR 0108, "Report Designer") keeps that name. Main agents keep theirs.
7. **The harness under a name.** Where a name does not say its harness, the agent list says it
   after the handle on the phone and the desktop (`harnessUnder`): "@Milo · Jacobian", and not for
   "OpenClaw 3".

## Consequences

- One migration: `memberships` gains `agent_name` and `agent_name_by` (0044). The server restarts
  to take it.
- No harness change. Jacobian still names its own Space from the first message, and its first reply
  may still say that name; the room and the agent go by the first name.
- A person renaming an agent to a name a room holds is not refused; the agent taking the hold is
  numbered instead.
- The Agents tab and search show the new agents by their first names, as they show any agent.

## Addendum, 11 October 2026: what the first live room showed

In "Model check", made from the + with Jacobian and OpenClaw, the room held Boris and Jamal and
both agents took those names. Arjun asked "What models are you guys currently on?". Three things
went wrong, and he said "Fix 1,2,3 items":

1. **Boris answered as J, about "Jeff".** J's "About you" file still said "Jeff … That's me", from
   before Jacobian's July rename. The first turn in a + room also never got Chips's note on the
   room. J answered as its instruction said ("Say what you made"): "I can't verify the exact
   models Jeff and the Spaces are currently using. The new Model Check Space checked…". Now:
   - Chips's note lists a waiting harness by the first name its room holds, with the harness
     beside it: "and you, Boris (Jacobian agent, @Boris)". The test fake server lists it the
     same way.
   - Jacobian (`9094a39`) hands that note to J with the first words, and J answers as the agent
     it names, in the first person.
   - "Jeff" became "J" in five lines of J's profile files.
2. **Boris could not say its model.** Every Jacobian turn now says the model it runs on and its
   effort ("You run on gpt-6.1-sol, at high reasoning effort.").
3. **Boris's first turn was nobody's.** Jacobian begins that turn as the harness, seconds before
   it claims the room. The run kept no agent, so the room's sense of who is working left it
   out. Chips handed Jamal's reply to Boris as the lead while Boris was still working. Now the
   claim's `membership.replaced` gives the agent the runs its harness began in that room as itself
   (`take_runs`). Runs already in the log stay as they were.
