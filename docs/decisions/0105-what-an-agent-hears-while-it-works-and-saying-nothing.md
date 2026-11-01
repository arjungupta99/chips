# 0105. What an agent hears while it works, and saying nothing

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0088 (an agent is handed what was said since it last
spoke), whose window now starts where the turn that said those words began; 0081 (who a message
is for), whose `message.overheard` a harness now hands to a turn working in the room; and 0104 (a
room has a lead), whose stall turn may now be answered with `NO_REPLY`. Jacobian changes; the
OpenClaw bridge does not.

## Context

Arjun asked whether Chips should send agents messages that need no reply, which the agent would
answer with a token Chips hides, so that each agent stays aware of the conversation. OpenClaw's own
group chats work that way, with `NO_REPLY`.

Each such message would be a model turn per message per agent: three agents in a 60-message run is
about 120 extra turns. A turn queued behind an agent's work reaches it after the moment it
mattered, and Jacobian would run it beside the work. A model does not always keep to a token,
and every acknowledgement is a run that "Working now", the lead's sweep and the thinking bubble
would have to learn to ignore. And Chips already hands an agent what it missed, with no turn:
`message.overheard` as it happens, and `context` with its next message.

Where awareness actually failed was elsewhere:

- **Words said while an agent works.** In run 4, J1 made a file of its own while ASCII Art posted
  the room's. Words for somebody else reached Jacobian as `message.overheard` and were only kept
  for the next turn. And `context` started after the agent's own last words, which come after
  everything said while it worked: those words were in no turn at all, ever.
- **A busy room.** `context` stops at the harness's budget, 20 lines and 4,000 characters by
  default, and the agent was not told that older lines had been left out.

He took three steps: hand a working turn what is said in its room; say when the catch-up was cut;
and a silence token for turns Chips starts, recognised by Chips. "We need this for Jacobian."

## Decision

1. **`context` starts where the turn that said the agent's last words began**: at the first event
   of the run those words were said on, or at the words when they were said on no run. What was
   said while that turn worked is handed to the next one. The taker's own words are left out, since
   it knows what it said, unless one message is for several agents of one harness: they share one
   context, and each is owed what the others said (agents review, finding 15).
2. **A turn working in a room hears what is said there, not to it, at its next step.** Chips
   delivers `message.overheard` as it always has; a harness with a turn going in the room hands
   the words to that turn, marked as said to somebody else, and starts no turn on them. Jacobian
   tells them to the turn at its next round, as it tells a Chips notice: "ASCII Art said in the
   room, not to you: … (sent ascii-alphabet.html)". Never to the one who said them, nor to an agent
   they were for, which has them. A turn with no round left hears nothing, and point 1 hands them
   to its next turn.
3. **The note says when older lines were left out**: "Only the newest 20 lines of what was said
   here since your last turn come with this one: older lines were left out." `context.truncated`
   already said so to the harness; now the model hears it.
4. **An agent's post that says only `NO_REPLY` is its turn passed.** Chips logs it as
   `turn.passed`, keeping its room, its run and what it answered, not as a message: nobody is shown
   it, no agent is handed it, and the room's last words stay what they were. The `ack` carries its
   `seq` as for any post, so neither adapter changes. A run that completes with `NO_REPLY` as its
   summary draws no line in the room; its summary reads "Had nothing to add." A person's words
   are theirs, whatever they say, and a post with files says something. `NO_REPLY` in backticks,
   bold or quotes, or with a full stop, counts.
5. **Only the lead's stall turn is told of it**: "If nothing needs doing, answer NO_REPLY and
   nothing else: the room shows nothing." Chips recognises it from anyone, but tells nobody else,
   so an agent asked something by a person still answers.

## Consequences

- Words said while an agent works reach it twice when its turn heard them at a round: once there,
  and again in its next turn's `context`. ADR 0088 allows lines to repeat; it never allowed a gap.
- A turn that passes still costs a turn; what it saves is a line in the room and a message that
  would count towards the referee's ceiling.
- The OpenClaw bridge hands nothing to a running turn. OpenClaw's own `steer` could, but when the
  turn has just ended it starts a follow-up turn instead, whose answer would go to the room.
  Point 1 still hands OpenClaw's agents what they missed at their next turn.
- Jacobian ends a turn that said nothing with "Done.", as before; only `NO_REPLY` is silent.
- The conformance fake starts `context` the same way, leaves out the same words, and makes the
  same `turn.passed`.
