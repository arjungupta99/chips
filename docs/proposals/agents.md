# Agents: several per harness, one room each — proposal

29 September 2026. Nothing built. Agreed with Arjun in conversation, point by point; the mock
is kept out of the repository. The decisions are
[ADR 0087](../decisions/0087-a-harness-has-agents-and-an-agent-is-in-one-room.md) (agents, and one
room each) and [ADR 0088](../decisions/0088-an-agent-is-handed-what-was-said-since-it-last-spoke.md)
(continuity), both accepted 29 September 2026. How it is built is [the phased plan](agents-plan.md).

## What Arjun asked

"Allow adding multiple agents of each harness into Chips rooms. That also means we would not have
1:1 linkage of Chips room to Jacobian room." Then, over the conversation:

1. One Jacobian Space is one agent. A room with two Jacobian agents in it has two Spaces in it.
2. Every room is just a room. No room belongs to an agent, and one with a single agent is a room
   with one agent in it.
3. **An agent is in one room at a time.**
4. Archiving a room releases its agents, and each agent is told. A released agent is free, and can
   be attached to another room later.
5. Unarchiving a room brings its agents back if they are still free. One that is in another room
   by then shows in this room as being elsewhere, with **Move back** (it leaves the other room) or
   **Fork** (a copy joins this room). Any agent can be forked, by a harness that can; Jacobian
   forks the Space.
6. Adding an agent that is in another room offers the same Move or Fork.
7. **J is the Lead agent.** The Lead agent is never added to a room. It is only in its **Lead
   room**, which takes no other agents. People may be added to the Lead room.
8. A free agent with something to say: its task is stopped, and when it cannot be, what it says is
   held until it is attached.
9. When J hands work to a free Space, the Space is attached to a new room with the person who
   asked. When the Space is already in a room, the work shows there, with a card in the Lead room
   pointing to it.
10. Delete releases the agents, as Archive does. When the room has one agent, the sheet also
    offers to delete that agent in its harness.
11. A Space archived in Jacobian leaves its room, and the room is archived too when it was the
    only agent there.
12. **The Harnesses tab becomes Agents.** It lists every agent, with its harness and its room
    under its name, and has a Harnesses section listing the harnesses.
13. A room whose only agent moves away stays open, and shows a notice saying so.
14. **An agent has a message history.** Agents, then the agent, then Message history: the
    messages it received, across rooms, with a divider for each room. A room does not show what
    an agent said in other rooms.

## Why this is needed

A participant today is a harness: the software, with one face. Jacobian is one participant, so
all its Spaces speak as "Jacobian", and a room holds Jacobian at most once. Each room is keyed to
one Space and follows it. So a room cannot have two Jacobian agents, and a room shared with
another harness makes Jacobian quietly create a new Space for it (`brought_into`). OpenClaw's
agents each need a harness and a token of their own (open decision 8). The blueprint always meant
otherwise: "One connection can present many agents… a gateway-style harness shows as several
agents sharing one link status."

## The words

| Word | Meaning |
| --- | --- |
| **Harness** | The software and its connection: token, owner, autonomy, budget, link status. Jacobian on the Mac mini; the OpenClaw gateway and its bridge. |
| **Agent** | Who takes part in rooms: a face, a name, an @handle. A harness has one or more. Jacobian: J, and each Space directly under J. OpenClaw: each agent the gateway lists. Scout: itself. |
| **Lead agent** | One agent a harness may mark as its lead: J. It lives only in its Lead room. The label is generic; a harness without a lead has none. |
| **Lead room** | The Lead agent's room. People can be added to it; other agents cannot. It is never archived or deleted (ADR 0069's home, renamed). |
| **Attached** | In a room. An agent is attached to at most one. |
| **Free** | In no room. It keeps its memory and can be attached again. |
| **Released** | Taken out of its room by an archive, a delete or a move, and told so. |
| **Move** | Take an agent out of its room and attach it to this one. The room it left says so. |
| **Fork** | Ask the harness for a copy of an agent, attached to this room. The copy remembers everything up to the fork; after that, the two remember separately. |

## The rules

1. **An agent is in at most one room.** A room holds any number of agents, from any harness, and
   people. The server refuses a second attachment; the clients offer Move or Fork instead.
2. **Rooms own nothing, and agents own no room.** A room has no key. The harness finds its agents by
   its own key (a Space's id), and their rooms through membership. A room with no title is named
   after its agents, as a direct room is named after the other person, so renaming the Space
   renames the room with no sync.
3. **Archiving a room stops its agents' work and releases them.** Chips cancels every run going on
   in the room, with the lanes those runs opened. Both adapters already stop a turn on
   `run.cancel`: Jacobian stops the live turn, and the bridge sends `chat.abort`. Then each agent is
   released and told. The room keeps its history and its people.
4. **Unarchiving brings them back.** Each agent released by the archive that is still free is
   attached again automatically. One attached elsewhere is shown in the room as elsewhere, with
   Move back and Fork.
5. **Deleting a room releases its agents too.** When the room has one agent, the sheet also offers
   *Delete Chess Game in Jacobian too*. That keeps ADR 0069's "gone on both sides" as a choice.
6. **What an agent says while free is held.** Its task was stopped (rule 3), so this is the rare
   case: a scheduled job not tied to a run, or a harness that ignored the cancel. Its messages
   wait, the Agents tab shows *1 waiting* on its row, and they are posted in the next room it is
   attached to.
7. **The Lead agent is only in its Lead room.** The server refuses adding it anywhere else, and
   refuses adding any agent to the Lead room. People can be added. A harness marks at most one
   agent as lead.
8. **The lead's hand-off follows the agent.** When J hands work to a Space, the lane lives in
   that Space's room, and the route card is in the Lead room. When the Space is free, Chips opens
   a room with the person who asked and attaches the Space there. This is rule 6's one exception,
   because a person asked for it. It is ADR 0029's shape: a lane's home is the specialist's room,
   "or one Chips opens".
9. **An agent archived in its harness leaves its room.** When it was the room's only agent, the
   room is archived too. That keeps the list following Jacobian, as asked on 19 September. A room
   it shares with other agents stays open and shows it as gone.
10. **A room with no agent says so.** When its only agent moves away, is released or is archived
    in its harness, the room stays open with its history and people. A notice sits above the
    field: *No agent in this room. Chess Game moved to Openings prep. Messages here reach people
    only.* It offers Move back, Fork and Add an agent. It is amber, as *can't answer now* is (ADR
    0083), and it stays until an agent is attached. An archived room shows the archive bar
    instead.
11. **An agent's message history is on its card.** The history holds what the agent was asked and
    what it answered, in every room it has been in, oldest first. Each stretch in a room is under
    a divider with the room's face, name and dates, such as *Engine eval · 25–29 Sep*. The room
    it is in now is marked *now*. A reader sees only rooms they can read; any other room is a
    divider and a count (*2 messages in a room you're not in*). A fork's history starts at the
    fork, with a line pointing to the original. A room shows only what was said in it, never an
    agent's words from another room.
12. **Only what a harness declares is offered** (ADR 0077). Fork is shown only for a harness that
    declares `forks`, and the delete sheet's extra line only for one that declares
    `follows_rooms`.

### Who may do what

- **Add a free agent to a room:** any member of the room, as adding a harness is today.
- **Move or Fork:** the agent's harness owner, or a workspace owner or admin. Moving takes the
  agent out of a room that other people may be using, and a fork spends the harness's budget.
  Other members see the agent as elsewhere and can ask.
- **Archive and delete:** unchanged (ADR 0066, ADR 0067).

## What each moment does

| Moment | Chips does | The harness hears | The room shows |
| --- | --- | --- | --- |
| Agent added (free) | attaches it | `agent.attached`, with a catch-up | *Arjun added Chess Game* |
| Agent added (elsewhere) → Move | releases it there, attaches it here | `agent.released` (moved), then `agent.attached` | here: *…added Chess Game*; there: *Chess Game moved to Openings prep* |
| Agent added (elsewhere) → Fork | asks for a fork | `agent.fork` | *Forking Chess Game…*, then the copy joins |
| Room archived | cancels its runs, releases its agents | `run.cancel`, then `agent.released` (archived) | *Arjun archived this. Chess Game's reply was stopped.* |
| Room unarchived | re-attaches the free ones | `agent.attached` | the ones back; each one elsewhere as a row with Move back and Fork |
| Room deleted | releases its agents (and deletes the agent when the sheet said so) | `agent.released` (deleted) | the room is gone |
| Agent archived in its harness | releases it; archives the room if it was the only agent | — | *Chess Game was archived in Jacobian* |
| Free agent speaks | holds the message | — | Agents tab: *1 waiting* |
| J hands work to a Space | the lane in the Space's room (a new room if it was free) | `run.requested` | Lead room: the route card; the Space's room: the task |

## Continuity: how an agent keeps up

### In plain words

There are two memories, kept in two places.

- **The room's conversation is kept by Chips.** It is everything said in the room, by everyone.
  Everyone in the room sees the same copy.
- **The agent's own memory is kept by its harness.** For Jacobian, that is the Space: its past
  conversation, its notes, its files. Chips never holds it.

While an agent is in a room:

1. Every message reaches every agent in the room as soon as it is said. It is marked *for you,
   answer it* or *for someone else, just listen*.
2. Listening is free. The agent does not think about what it overhears.
3. When a message is for the agent, it gets three things together: what was said since it last
   spoke, who is in the room and how to @ them, and the message itself. It answers, and that
   exchange goes into its own memory.

It is like someone in a meeting who jots down what others say, then glances at the notes when
asked a question.

When the agent moves:

- **It joins a room**, whether new, attached or moved: it is told which room and who is there, and
  given the last few lines, so "what do you think of the above?" works.
- **It is released:** it is told it has left. Its memory keeps everything. Nothing in Chips is
  deleted.
- **It moves to another room:** it still remembers the old room, because it is the same agent, and
  it catches up on the new one.
- **It is forked:** the copy remembers everything up to the fork. After that, the two remember
  separately.
- **It comes back to an unarchived room:** it is told it is back, and caught up on what it missed.

One room at a time means one agent has one running conversation. There is never a question of
which room's thread it is in.

### What changes from today

Today step 2's notes are kept by each adapter, in memory: the last 20 lines, at most 4,000
characters (Jacobian's `room-talk.ts`, the bridge's `bridge.ts`). They are lost when it restarts.
A late joiner gets nothing from before it joined. Every adapter builds the same thing again.

**Chips sends the notes with the question.**
- `message.new` gains `context`: the room's lines since this agent's last turn in its room. That
  covers who said what, who joined, left or was renamed, voice notes as their transcripts, files
  as names, and what agents said to each other.
- It is capped by a budget the harness declares. The default is today's 20 lines and 4,000
  characters.
- It carries a cursor. `GET /v1/spaces/:id/context?since=` reads further back for a harness that
  wants more.
- `agent.attached` carries a `catch_up` of the same shape: the room's last lines before the agent
  joined.
- `message.overheard` stays, for a harness that keeps its own memory as things are said.

The adapters then keep nothing. Jacobian's `RoomTalk` buffer and the bridge's `overheard` map are
deleted, and their `withRoom` prefix reads `context` instead.

## The Agents tab

Phone and desktop, replacing Harnesses:

```
Lead agent
  J              Jacobian · Lead room
Agents
  Chess Game     Jacobian · Openings prep
  Kit            OpenClaw · Build night
  Lux            OpenClaw · Build night
  India Trip     Jacobian · Free · 1 waiting
  Archived · 51
Harnesses
  Jacobian       Connected · 16 agents
  OpenClaw       Connected · 2 agents
  + Add harness
```

- An agent's row opens its card: its face, harness, room (tap to open it), Message history, and
  Attach, Move, Fork and Archive as allowed.
- A harness's row opens the card it has today: token, autonomy, budget, the checklist.
- Status stays on the ring and in words, as the fleet does now: a working agent says so.
- Archived agents fold behind one row, as closed rooms do.

## The wire

Additive where it can be. A harness with one agent works on the first day without a change.

1. **Agents are participants.** They are of kind `agent`, with ids `agt_…`, and carry `harness_id`,
   `key`, `lead`, `forked_from`, and their room (`space_id`, or none when free). The harness,
   `hrn_…`, keeps the token, owner, autonomy and budget, and stops speaking as itself. Budget stays
   per harness and rolls up its agents (ADR 0029). The autonomy dial stays per harness, per room.
2. **One connection, many agents** (closes open decision 8). `hello` lists the connecting
   harness's agents. Everything a harness sends names one of its agents as `actor`. The server
   refuses any other. A harness with one agent may keep sending its own `hrn_` id, which the
   server reads as that agent. That keeps Scout and today's bridge working unchanged.
3. **Agents are registered by key.** `POST /v1/harnesses/:id/agents {key, name, lead?}` registers
   an agent or renames it. It returns the same agent every time for a key. `GET
   /v1/harnesses/:id/agents` lists every agent with its room, state and held count. These replace
   opening rooms by key (`POST /v1/harnesses/:id/spaces`), the `asked` list, and `space.claimed`.
4. **Chips to the harness:**
   - `agent.attached {agent_id, space_id, by, catch_up}`
   - `agent.released {agent_id, space_id, by, reason: archived | deleted | moved | agent_archived}`
   - `agent.fork {agent_id, space_id, by}`: make a copy. The harness registers it with
     `forked_from`, then attaches it to `space_id`.
5. **The + asks a harness for a new agent.** `space.created` keeps `asked_of: hrn_…`. The
   harness registers a new agent (for Jacobian, J makes the Space) and attaches it to the room.
   That replaces the claim.
6. **Delivery is once per connection.** A message goes once to each harness with an agent in the
   room. `addressed_to` holds agent ids, and the harness hands the turn to whichever of its agents
   are named. A message for two of Jacobian's agents is one delivery and two turns.
7. **`message.new` carries `context`** (above).
8. **An agent's history is one read.** `GET /v1/agents/:id/messages?before=` returns the messages
   the agent sent or was addressed in, in rooms the reader can read. Each carries its room, and the
   stays come with it as ranges, so the client draws the dividers. Rooms the reader cannot read
   come back as counts only. It reads the projection's `addressed_to`, which already holds agent
   ids after Phase 2.
9. **The door enforces the rules:** one room per agent; the lead only in the Lead room; no agent
   into a Lead room; a held message is stored per agent and posted on its next attach.

## Moving what is there today

On his server, Jacobian is in 66 rooms: 15 open, 51 archived. Every one is keyed to a Space. One
of them is J's home. One room holds two harnesses (the room shared with OpenClaw).

- **J's home** becomes the Lead room, and J the Lead agent.
- **Each other keyed room** gets an agent for its Space: the key is the Space's id, and the name is
  the room's title.
  - An open room keeps its agent attached.
  - An archived room's agent is released, so its state is archived. Rule 9 covers it, since the
    Space was archived in Jacobian.
- **The shared room** gets the agent of the Space Jacobian made for it (`brought_into`). That is
  already one room for one Space, which is the new rule.
- **Scout and OpenClaw** each become a harness with one agent, attached where they are now.
- **History is not rewritten.** One `membership.replaced {from: hrn_, to: agt_}` per room tells
  every reader that what the harness said there before is that agent's. So Chess Game's past
  answers in its room show under Chess Game's face, and start its message history. The log keeps
  what was sent.

## What goes away

- Room keys (`external_key`), opening rooms by key, `space.claimed`, the `asked` list.
- Jacobian's `brought_into` map, `RoomTalk`'s buffer, and room-keyed `SpaceMap`. Jacobian maps
  agent ↔ Space instead.
- ADR 0069's home. It becomes the Lead room.
- The bridge's `overheard` map.
- Superseded or amended: ADR 0024 (a room per Space), ADR 0033 (two harnesses in one worktree share
  one room: its automatic joining goes, see Decided since), ADR 0066 and ADR 0069 (a room following its Space becomes rules
  3, 5 and 9), and ADR 0081's delivery (point 6 above; the rules of who a message is for stand).

## Phases

The phases are in [the plan](agents-plan.md), which supersedes the table first drawn here:
0 the two ADRs; 1 context with the turn; 2 agents on one connection; 3 the adapters speak as
agents; 4 one room per agent; 5 the Agents tab and message history; 6 fork; 7 cleanup.

## Decided since

1. **Two harnesses in one worktree** (ADR 0033). This needs nothing new. Two harnesses in one room
   is one agent from each, which the model has. ADR 0033 added one more thing: a harness that
   opened a room by a worktree's path, marked shared, was put into the room another harness had
   already opened for that path, with no person involved. Only the Claude Code bridge did that,
   and it was removed on 7 September (ADR 0041). No room on his server has a shared key. So the
   automatic joining goes with room keys, and a person adds the second agent.
2. **A room left with no agents** stays open with the notice in rule 10.
3. **An agent's message history** (rule 11), asked for on 29 September.

## Open questions

1. **A fork's name.** Recommendation: the harness names the copy. Chips shows *Chess Game · fork*
   until it does.
2. **Other people in the Lead room.** They can read and talk. Jacobian answers only its owners
   today (`isAuthorized`), so J will not act on what they ask unless Jacobian widens that. That is
   Jacobian's rule, not Chips's.
