# 0104. A room has a lead, and Chips wakes it

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0092 (an agent is told who is in the room), whose note
now says who leads, who is working and what is news to the taker, and 0097 (the referee), whose
`message.handed` now also hands a lead what was nobody's turn. No change to either adapter.
On the Mac the Lead picker is the sheet's Lead page since ADR 0151.

## Context

After five ASCII Art runs, Arjun stepped back: a team of people in a chat gets a project done;
what is our agent chat missing? People read every message and choose what to act on and when, know
their roles, have a lead, and see who is working on what and who is done.

The difference is presence. A person is there between messages: they glance at the room, see
someone typing, notice it has gone quiet and ask "where are we?". An agent exists only in its
turns. So the runs stopped where nobody's turn was next: in run 1, O1's hand-off woke nobody; in
run 2, ASCII Art posted its file with no @ and the room sat. In run 4, J1 started a file of its
own before ASCII Art's arrived; in run 5 it brought its copy from the room before.

The proposal (a private mock, kept out of the repository) had three steps, smallest first: a room
note that says more; a room lead that Chips wakes when the room goes still; and, later, actions an
agent calls (claim, done, "wake me when"). He dropped the brief and the roles from the first: "If
I have a lead, the lead needs to take care of these things, making sure nothing is stuck, and the
goal is progressing, why do we need to pin anything?" and "drop roles too, the lead assigns work".
He took the four A's: hand the lead what was nobody's turn once the room is still; a + room is led
by the agent it was asked of; one quiet line says so; a join wakes nobody.

## Decision

1. **A room may have a lead**: one of its agents, which hands out the work there and which Chips
   hands what was nobody's turn. A person in the room who is not a guest chooses it, or that nobody
   does (`POST /v1/spaces/:id/lead {agent_id}`, `space.lead_set`). A room asked of a harness from
   the + is led, from its claim, by the agent that claimed it, unless a person chose first: it
   heard the person's first words, so it holds what the room is for. An agent that leaves the room
   leads it no more (`spaces.lead_id`, migration 0036, read with the membership). The room's lead
   is not a Lead room's Lead agent (ADR 0069), which stays as it is.
2. **Every turn says who leads and who is working.** The room note (ADR 0092) gains "ASCII Art
   leads here: it hands out the work, and what is nobody's turn goes to it" ("You lead here" to the
   lead), and "Working now: O1, 2 minutes in (last step: Editing ascii-alphabet.html). Not
   working: J1 for 3 minutes." A turn nothing has been heard from for ten minutes is not working:
   a run its harness never ended says nothing about now. `room.members[].lead`, `room.working` and
   `room.idle` carry the same facts. As of the moment Chips sends the turn, as who is in the room
   is.
3. **What is news to the taker comes first**: "You joined this room 2 minutes ago, added by
   Arjun. The room's files listed with this turn are its current versions: work from them, not
   from a copy you made in another room", to an agent that joined a room already talking and has
   had no turn there; "New since your last turn: J2 (Jacobian agent, @J2), added by Arjun", to the
   others. A join wakes nobody: the lead hears of it on its next turn.
4. **Chips hands the lead what was nobody's turn.** The sweep (every 15 seconds) looks at each
   room with a lead. Where the last words are an agent's that named nobody, and nobody has been
   working for twenty seconds since, Chips hands them to the lead as `message.handed` with `lead`,
   which its harness hears as `message.new` with `handed` and `lead`, its note starting "Nobody has
   this turn: J1 said it with no @, and nobody in the room has worked since. It comes to you as the
   lead: hand the next step on with an @, or, if the work is done or stuck, tell Arjun." Never the
   lead's own words, which were for the people; words that @-mention a person; an answer to a
   person who asked that agent alone; words the referee held, or anything while it holds the room;
   nor the same words twice, so a lead whose turn ends naming nobody is not handed its own silence.
5. **People see one quiet line** under the words: "ASCII Art took it as the lead: it was nobody's
   turn". A person choosing the lead says so too: "O1 leads this room now, chosen by Arjun".
6. **Choosing**: on the phone, a Lead row on the room sheet ("Hands out the work", and who) opens
   the room's agents and No lead, a tick on the one that leads; the lead's row wears "Lead". On the
   Mac, the members panel marks the lead and has a Lead picker.

## Consequences

- No adapter changes: both put the room note at the top of the turn already, and a handed message
  is a `message.new` like any other. The adapters' own "a turn ended with words for nobody" are
  untouched; the lead takes those up.
- A lead turn costs one turn per stall, against a room that sat until a person noticed.
- The note is longer by a sentence or three in a room with several agents.
- The conformance fake says who leads, sets it at a claim, and hands to the lead when a test says;
  it keeps no clock, so it never hands on its own.
- Left for later, step 3 of the proposal: actions an agent calls, to claim work, say it is done,
  or be woken when something changes.

## Addendum: a message chosen for an agent with no @ is its (15 October 2026)

In "Write a two-line poem about autumn…", Tomas (Claude Code) led and Nova (Claude Code) was the
room's second agent. Arjun chose Nova in the composer and wrote "Test", then "Say "hello"", four
messages with no @. Chips made each Nova's (ADR 0081: `to`, then `addressed_to`), and Nova took a
turn on each, but every one ended `NO_REPLY`. Its note said that only those @-mentioned act, that
Tomas leads and what is nobody's turn goes to Tomas, and that a message asking nothing of it is
answered NO_REPLY. Nothing said Arjun had chosen it, so it read his words as Tomas's. Where the
chosen agent led, or was the room's only agent, nothing went wrong, which is why it was first
seen here.

- **What is news to the taker gains one line**, after "Nobody has this turn" and before "You
  joined": "Arjun sent this message to you without an @: it is yours to answer." It goes to each
  taker a message is for that does not @-mention it: chosen in the composer, a reply to its words,
  or where its sender's last message went (ADR 0081's rules 2, 3 and 5). Never on a message for
  every agent (`addressed_to_all`), where "asks nothing of you" still decides, nor on what was
  nobody's turn handed to the lead, whose own line says why it is its.
- **Only beside another agent.** With no other agent in the room the note never speaks of an @, so
  the line would be noise on every turn in a direct room.
- The rule is the protocol's `yoursWithoutAt` (with `TakerNews.yours`), used by the server and the
  conformance fake alike. No adapter changes: the note is at the top of every turn already.

## Addendum: an answer stays an answer past a person's aside (31 October 2026)

In the "Bro chat" room on 30 October, Arjun asked Paolo alone to run three slow commands, and while
Paolo worked he wrote "@Arjun note to self: the demo moved to Friday at 3." Paolo's answer named
nobody, and the last words of a person before it were that note, not the ask, so it did not count as
an answer to a person. Twenty seconds later the lead, Nigel, was handed it, and spent a turn
($0.12) passing.

- **Looking back for the ask passes over people's words for no agent**: a person's message that
  named no agent and was not for all (an aside, a note to themselves, words for another person).
  The rule is now: the person's message for that agent and no other comes before the answer, with
  nothing between but that agent's own words and such asides.
- An agent's words still end the look back, so an agent's answer to another agent's ask, with an
  aside between, is still handed to the lead.
