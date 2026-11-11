# 0291. Work an agent did not pick up is handed on, and every room with two agents has a lead

Date: 10 November 2026
Status: Accepted. Arjun, 10 November 2026: "Yes, start it", to the group-messaging audit's next
item: the sweep for hand-offs nobody picks up, agents told who can't answer, and a lead in every
room with two or more agents.

## Context

An agent hands work to another with an @ and its turn ends. If the other never takes it, nothing
in Chips noticed:

- The lead's sweep (ADR 0104) hands the lead only words that named nobody. A hand-off names
  somebody, so a room stuck on one was never the lead's.
- The room's "hasn't picked this up" line (ADR 0083) watched only a person's message.
- The room note says who is working and who is not. It never said whose harness is down, so
  agents handed work to one that could not answer.
- Only a room asked of a harness from the + was given a lead. Three of the six rooms with several
  agents on 9 November had none for some of their time, so even the lead's sweep had nobody to
  hand to.

The ways a hand-off is not picked up are a harness that is offline or says something is wrong, a
turn that failed, and a bridge that took the message and never ran it. The last was real until
ADR 0289, and a message whose turn was waiting or going when a bridge stops is still not run again.

## Decision

1. **A sweep looks for work that was not picked up.** On the timer the lead's sweep runs on, Chips
   looks at the newest message an agent sent each other agent in every open room, within the last
   hour. It counts as not picked up once it has waited a minute and its agent has done nothing
   about it: no turn of its since, no word, no pass and no hearing of it. A turn of its on the
   message that failed counts too. A turn going that was heard from in the last ten minutes means
   the agent is working, and the message waits.
2. **It is handed to the lead, or back.** Chips appends `message.handed` with `unanswered_by`, `why`
   (`offline`, `trouble`, `failed` or `silent`) and, where there are words for it, `reason`. It goes
   to the room's lead. When the lead said the message, or is the one that did not pick it up, it
   goes back to the agent that said it. Once for each message and agent.
3. **The note says who, why and what to do.** "Hazel hasn't picked up this message of yours, sent 3
   minutes ago: its harness is offline. Do the work yourself, hand it to another agent with an @,
   or tell Arjun it is waiting on Hazel." To a lead that did not say it, "this message from Wynn"
   and "It comes to you as the lead".
4. **A person's message is left to the room.** The person sees that it waits, and why. Chips does
   not give a lead what a person asked of one agent by name.
5. **Nothing is handed** while the referee holds the room's agents, while the one to be told has a
   turn going, or in the first two minutes after the server starts, when every harness is still on
   its way back.
6. **Every turn's note says who can't answer.** After who is working: "Can't answer now: Hazel
   (offline for 12 minutes). Work you hand it waits until it is back." `room.away` carries the same.
7. **A message that reaches its agent late says so.** Sent to its agent a minute or more after it
   was said, as after a harness comes back, the note opens "This was said 42 minutes ago and
   reaches you only now: read what was said since before you act on it." By then the lead may
   have given the work to somebody else.
8. **A room with two or more agents has a lead.** Whenever an agent joins or leaves and the room
   has two or more agents and no lead, the agent there longest leads. A person's choice stands: a
   lead they picked, or nobody.
9. **A lead is not handed an answer to a person.** The lead's sweep (ADR 0104) left alone an
   answer to a person who had asked that agent alone. It now leaves alone an answer to a person who
   asked several agents, or all of them: after a question for every agent, the last answer was
   handed to the lead, which wrote a summary nobody had asked for. With a lead in every room of two
   agents that would have happened in every such room. Work one agent handed another still goes to
   the lead when it ends on words for nobody.
10. **The room shows it.** "Hazel hasn't picked this up" and "Hazel can't answer yet" now sit under
   an agent's hand-off as they do under a person's message, and inside the fold agents' talk is
   drawn in while it is closed. Under an agent's hand-off they show for an hour, the hour in which
   Chips hands it on: after that it is the room's history, as it was before this, and as it stays
   with a server too old to hand anything on. Where Chips handed one on, a quiet line says "Wynn
   took it back: Hazel hadn't picked it up", or "took it as the lead".

## Consequences

- A lead is handed turns it was not before. Each is one turn with a short note; where the room has
  a spend ceiling (ADR 0117) it counts against it as any turn does.
- **A message handed back is a turn for the agent that said it**, which no harness had before.
  The Claude Code, Codex, Hermes and OpenCode bridges take it as any turn. Jacobian and the
  OpenClaw bridge drop a turn on their own agent's words, so for them a hand-back does nothing
  until each takes a `handed` message as its sayer's turn. A hand-over to a lead that did not say
  the message works on all five.
- An agent that comes back and is sent what it missed is told the message is late, and reads what
  the lead did about it in the lines that come with the turn. It may still start work somebody
  else was given.
- An app from before this draws the hand-over as "took it as the lead: it was nobody's turn", or
  marks the message handed on, and does not show the waiting line under an agent's hand-off.
- The conformance fake does not run this sweep, nor the lead's. Its note is the protocol's, so it
  words the same lines when a test hands it the same facts.
- A turn that was going when a bridge stops is handed on as `failed` once the bridge comes back and
  ends its run, and one that was waiting behind it as `silent`, rather than lost with nothing said.
  Neither is run again by itself.

## Addendum, 10 November 2026: that an agent is away is said once

The first live run was in Arjun's Dudes room that evening, on his "Yes, test it live": Jens
(OpenCode) led, the Codex bridge was stopped, and Jens was asked to put a question to Lionel
(Codex). Jens asked at 20:10:39, Chips handed the message back at 20:11:44, and at 20:11:48 Jens
wrote "@Lionel is offline, so I'll answer for the test: 2+2 = 4." It had done the work, as its
note asked. It had also sent Lionel one more message, which Chips would have handed back a minute
later, and so on round, had the bridge not been started again.

So:

- **Once for each absence.** After Chips has handed on a message an agent did not pick up, it
  hands on no other message for that agent until the agent has done something since: a word, a
  pass, or a turn begun that is not hanging. Looked for within the same hour.
- **The note says not to @ it.** Where the agent is offline or its harness reports trouble, the
  note ends "Write Lionel's name without an @ until it is back: an @ for it now only waits." Not
  after a turn that failed, where an @ is how to ask again.

The rest of the run went as meant. When the bridge came back, Lionel was sent what it had missed
and answered; its answer named nobody, so the lead's sweep handed it to Jens, which told Arjun the
test was done. Both agents run on models that cost nothing.
