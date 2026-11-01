# 0250. A session hears a space's rules once

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026, on the four agents' review of Chips: "after that do 3".
Amends [ADR 0092](0092-an-agent-is-told-who-is-in-the-room.md) (the note ends with its rules,
carried apart too), [ADR 0117](0117-a-room-has-a-spend-ceiling-per-job.md) (the spend line comes
before them) and
[ADR 0221](0221-an-agent-works-on-the-rooms-project-in-a-copy-of-its-own-and-its-bridge-does-the-git.md)
(the project's note is its facts, then its asks).

## Context

In the same room as [ADR 0249](0249-agents-told-a-message-is-for-all-and-handed-more-of-the-room.md),
two agents said the turn's instructions were long and came with every turn, costing tokens and
burying the message. They are right. Before a turn's words, a bridge that sends files and works on
the room's project says, in a room of four agents:

- the room's note, about 1,060 characters, of which about 520 are rules: what an @ does, and when
  to answer `NO_REPLY`;
- the project's note, about 2,160 characters, of which about 1,900 are asks: work in the copy,
  leave git to Chips, split work by file, keep a start page and `run.json`;
- how a file reaches the room, about 285 characters.

About 2,700 of those 3,500 characters are the same on every turn, while ADR 0249's whole budget for
what was said is 16,000. Claude Code, Codex and OpenCode keep a session's turns, so every turn's
copy stays in the session: forty turns in a room carry the same rules forty times, and the session
compacts that much sooner, losing the detail the agents also asked to keep.

## Decision

1. **A turn's rules are named apart from its facts.** The room's note ends with its rules
   (`roomRules`); what the job has spent, which used to end it, comes just before them. `message.new`
   carries each taker's rules as `room.rules` too, and `noteWithoutRules` gives a note without them.
   The project's note is its facts (`renderProjectFacts`: where the copy is, what others changed, a
   clash or a key) and then its asks (`renderProjectAsks`). `rulesFor` in the SDK puts a turn's
   rules together: the note's, the project's asks, and how a file reaches the room.
2. **A session is told them once.** `promptFor(message, { rulesHeld })` leaves them out, and says
   the facts. A bridge keeps which rules each of its sessions holds in a `SessionRules`: told once
   the turn that said them is given, forgotten when the session compacts, and said again when they
   change, as when a second agent joins or the project gets its first page. A new session holds
   none, and a bridge that restarts tells each session once more.
3. **Each harness, as it keeps its turns:**
   - **Claude Code and Codex** (the ACP bridge) and **OpenCode** keep a session's turns, and say
     when it compacts: they tell each session once.
   - **Hermes** puts the rules in each run's `instructions`, which it adds to that run's system
     prompt and keeps out of the session, as its bridge already said how a file reaches the room
     there. The turn says the facts only.
   - **OpenClaw and Jacobian** are unchanged: each reads `room.notes` whole, and Chips's note still
     holds everything.

## Consequences

- After its first turn, a session in a busy room is handed about 2,700 fewer characters a turn,
  and its window fills with what was said rather than with copies of the rules.
- A session that compacted on its own, and said nothing of it, would go without the rules until
  it is told again. The bridges here each hear their harness's compactions; one that can't keeps
  saying them every turn.
- The server's change is only the order and the new `rules`: a bridge on an older SDK reads
  `notes` whole as before. The bridges' half ships as their next releases on npm.

## Addendum, 30 October 2026: OpenClaw too

OpenClaw's bridge keeps a `SessionRules` by session key, as the ACP bridge does. A turn's rules
there are the note's, the project's asks, how a file reaches the room, and how to speak in it
later (its automations line); the turn that holds them is handed the note without them, the
project's facts and which files came with it. They are forgotten when the turn's stream says
OpenClaw has begun compacting, when OpenClaw says a session was compacted (a person's Compact now,
or OpenClaw's own between turns), and when a send fails. Jacobian still reads `room.notes` whole.
