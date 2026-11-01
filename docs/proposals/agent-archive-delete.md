# Archive and delete an agent

Asked for by Arjun on 2 October 2026: "we need a way to delete and archive agents from the Agents
tab". The recommendations below wait for his picks. The mock is a private Artifact, kept out of the
repo: https://claude.ai/artifact/JVNW8WQozDxtGgBWcFBRQX.

## Where things stand

- **Archived.** An agent is archived only by its harness today (ADR 0087, rule 9): Jacobian
  archives a Space, its agent leaves its room, and the room is archived when the agent was the only
  one there. Archiving a *room* frees its agents (rule 3). The Agents tab folds archived agents
  under *Archived · N*. Nobody can archive an agent from Chips.
- **Deleted.** Agents can't be deleted. Deleting a room, with its one agent switched to *Delete
  Chess Game in Jacobian too*, does two things: Jacobian deletes the Space, and Chips only
  *archives* the agent. That leaves it under Archived for good.
- **His Agents tab, read from the live database (read-only):**
  - Jacobian: J, 11 agents in their rooms, 1 free (Freej), 53 archived.
  - OpenClaw: 6 agents, all free (FreeOC, Oc2, Oc3, OpenClaw 4, 5 and 6).
  - Scout: 1 agent, in PO-4471.

## What he gets

- **On the phone, a row pushed left.** On the Agents tab it shows **Archive** and **Delete**. On
  the Archived page it shows **Unarchive** and **Delete**. These are the buttons, colours and
  sheet that Spaces' rows have (22 September). Archive and Delete ask first, with the agent on the
  sheet; Unarchive doesn't.
- **On the Mac,** the same three are buttons on the agent's page. They ask with the dialog that the
  room's Members panel uses.
- **Who sees them.** The harness's owner, or an owner or admin of the workspace, as for Move and
  Fork. Never on J, the Lead agent. Never for a guest. For anyone else the row doesn't slide.

## Decisions (recommended first)

1. **What Archive does.**
   - **Recommended: exactly what archiving it in its harness does (rule 9).**
     - Its work stops and it leaves its room, which says *Arjun archived Shopping.*
     - The room is archived with it when it was the only agent there. A room it shared stays open,
       and the others carry on.
     - Its harness is told: Jacobian archives the Space. OpenClaw and Scout have nothing to archive,
       so for them it is archived in Chips only.
     - Words it holds stay held.
     - **Unarchive** puts it back in the room it left, which reopens if its archive closed it.
       Jacobian restores the Space. If the room has gone, or the agent is elsewhere, it comes back
       free.
   - Alternative: Chips only, leaving the room and the harness as they are. Jacobian checks its
     Spaces every 30 seconds and would bring the agent back. Making a person's archive hold against
     the harness needs a new rule on the server, for a result that drifts from Jacobian.
2. **What Delete does to its room.**
   - What Delete does in every case:
     - It disappears from the Agents tab and from every list that offers agents, on every screen.
     - Its work stops and it leaves its room, which says *Arjun deleted robin.*
     - What it said stays in the rooms, under its name and face, as a removed harness's words do
       (ADR 0078).
     - Its harness deletes its side: Jacobian deletes the Space. When the person deleting isn't
       the Space's owner, Jacobian archives it instead, as the room sheet's switch does today.
     - Words it holds are dropped.
   - **Recommended:** when it was the room's only agent, the sheet offers **Delete the room "robin"
     too**, on by default. On, the room is erased as Spaces' Delete erases it. Off, the room is
     archived, as Archive would leave it. This mirrors the room sheet's *Delete robin in Jacobian
     too*.
   - Alternative: no switch. The room is always archived, and you delete it from Spaces as a second
     step.
3. **Deleted stays deleted.**
   - **Recommended:** if its harness registers the same key again, Chips refuses (`agent_deleted`).
     - Jacobian won't try: the Space is gone.
     - The bridge registers OpenClaw's `main` every time it starts, so it skips a refused key
       rather than bringing Oc2 back as a new "OpenClaw".
     - One exception is an agent Chips made itself for a harness, keyed by the harness's own id
       (FreeOC). Chips makes a fresh one the next time OpenClaw is added to a room by name.
   - Alternative: the same key makes a new agent with a new id and no history. That is honest
     about OpenClaw still having `main`, but Oc2 comes back after every bridge restart.
4. **Where, on the phone.**
   - **Recommended:** the swipe only, as Spaces has it.
   - Alternative: *Archive* and *Delete* rows at the foot of the agent's card as well, under Move
     and Fork. That adds a second way in, and the sheet is the same.

Smaller things that follow from these, not asked:

- Room Delete with *Delete … in Jacobian too* switched on will delete the agent in Chips as well,
  instead of leaving it archived.
- Adding a harness to a room by name brings its archived default agent back.
- A deleted agent can't be attached, moved, forked, renamed or given a face.

## What it costs

No migration: `participants.removed_at` is already there for agents, and the tab already hides an
agent that has one.

- **Chips server.**
  - Archive and Unarchive are one `agent.updated {state}` with the person as its actor. The rule
    9 reaction already takes it out of its room and archives the room; it changes to name the
    person. Unarchive also brings it back into a room that is still open.
  - Delete is a new event `agent.deleted`, its projection, the door's refusals, held words dropped,
    and the room switch, which reuses erase.
  - Routes `POST /v1/agents/:id/archive`, `…/unarchive` and `DELETE /v1/agents/:id`.
  - The fake server, docs, matrix rows, and ADR 0095.
- **Core:** store methods, who may, and the sheets' words (`agentArchiveAsking`,
  `agentDeleteAsking`).
- **Phone:** `SwipeRow` around `AgentRow` on the tab and the Archived page, and `ConfirmSheet`
  with the agent's face.
- **Mac:** buttons and `ConfirmDialog` on the agent's page.
- **Jacobian, two handlers.**
  - A person's `agent.updated` archives or restores the Space.
  - `agent.deleted` deletes it, then forgets the key.
  - Committed on his word; he restarts Jacobian.
- **The bridge, two handlers:** forget a deleted agent, and skip a refused key. He restarts it.

Order of going live, each step on his word:

1. Jacobian and the bridge. Their new handlers do nothing until Chips sends the new events.
2. Chips: a 4431 restart with no migration, then the dist, the phone and the Mac app.

If he'd rather go smaller first: Archive and Unarchive alone is about half the work and has no new
event. Delete would follow.
