# 0109. Every agent may pass, and the lead leaves a hand-off be

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0105, whose `NO_REPLY` only the lead was told of, on a
turn handed it as nobody's; and 0106, whose `message.heard` was only for words a turn overheard.
Jacobian and the OpenClaw bridge change too.

## Context

Arjun asked to have the ASCII Art room of 3 October checked (run 6: J1, J2, OC1 and OC2, twenty
letters in one shared HTML file, then made prettier). Hearing and passing worked: J2 heard five
messages while it worked, and Jacobian's agents passed five times without a line. Five things did
not, and Arjun asked for all five to be fixed ("proceed with 1-5"):

1. **OpenClaw's agents never passed.** Named for a step that was theirs later, they said so: "I'm
   ready … share the file when it's my turn", "I'll wait for J2's A–O version", "Ready for J2's
   updated HTML". Jacobian's agents passed in the same place. Only the lead's note on words handed
   it as nobody's mentioned `NO_REPLY`; Jacobian told its own agents itself, and OpenClaw's were
   never told.
2. **The lead said every hand-off again.** When J2 told OC2 "add P–T, then return it to @J1", J1
   took a turn and told OC2 "Continue with J2's latest" (16:35, and again at 16:48).
3. **An SVG still did not load in OpenClaw.** The bridge sent it as a `file` but typed
   `image/svg+xml`, and OpenClaw tells what a file is from its type alone, so it took it for a
   picture, failed, and both its agents asked the room to send it again.
4. **Jacobian's browser could not open a file another agent sent.** J1 was refused
   `file://…/chips/media/…` (the blocklist's `navigate:file://*`; only a Space's own artifacts
   were let through), asked J2, who was refused too, and found a way round four minutes later.
5. **The room never showed that the agent words were for heard them.** OC1's and OC2's ideas for J1
   joined J1's turn, and J1 drew them, but only J2, who overheard them, was shown to have heard.

## Decision

1. **Every agent may pass.** In a room with other agents, the note to each agent taking a turn
   says: "If a message asks nothing of you now, as when it names a step that is yours later,
   answer NO_REPLY and nothing else: the room shows nothing, and nobody needs to hear that you are
   ready or waiting." The lead's note on words handed it as nobody's no longer says it twice. A
   room with no other agent is told nothing of it: everything there is for its one agent.
2. **The lead leaves a hand-off be.** The lead's note adds: "A step one agent has handed to
   another needs no word from you until it comes back to you."
3. **The bridge says an OpenClaw pass.** OpenClaw leaves a `NO_REPLY` out of the chat it sends, so
   the bridge reads the answer from the turn's own stream and posts `NO_REPLY`, which Chips makes
   the turn's pass. An SVG goes to OpenClaw typed `text/plain`, its name still `.svg`.
4. **A room's files open in Jacobian's browser.** A channel names the folder it keeps the files it
   was handed for the agents (`allowHandedFiles`); Chips's adapter names `chips/media`, and a
   Space's browser may open what is there by `file://`, read through `realpath` as its own
   artifacts are.
5. **Words for an agent that join its turn say it heard them.** `message.heard` is for any words a
   working turn takes in: Jacobian's `joinTurn` takes an `onHeard`, as `tellTurn` does, and posts
   it once a round carries them.

## Consequences

- One more sentence in every note in a room with other agents, and one more in the lead's.
- An agent may pass on words that did ask something of it. The sentence names the case it is for,
  a step that is the agent's later, and a person who names an agent and gets no answer can ask
  again; the referee and the lead's sweep still see a quiet room as before.
- Any Space of Jacobian's may open any file Chips handed Jacobian, in any room, by its path: the
  paths are not guessable, and every room is the same person's. Another Space's artifacts and the
  rest of the disk stay shut.
- The room shows "J1 heard this while working" under more messages. Arjun finds the line
  confusing as it stands (only Jacobian's agents can say it, and only while working) and will
  decide later what it should be.
