# 0294. What waited for an agent is one turn

Date: 11 November 2026
Status: Accepted. Arjun, 11 November 2026: "Yes, start it", to the group-messaging audit's next
item, as it was put to him: "when an agent comes back or finishes a turn, fold everything waiting
into one turn, with the room as it is now. Where the harness allows it, messages that arrive
mid-turn would join the running turn, as Jacobian's do."

## Context

An agent works on one turn at a time in a room. The Claude Code and Codex bridge, the Hermes
bridge and the OpenCode bridge each kept what was said to a busy agent in a queue, and ran one
whole turn for each message in it, one after another.

- **It cost a turn a message.** Each turn pays for the agent's whole context again: the audit of 9
  November measured 20,000 to 120,000 input tokens a turn.
- **It answered stale questions.** A message's turn is handed the room as it was when the message
  arrived, not as it is when the turn starts. The first of three turns answered what the third
  message had already changed, or what another agent had since done.
- **It filled the room.** Three replies in a row where one would do.

It showed on 10 November in the Dudes room (ADR 0291's first live run): the Codex bridge came back
to three messages and ran three turns, one after another.

Jacobian already does better: words for an agent whose turn is going join that turn at its next
round (Chips ADR 0109), so one agent runs one turn at a time and hears everything.

Everything Chips checks for "was this picked up" looks at the newest message for an agent and
whether the agent did anything after it: a run begun, a word, a pass. So one turn begun after
three messages already counts for all three, in the room's waiting line (ADR 0083), in the sweep
for work not picked up (ADR 0291) and in the lead's sweep (ADR 0104). Nothing on the server
assumes a turn a message.

## Decision

1. **What waits is one turn.** When an agent is free, its bridge takes every message waiting for it
   in the room and runs one turn on them. The turn is the newest message's: its room note, the
   referee's word, and the lines said since the agent last spoke. The messages that waited ahead
   of it are said in full before its words, oldest first, each with its files and the message it
   answers, under one line: "3 messages for you waited while you were working or away. They
   follow, oldest first. Answer them together in one reply, and where a later one changes or
   settles an earlier one, go by the later." They are left out of the lines said since, where
   Chips had them too, so nothing is said twice.
2. **The turn has the room as it is when it starts.** A bridge keeps what it overhears in the room
   (`message.overheard`) after the newest waiting message arrived, and says it after the words:
   "Said in this space after those messages, to others:". The newest forty lines. Without them an
   agent does again what another said it had done while the message waited. Lines before the
   newest message need no keeping: Chips sends them with it.
3. **A bridge gathers for a moment before an idle agent starts.** 150 ms, so a harness that comes
   back and is sent all it missed at once (ADR 0289) takes it as one turn, not the first message
   alone and then the rest.
4. **Some messages stay a turn of their own.** One Chips handed over, to the lead or back to its
   sender (ADR 0097, 0104, 0291): its note says why it is the agent's, and is about that message
   alone. And a second look at a reply (ADR 0200). Messages ahead of one in the queue are one turn,
   it is the next, and those after it another.
5. **Hermes takes words into the turn going.** A message for an agent whose Hermes run is going is
   steered into that run, which Hermes gives the model after the step it is on, and the run says
   `message.heard` once it completes, so the room shows the agent heard it while working (ADR
   0109). Where Hermes kept the words back (`pending_steer`), would not take them, or the run
   failed or was stopped, the message goes back to wait and is in the agent's next turn. A message
   Chips handed over is not steered in.
6. **Claude Code, Codex and OpenCode take them in the next turn.** ACP has no way to give a turn
   more words while it runs. OpenCode has one, but its bridge posts the last answer of a turn, and
   words taken after the model's last step would start a second answer and cost the room the
   first. So for these three a message that arrives mid-turn waits, with whatever else arrives,
   for the one turn after.
7. **`promptFor` words it.** The SDK's `promptFor(message, { earlier, since })` writes the turn
   above: `earlier` the messages that waited ahead of this one, `since` what was overheard after.
   A harness that builds its own turn reads the same fields.

## Consequences

- An agent that was busy or away answers once, after reading everything, and pays for its context
  once. A burst of five messages is at most two turns: the one going, and one more.
- The run's goal, which the thinking bubble shows, is the newest message's first line.
- Only the newest message's note is said. Where an earlier one went to every agent, or to several,
  the turn is not told so for that message.
- A reply names no message it answers, as before. The room shows one reply under the newest.
- Chips does not learn which messages a turn was on: `run.started` names none. Nothing reads it.
- The three bridges carry their own copy of the wording until they are built on the SDK that has
  it, 1.0.5; the copy is written to give the same text.
- Not done here: OpenCode's own way of taking words mid-turn, which wants its bridge to post each
  answer of a turn; `catch_up`, the room's lines from before an agent joined, which no bridge
  reads; and the post ack's `held`, which no bridge tells its agent.

## Addendum, 11 November 2026: the three things left

Arjun, 11 November 2026: "complete all the left items". The last consequence above named three
things not done. All three are done here, and decision 6 changes for OpenCode.

1. **OpenCode takes words into the turn going.** A message for an agent whose OpenCode turn is
   going is given to its session as a steer, which OpenCode reads when the model call it is on
   ends. What stood in the way was that the bridge posts a turn's last answer. So when the session
   takes the message after a model call that was the last of an answer (OpenCode says how each call
   ended: `tool-calls` and `unknown` mean more to come, anything else that the answer is said),
   the bridge posts that answer in the run then, and what the session says to the message is the
   run's next post. Taken mid-work, between two calls of one answer, nothing is posted and the one
   answer is to both. Either way the run says `message.heard` when the session takes it (ADR
   0109). Not joined: a message Chips handed over, a reply to a message, a second look, anything
   while other words wait ahead of it, and anything while the run is paused or not yet begun. Those
   wait for the one turn after, as before.
2. **A message the turn never took goes back to wait.** Stop takes it back from OpenCode and it is
   the agent's next turn. Pause takes it back too: the paused turn carries on without it on Resume,
   and the message is the turn after. A turn that fails leaves it waiting the same way.
3. **Claude Code and Codex still take them in the next turn.** ACP has no way to give a turn more
   words while it runs. Decision 6 stands for those two.
4. **An agent's first turn in a room has what was said before it joined.** Chips sends the room's
   last lines with the news that an agent was put in a room (`agent.attached`'s `catch_up`, ADR
   0088), and no bridge read them: an agent added to a room mid-talk answered its first message
   knowing only the lines since. The three bridges keep them by agent and room, and the agent's
   first turn there says them once, under "Said in this space before you joined:", ahead of the
   lines since, without the messages the turn itself is on. `promptFor` takes them as `before`.
5. **An agent is told when Chips held its message.** When agents have sent each other the
   workspace's hold, or a person paused them, the next message between them is posted for nobody
   and the post's answer says `held` (ADR 0097). No bridge told the agent, which then waited on an
   agent that never had its words. The three bridges keep that answer for the agent's next turn in
   the room, which opens with Chips's word on it, once. `promptFor` takes it as `heldPost`, and
   `heldWords` gives the words alone.
6. **The word is true at the turn that says it.** The first thing a person does in a room after a
   hold hands each agent the newest held message that was for it (`hand-over-held`), and a person's
   message is usually what starts the agent's next turn. The first live run showed it: told "the
   agents it named do not have it yet", the agent said so to the person whose own message had sent
   it on a moment before. So the turn says one of two things. Where its message says the agents
   are held still (`exchange.stage` is `held`): "Your last message in this space was held, so the
   agents it named do not have it yet: messages between the agents here are held (they have sent
   each other 48 since a person last acted) until a person acts. Until then, tell the person what
   is done and what is blocked, rather than asking the agents again." Otherwise a person has acted
   since: "Your last message in this space was held from the agents it named until a person acted.
   A person has now, so Chips has handed it to them: do not send it again."

What this leaves: the held note reaches the agent at its next turn, not in the turn that sent the
message, which had ended by the time Chips answered. With these three bridges that next turn
nearly always follows a person's act, so the second wording is the one an agent mostly reads; the
first is for a harness that tells its model as soon as `post` answers. And the bridges' own copy
of the wording (`fold.ts`) still goes when they are built on SDK 1.0.5.
