# 0097. The referee: Chips talks before it stops

Date: 2 October 2026
Status: Accepted, 2 October 2026. Amends 0081 (point 4: the hold after four goes) and 0092 (the
room note's last sentence). The proposal is `docs/proposals/agents-working-together.md`; the
build is its runbook, `docs/proposals/agents-working-together-build.md`, Phases 2 and 3.
Amended by [0187](0187-the-workspace-sets-when-chips-steps-in-on-agents.md), 17 October 2026: the
stop, the hold and whether circles count are the workspace's, Chips's 16, 48 and on until set.

## Context

On 2 October Arjun gave three agents one brief in the ASCII Art room: a shared HTML file, five
letters each. ADR 0081's guard held the fifth message agents sent each other without a person —
the one carrying the file's path — and every one after, delivered to nobody with the sender told
nothing. The room went quiet for 27 minutes. When he typed again it reset, and held again four
messages later. The count was the wrong unit: three agents handing work along a chain need more
than four messages before any work moves.

His words: the message limit "seems an anti pattern to me. I would rather have chips inject maybe
messaging or later warning context (if it is truly going south) … The limit should otherwise be a
very large number." Work resets the counts. "When the communication is blocked by Chips, the
notification needs to be clearly notified in the UI."

## Decision

1. **Two counts, one reset.**
   - *The exchange* is every message an agent sends an agent in the room since the reset, a held
     one included.
   - *The circle* is its shape: the same two or three agents taking turns (A B A B, A B C A B C)
     for two rounds with a repeat among them, or three rounds without. A repeat is a file already
     in the room (its digest), or words much the same as words its sender already sent since the
     reset: word trigrams at least 60% alike, @names, links and punctuation left out, never under
     six words.
   - *The reset* is anything a person does in the room — writes, answers a question, decides or
     hands on an approval, adds or takes out somebody, steers or stops a run, gives a thumb, lets
     the agents carry on — or anything new an agent makes: a file new to the room, a question to
     a person, an approval request. Time resets nothing, and neither does pausing.
2. **Four stages,** constants in `@chipschat/protocol` (`exchange.ts`), not settings:
   - *Quiet* under `NUDGE_AT` (8): nothing.
   - *Nudge* from 8: the facts ride each `message.new` an agent sent, as `exchange`, with a
     plain `note` a harness puts at the top of the turn, as Chips's, ahead of the room note. The
     facts are the count, where it runs from and how long ago, the repeats, and who else the
     message is for.
   - *Warning* on a circle, or from `WARN_AT` (16): the note names the way out (*Stop, and tell
     Arjun what is done and what is blocked. Messages between the agents are held after 48.*);
     the room draws a line for its people under the agents' fold, with *Let them carry on* and
     *Pause them*; and the room's people get one push (`warning:<room>:<reset>`).
   - *Held* at `CEILING` (48), or while a person has paused the agents: an agent's message to
     agents is held — shown in the room and handed to nobody.
3. **Blocked is loud.** While Chips holds the agents' messages:
   - The room shows a banner above the field, *Chips paused the agents. ASCII Art, Oc2 and Oc3
     sent each other 49 messages since you last acted.*, with *Let them carry on*, and its row on
     Spaces is marked *Paused*. Both go when a person acts.
   - The line under the fold says it first: *Chips paused the agents.* Held bubbles say *held*
     beside their time, and *handed on* once they are.
   - The room's people get one push, *Chips paused the agents* (`held:<room>:<reset>`).
   - The sender is told in its acknowledgement: `held: true` and `exchange: {count, allowance}`,
     on the socket's `ack` and the HTTP post's answer. Its adapter tells the model, which stops
     and says what is done and what is blocked rather than waiting on the others.
4. **Nothing is dropped.** The first thing a person does after a hold hands each agent the newest
   held message that was for it — worked out again from what it said, among the agents in the
   room now — as `message.handed`, which its harness hears as `message.new` with `handed: true`.
   It is numbered as the hand-over, so no harness's place in the log goes back; its `message_id`
   is the message's own. The older held messages are the room's lines, handed with the turn
   (ADR 0088).
5. **A person pauses them, or lets them carry on**: `POST /v1/spaces/:id/exchange {state}`, a
   person's in the room who is not a guest, as `exchange.set`. Pausing holds every message an
   agent sends an agent there; carrying on is a person acting, so the count starts again and what
   was held is handed over.
6. **Worked out from the log, as of the message.** The server and the conformance fake read the
   same rules from the protocol (`exchangeFactsOf`, `renderExchangeNote`, `circleIn`,
   `repeatOf`), so a replay hands over the same facts. The clients draw the people's line and the
   banner from the lines and two marks the fold keeps per room: where a person last acted, and
   the newest pause (`exchangeLine`, `pausedIn`, `pauseWords` in core).

## What is left out, and why

- **Whether a person has the room open.** The proposal's facts said whether the person is looking,
  read from `read_state`; nothing on the server writes `read_state` (how far a person has read is
  kept on their own device). `person_looking` is in the schema, always `null`, and the push goes
  to the room's people outside their quiet hours, once each.
- **Who took no turn on a message** (ADR 0083's fact), and the full list of what was made since a
  person acted. The reset names what was made last; the rest can follow when a room needs it.
- **The people's line runs from the person.** It says *since you last acted*, and starts again only
  when a person acts; the server's count also starts again when an agent makes something new.
  Which messages are held is the server's.

## Consequences

- Agents that hand work along a chain do it without a person, up to 48 messages; one that goes
  round is told so at its next turn, and its people are told once.
- A hold is never silent: the sender, the room, its row and its people's phones all say it, and
  the held messages reach the agents they were for when a person acts.
- A held answer never starts a turn of its own in either adapter (Phase 2): it is told to the
  turn that said it while that turn has a round left, else to the agent's next turn in the room.
  A turn started by a hold could say something held again, at the ceiling, in a loop.
- `GUARD` is gone. Every layer's test of the hold after four moved to the ceiling.

## Addendum, 17 October 2026: taking turns is not going round

Arjun, asked how a circle is found: "go with B. I need you to add comprehensive tests, to make
sure this does not get called for no reason. It is totally possible 2+ agents are working on a
complex task and need to go back and forth."

Before changing anything, eleven conversations of agents at work were written down as tests
(`packages/protocol/src/circle.test.ts`): two chasing a bug, a writer and a checker going section
by section, three in a pipeline batch by batch, a lead giving out letters, a numbered interview, a
code review by line and commit, a reviewer posting the file under discussion with new comments,
and others. The rule above called every one of them a circle: two agents at their sixth message
and three at their ninth by taking turns alone, and hand-offs in the same words ("Done with
section 2 … over to you for section 3") as early as the fourth, as repeats.

- **A circle always needs a repeat.** Two rounds of the same two or three agents with a repeat
  among them, as before; three rounds without one is no longer a circle (`circleIn`). Agents that
  only go back and forth are told to stop at `WARN_AT`, like any others.
- **A repeat is about the same particulars.** Words much the same as the sender's earlier ones
  are a repeat only when they carry the same numbers, ids and lone letters (a section, a batch, a
  commit, a total, "F to J"): work handed on in the same words differs in exactly these
  (`repeatOf`). Apostrophes are dropped before words are compared, so "bank's" leaves no lone "s".
- **A file posted again counts toward a circle only with nothing new said beside it** (under six
  words). It is still among the facts' repeats, so the next turn is told that posting it again
  reaches nobody new; it no longer tells a reviewer commenting on the file it posts to stop.
- The five conversations of agents going round in the same tests are still caught, at the soonest
  message a circle can be (the fourth of two, the sixth of three): asking each other to check the
  same thing again, each waiting on the other, the same file handed back and forth with nothing
  said, three in a fixed order with one asking again, the same apology nearly word for word.
- The server's referee test, core's line under the fold and the web spec
  `who-a-message-is-for.spec.ts` moved with it: two trading questions and answers are warned at
  sixteen, and a circle there is now Pilot giving its second answer again.

The settings for the stop and the hold (when Chips tells the agents to stop and when it holds
them) are a separate change, still at the mock.
