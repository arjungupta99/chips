# 0111. A person takes an agent out of a room

Date: 3 October 2026
Status: Accepted, 3 October 2026. The Name page was replaced by renaming in place (ADR 0112). The
agent's page in the sheet was replaced by the agent's card, 10 October 2026 (the addendum below).
The Mac's Members panel became the room's sheet, as the phone's is (ADR 0151, 11 October 2026),
and a person is taken out of a room by swiping their row on the phone too (JR-7, 14 October 2026):
where this record says "Members panel", read the sheet.

## Context

Arjun: "I need the ability to remove agent from a space."

Most of it was there already:

- **The server.** A person's `membership.removed` of an agent is allowed for the room's owner, or
  an owner or admin of the workspace who is in the room, and never for a guest (rule 7). The
  Lead agent stays in its Lead room (rule 17). Before the removal is written, the agent's runs in
  the room are cancelled ("The agent was taken out of the room."), then the harness hears
  `agent.released` with reason `removed` (ADR 0087, the addendum's point 4).
- **The harnesses.** Jacobian keeps the Space and archives nothing. The OpenClaw bridge marks the
  agent free and keeps its session. The agent is free, with its memory, and Add → Free puts it
  back, here or in another room.
- **The Mac.** Each row in the Members panel had a Remove button, for the room's owner only.

What was missing:

- **The phone had no way to ask.** The room sheet's agent rows did nothing.
- **The room said nothing.** Core wrote a line for a move, an archive and a delete, but none for a
  person's removal, so an agent vanished from the room without a word.

The mock ("Remove an Agent", a private Artifact) drew three ways for the phone: A, swipe the row;
B, tap the row for the agent's own page, with Remove at its foot; C, a long-press menu. Arjun:
"I need both A and B". The other two calls were kept as drawn: who may is the server's rule, and
nothing asks a second time.

## Decision

- **Each agent's row on the room sheet's first page opens the agent's page** (`AgentPage` in
  `RoomSheet.tsx`, a page of the sheet as Lead and Files are, ADR 0110). It shows:
  - the agent's face, name and harness, and "Lead agent" or "leads this room" when it does;
  - what it last said here, with the time (`lastSaid`, skipping a queued turn's account of
    itself);
  - whether it is working now (`agentWorking`: a run of its own going, or its queued turn's
    message still thinking, ADR 0090);
  - one line about Remove, and the red **Remove from <room>**.
- **The line says what happens** (`removeWords`): the agent "goes free with its memory. Add
  brings it back, here or in another room." When the agent is working, the line says
  "Removing it stops that reply" first. Where there is no Remove, the line says why
  (`noRemoveWords`): the Lead agent stays in its Lead room; otherwise it's the room owner's or a
  workspace admin's to do.
- **The page renames the agent too.** While this was being built, Arjun asked: "the agent detail
  page should also allow agent rename". The agent's name on its page wears the pencil its card
  has, and opens **Name**, a page of the sheet rather than a second sheet over it. Name has the
  field, the card's words under it (`nameWords`, now shared), and Save, which goes back to the
  agent's page. Who may rename, and the name it starts from (without a fork's " · fork"), are the
  card's (`agentCard`'s `mayName` and `ownName`, ADR 0091). A name the server refuses stays in
  the field, with the reason in red under it.
- **The same row slides left on a red Remove** (`SwipeRow`, as a Spaces row slides on Archive and
  Delete, ADR 0066). One row is open at a time. A screen reader gets Remove as the row's
  accessibility action, since it cannot swipe.
- **Neither asks first.** A removal is undone with Add → Free, and the page warns when a reply
  would stop. The sheet stays open on its first page without the agent; it does not close as an
  add does.
- **Who may is core's, and matches the server** (`mayRemoveMember` in `rooms.ts`):
  - yes for the room's owner, and for a workspace owner or admin who is in the room;
  - never for a guest;
  - never for oneself (that is leaving, `/leave`), for anyone not in the room, or for the Lead
    agent in its Lead room.

  The Mac's Members panel uses the same rule, so its Remove button now shows for workspace admins
  too.
- **The room says who took it out.** Core's `agentLeft` writes the agent's own muted line, "J1
  was removed by Arjun", as for a move or an archive. A removal with no person behind it, such as
  an upgrade's release, still says nothing. When the room is left with no agent, its notice says
  the same: "J1 was removed by Arjun. Messages here reach people only."

## Consequences

- Nothing changes on the server, the protocol, Jacobian or the bridge, and there is no migration.
  Going live means installing the phone and the Mac app, and rebuilding the web copy 4431 serves.
- `SwipeRow` takes a wider set of acts (`SwipeAct`: Spaces' three, and `remove`) without changing
  what the Spaces list and the Agents tab offer. The phone has its own `remove` mark (⊖).
- Removing the agent that leads a room leaves the room with no lead until somebody picks one. Lead
  says Nobody, as it already did when the lead left (`roomLeadOf`).
- The Mac has no agent page in its Members panel. Renaming there is still the Agents card's.
- A person still can't be removed from the phone. The Mac's Members panel can do it, as before.

## Addendum, 10 October 2026: an agent's row opens its card

Arjun: "When we tap the Agent, it should open the agent detail page (the same one we see when we
tap Agent from the agent tab, currently we show some mini version which is not very useful".

The page of the sheet showed a little of the agent: its name, harness, last words here, whether
it was working, and Remove. The card (ADR 0087, Phase 5, `agents/AgentCard.tsx`) has the rest:
the room it is in, since when, what it is doing, its history, Move, Fork, Archive and Delete, its
face, its model and effort, its context files and its context window. It renames in place, as the
page did.

- **An agent's row on the room sheet's first page opens the agent's card**, the route the Agents
  tab opens (`/agents/<id>`), over the room. The sheet goes down first, and the card is pushed
  once it has gone (the sheet's `onGone`): a push under the sheet's modal while it is still up
  would come in under it. Back from the card lands on the room, with the sheet closed.
- **The page is gone**, and with it core's `agentPage.ts` (`lastSaid`, `agentWorking`,
  `removeWords`, `noRemoveWords`), which nothing else used.
- **Remove stays on the row**: it slides left on the red Remove, and a screen reader gets Remove
  as the row's action, as before. The card has no Remove from the room; the row is where it is.
- **The Mac does the same** (Arjun: "Do the same on the Mac too"). Its Members panel never had an
  agent page, and its rows opened nothing. Now an agent's face, name and harness are one flat
  button, lit on hover, that opens the agent's page in Agents, as the line of a compaction does
  (ADR 0146). Remove stays beside it, never inside it. A person's row is not a button. The panel
  closes with the room as Agents opens.

Files: `apps/mobile/src/spaces/RoomSheet.tsx` (the `onOpenAgent` prop) and
`apps/mobile/app/spaces/[id].tsx`; on the Mac, `apps/web/src/app/Members.tsx` (`MemberRow`'s
`onOpen`, `.members-open`) and `SpaceView.tsx`.
