# 0088. An agent is handed what was said since it last spoke

Date: 29 September 2026
Status: Accepted, 29 September 2026. Extends 0081: a message for an agent carries the room's recent lines. Every
field is optional, and `message.overheard` stays. It replaces the buffers the adapters keep for
themselves (Jacobian's `room-talk.ts`, the OpenClaw bridge's `bridge.ts`), which they delete in
their own repositories. Built as Phase 1 of `docs/proposals/agents-plan.md`, before agents exist.

## Context

Arjun asked, with ADR 0087, how an agent keeps up with a group conversation. There are two
memories, kept in two places:
- **The room's conversation is kept by Chips**: everything said there, by everyone, one copy.
- **The agent's own memory is kept by its harness**: for Jacobian, the Space's thread, notes and
  files. Chips never holds it (ADR 0024, decision 8).

What joins them today is ADR 0081's delivery. A harness gets `message.new` for what is addressed
to it, and `message.overheard` for everything else said in its rooms. What it overhears, it has
to remember for itself until its next turn there, and both adapters do it the same way, in
memory:
- **Jacobian** keeps the last 20 lines and 4,000 characters per room (`HEARD_LINES`,
  `HEARD_CHARS` in `src/channels/chips/room-talk.ts`), and puts them ahead of its next turn there.
- **The bridge** does the same for OpenClaw (`OVERHEARD_LINES`, `OVERHEARD_CHARS` and
  `withOverheard` in `bridge/src/bridge.ts`): "Said in this room since you last spoke:".

That breaks in four ways:
- **A restart forgets it.** Restart Jacobian, ask it what OpenClaw just said, and it does not
  know.
- **A late joiner gets nothing** from before it joined, so "what do you think of the above?" has
  no above.
- **Every harness builds it again**, and a harness that never learned `message.overheard` (Scout)
  has no context at all.
- **ADR 0087 makes it worse.** Agents move between rooms, come back to rooms unarchived, and join
  rooms mid-conversation. Each of those is a moment the adapter's buffer is empty.

Chips already holds every line, in order, in a log that replays identically. It can hand them
over with the question.

## Decision

1. **A message for an agent comes with what was said since it last spoke.** `message.new` gains
   an optional `context`. `message.overheard` never carries one: it is the context.
   - **Since it last spoke** means the lines after the agent's latest message in that room, up
     to the message it is being handed. When it has not spoken there, the lines since it joined.
     The message itself is not in its context.
   - **Worked out from the log, relative to the message.** It is the same whether the message is
     delivered live, on a reconnect's replay, or after either side restarts.
   - **An agent addressed that did not answer** is handed those lines again next time. They
     repeat; they never leave a gap.
   - **Before agents exist**, "the agent" is the harness: the lines since the harness last
     posted in that room. When a harness has agents (ADR 0087), it narrows to the agent.

2. **What a line holds.** Each line has its `seq`, when it was said (`at`), who (`from`: id,
   kind, name), and a `kind`:

   | Kind | What it is |
   | --- | --- |
   | `said` | A message, by a person or an agent, addressed to this agent or not. |
   | `joined` | Someone came into the room: added, attached, or moved in. |
   | `left` | Someone went: removed, released, or moved away. |
   | `renamed` | A person or an agent took a new name, or the room a new title. |
   | `archived`, `unarchived` | The room was put away or brought back. |

   A `said` line carries:
   - `text`, as it reads now: an edited message reads edited, and a deleted one is left out;
   - `transcript` for a voice note;
   - `files`, by name;
   - `addressed_to`, so a harness can tell a line it already took a turn on;
   - `held`, when ADR 0081's guard held it.

   Runs, steps, approvals, reactions and pins are not lines. They are a run's or the room's own
   state, and a harness hears them as it does today.

   The block has the `lines`, oldest first. It also says where they start (`since_seq`), whether
   older ones were left out (`truncated`), and a cursor for reading further back (`before`).

3. **The budget is the harness's.** The `hello` client frame gains an optional
   `context: {lines, chars}`.
   - **The default is today's**: 20 lines and 4,000 characters.
   - **Chips's ceiling** is 200 lines and 32,000 characters. The pull route (point 4) is for more.
   - **The oldest line goes first** until the rest fit. A single line longer than the whole
     budget is cut to it rather than dropped, so the newest line is always there.
   - **The harness sends it itself.** A budget promises nothing to anybody else, so ADR 0046's
     rule that only a person declares does not apply.
   - It is per connection, so with ADR 0087 it applies to all of that harness's agents.

4. **More is one read away.** `GET /v1/spaces/:id/context?before=&limit=` returns older lines in
   the same shape, paged by the same cursor.
   - It takes a harness's token only. A person reads the room itself.
   - It reads only a room the harness is a member of now, or with ADR 0087, a room one of its
     agents is attached to.
   - `limit` is at most 200.

5. **Joining catches up.** `agent.attached` (ADR 0087) carries a `catch_up` of the same shape: the
   room's last lines before the agent joined, within its budget. That covers an agent added,
   moved in, or brought back by an unarchive. Until those events exist (Phase 2 and Phase 4 of
   the plan), a harness added to a room reads the pull route.

6. **`message.overheard` stays.** A harness that keeps its own memory as things are said can go on
   listening. One that does not need to can ignore it.

7. **One renderer, shared.** `packages/protocol/src/context.ts` picks and clips the lines
   (`contextLines`) and renders them as plain text (`renderContext`), beside `address.ts`, which is
   shared the same way. The server, the conformance fake and the SDK use it, so all three hand over
   the same lines. The plain form is the adapters' form today, "Said in this room since you last
   spoke:" then `Name: words`, one per line. A harness may render the block as it likes.

8. **The adapters' buffers go.** Jacobian's `withRoom` and the bridge's `withOverheard` read
   `context`. While a Chips without it is connected, they fall back to their own buffers. Once it
   is live, they delete them: Jacobian's `heard` map and `overhear()`, and the bridge's
   `overheard` map. Jacobian's `company`, who is in the room, stays until ADR 0087's `hello` lists
   it. Those changes are theirs, landed on Arjun's word.

## Consequences

- **A restart on either side loses nothing.** The plan's check for this phase: in a room with
  Jacobian and OpenClaw, OpenClaw answers something, Jacobian restarts, and Jacobian is asked what
  OpenClaw just said. It knows.
- **Every harness gets context**, including one written before this and one on the SDK that never
  listened to `message.overheard`.
- **Nothing new is disclosed.** Every line is from a room the agent is in now. A member already
  reads a room's history through `GET /v1/events` (M3.3), and the catch-up hands over only its end.
- **Cost:** one read per `message.new`, of at most the budget's lines, on the index the log
  already has (`workspace_id`, `space_id`, `seq`). The message grows by at most the ceiling.
- **Some lines repeat.** Lines addressed to the agent since it last spoke may already be in its
  harness's thread (two questions before one answer). `addressed_to` on each line lets a harness
  leave them out.
- **The wire only grows:**
  - `message.new` gains `context`, and `agent.attached` carries `catch_up`.
  - The `hello` client frame gains `context`.
  - `GET /v1/spaces/:id/context` is new.
  - The `message.new` fixture gains a context in the commit that adds the field, since
    `catalogue.test.ts` holds every fixture to its schema. `pnpm gen:protocol` writes the pages.
  - The WebSocket and custom connect guides gain "What you're told with a question".
- **Tests:**
  - The renderer: clipping, the oldest line first, voice notes, held messages, joins, renames.
  - Delivery: a new message carries context, an overheard one does not, the budget holds, and a
    replay carries the same context.
  - The pull route and its row in the authorization matrix.
  - The fake, and a scripted harness end to end.
- **Not decided here:**
  - A summary of a room's long past. A harness that wants one pages the pull route and makes its
    own.
  - A budget per agent. It is per connection until one is needed.

## Addendum, 13 November 2026: a line for another agent says whom it was for

Point 7's plain form was `Name: words` for every line. A person who picks an agent in the field
(ADR 0081) puts no @ in the words, so such a line read as the room's, or as the reader's own. In a
room of three agents, Arjun sent one ask to each by the pick, the same but for a word: "Reply with
the single word delta" to one, "echo" to the next, "foxtrot" to the third. The second agent's turn
listed the first ask under "Said in this space since you last spoke:" as
`Arjun (owner): Reply with the single word delta`, and on a small model it answered "delta"
(finding NR-13). A line said after the message was already under "to others" (ADR 0294). One said
before it was not marked.

Chips knew whom each line was for: `addressed_to` has been on a line since this ADR. It had ids and
no names, and the renderer did not read it.

- **A line carries the names.** A `said` line gains `to`: the agents in `addressed_to`, each with
  the name it goes by now, as `from` has. `linesOf` fills it in for the server and the conformance
  fake alike. It is absent when the line was for no agent, and an id nobody knows is left out.
- **The plain form says them.** `renderLine` and `renderContext` take who reads the line
  (`{ taker }`), as `renderReplyingTo` does:
  - for another agent: `Arjun (owner), to Check Codex: Reply with the single word delta`;
  - for the reader and others: `Arjun (owner), to you and Check Codex: …`;
  - for the reader alone, or for no agent: `Arjun (owner): …`, as before. In a room with one
    agent nothing changes.
  Without a reader every agent is named, and that is the form the budget counts.
- **Everywhere a line is said.** `promptFor` passes the taker for the lines since, the lines from
  before the agent joined, and the lines ahead of a quoted message. An agent's line that @-mentions
  another is marked the same way: the rule is the line's, not the sender's.

The lines after the message keep their heading, "to others", and say no names: `message.overheard`
has the ids only. The OpenClaw bridge and Jacobian write their own lines from the same fields, and
say `to` in the same words, each in a commit of its own.

A bridge on the SDK says it once it is built on an SDK with this, from a Chips that sends `to`.
An older bridge drops the field unread, and an older Chips sends none, so either side can go
first.
