# 0091. No two agents share a name

Date: 2 October 2026
Status: Accepted (Arjun, 1 October 2026: "all your suggestions are accepted"; the mock, 2 October:
"approved"). Extends 0087 (agents) and 0082 (a person renames themselves). Amends 0081's handles:
a whole name now beats a first word.

## Context

In the room "HTML ascii art" on 1 October, Arjun asked Jacobian's Hello and two OpenClaws to write
an ASCII alphabet together. Both OpenClaws were called "OpenClaw": Chips names every room a
harness is asked for after the harness (`agentForRoom`), and nothing renames an agent but its
harness. A handle two members answer to went to whichever joined first (the agents review,
finding 34), so `@OpenClaw` reached one of the two, and nobody could tell them apart in the
field's list, on the Agents tab or in the room.

Four agents on his workspace were called OpenClaw. A face each (ADR 0089) told them apart by eye;
nothing told them apart by name.

## Decision

1. **Two names clash when they are the same @-name:** equal once case and spaces are left out.
   "Open Claw", "OpenClaw" and "openclaw" clash. The names that count are the workspace's people,
   less any removed, and its active agents. A rule per room would break the moment an agent moved.
   A harness's own row does not count, since it shares its default agent's name by design, and an
   archived agent gives its name up.
2. **Chips numbers an agent whose name clashes:** the smallest free number after a space,
   "OpenClaw", "OpenClaw 2", "OpenClaw 3", so the @-name is `@OpenClaw2`. "(2)", "#2" or "· 2"
   would make a handle nobody can type. Every door that names an agent does it: a harness's
   registration, a claimed or asked room, the default agent, a fork's copy, a lane's agent, an
   unarchived agent whose name was taken meanwhile, and a followed room's retitle.
   - A trailing number in the name asked for is part of a family only when the name before it is
     taken: "OpenClaw 2" asked for beside an "OpenClaw" becomes "OpenClaw 3", never "OpenClaw 2 2".
     "India trip 2026" is its own name.
   - **Numbers stay put.** An agent asked for again under the name it has, or under the name its
     number is of, keeps what it has. When OpenClaw 2 is archived, OpenClaw 3 is still OpenClaw 3,
     and the next new one takes 2.
   - **People are never numbered.** A person whose new name clashes is refused, as before.
3. **A person may rename an agent**, with `PUT /v1/agents/:id/name {name}`: anybody but a guest,
   as with its face (ADR 0089). The name is cleaned as a person's is (trimmed, its spaces
   collapsed, 1 to 120 characters). A name that clashes is refused with who holds it, "An agent
   here goes by Hello already." or "Somebody here goes by Arjun already.", and is not numbered. It
   is written as `agent.updated {agent_id, name}` with the person as the actor, by Chips, which
   is the only writer of that event.
4. **A person's word holds.** Once a person has named an agent, its harness's registration and a
   followed room's retitle no longer rename it, as a person's title holds a room's (`title_by`).
   It is kept as `name_by`, the person who named it, derived from the log, so a rebuild keeps it.
   Chips may still number it when it comes back from an archive and its name was taken meanwhile.
5. **`@` takes whole names first.** Every member's whole name, spaces left out, is its handle
   above all. A first word names a member only when no other member of the room has that first
   word and nobody has it as a whole name; otherwise it names nobody. A harness's name (`also`,
   ADR 0087's addendum) comes last. In a room with OpenClaw and OpenClaw 2, `@OpenClaw` reaches
   OpenClaw in either join order; beside Chess Game 2, `@chess` reaches nobody. The server and the
   apps resolve the same way, in `packages/protocol/src/mentions.ts`.
6. **What is there is renumbered once**, by `chipsd upgrade names`: a dry run that lists each
   rename, then `--apply`, which writes `agent.updated` by `system`. The oldest keeps the plain
   name, an agent that clashes with a person is numbered, and a second run finds nothing.
7. **The screens.** The phone's agent card puts a pencil beside the name, which opens the sheet You
   uses for a person's own name; the Mac's agent page makes the name the field, as You does. The
   field's list of who a message is for shows each agent's @-name under its name. A guest sees no
   pencil and no field.

The rule lives once, in `packages/protocol/src/names.ts` (`clashKey`, `freeAgentName`), for the
server, the conformance fake and core.

## Consequences

- `@OpenClaw2` is a handle a person can type and an agent can be told to use. The room note
  (ADR 0092) lists each member with it.
- A harness that keeps its own name for an agent sees Chips's name come back numbered. Both
  harnesses read the name from `agent.updated` and the registration's answer already.
- A fork's copy is usually numbered ("Chess Game 2"), and the screens add " · fork" to a copy whose
  name is its original's or a numbered form of it, as they added it to an equal name before.
- Two doors naming two agents at the same instant can both pick the same number. It is rare, the
  log keeps both, and the upgrade's second run finds and numbers it.
- A one-letter name ("J") still has no handle (finding 34's rest), and is not changed here.

## Addendum, 26 October 2026: a name is what it looks like (SEC-33)

Arjun: "refuse homoglyph, zero-width and bidi characters in names, and refuse an agent named Main
or You." Names were checked for length alone, so Arjun with a Cyrillic A, Arjun with a zero-width
space in it, and a name ending in a right-to-left override all passed. Each could read as somebody
it wasn't, on the screens and in the lines an agent reads, now that those lines say a person's
standing beside their name (SEC-49). An agent could be called Main, which the Main
agent's tag says, or You, the word a person reads for themselves.

1. **Two names clash when they look the same.** `clashKey` folds a name by NFKC, so full-width
   and mathematical letters are plain ones. It drops what nobody sees: control and format
   characters, the grapheme joiner, the blank letters of Hangul and Braille, and an emoji's
   variation selectors. It reads a Cyrillic or Greek letter that looks Latin as that Latin letter,
   so Dana in full-width letters, with a zero-width space in it, or with Cyrillic a's is Dana.
   These are the letters a name borrows to pass for another; Unicode's whole list of confusables
   isn't carried.
2. **A name a person types can't hide anything** (`nameProblem`): no control or format character,
   so no zero-width space and no mark that changes the text's direction. A zero-width joiner or
   non-joiner stays where it shapes what is either side of it, between two emoji, which it makes
   one, or in Persian or an Indian script, and is refused at an end or beside a Latin, Cyrillic or
   Greek letter, a digit or a space. A name can't mix Latin, Cyrillic and Greek letters in one word;
   "Priya Иванова" is two words and is had. This holds wherever a person names somebody or
   something: joining, their own name, an agent's, a new agent's, and the workspace's. The
   refusal says why.
3. **No agent is called Main or You**, however written (`notAnAgentName`). A harness or a person
   asking for one gets it numbered, "Main 2", as for a name somebody has, and the field under the
   name says so; a person renaming an agent to one is told why not. A person may still be called
   You, which `chips serve` calls the first person until they name themselves.
4. **A name a harness or a device gives itself loses what nobody sees** (`withoutHidden`) rather
   than being refused, since nobody typed it to be told: an agent's, a harness's and a joining
   device's, and the words of a join request. Its clash is judged by point 1.

The rule is in `packages/protocol/src/names.ts`, for the server, the conformance fake and core.
Names already there are left as they are; on 4431 none breaks it, and no agent is called Main or
You. Letters that look alike within Latin, a capital I and a small l, are a matter for the font
and aren't folded.
