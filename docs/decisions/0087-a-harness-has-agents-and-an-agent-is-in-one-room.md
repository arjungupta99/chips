# 0087. A harness has agents, and an agent is in one room at a time

Date: 29 September 2026
Status: Accepted, 29 September 2026. Supersedes ADR 0024's decision 3 and its addendum of 5 September where they
make each of Jacobian's Spaces a room. Amends 0029 (decision 3), 0033 (decisions 1 and 2), 0066,
0069, 0077 (point 3, and the plan's open decision 8, which it left for later) and 0081 (delivery;
who a message is for is unchanged). The proposal is `docs/proposals/agents.md`; the build is the
phased plan in `docs/proposals/agents-plan.md`. Extended by 0089 (an agent's face) and 0108 (a new
agent asked for in a room). Amended by
0095 (a person archives or deletes an agent: rule 9 by a person, and rule 5's switch deletes it). Five
addenda: 29 September, 30 September, 1 October 2026 (what the review of Phases 1 to 6 changed),
8 October 2026 (the Lead agent and Lead room are called the Main agent and Main room), and
19 October 2026 (an agent's card says what its waiting words are, under them).

## Context

Arjun, 29 September 2026: "allow adding multiple agents of each harness into Chips rooms. That
also means we would not have 1:1 linkage of Chips room to Jacobian room."

Today a participant that is not a person is a harness: the software, with one face.
- **Jacobian is one participant.** Every Space speaks as "Jacobian", and a room holds Jacobian at
  most once.
- **Each Space is a room.** Jacobian opens a room per Space under a key (ADR 0024, decision 3, and
  its addendum), and the room and its Space follow each other: archived together (ADR 0066), and
  deleting the room deletes the Space. J's room is a home that is never put away (ADR 0069).
- So **a room cannot hold two of Jacobian's Spaces**, and a room a person shares with Jacobian
  and another harness makes Jacobian quietly create a Space for it (`brought_into`).
- **Each of OpenClaw's agents needs a harness and a token of its own**, because a connection
  speaks for one participant. That is the plan's open decision 8, which ADR 0077 left for later.

The blueprint meant otherwise from the start: "One connection can present many agents… a
gateway-style harness shows as several agents sharing one link status." ADR 0024 set that aside
on 4 September, when a Space was taken to be a room ("presenting Jacobian's Spaces as several
participants on one connection is no longer the shape").

Over the conversation of 29 September he set the model, point by point:
- One Jacobian Space is one agent. Every room is just a room, and none belongs to an agent.
- **An agent is in one room at a time.** He turned down a home room per agent and turned down
  membership of many rooms.
- Archiving a room stops its agents' work and releases them, and each is told. Unarchiving brings
  back the ones still free. One that is elsewhere by then shows as elsewhere, with Move back or
  Fork, and adding an agent that is elsewhere offers the same.
- **J is the Lead agent**, only ever in its Lead room, which takes people and no other agent.
- A free agent's task is stopped; what it still says is held until it is attached.
- When J hands work to a free Space, the Space gets a room with the person who asked.
- Delete releases the agents too, and can delete a room's only agent in its harness.
- A Space archived in Jacobian leaves its room, and the room is archived when it was the only
  agent there.
- A room left with no agent stays open and says so.
- The Harnesses tab becomes Agents, and each agent has a message history across its rooms.

He chose a participant kind of its own for agents: "go with the new type". The alternative kept
agents as `harness` participants and moved the token to a new connection record. It was less
change, but every name would have said the wrong thing.

On his server on 29 September, read-only: Jacobian has opened and keyed 66 rooms (15 open, 51
archived), one of them J's home and one shared with OpenClaw. OpenClaw's one harness is in 4
rooms. No room has a shared key.

## Decision

1. **The words.**

   | Word | Meaning |
   | --- | --- |
   | **Harness** | The software and its connection: token, owner, autonomy, budget, link status. |
   | **Agent** | Who takes part in rooms: a face, a name, an @handle. A harness has one or more. For Jacobian: J, and each Space directly under J. For OpenClaw: each agent its gateway lists. |
   | **Lead agent** | The one agent a harness may mark as its lead. J is Jacobian's. The label is generic, and a harness without a lead has none. |
   | **Lead room** | The Lead agent's room. It takes people, and no other agent. |
   | **Attached** | In a room. An agent is attached to at most one. |
   | **Free** | In no room. It keeps its memory and can be attached again. |
   | **Released** | Taken out of its room by an archive, a delete or a move, and told so. |
   | **Move** | Take an agent out of its room and attach it to this one. The room it left says so. |
   | **Fork** | Ask the harness for a copy of an agent, attached to this room. The copy remembers everything up to the fork; after that, the two remember separately. |

2. **An agent is a participant of its own kind.**
   - **Its kind.** `agent`, with ids `agt_…`, beside `person` and `harness`. It carries its
     harness, the harness's key for it, its name, whether it is the lead, what it was forked
     from, and its state (active or archived). Whether it is attached, and where, is its
     membership.
   - **What stays with the harness.** The token, the owner, the autonomy dial (per room, as
     today), the budget and the link status. The budget rolls up its agents' runs, as it rolls up
     lanes (ADR 0029, decision 5). An agent can't answer when its harness can't (ADR 0083), so a
     harness's agents share one link status.
   - **The harness leaves rooms.** Once existing rooms have moved (point 9), a harness is a member
     of none and speaks only as its agents.
   - **One connection speaks for all its agents.** `hello` lists the harness's agents. Everything
     a harness sends names one of its own agents as `actor`, and the server refuses any other. A
     harness may keep sending its own `hrn_` id in a room where it has exactly one agent; the
     server reads it as that agent. That keeps a harness written before this working unchanged.
   - **A harness registers its agents by its own key.** For Jacobian the key is the Space's id.
     Registering a key twice returns the same agent, renamed when the name has changed.
   - `agt_` was the harness's prefix before the rename of 4 September (ADR 0024's addendum). No
     log holds one: that rename deleted every database made before it, and his log of 29
     September has none.

3. **The rules.**
   1. **An agent is in at most one room.** A room holds any number of agents, from any harness,
      and people. The server refuses a second attachment, and the clients offer Move or Fork
      instead.
   2. **Rooms own nothing, and agents own no room.** A room has no key. A harness finds its
      agents by its own key, and their rooms through membership. A room with no title is named
      after its agents, as a direct room is named after the other person, so renaming a Space
      renames its room with nothing to sync.
   3. **Archiving a room stops its agents' work and releases them.** Chips cancels every run
      going on in the room, and the lanes those runs opened. Then each agent is released and
      told. The room keeps its history and its people.
   4. **Unarchiving brings them back.** Each agent the archive released that is still free is
      attached again. One attached elsewhere shows in the room as elsewhere, with Move back and
      Fork.
   5. **Deleting a room releases its agents too.** When the room has one agent, the sheet also
      offers *Delete Chess Game in Jacobian too*. ADR 0069's "gone on both sides" becomes a
      choice.
   6. **What an agent says while free is held.** Its task was stopped (rule 3), so this is the
      rare case: a scheduled job not tied to a run, or a harness that ignored the cancel. Its
      messages wait, its row on the Agents tab says *1 waiting*, and they are posted in the next
      room it is attached to.
   7. **The Lead agent is only in its Lead room.** The server refuses to add it anywhere else, and
      refuses to add any agent to the Lead room. People can be added. A harness marks at most one
      agent as lead. A Lead room is never archived or deleted, as a home is not today.
   8. **The lead's hand-off follows the agent.** When J hands work to a Space, the lane lives in
      that Space's room, and the route card is in the Lead room. When the Space is free, Chips
      opens a room with the person the work is for and attaches the Space there. This is rule 6's
      one exception, because a person asked for it.
   9. **An agent archived in its harness leaves its room.** When it was the room's only agent, the
      room is archived too, so the list still follows Jacobian. A room it shares with other agents
      stays open and shows it as gone.
   10. **A room with no agent says so.** When its only agent moves away, is released or is
       archived in its harness, the room stays open with its history and its people. A notice
       sits above the field: *No agent in this room. Chess Game moved to Openings prep. Messages
       here reach people only.* It offers Move back, Fork and Add an agent. It is amber, as
       *can't answer* is (ADR 0083), and it stays until an agent is attached. An archived room
       shows the archive bar instead.
   11. **An agent's message history is on its card.** Agents, then the agent, then Message
       history: what it was asked and what it answered, in every room it has been in, oldest
       first. Each stretch in a room sits under a divider with the room's face, name and dates
       (*Engine eval · 25–29 Sep*), and the room it is in now is marked *now*. A reader sees only
       rooms they can read; any other room is a divider and a count (*2 messages in a room you're
       not in*). A fork's history starts at the fork, with a line pointing to the original. A
       room shows only what was said in it, never an agent's words from another room.
   12. **Only what a harness declares is offered** (ADR 0077). Fork is offered only for a harness
       that declares `forks`, and the delete sheet's extra line only for one that declares
       `follows_rooms`.

4. **Who may do what.**
   - **Add a free agent to a room:** any member of the room but a guest, as adding a harness is
     today.
   - **Move or Fork:** the agent's harness owner, or a workspace owner or admin. A move takes the
     agent out of a room other people may be using, and a fork spends the harness's budget. Other
     members see the agent as elsewhere, and can ask.
   - **Archive and delete:** unchanged (ADR 0066, ADR 0067).

5. **What each moment does.**

   | Moment | Chips does | The harness hears | The room shows |
   | --- | --- | --- | --- |
   | Agent added, free | attaches it | `agent.attached`, with a catch-up (ADR 0088) | *Arjun added Chess Game* |
   | Agent added, elsewhere → Move | releases it there, attaches it here | `agent.released` (moved), then `agent.attached` | here, *…added Chess Game*; there, *Chess Game moved to Openings prep* |
   | Agent added, elsewhere → Fork | asks for a copy | `agent.fork` | *Forking Chess Game…*, then the copy joins |
   | Room archived | cancels its runs, releases its agents | `run.cancel`, then `agent.released` (archived) | *Arjun archived this. Chess Game's reply was stopped.* |
   | Room unarchived | attaches again the ones still free | `agent.attached` | the ones back; each one elsewhere as a row with Move back and Fork |
   | Room deleted | releases its agents, and deletes the agent when the sheet said so | `agent.released` (deleted) | the room is gone |
   | Agent archived in its harness | releases it, and archives the room when it was the only agent | — | *Chess Game was archived in Jacobian* |
   | Free agent speaks | holds the message | — | the Agents tab, *1 waiting* |
   | J hands work to a Space | the lane in the Space's room, a new room when it was free | `run.requested` | the Lead room, the route card; the Space's room, the task |

6. **The + asks a harness for a new agent.** `space.created` keeps `asked_of`. The harness asked
   registers a new agent (for Jacobian, J makes a Space) and attaches it to the room. That
   replaces the claim (`space.claimed`). When several faces are picked (ADR 0084), each harness
   picked is asked for a new agent, and the first one's names the room. A harness that cannot
   make one attaches the agent it has; when that agent is elsewhere, the room shows rule 10's
   notice with Move.

7. **Chips keeps the room; the harness keeps the agent.** The room's words are Chips's, and every
   member reads the same copy. The agent's memory is its harness's: for Jacobian, the Space's
   thread, notes and files. That is ADR 0024's decision 8, unchanged. How an agent keeps up with
   a room is ADR 0088.

8. **Delivery moves to agents; who a message is for does not change.** ADR 0081's rules read
   *agents* where they said *harnesses*:
   - `addressed_to` holds agent ids. An agent's @handle is its name without spaces, and `@all`
     names every agent in the room.
   - The guard of four counts messages agents address to agents.
   - A message goes **once to each connection** with an agent in the room. `message.new` and
     `message.overheard` gain `for`, the connection's own agents the message is addressed to, and
     the harness gives each of them a turn. A message for two of Jacobian's agents is one
     delivery and two turns.

9. **What is there today moves by appended events; nothing is rewritten.**
   - For each room a harness opened by key, it gets an agent: the key is the room's key, the name
     the room's title.
   - J's home becomes the Lead room, and J the Lead agent.
   - An archived room's agent is archived (rule 9: its Space was archived in Jacobian).
   - Scout and OpenClaw each get one agent, in the rooms they are in now.
   - One `membership.replaced {from: hrn_…, to: agt_…}` per room says that what the harness said
     there is that agent's. Chess Game's past answers then show under Chess Game's face and start
     its message history, and the log keeps what was sent.
   - The upgrade shows a dry run first and runs on his word. The one-room rule reaches the door
     after it, so an agent in several rooms today (OpenClaw's) is settled by a second dry run, on
     his word.

## Consequences

- **What this supersedes and amends:**
  - **ADR 0024.** Decision 3 and its addendum's "J and the Spaces directly under J are spaces"
    now read *agents*. The worker level below them stays lanes. The consequence that set aside
    "a Space is an agent with its own conversation" is reversed.
  - **ADR 0029, decision 3.** A lane's home is the specialist agent's room, or one Chips opens
    with the person when the agent is free (rule 8).
  - **ADR 0033.** A shared key, and a second harness joining the room the first opened by it, go
    with room keys. Only the Claude Code bridge used it, and it was removed on 7 September (ADR
    0041). Two harnesses in one room is one agent of each, added by a person.
  - **ADR 0066.** A room following its Space becomes rules 3, 4 and 9. `moved_by` and the
    adapter's 30-second pass over its rooms go with room keys.
  - **ADR 0069.** The home becomes the Lead room. A delete reaches the harness only when the
    sheet says so (rule 5).
  - **ADR 0077.** Point 3's lane lands in the agent's room. The plan's open decision 8 is
    decided: one connection speaks for many agents.
  - **ADR 0081.** Delivery, as point 8 says. Its rules of who a message is for stand.
- **A harness with one agent is in one room at a time.** Scout, and OpenClaw's bridge as it is
  today, can no longer be in several rooms at once. A harness that wants to be needs several
  agents: it makes them when asked (point 6), forks, or registers each agent it runs, as
  OpenClaw's bridge will for its gateway's agents.
- **Archiving now stops work.** The archive sheet says so, by name.
- **An erased room leaves every agent's history.** Erase deletes a room's events (ADR 0067), so
  its stretch goes from the history with them.
- **A removed harness takes its agents with it** (ADR 0078). Their names stay on their history,
  as its name does, and its Lead room stops being one, as its home does.
- **People in the Lead room can read and talk there.** Whether J acts on what they ask is
  Jacobian's rule (it answers only its owners today), not Chips's.
- **A fork's name is the harness's.** Chips shows *Chess Game · fork* until the harness names it.
- **Budget and autonomy stay per harness.** A per-agent budget can come later without a change to
  the wire.
- **The wire grows; nothing is renamed in place.**
  - The participant kind `agent` and the prefix `agt`.
  - Events: `agent.registered`, `agent.updated`, `membership.replaced`, `agent.attached`,
    `agent.released`, `agent.fork` and `message.held`.
  - `hello` lists agents; `message.new` and `message.overheard` gain `for`.
  - Routes: `POST` and `GET /v1/harnesses/:id/agents`, `POST /v1/agents/:id/move`, and `GET
    /v1/agents/:id/messages`.
  - The capability `forks`.
  - Opening a room by key, `space.claimed` and the `asked` list keep working until the last
    phase, which answers 410 for the first and keeps the others readable for old logs.
- **Chips still names no harness.** *Lead agent* is a generic label, and the sheets build their
  words from the harness's name.
- **Not decided here:**
  - Continuity: ADR 0088.
  - A budget per agent.
  - Where a free agent's scheduled output goes when its harness ignores the cancel, other than
    held.
  - The phone's room sheet, which gets a mock drawn from the real app's screens first.
  - How Jacobian copies a Space for a fork, which is its own design.

## Addendum, 29 September 2026: a harness that has not learnt agents

Point 2 keeps a harness written before agents working when it *sends*: its `hrn_` id is read as
its agent in the room. An audit of Jacobian's adapter and OpenClaw's bridge, as they are, found
what they *read* would break too, and five things the plan did not say. Arjun took each
recommendation ("rest go with your recommendation").

1. **A harness says it speaks agents by declaring `agents`** (ADR 0046's list, stored on the
   harness, as `follows_rooms` is). Until it does, everything Chips hands it, on the socket and
   over HTTP (`GET /v1/events`, `/v1/participants`, `/v1/harnesses/:id/spaces`, the context
   route), is the view it knew:
   - its own agents are its `hrn_` id, wherever an id is written: `from`, `actor`,
     `addressed_to`, `mentions`, the lines of `context`, `resolved_by`, `answered_by`, a
     membership's `participant_id`;
   - any other agent is a participant of kind `harness`, under its own id, and
     `/v1/participants` names it so, with its harness's owner as `owner_id`;
   - no `for`, and none of `agent.registered`, `agent.updated` or `membership.replaced`.

   A flag in `hello` was the first idea. It could not reach the HTTP reads: Jacobian learns a
   room's members and a room's brief from `GET /v1/events`, and whose agent is whose from
   `/v1/participants`.
2. **A harness's name is a handle for its one agent in a room.** `@Jacobian` names Jacobian's
   agent in a room where Jacobian has exactly one, whatever that agent is called; so does
   Jacobian's `hrn_` in `to`. After the upgrade Jacobian's agents are named after their rooms
   ("J", "Hello"), and people and other agents write `@Jacobian`. It is point 2's rule for the
   actor, applied to addressing. Where the harness has several agents in the room, its name
   names none of them.
3. **An `hrn_` in a task's `to` is its agent in the lane's home.** Jacobian opens a lane to
   itself (`task {to: hrn_…, home: <the Space's room>}`); the lane's specialist is the
   harness's one agent there.
4. **A keyed room is its own agent only for a harness that declares `follows_rooms`.** Point 9
   said every keyed room gets an agent. OpenClaw's bridge keys the rooms it claims from the +
   too, one OpenClaw session per room (`agent:main:chips-spc_…`), which is not an agent of its
   own. A harness that follows its rooms keys them by the thing it keeps for each, a Space for
   Jacobian, and that thing is the agent. Any other harness gets one agent, named after itself,
   in every room it is in. On his server: Jacobian 66 (J as Lead and 65), OpenClaw 1 in its 4
   rooms, Scout 1.
5. **Rooms made after the upgrade hold agents, not harnesses.**
   - A room a harness opens by key holds the key's agent (for a harness that follows its rooms,
     named by the room's title) or its default agent, registered when first needed.
   - A room asked of a harness from the + holds the harness until it claims it. The claim
     appends `membership.replaced`, from the harness to the key's agent or the default one, as
     the upgrade does.
   - A harness added to a room, including the direct room opened when it is added, is its
     default agent.
   - The add list goes on offering harnesses until Phase 4. Adding a particular agent that is
     in another room is Phase 4's Move, and a harness that has not learnt agents cannot tell one
     of its agents from another.

## Addendum, 30 September 2026: one room per agent, as Phase 4 builds it

An audit before Phase 4, of his database (head seq 11019), Jacobian's channel and the OpenClaw
bridge, found eight things the rules above left open. Arjun took each recommendation ("rest go
with your recommendation").

1. **`chipsd upgrade one-room` settles two groups, dry run first and applied on his word.**
   - An agent still in a closed room is released from it, and the room is kept as its
     `released_from`, so unarchiving the room brings it back. On his server that is Jacobian's 51
     archived agents: 49 in rooms Jacobian archived (`agent_archived`) and 2 in rooms he did
     (`archived`).
   - An agent in more than one open room is settled by point 2 where a room has a key or is the
     harness's direct room, and otherwise keeps the room with the latest activity and is
     released from the rest.
2. **A claim makes the key's agent, for every harness.** The first addendum's point 4 gave a
   keyed room its own agent only for a harness that declares `follows_rooms`. From Phase 4 a
   claim from the + makes the claim key's agent whatever the harness declares, named after the
   harness, and a harness's direct room holds its default agent. So a harness that cannot make
   agents (Scout, or any SDK harness) still gets one per room it is asked for, and keeps working
   unchanged.
   - **OpenClaw:** each room gets an agent of its own, all run by the gateway's `main`, each on
     the session its room already has (the bridge claims under the session key,
     `agent:main:chips-<room>`). Nothing changes in OpenClaw. The upgrade gives the two rooms
     asked from the + their key's agents and the direct room its default agent, and the room
     shared with Jacobian keeps `main`. A gateway agent per room (`agents.create`) was the
     alternative: separate memories, but OpenClaw's configuration grows by one agent a room.
3. **Jacobian stops opening and following rooms in Phase 4.** Once an agent can move, a room's
   key no longer says where its Space is. A Space's room is its agent's room, from the agents
   list and `hello`. Chips moves the rooms: rule 9 archives a room when its only agent is
   archived in its harness, and, added here, **an agent restored in its harness goes back to the
   room its archive closed, and the room reopens**. A person's archive reaches Jacobian as
   `agent.released (archived)`, and an unarchive as `agent.attached`, in place of its own pass
   over its rooms.
4. **What a free agent says.** A `message.post` from an agent in no room is held, whether it names
   no room or the room it left. One naming a room it has left while it is in another is refused,
   as today. A harness that has not declared `agents`, posting as itself into the room its one
   agent left, is held as that agent. **An agent that has never been in a room** (a Space made in
   Telegram) is rule 6's other exception: its first words open a room with its harness's owner,
   as rule 8's hand-off does.
5. **No default agent is archived.** Point 2 gives each one a room.
6. **Several faces in the +.** `space.created` gains `also_asked_of`, the other harnesses asked.
   Each is held in the room, as the first is, until it answers with a new agent: its own,
   attached in its place, or the one its claim makes. Only the first names the room.
7. **`home` stays.** It stays on the wire and in the read model. A Lead room is a home that holds
   its harness's lead agent. The lead goes into no other room, no other agent goes into it, and
   it is never archived or erased, as a home is not.
8. **The door holds on every path.** Besides `authorize.ts`: opening a room by key and a claim, a
   harness's direct room, and a lane's home. The hand-off's room is opened under a new key each
   time, since the old one would find an archived room again.

Found beside these, and Jacobian's to change: its stop is per person, so a `run.cancel` for one
room stops every live turn of that person, and a cancel for a lane's run is ignored. Archiving
now stops work, so Phase 4 makes both per turn.

## Addendum, 1 October 2026: what the review of Phases 1 to 6 changed

`docs/reviews/agents-review.md` read the six built phases against this ADR and ADR 0088. The
rules above stand. What changed is where they are kept and how they are held, and a few things
the wire says. Arjun's word was "proceed with the fixes"; four findings are decisions and are
left open at the end.

1. **Who sends an event is the catalogue's to say** (findings 1 and 2). Every event declares its
   `sender`: a harness, a person, either, or Chips alone. The door, the conformance fake and the
   tests read it from there. Before, an event with direction `workspace` was a person's unless a
   hand-kept list said otherwise, and `agent.registered`, `agent.updated`, `membership.replaced`
   and `agent.fork` were on no list: any person could write them. They are Chips's own now. The
   fields Chips writes on an event a sender does send (`held_since`, `from_held`, `moved_from`,
   `fork_of`, `reason`, `moved_to`) are dropped from what the sender wrote (`chipsWrites`), and
   `removed_by` is stamped from the credential.
2. **One function decides where an agent may be, and the store asks it** (findings 5 to 9).
   `refuseAgentInto`, in the protocol package: the room is there and open, a Lead room takes its
   Lead agent and no other agent, the Lead agent's place there is not taken, and the agent is in
   no other room, open or archived. The store asks it inside the append's transaction, of every
   event that puts an agent in a room, so point 8 of the second addendum ("the door holds on
   every path") is true by construction and two actions at once cannot both pass. New on the
   wire: the refusal `room_closed`, for an agent added to an archived room. The upgrades write
   past it, and a replay does not come through it.
3. **The Lead agent stays** (findings 8 and 9). A person does not take it out of its Lead room, a
   harness's `attach` does not put another agent in its place, and its harness does not archive
   it: registering it with `state: "archived"` is refused.
4. **Leaving a room stops the work, whatever the reason** (findings 10 and 12). An agent's runs in
   the room it leaves are cancelled, with the lanes they opened, before the leaving is written,
   while its harness is still in the room to hear: for an archive, a move, a delete, a person's
   removal, and the agent being archived in its harness. Rule 3 said so for an archive, and
   point 4 of the decision for a move. A `message.post` naming a room that is gone is refused,
   and not held for the next room.
5. **What a restart cut is finished at the next start** (finding 7). Before it listens, the
   server releases any agent still in an archived room, and ends any run still going in an
   archived room or by an agent no longer in the run's room. A claim, a hand-off's room and an
   agent's first room finish their own members when asked again.
6. **`for` names who takes the turn, the harness itself included** (findings 15, 17 and 31).
   `for` on `message.new` is never empty. It holds the connection's agents the message is for,
   or the harness's own id where the harness is the member addressed, which it is in a room
   asked of it from the + until it claims the room. It was `[]` there, and the OpenClaw bridge
   took no turn. One delivery for several of a harness's agents carries one context, from the
   oldest of their marks, so lines repeat and never leave a gap, as ADR 0088 says. A harness in
   `also_asked_of` is sent the `space.created`, as the one in `asked_of` is.
7. **An agent's registration and changes have an audience** (finding 3). `agent.registered` and
   `agent.updated` name no room and went to everybody. They go to the agent's harness, to people
   who are told who everybody is (anybody but a guest), and to whoever shares a room with the
   agent. A `message.post` that names no room, and no run that has one, is refused; an agent in
   no room is still held.
8. **A hand-off's room is keyed by the agent's last leaving** (finding 14), not by the room it
   left: released from the same room twice, the second hand-off opens a room of its own.
9. **A deleted room leaves nothing a device is sent that names it** (finding 11). The release of
   its agents goes to their harness alone, the directory names no last room that is gone, and
   the apps' model does not make an erased room again.
10. **Deleting a room's agent in its harness too** (finding 4) is for the harness's owner or an
    owner or admin of the workspace, as a move and a fork are. Anybody else who may delete the
    room deletes the room, and the agent is freed.
11. **The fake follows the server by test** (finding 37). Fourteen scenarios are played against
    the real server and the conformance fake, and what the harness's socket was sent has to
    match. The rules above that are pure functions (`sender`, `refuseAgentInto`, `canSee`,
    `takersOf`) are the protocol's, and both call them.

One line of the second addendum is out of date since the same evening. Its point 2 says the
OpenClaw bridge claims a room under the room's session key, `agent:main:chips-<room>`. That is
also the session of the gateway's own `main` in that room, so `main` added to a room the bridge
had claimed was the same conversation as the claim's agent, and a message for both got one
answer. The bridge now claims under `agent:main:chips-<room>:asked` (its commit `c5b6ead`).
Chips knows only that a key is the harness's own, so nothing here changed.

Not decided here, and Arjun's:

- **Unarchive and an agent archived in its harness** (finding 18). An unarchive brings back
  every agent the archive released that is still free, one archived in its harness included.
- **Archive, for a harness that follows its rooms** (finding 19). Chips frees the agent; Jacobian
  archives the Space, which archives the agent, so it is not "free to join another room" as the
  sheet says.
- **A late copy** (finding 20). A fork's copy registered after the minute stays free. Whether it
  may still join while its ask is the room's newest is open; the apps now ask once.
- **An agent's end** (finding 40). An agent is active or archived, and nothing removes one.

## Addendum, 8 October 2026: the Main agent and the Main room

Arjun renamed this ADR's **Lead agent** and **Lead room** to the **Main agent** and the **Main
room**, for Jacobian too. Since ADR 0104 a room with several agents has a *lead*, the agent that
hands out its work and wears "Lead" beside its name. That is a role in one room, and he wants
"Lead" to keep that meaning alone. The Main agent is a harness's own: J for Jacobian.

- **The words people read** say Main: the Agents tab (*Main agent · Jacobian*), the agent's page,
  the sheets that refuse a move or a removal, the server's refusals, and the docs. So do the
  comments.
- **The wire and the code keep `lead`.** An agent's `lead` flag, the refusal kind `lead_room`,
  `participants.lead` and `home` are unchanged, so neither adapter changes. In the code an
  agent's `lead` means the Main agent; a room's `lead_id` (ADR 0104) is the room's lead.
- The text above keeps the old words, as written on 29 September.

## Addendum, 19 October 2026: what waits is said under it

Arjun, 19 October 2026, of a free agent's row: "What is the '1 waiting' label indicate". Rule 6's
words were on the agent's card, but at its foot, under its context, its history and its buttons,
and he did not find them; the card's *Waiting · 1 message* said nothing more.

- **Under the facts that count what waits**, the card says who said it and where it goes:
  *Walt said this while in no room. It's posted in the room it joins next.* (`heldNote` in core's
  `agentsTab.ts`; *these* and *They're* for more than one). On the phone it is the facts group's
  footnote; on the web and the Mac, the line under the card's facts.
- **The foot no longer says it** while that line does. A free agent with nothing waiting keeps the
  foot's *What it says while in no room waits, and is said in the next room it's in.*
- The card still counts what waits and does not show it; it is read in the room it is posted in.

## Addendum, 25 October 2026: a restore reopens only what an agent's archive closed

The security review of 25 October (SEC-48) found that an agent restored in its harness reopened
the room it was released from whoever had archived it, with an event appended past the door. A
harness that archived and restored its agent reopened a room a person had archived, and could
put a guest back in two open rooms (JR-24).

- **A room a person archived stays archived** when an agent it released is restored, in its
  harness or by a person. Unarchiving it is theirs, and brings the agent back as rule 4 does
  every agent an archive released. A room closed because its last agent was archived still opens
  again, whoever archived the agent, and so does one its harness archived itself, as Jacobian did
  before Phase 4. A JSpace restored in Jacobian after its room was archived in Chips no longer
  brings the room back; unarchiving the room does.
- **No unarchive puts a guest in a second open room**, through the door or past it. The store
  asks it inside the append's transaction (`guest-gate.ts`, beside the one-room rule), so of two
  unarchives at once that share a guest, the second is refused. A restored agent whose room is
  refused waits free for it.
