# 0182. Agents are picked to archive or delete together

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's word ("we need the select option in the Agent tab as
well, for the agents (not harnesses)"), built as ADR 0181 was. Adds to the Agents tab on the phone
(`agents/Agents.tsx`); the swipe and the card's acts (ADR 0095) are unchanged.

## Context

The Spaces list picks rooms to archive or delete together (ADR 0181). The same evening Arjun asked
for it on the Agents tab: "after that, we need the select option in the Agent tab as well, for the
agents (not harnesses)". An agent's row already offers Archive and Delete on a swipe and on its card
(ADR 0095), to its harness's owner or an admin, never on a Main agent, and Delete offers to erase
the room it was the one agent in.

## Decision

1. **The same picking, over agents.** Select beside the tab's name, each agent's row a checkbox
   that moves over for its circle, the tab bar and the gold + stepping aside for a bar of Archive
   and Delete with counts, Done to stop. What is the same for any list is one hook
   (`spaces/usePick.tsx`): the picked set, the notes and shakes, the rows on their way out, the dust;
   the bar, the note and the sheet are shared too (`spaces/Selecting.tsx`, generic over the row).
   The Spaces list was moved onto them in the same change.
2. **Who can be picked is the swipe's rule.** `mayPickAgent` is `mayKeepAgent`: a Main agent can't
   be picked, nor another's agent for somebody who doesn't administer the workspace; a guest sees no
   Select. Pressed, such a row shakes and says why ("J is its harness's Main agent: it can't be
   archived or deleted."). The line under the name says "Main agents can't be picked", without
   Locked's padlock, which is about locked rooms.
3. **Harnesses are not picked.** The harnesses' cards, "Add an agent" and the "Archived · N" row step
   back while the tab picks and take no presses.
4. **Archive asks once** (`agentsArchiveAsking`): whose replies stop, which of their rooms are
   archived with them — each one they leave with no agent in it, unless its changes are locked —
   and what each harness does. One agent is asked about as its swipe asks.
5. **Delete asks, with one switch** (`agentsDeleteAsking`, `roomsToo`): "Delete their 2 rooms too",
   or the room by name for one, for the rooms they leave empty that this person may delete; the
   rest are said to be archived, or to stay open when locked; each harness's side is said once, "it"
   or "them". The server erases a room only with the one agent left in it (`422` otherwise), so a
   shared room goes with the last of its agents in the batch (`roomGoesWith`).
6. **Both wait for the server**, agent by agent; what it refuses stays on the sheet, with why
   (`whyNotKept`). Archived rows fold away; deleted rows go to dust and fold, after the sheet has
   gone, held where they stood among the agents (not counted with the Main agents above them).

## Consequences

- No server change: Archive sends each agent's `PUT /v1/agents/:id/state`, Delete each one's
  `DELETE /v1/agents/:id`, as the swipe does.
- `AgentRow` always draws through `PickRow` (the Profile and Archived lists too, where nothing
  picks); its face, name, Main tag and line move by a transform, its time stays (ADR 0181's
  addendum).
- Measured on the simulator with the app toggling Select by itself, 31 rows: frames at 17 ms through
  the motion, a single dropped frame on about one toggle in two, as on Spaces.
- Walked on a simulator against a scratch copy of the live data: Select, the Main agents stepping
  back, Archive 2 (two `agent.updated`), Delete 3 with one locked room and the switch on one room
  (three `agent.deleted`, one `space.erased`), dark mode. The walk found two things, fixed: rows
  going were held four rows low (counted with the Main agents), and the line under the name wore the
  padlock; and two of wording: free agents "move to Archived" rather than "leave their rooms", and a
  harness with one agent in the batch does "it", not "them".
- Not done: the web and the Mac (done 17 October: see the addendum of that day). Not walked: Android, the iPad, a refused delete on the simulator
  (the tests cover it).

## Addendum, 17 October 2026: the Archived page picks too

Arjun: "add Select to the Archived page too". The Archived page (`agents/Archived.tsx`) picks its
agents the same way, through the same hook (`useAgentPicking`, now handed its rows, the ones shown
and their runs rather than the Agents tab's two lists):

- **Select is the bar's own item.** The page is pushed under the platform's bar, so Select, then
  Done, stands at the bar's right as the Media page's Select does (a custom item whose glass is
  hidden, so the capsule draws its own), and the bar's title says "Select agents", then "2
  selected". The page draws its own screen and bar, since both change while it picks.
- **Select all stands on a shelf under the bar** (`Screen`'s `under`, where the name is not
  floating), opened and shut on the same spring. It picks the rows shown: the ones in rooms the
  reader isn't in only once their row is opened.
- **Unarchive, in Archive's place, happens at once**, as a swipe's Unarchive does and as Spaces'
  Unarchive does for picked archived rooms: picking stops, each row is held where it stood and folds
  away as the server says it is back, and one the server refuses stays, with a warning. **Delete
  asks**, with the sheet and words of the Agents tab.
- There is no tab bar to step aside here; the bar of acts rises on its band of blur as on the tabs.

Walked on the simulator against a scratch copy of the live data: Select, two picked, Unarchive 2
(two `agent archived or unarchived`, both rows folded away), Delete 1 through its sheet (one
`agent deleted`), dark. The Agents tab's picking is unchanged, its tests as they were.

## Addendum, 17 October 2026: the web and the Mac pick too

Arjun: "add Select to the web and Mac too". The Agents page picks its agents as the rail picks
rooms (ADR 0181's addendum of the same day, `apps/web/src/app/select/agents.tsx`):

- **Select stands at the header's right**, where Add an agent steps aside for it. The header's name
  says "Select agents", then "2 selected", and the line under it gives way to Select all and what
  can't be picked ("Main agents can't be picked"), one fading into the other, so nothing under the
  header moves. The harnesses' shelf steps back.
- **The archived agents are picked in their folds**, since the page folds them under it rather
  than giving them a page of their own; Select all picks what is shown. The bar's first act is the
  rail's: Archive, or Unarchive, at once, where every agent picked is archived. Archive and Delete
  ask in the confirm dialog, Delete with the one switch for the rooms the agents leave empty, a
  shared room going with the last of its agents (`roomGoesWith`).
- **The bar of acts floats in the middle of the page's foot**, on glass.

Walked in a browser against a scratch server: the Main agents stepping back and saying why, two
picked, Archive 2 asked and done, both back with Unarchive 2 from their fold, the rows folding out
of one section and unfolding in the other. The walk found that a held row's run was worked out
again from a list it had left, so it unfolded where it should have folded; fixed by each list
telling its rows their run.

## Addendum, 5 November 2026: a batch is asked at once, and a delete is done at the server's yes

Arjun: "agent deletion from agent tab is super slow. Specially gets slow when batch deleting. Any
way to speed up?" His four deletes at 21:09 that evening reached the server 2.5 to 2.8 s apart. On
a copy of his workspace the server took 2 to 6 ms for each delete and 2 to 3 ms to read the
directory, so the time was all round trips, each about 650 ms through the relay:

- the store's `deleteAgent` waited for the directory to be read again after the delete, and the
  `agent.deleted` event arriving on the socket meanwhile marked that read stale, so it read twice.
  The directory is 142 KB on his workspace (275 entries, 172 of them deleted agents);
- the batch asked about one agent, waited for all of that, then asked about the next.

What changed:

- **A delete is done when the server says yes.** The store draws the agent as removed, and in no
  room, from that answer on (`withDeleted`), and reads the directory again behind it without
  waiting. A read already on its way says the agent is still there; it is drawn removed anyway,
  since deleted stays deleted (ADR 0095: its key is retired). Archive still waits for its read,
  since an archive can be undone and a stale read could not be told from a newer one.
- **A batch is asked at once** (core's `actAll`, now one for the phone and the web): every row is
  sent without waiting for the others, except that a room's agents go one at a time
  (`agentLane`), because the last of them may take the room with it and the server refuses that
  while another is still there, and because two leaving at once could both find the room empty and
  archive it twice. One the server refuses still stays on the sheet with why. The Spaces list's
  batches use the same runner, every room at once: ADR 0181's "deleting stays one room at a time"
  no longer holds. Each erase is its own transaction on the server, and a file two rooms share is
  only removed by the last of the erases.

So a delete through the relay is one round trip instead of about four, and a batch of agents in
rooms of their own takes about as long as one.
