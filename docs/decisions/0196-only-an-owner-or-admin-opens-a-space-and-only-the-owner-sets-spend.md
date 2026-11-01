# 0196. Only an owner or an admin opens a space, and only the owner sets Spend per job

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Does a member get the +? No" and "Can a member set
Spend per job, or only you? Only me". Built as Phases 1 and 2 of
[the invited-people plan](../proposals/invited-people-plan.md).

## Context

A walk of a never-installed iPhone joining one of Arjun's spaces by a guest link, and then by a
member link, found ten gaps (the mock: https://claude.ai/artifact/3XhgcKYd3TrcApWLPL77eZ). Four of
them were rules the screens and the server did not agree on, or that nobody had decided:

- The + showed for a guest. Naming a room was refused, and left a blank "Space" page behind.
- The room sheet offered a guest the Lead picker, then answered `403` "A guest does not choose
  the lead."
- A guest's Agents shelf opened a harness page, with a dial they could not turn and a Pause.
- A member raised a room's Spend per job from $3 to $25 on Arjun's agent, and the server took it.

A member could also open spaces of their own. Every agent in Arjun's workspace runs on his
computer and his model account, so a space a member opened was answered on his bill. He was asked
both questions on the mock and answered them.

## Decision

1. **Only an owner or an admin opens a space.** The server's `mayOpenSpace` is `administers`; a
   member's top-level `space.created` is refused with "a member of the workspace may not open a
   space: an owner or an admin opens one and adds them". A thread is still judged by its own rule
   (rule 13); neither app offers one. A guest is refused as before. The direct room `add-harness`
   opens for a person's own harness is left alone.
2. **A member keeps Add.** Adding people and agents to a space they are in was the second thing
   the old `mayOpenSpace` gated. It is now `mayAddToSpaces`, true for anybody but a guest.
3. **Only the workspace's owner sets Spend per job.** `set-spend-ceiling` refuses anybody else,
   after the room check (somebody asking about a room they are not in still gets `404`): "Only the
   workspace's owner sets what a job may spend."
4. **Core says the same, for both apps.**
   - `mayOpenSpace(role)`: an owner or an admin. `welcomeFor`'s `mayCreate` and a harness page's
     New agent (`mayAskFromPage`, which opens a space) read it. A member who owns a harness asks
     it for an agent in a room they are in instead (ADR 0108).
   - `maySetSpend(space, model, selfId)` takes the model: in the room, and the workspace's owner.
   - `maySeeSpend`: in the room, and not a guest.
   - `mayChooseLead`: in the room, and not a guest, as `set-lead` already ruled.
   - The role words change: a member "works in the spaces they're added to, and adds people and
     agents to them".
5. **No + for anybody who may not open a space.**
   - Web and Mac: no + beside Recent, no Create a space in an empty workspace or under a welcome,
     and no "A new room with…" on an agent's page.
   - Phone: no gold +, no Create a space, no "A new room with it" in the room picker, and the
     iPad's empty pane says only "Choose a space on the left."
   - The phone's search slot is hidden, not left as a dead button: it was the bar's own + on an
     iPad. Hiding it remounts the navigator, so it is read as a yes until the people are read
     (`useOpens`). It is hidden once, for somebody known to be a member or a guest, and never shown
     and taken back from an owner whose phone has just paired.
   - An empty Spaces tells a member where spaces come from: "When somebody adds you to a space, it
     appears here."
6. **The room sheet follows the rules.**
   - Lead opens only for `mayChooseLead`. For anybody else it is a plain row with no chevron.
   - Spend per job: the owner opens it. A member sees the amount and "Arjun sets it · this job
     so far: $1.23" (`spentWords(spend, setBy)`, with `workspaceOwnerName`). A guest has no row.
7. **A guest's own screens.**
   - The Agents tab has no harness shelf.
   - A harness page opened by a link says "Not here".
   - You has no Decisions row, and the foot speaks of @s only.
   - A guest's line under their name is "Guest in Japan trip · invited by Arjun".
8. **An agent's page says whose it is.** For anybody but its owner, a Belongs to row names the
   owner of its harness (`belongsTo`). The mock said "Runs on: Arjun's computer", but Chips knows
   who owns a harness, not which computer runs it.
9. **Sign out says how this person gets back** (`signOutWords`). The workspace's first person
   pairs again with a new code. Somebody let in by an invite has no computer of the workspace's to
   make a code on, so they are told to use a new invite link, or a code from another device they
   are signed in on.

## Consequences

- Arjun is the only person in his workspace today, so nothing changes on his devices. It matters
  the first time he invites somebody.
- A member who wants a space asks an owner or an admin for one. A member who owns a harness can
  no longer open a room for a new agent from its page.
- The authorization tests now give every person a role. The server reads a person with no
  `workspace_members` row as a member, so many tests' rooms were being opened by members. They
  now open rooms as owners, or through `ws.roomOf`.
- Left for later:
  - The first notifications question still says "Hear when an agent needs you?" to a guest.
    Phase 5 rewords it, when people's messages reach the phone (ADR 0198).
  - A guest's agent rows keep their harness's name. "Arjun's agent", and a foot line on the
    Agents tab, wait for a guest to ask; the agent's page says whose it is.
  - No note under a guest's one space.
