# 0095. A person archives or deletes an agent

Date: 2 October 2026
Status: Accepted, 2 October 2026. Amends 0087 (rule 5's switch, rule 9, and the moment table) and
builds on 0078 (what a removed harness leaves behind) and 0066/0067 (a room archived, a room
erased). The proposal is `docs/proposals/agent-archive-delete.md`.

## Context

Arjun asked for "a way to delete and archive agents from the Agents tab". Only a harness could
archive an agent: Jacobian archives a Space, its agent leaves its room, and the room is archived
when the agent was the only one there (ADR 0087, rule 9). Nobody could delete one. Deleting a
room with *Delete Chess Game in Jacobian too* switched on deleted the Space but only archived the
agent in Chips, where it stayed under Archived for good.

His tab on 2 October:

- **Jacobian:** J, 11 agents in rooms, 1 free, and 53 archived.
- **OpenClaw:** 6 agents, all free.
- **Scout:** 1 agent.

He took every recommendation in the mock, and asked for the two acts on the agent's card as well
as on its swipe.

## Decision

1. **Who.** An agent is archived, unarchived or deleted by its harness's owner, or by an owner or
   admin of the workspace, as it is moved or forked. Never by a guest, and never by a harness:
   a harness archives its own by registering it so. The Lead agent is none of these: it stays in
   its Lead room (rule 7).

2. **Archive is rule 9, done by a person.**
   - Chips writes `agent.updated {state: "archived"}` with the person as its actor.
   - What rule 9 does then follows unchanged:
     - The agent's work in its room stops.
     - It leaves the room (`agent.released`, reason `agent_archived`, by the person). The room
       says *Shopping was archived by Arjun.*
     - The room is archived with it when no other agent was there.
   - Words it holds stay held.
   - Its harness hears the person's `agent.updated` and archives its side: Jacobian archives the
     Space. A harness with no side to archive, like OpenClaw or Scout, leaves it; the agent is
     archived in Chips alone.
   - Jacobian archives the Space as it hears the archive, so its own sync agrees. A harness that
     registered the agent as active again would bring it back, as a harness's restore always has
     (ADR 0087's second addendum, point 3). That is why the harness's half goes live first.

3. **Unarchive puts it back.**
   - Chips writes `agent.updated {state: "active"}` with the person as its actor.
   - The agent goes back to the room its archive took it from:
     - The room reopens if the archive closed it, as before.
     - It is put back if the room stayed open, which is new.
     - It comes back free if the room has gone, or if the agent has been put somewhere since.
   - Its harness restores its side.

4. **Delete takes it out of Chips.**
   - Chips does these, in order:
     - Stops its work.
     - Takes it out of its room (`agent.released`, reason `agent_deleted`, by the person). The room
       says *robin was deleted by Arjun.*
     - Writes `agent.deleted`.
   - The agent is then gone from every list that offers or shows agents, on every screen.
   - What it said stays in the rooms it was in, under its name and face, as a removed harness's
     words do (ADR 0078).
   - Words it holds are dropped.
   - Its harness hears `agent.deleted` and deletes its side. Jacobian deletes the Space, or
     archives it when the person deleting is not the Space's owner, as rule 5's switch did.
   - **The room.** When the agent was the only one in its room, the sheet offers *Delete the room
     "robin" too*, switched on, to a person who may delete that room (ADR 0067).
     - On, the room is erased.
     - Off, the room is archived, as an archive would have left it.
     - A room the agent shared stays open, and the others carry on.

5. **Deleted stays deleted.** Chips refuses `agent_deleted` to anything that would bring it back
   or speak as it: registering its key again, adding, attaching, moving, forking, renaming, giving
   it a face, archiving it, and a harness sending anything as it.
   - The one exception is an agent Chips made itself for a harness, keyed by the harness's own id
     (ADR 0087's addendum, point 5). Chips makes it afresh, under a new id, the next time it needs
     one: the harness added to a room by name, say.

6. **Rule 5's switch deletes the agent.** Deleting a room with *Delete Chess Game in Jacobian too*
   switched on now writes `agent.deleted`, not an archive. `agent.released` no longer carries
   `delete`; logs that hold it keep it, and harnesses read either.

7. **Where.**
   - **The phone.** A row pushed left on the Agents tab shows Archive and Delete. On the Archived
     page it shows Unarchive and Delete. These are Spaces' buttons, colours and sheet.
   - **The phone's card.** An agent's card has the same acts at its foot, under Move and Fork:
     Archive or Unarchive, and Delete. They open the same sheet, which asks first for Archive and
     Delete but not for Unarchive.
   - **The Mac.** The agent's page has the three as buttons. They ask with the dialog that the
     room's panel uses.

8. **The wire.**
   - `PUT /v1/agents/:id/state {state: "archived" | "active"}`, beside `…/name` and `…/face`.
   - `DELETE /v1/agents/:id`, with `{delete_room: true}` for the switch, as
     `DELETE /v1/spaces/:id` takes `{delete_agent: true}`.
   - **`agent.deleted {agent_id, harness_id, name, by}`.**
     - It has no space.
     - It is seen by the agent's harness and by whoever sees the directory, as `agent.updated` is.
     - Clients read the directory again when it arrives.
   - **The release reason `agent_deleted`.**
   - **The refusal `agent_deleted`.**

## Consequences

- His six free OpenClaws and the Jacobian Spaces he has finished with can go from the tab, and
  their rooms with them.
- An agent archived by a person in a harness that has no archive of its own (OpenClaw) stays
  archived in Chips until a person unarchives it. The bridge never says otherwise.
- **The bridge.** OpenClaw's `main` is registered each time the bridge starts. Once deleted, it is
  refused, and the bridge skips it rather than stopping. OpenClaw keeps its own conversation with
  it.
- **Jacobian and the bridge** each gain two handlers: a person's archive or unarchive, and a
  delete. They go live before Chips: until Chips writes the new events, nothing calls them.
- **No migration.** An agent's `participants.removed_at` was there already, and every read of an
  agent's removal reads it.
