# 0249. Agents are told a message is for all of them, and handed more of the room

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026, on the four agents' review of Chips: "1 and 2 now".
Amends [ADR 0081](0081-chips-says-who-a-message-is-for-and-only-they-take-a-turn.md) (a message
for every agent now says so in each taker's note),
[ADR 0092](0092-an-agent-is-told-who-is-in-the-room.md) (the note's news) and
[ADR 0088](0088-an-agent-is-handed-what-was-said-since-it-last-spoke.md) (the default budget).
[ADR 0287](0287-agents-are-told-how-run-files-and-several-agents-work.md) replaces its line for a
person's message to every agent.

## Context

Arjun put four agents in one space, one on each of Claude Code (the lead), Hermes, Codex and
Jacobian, and asked them, with All chosen in the composer, to introduce themselves and then to say
what they thought of Chips. Two things went wrong that were Chips's, and the agents named both.

1. **A message for every agent didn't say so.** Each agent's note said "only those you @-mention
   act on it" and nothing about the message being for all of them. The lead took Arjun's second
   question as its own to hand out and asked the other three again by @, though each already had
   it; earlier, the Jacobian agent, which took 26 seconds over its introduction, asked the other
   three by @ to introduce themselves after all three had. Each was answered twice: 6 of the 16
   turns were repeats, about $0.29 of $1.67.
2. **The default budget held two introductions.** No bridge says how much of the room it wants, so
   each was handed the default of ADR 0088, 20 lines and 4,000 characters, which were the first
   adapters' own numbers. The agents' answers ran 1,500 to 2,600 characters. The lead was handed
   the newest 2 of the 4 lines said since its last turn, and the Jacobian agent 3 of 6, none of
   them the introductions.

## Decision

1. **A message for every agent says so, first in each taker's note**, beside other agents: "Arjun
   sent this message to every agent here, so each of you has it: answer it yourself, and don't
   pass it on with an @." It is the protocol's `toEveryAgent` with `TakerNews.toAll`, said by the
   server and the conformance fake as ADR 0104's addendum says a message is the taker's. A room
   with no other agent says nothing of it, as it says nothing of an @.
2. **The default budget is 40 lines and 16,000 characters** (`CONTEXT_BUDGET`): about eight
   answers of an agent, and about 4,000 tokens, small beside a model's window. The ceiling stays
   200 lines and 32,000 characters, and a harness that says a budget in its `hello` still gets its
   own. A room's context page read with no `limit` is 40 lines too, since it reads the same
   default.

## Consequences

- Both are the server's: a restart of Chips takes them live, and no bridge changes. The note is
  worded once, in the protocol, and the server, the fake and every bridge read the same words.
- A turn in a busy room carries more of it. In a room of people and one agent, what is said since
  an agent's last turn rarely reaches the old budget, so little changes there.
- The note's rules, said with every turn, are the other half of the agents' review: ADR 0250.
