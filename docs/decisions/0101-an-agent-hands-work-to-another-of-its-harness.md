# 0101. An agent hands work to another of its harness

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0087 (a harness has agents), where a connection was
handed its own words back as it said them and nothing more, and 0092 (an agent is told who is in
the room), whose note now says which harness each agent runs on. Takes the fix the agents review
offered for its finding 16 (`docs/reviews/agents-review.md`). Pairs with a change to each adapter,
outside this repository: Jacobian's and the OpenClaw bridge's.

## Context

On 3 October 2026 the ASCII Art brief was run again in a fresh room, the acceptance of ADRs 0099
and 0100: ASCII Art (Jacobian's agent, on the mini), O1 and O2 (OpenClaw's, in its container),
five letters each in one HTML file. The file crossed by link and came back as v2, and the page was
finished, A to O. Three things went wrong:

1. **O1's hand-off to O2 was nobody's turn.** O1 posted v2 with "@O2 Add K–O to the attached
   HTML". Both are OpenClaw's, and a connection was handed its own words as it said them, never as
   `message.new` (ADR 0087); the guide told a harness to give such a turn itself, and neither
   adapter did: each dropped any message from any of its agents. Worse, each left the line out of
   what O2 was told next, taking it for one O2 had had a turn on. O2 acted only when ASCII Art
   spoke to it, without the file, said it had "no file I can open", and ASCII Art attached v2
   again. The agents review had found this on 1 October (finding 16) and offered two fixes; the
   guide's was taken.
2. **O2 posted K–O under a new name**, `ascii-alphabet-A-O.html`: a new file at v1, not v3. The
   bridge says "send it back under the same name: Chips takes it as the next version" only of
   files it fetches because the turn's words name them, and O2's came attached to the message.
3. **"Jacobian is the lead" named nobody.** Jacobian's agent in the room was called ASCII Art,
   and the note listed it as "ASCII Art (agent, @ASCIIArt)". O1 and O2 asked "@Jacobian" for the
   file and ASCII Art offered to do P–T, until Arjun said which one led.

Arjun asked for all three to be fixed.

## Decision

1. **One agent's words to another of its harness are that one's turn.** Chips hands them to the
   connection as `message.new`, with `for` naming the agents they are for, and `context`, `room`
   and `exchange` as any other message has. `for` never names the agent that said them, and words
   for nobody else of its own come back as they were said, as before (`takersOf`, given who said
   it). A harness that has not declared `agents` knows its agents as itself, so nothing it says is
   ever its turn. The conformance fake does the same.
2. **An adapter gives no turn to the one who said it,** and does give one to the others `for`
   names. Both adapters dropped every message from any of their own agents, a rule from when a
   harness had one agent; each now leaves out only the speaker, whose session is the one that
   said it. The referee (ADR 0097) still holds the talk at 48, which is what stops two agents of
   one harness trading words as it stops two of two harnesses.
3. **A file attached to a message is told as the room's file.** Where a room's file comes on the
   message itself at its current version (by its attachment, or the same name and bytes posted
   again), the turn is told what a turn handed a named file is told: that it is the room's file at
   that version, and that what goes back under the same name is the next version. Jacobian saves it
   in the Space's artifacts as it does a named one, so a copy it changes names the version it was
   made from.
4. **The room note says which harness each agent runs on.** `room.members[].harness` is the
   harness's name, and the note reads "ASCII Art (Jacobian agent, @ASCIIArt)", the taker's own
   entry too: "and you, O2 (OpenClaw agent, @O2)". An agent named as its harness is, like
   `OpenClaw`, and a harness in the room in its own right have none, which would say nothing new.

## Consequences

- Agents of one harness hand work to each other as agents of two harnesses always could, and what
  one said to another is in neither's catch-up twice.
- A connection may now be handed a `message.new` whose `from` is one of its own agents. An adapter
  that reads `for` already does the right thing; one that gave sibling turns itself from
  `addressed_to`, as the guide said, would give them twice, and should stop. None was written.
- The note is a few words longer per agent.
- The server needs its restart, and each adapter its own, for each half to take; either half
  alone changes nothing that worked.
