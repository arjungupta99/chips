# 0234. A room somebody else reads says shared, and an agent says whose it is

Date: 25 October 2026
Status: Accepted, 25 October 2026. Phase 8 of the second security review
(`docs/proposals/security-review-2-plan.md`). Arjun, from the mock
(`docs/proposals/shared-and-whose-agent-mocks.html`): "I want B, but can you make it have a
color?", then "Build B in violet: the tag on the second line, the same on the web and Mac, Dana's
agent in the selector and details, and an ownerless harness counts as nobody else's."

## Context

Nothing on a Spaces row said whether anybody besides the reader reads the room. A room with another
person in it looked the same as one of the reader's own. So did a room with only another person's
agent in it, though that person can read what their agent is told. An agent's line said its
harness, "Hermes", and only a guest was told whose it is, on room details ([ADR
0196](0196-only-an-owner-or-admin-opens-a-space-and-only-the-owner-sets-spend.md)).

The mock showed two places for a "shared" label: A, after the name; B, a tag at the start of the
second line. Arjun chose B and asked for a colour. The mock then put B in violet, in the app's blue
and in the palette's green. Blue already means Thinking and Working, and green means Done, so the
mock recommended violet, which meant nothing yet. He chose violet. He also settled the mock's two
questions: the web and Mac lists show it too, and a harness with no recorded owner counts as
nobody else's.

## Decision

1. **A room is shared when somebody besides the reader reads it** (`isShared`, core's
   `people.ts`). That means another person is a member, or an agent whose harness has an owner on
   record who is not the reader. The reader's own agents never count, wherever their harness runs.
   An agent whose harness has no owner on record does not count, since there is nobody to name.
   Neither does a member the directory doesn't know. A thread is its room's, so it says nothing of
   its own.
2. **A shared room wears a violet tag at the start of its row's second line**: a person and the
   word "shared", after Main and before the waiting dot, the gear and the last words. It does this
   on the phone and iPad (`ui/SharedTag.tsx`, `spaces/List.tsx`) and on the web and Mac
   (`SharedTag.tsx`, `Sidebar.tsx`). It is the Main tag's shape, so the two sit together. It is a
   label, not a state, so it has no dot. A screen reader hears it in the row's name, "Japan trip,
   shared".
3. **The palette has a violet pair that means only this**: ink `#6a3fc9` on `#efe8ff` in light,
   `#c6b0ff` on `#2a2044` in dark (`tokens.css`, transcribed to `tokens.ts`). The ink clears 4.5:1
   on its ground in both, at 5.6 and 8.0, close to the blue pair's 6.3 and 8.2.
4. **The room's details wear the same tag before who is here**, on the phone, iPad, web and Mac.
5. **An agent somebody else owns says whose it is, then its harness, for every reader.** The field's
   list and the column of faces read "@theo · Dana's agent · Hermes", with whose it is a step darker
   than the note it sits in. A screen reader hears "Theo, @Theo, Dana's agent, Hermes". Room details
   read "Dana's agent · Hermes" (`roomByline`). A guest is never shown a harness, so a guest still
   reads "Dana's agent" alone. The reader's own agents, and one with no owner on record, say their
   harness as before.

## Consequences

- No server change. Every client already holds a room's members and each harness's owner, and a
  member sees every person. Where a reader can't see the owner, the line says the harness, as a
  guest's does.
- The Agents tab's lines are unchanged: its rows say where an agent is, and an agent's page already
  has its Belongs to row (ADR 0196).
- The People page keeps its own list of the spaces the reader shares with each person
  (`sharedSpaces`).
- Every harness on Arjun's server has an owner recorded today, so the ownerless rule changes nothing
  there now.
- On a busy row, the second line now has less room for the last words.
