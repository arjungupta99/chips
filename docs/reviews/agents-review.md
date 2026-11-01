# Agents plan review: Phases 1 to 6

Verdict: **Sound for one person. Not yet safe to share. One rule needs a single home.**
Reviewed: Chips `main` (the agents work, `f8bedd0f..7198f9a8`, read at `a2b7abe0` to `d473e69f`),
Jacobian `4ff69ad`, the OpenClaw bridge `675e6b7`.
Reviewer: Fable · 1 October 2026, on the Mac mini the phases were built on.
The plan is `docs/proposals/agents-plan.md`; the decisions are ADR 0087 and ADR 0088.

## Since this review

Arjun's word on 1 October was "proceed with the fixes", and later that evening "go live with all
of it". They are on main, each commit naming its findings, and live since 21:51 PDT on 1 October:
the server restarted, the apps rebuilt, and Jacobian's two (findings 25 and 26) committed there as
`e395275`, live once he restarts it. The text below this section is the review as written, before
any fix.

| Findings | State | Commit |
| --- | --- | --- |
| 1, 2 | Fixed. Who sends each event is in the catalogue; the four agent events are Chips's own | `ece06b3b` |
| 3 | Fixed. Agent events have an audience; a roomless post is refused; a guest's directory names the harness | `f24e39e9`, `bf107721` |
| 4 | Fixed. "Delete it in its harness too" is for the harness's owner or an admin | `fc14fde9` |
| 5, 6, 8, 9 | Fixed. One rule, asked by the store inside the append; the Lead agent stays | `73645406` |
| 7 | Fixed for an archive, a claim, a hand-off's room and an agent's first room. A Move cut between its halves leaves the agent free, to be put in a room again | `73645406` |
| 10, 12 | Fixed. Every exit from a room stops the agent's runs first. The three old runs on the live workspace end at the first start | `73645406`, `040d3a4a`, `1e0b93ca` |
| 11 | Fixed | `73645406`, `1e0b93ca` |
| 13 | Fixed. A refused add is said in the room, on both apps | `1e0b93ca` |
| 14 | Fixed | `73645406` |
| 15, 17, 31 | Fixed in Chips alone: both adapters already took the shape Chips now sends | `26dd4240` |
| 16 | Open. The guide now says a harness gives a turn between two of its own agents itself | `26dd4240` |
| 18, 19, 40 | His decision | |
| 20 | The double tap and the empty room are fixed. Whether a late copy may join is his decision. Jacobian's sixty-second window and the device clock are open | `1e0b93ca` |
| 21, 24 | Open | |
| 22, 23 | Fixed | `1e0b93ca`, `73645406` |
| 25, 26 | Fixed in Jacobian. Live once he restarts it | Jacobian `e395275` |
| 27 to 30 | Open, Jacobian's. 27 is smaller now, since Chips cancels the run on every exit | |
| 32 to 36 | Open | |
| 37 | Fixed for fourteen scenarios, each run against the server and the fake. Child lanes and a lane's files are not covered | `c5080b77` |
| 38 | The guides the fixes touch are current. The older pages listed are not | |
| 39 | The apps read the directory one request at a time now. The rest is open | `1e0b93ca` |
| 41, 42 | Open | |

What the fixes changed on the wire is ADR 0087's addendum of 1 October.

Found on the live workspace the same evening, by the session that looked at the "Hey both…" room,
and not in this review: two of OpenClaw's agents in one room were one OpenClaw session, so a
message for both got one turn. It was the bridge's, near finding 34's last bullet, and was fixed
there the same evening (bridge `c5b6ead`, live from 21:14 PDT); nothing in Chips changed for it.
That commit also has the bridge take a turn where `addressed_to` names the harness, so the
dropped first words of finding 31 no longer wait on this branch going live.

Found by the same session later that evening, also not in this review, and **open**: the context
handed with a message starts after the agent's last post (`contextFor`, `room-context.ts`), not
after the message its last turn was on. A line that lands while an agent's turn is going, such as
another agent's answer to the same message, is before that post and is never handed to it. The
bridge covers itself since `59d0c3a` (it reads the room's context page and adds what its
conversation missed); Jacobian does not. Changing the cut is a change to ADR 0088, so it is his
to decide.

Two corrections to finding 34, from that session's read-only survey later the same evening, each
checked against the code:

- Its last bullet says the bridge names every claimed room's agent "OpenClaw". Chips does: for a
  harness that does not follow its rooms, `agentForRoom` names each keyed room's agent after the
  harness (`server/src/application/agents.ts:202`). The fix is Chips's, not the bridge's.
- Numbering names that repeat would not by itself make `@` reach one of them. A participant
  answers to its whole name and to its first word (`handlesOf`, `packages/protocol/src/mentions.ts`),
  so "OpenClaw 2" answers to `@openclaw` too, and a handle two answer to goes to the first given,
  which is join order (`resolveMentions`). A whole name has to win over another's first word, or
  each agent needs the one unique handle the finding's fix asks for.

## Verdict

The model is right and the build follows it. An agent is a participant of its own kind, one
connection speaks for all of a harness's agents, history was moved by appended events, and a
harness written before agents keeps working. On the live workspace every rule holds today: no
agent is in two rooms, no closed room holds an agent, no harness is left in a room, and J is alone
in its Lead room.

Three things keep it from a clean pass.

1. **The event door trusts people with events only Chips or a harness should write** (finding 1).
   In a throwaway workspace a guest renamed another person's agent, a plain member archived one
   and closed its room, and a member who owns a harness took another harness's agent as her own,
   after which her token read the owner's room. Nobody on the live workspace can do this, because
   it has one person. It must be closed before a second person or a guest is invited.
2. **One room per agent is checked in nine places and enforced in none** (findings 5 to 8). Each
   path reads where the agent is, then writes. Two actions at once, an add into an archived room,
   or a restart in the middle of an archive each leave an agent in two rooms. Nothing repairs it
   on its own.
3. **Work is stopped on some exits from a room and not on others** (findings 10 and 12). Archive
   and Move cancel an agent's runs. Delete, a person's Remove, and an agent archived in its
   harness do not, and the late answer turns up in the next room the agent joins.

The rest is a long list of smaller things: flows that go quiet, words on screens that are no
longer true, and gaps for other harness authors. None of them loses data.

## What was reviewed, and how

- **Read:** the two ADRs and the plan, then the server's agent code in full (`agents.ts`,
  `one-room.ts`, `move-agent.ts`, `fork-agent.ts`, `open-space.ts`, `erase-space.ts`,
  `route-lane.ts`, `room-context.ts`, `visibility.ts`, `harness-sight.ts`, the routes, and the
  changes to `authorize.ts`, `submit-event.ts`, `projection.ts`, `session.ts`, `read-models.ts`
  and the three migrations).
- **Four independent read-only reviews**, each given the spec and one area: Jacobian's adapter and
  fork; the bridge, the SDK, the wire and the docs; the conformance fake against the server; the
  two apps and `packages/core`. I checked each one's main claims against the code before taking
  them, and ran the ones that could be run. The "Smaller" lists (24, 30, 36, 41) and the fake's
  side of finding 37 are the reviewers' readings, taken as read. The docs in 38 were spot-checked.
- **Ran:** ten short probes, each in a throwaway workspace made by the server's own test helper
  (`createTestWorkspace`), never against 4431. A finding marked **Ran** was reproduced. One marked
  **Read** was traced in the code on both sides and not executed.
- **The live workspace, read-only** (`sqlite3` in read-only mode on `.chips/chips.db`): 1 person,
  3 harnesses, 71 agents (20 in rooms, 51 archived), 73 rooms, 6,670 events. The invariants above
  were checked there.
- **Baseline:** the six server test files for agents pass at `main` (285 tests).
- **Not done:** no full `pnpm check`, no e2e, no simulator walk, nothing run in Jacobian (its
  suite takes Colima down), and no live test with the real model. Agent faces (ADR 0089) is
  another session's work and was read only where it touches `agent.updated`.

## What to do first

Smallest first. Sizes are S (an hour or two), M (a day), L (more).

| Order | What | Size | Closes |
| --- | --- | --- | --- |
| 1 | Make the four agent events Chips-only at the door, and strip the Chips-written fields | S | 1, 2 |
| 2 | Refuse an agent into a closed room; stop offering it | S | 5 |
| 3 | Refuse removing the Lead agent from its Lead room; hide Remove for it | S | 9 |
| 4 | Cancel an agent's runs whenever it leaves a room, for any reason, in one place | S to M | 10, 12 |
| 5 | Bridge: read an empty `for` as the harness itself. Chips: deliver `space.created` to a harness asked second | S | 31, 17 |
| 6 | Jacobian: retry a failed registration; undo a failed fork | S to M | 25, 26 |
| 7 | Claim the agent's room inside the append's transaction | M | 6, 8, most of 7 |
| 8 | Show a refused add in both apps; a busy state on "a new room with the copy" | S | 13, 20 |
| 9 | Scope `agent.registered` and `agent.updated`; refuse a roomless post from a harness | M | 3 |
| 10 | One scenario suite run against both the server and the fake | M | 37 |

Items 1 and 9 are needed only before the workspace is shared. Items 2 to 6 are worth doing now.

**Four decisions are his, not fixes:** findings 18 and 19 (what archive and unarchive mean for a
harness that follows its rooms), 20 (whether a late copy may still join), and 40 (whether an agent
can be removed for good).

Jacobian's and the bridge's changes are made in their own repositories, on his word.

## Findings

Each says how it is known: **Ran** or **Read**.

### Before anyone else joins the workspace

#### 1. Any person can write four agent events that are Chips's or the harness's to write

**Ran.** Severity: blocks sharing. Not reachable on the live workspace today.

`agent.registered`, `agent.updated`, `membership.replaced` and `agent.fork` are accepted from a
person through the ordinary event door. What that allowed in the probes:

- **A guest renamed another person's agent.**
- **A plain member archived another person's agent.** It left its room and the room was closed.
- **A plain member registered a Lead agent under a harness that is not hers.**
- **A member who owns a harness took over another harness's agent.** She sent `agent.registered`
  with the agent's id and her own harness's id. The agent's row was overwritten. Her harness's
  token then read the owner's room and posted there as the agent.
- **A member swapped the agent in her room for one that was in another room.** The agent was then
  in two rooms. The one replaced was out, with no release.
- **A member forged a fork.** The fork route refused her. She sent `agent.fork` herself, in a room
  of her own, with `by` set to the owner's id. It was stored as she wrote it, the agent's harness
  was sent it, and the copy joined her room. Jacobian's check that the asker is an owner reads
  that `by` field (Jacobian's `bot.ts:786`), so it would pass.

Why: the door reads an event whose direction is `workspace` as something a person sends
(`server/src/domain/authorize.ts:303`). These four are not in the list of events only Chips writes
(`server/src/application/use-cases/submit-event.ts:114`), and no rule covers them. The suite
expects it: `senderOf` in `submit-event.test.ts:445` classes them as a person's.

A harness's token cannot send them (wrong direction), so on the live workspace nobody but the
owner can.

Fix:
- Add the four to `SYSTEM_ONLY_EVENTS`. Every real write of them already goes straight to the
  store from a use case, so nothing else changes.
- Then put who sends each event in the catalogue (person, harness, either, Chips only) and have
  the door and the test read it from there. A new event can then never default to "anyone".

#### 2. Fields marked "written by Chips" are kept as the sender wrote them

**Ran** for the first three. Severity: low on its own; same door as finding 1.

- `from_held` on a person's post deleted another agent's waiting words.
- `held_since` on a person's post was kept, so a message can claim to be old.
- `fork_of` on a person's `membership.added` marked a standing fork ask as answered. The harness's
  real copy was then turned away with "That room has its copy already".
- `reason` on a `membership.removed` decides whether the agent comes back on unarchive (read).

Fix: strip these four at the door, as `mentions` and `addressed_to` are replaced today.

#### 3. Every agent's name and key go to every guest and every harness

**Ran.** Severity: medium once shared.

`agent.registered` and `agent.updated` carry no room, and an event with no room is sent to
everyone (`server/src/application/visibility.ts:94`). A guest in no room with the agent, and an
unrelated harness, were both sent its name, its new name and the harness's key for it. The
directory, asked by the same guest, listed nobody. For Jacobian the name is the Space's name. On
the live workspace OpenClaw's bridge is sent each of them while it is connected.

Two neighbours of the same kind:
- **A harness that posts as itself with no room and no run is stored with no room**, and so is
  sent to everyone (ran). An agent in the same case is held. This is older than agents.
- **A guest's directory lists only current members of their rooms.** Harnesses are in no room
  now, so a guest sees each harness's name as a raw id (read).

Fix: send the two agent events to the agent's harness and to people who see the whole directory;
let a room's members learn of an agent through the directory. Refuse a roomless post.

#### 4. "Delete X in Jacobian too" is on by default for whoever may delete the room

**Read.** Severity: medium once shared.

The switch starts on in both apps (`apps/web/src/app/ConfirmDialog.tsx:53`,
`apps/mobile/src/spaces/List.tsx:525`). The server checks only that the room has exactly one agent
(`erase-space.ts:151`). So a room's owner who does not own the harness archives someone else's
agent in Chips by leaving the switch alone. Jacobian deletes its Space only when one of its owners
asked, and archives it otherwise.

Fix: offer and accept it only for the harness's owner or a workspace owner or admin, as Move and
Fork are.

### One room per agent

#### 5. An agent can be added to an archived room, and both apps offer it

**Ran** on the server; the offer is **read**. Severity: medium. No race is needed.

The door has no rule about the room's state (`authorize.ts:526`). A free agent added to a closed
room still reads as free, because "the room it is in" counts open rooms only
(`read-models.ts:796`). It was then added to a second room. When the first was unarchived it was
in both. `addableAgents` checks for a Lead room and not for a closed one
(`packages/core/src/rooms.ts:137`), so the desktop's Members panel and the phone's room sheet
both offer the add.

Fix: refuse it at the door with Move's words, "Unarchive the room first", and offer nothing in a
closed room.

#### 6. Two actions at once put an agent in two rooms

**Ran**, three ways: two moves at once, an add and a move at once, two adds at once. Each left the
agent in both rooms. Severity: medium as design, low as a risk for one person.

Every path reads where the agent is and then appends. Nothing joins the read to the write, and the
database has no constraint. The same is true of "one Lead agent per harness", which is checked in
the route alone.

The only repair is `chipsd upgrade one-room`, and its release is keyed once per room and agent
(`upgrade-one-room.ts:243`), so it will not release the same pair a second time.

Fix: see Architecture, "One gate for where an agent is".

#### 7. A chain cut by a restart is never finished

**Read.** Severity: medium. 4431 is restarted often, and `kickstart -k` does not wait.

What follows an event is appended one event at a time after the first has committed
(`one-room.ts:298`). A retry of the first is a duplicate, and a duplicate's consequences are
skipped. So a restart between "the room is closed" and "its agents are released" leaves the agents
in a closed room for good. They read as free, can be put elsewhere, and an unarchive then leaves
them in two rooms. Other chains with the same shape:

- **Move:** taken out of the old room, not yet put in the new.
- **A claim:** `space.claimed` lands, the agent is not yet put in the harness's place, and the
  retry returns early without placing it (`open-space.ts:477`).
- **A room for an agent's first words, or for a hand-off:** the room exists, the members do not.

Fix: append a trigger and its consequences in one transaction, or settle at start-up: release
agents from closed rooms and report any agent in two.

#### 8. The rule is kept at the door and skipped on other paths

**Ran** for the first, second and fourth. Severity: low to medium. Most need the harness to do it
to itself.

- **The attach route lets a plain agent take the Lead agent's place in the Lead room**
  (`agents.ts:288`). The Lead agent is then in no room.
- **One harness's Lead agent can be added to another harness's Lead room.** The door asks only
  whether the room is a Lead room, not whose (`authorize.ts:534`).
- **Opening by key, a claim, a lane's home and an agent's first words** check "is it elsewhere"
  and nothing about the Lead agent or an archived one (read).
- **A harness can archive its own Lead agent.** Restored, it stays out of its Lead room, because a
  restore only acts when the room was closed and a Lead room never is (ran).

### Flows that go wrong today

#### 9. The Lead agent can be removed from its Lead room, and no screen puts it back

**Ran** on the server; the screens are **read**. Severity: medium. One click on the desktop.

The Members panel gives the room's owner Remove on every member, J included
(`apps/web/src/app/Members.tsx:79`), and `/remove` does the same. The door has no rule against it.
Afterwards the Lead room shows "No agent", its Add offers people only, and `@J` is not a handle,
because a handle needs two characters (`packages/protocol/src/mentions.ts:18`). Only a raw
`membership.added` brings it back.

Fix: refuse it at the door, and hide Remove for a Lead agent in its Lead room.

#### 10. Deleting a room does not stop its runs

**Ran.** Severity: medium.

Archive cancels the room's runs first. Delete erases the room and sends `agent.released` only
(`erase-space.ts:155`). No `run.cancel` goes out, for the room's runs or the lanes they opened.
The agent's answer, sent to the room that is gone, was held as a free agent's words and then
posted in the next room the agent joined.

Fix: cancel as archive does, before the erase. Refuse a post that names an erased room.

#### 11. A deleted room leaves traces

**Ran** for the model; the rest **read**. Severity: low to medium. Seen after any delete of a room
with an agent.

- **The release names the room that is gone.** It is appended after the tombstone with the erased
  room's id, and a live session still counts that room as its own, so it is sent it.
- **The client model makes the room again.** Any event that names an unknown room creates one
  (`packages/core/src/model/fold.ts:100`). After `space.erased` then `agent.released`, the model
  held the erased room as an empty untitled room. The Spaces list hides it. The room pickers for
  Move, Put and Fork list it as "another room" until the next reconnect.
- **The agent's card says "Room: A room you're not in"**, because the erased room is its last room
  (`packages/core/src/agentsTab.ts:66`).
- **An agent deleted with its room stays under Archived for good**, with the note "Unarchive its
  room to bring it back there" (`agentsTab.ts:366`). There is no room.

Fix: send the release before the tombstone, or without the room's id. Clear the agent's last room
when that room is erased. Have the fold look a room up and not create it.

#### 12. A run is left running when its agent leaves by Remove, or is archived in a shared room

**Ran**, both. Severity: medium, because of what the screens then say.

A person removing an agent appends the removal and the release, and its run stays `running`. So
does the run of an agent archived in its harness while another agent keeps the room open
(`one-room.ts:216`). Nothing ends such a run later. The apps then read it wrongly:

- **The agent reads "Working" for good.** `agentDoing` takes any run of the agent in its room that
  has not ended (`agentsTab.ts:90`). The room's own bubble uses only the newest run, for this
  reason.
- **The archive sheet promises "X's reply will be stopped"** for a run that has been dead for
  weeks.

The live workspace has three such runs, from 17 and 18 September, in the closed room "algorithmic
beauty". The one-room upgrade released that room's agent and left them. They would show its agent
as Working if the room is unarchived.

Fix: cancel an agent's live runs in the one place every exit goes through, with archive, move,
delete, remove and "archived in its harness" all calling it. Use the newest run for the row and
the sheet. End the three by hand.

#### 13. A refused add is silent on both apps

**Read.** Severity: medium.

The server puts the rule and the agent's room on the error frame so a client can offer Move
(`session.ts:475`). The transport keeps only the code and the words
(`packages/core/src/transport.ts:200`), and `addMember` is not tracked
(`packages/core/src/store.ts:1330`). So the apps decide Add or Move from the directory before
sending, and when that is a moment stale nothing happens and nothing is said. "Put in a room" then
opens a room the agent never arrives in. `/add` of the Lead agent, an archived agent, or one that
is elsewhere is silent the same way.

Fix: track the add as a role change is tracked, pass `refusal` and `space_id` through, and open
the Move page on `agent_elsewhere`.

#### 14. A hand-off to a free agent can land in a room the agent is not in

**Ran.** Severity: medium. The work is lost without a word, in a rare sequence.

The room a hand-off opens is keyed by the agent, the person and the room the agent was last in
(`route-lane.ts:144`). Sequence: the agent is released from X, a hand-off opens R1, the agent is
moved back to X, X is archived again, a second hand-off. The key repeats, the append is a
duplicate, and R1 is returned before the agent is put in it (`route-lane.ts:172`). The lane read
`running` with R1 as its home, the agent was in no room, and its harness could not read R1.

Fix: when the keyed room exists, put the free agent in it; or key by the release, not the room.

#### 15. One message for two of a harness's agents carries one context, and it starts too late

**Ran.** Severity: medium for a room with two agents of one harness, which this work makes
possible.

The delivery carries one `context`. It starts after whichever of the agents spoke last
(`room-context.ts:54`, called from `session.ts:599`). In the probe Beta was owed four lines and
was handed one. ADR 0088 says lines "repeat; they never leave a gap". Both adapters deleted their
own buffers in Phase 1, so nothing else fills it.

Fix: start from the oldest of the agents' marks. The fresher agent sees repeats, which the ADR
accepts.

#### 16. An agent that addresses another agent of its own harness gets no answer

**Read.** Severity: low to medium.

A connection is handed its own words back as a plain `message.post`, never as `message.new`
(`session.ts:549`). So when Chess Game writes "@OpeningsPrep, what do you think?", Chips records
who it is for and counts it toward the guard of four, and nobody is told to take a turn. Jacobian
and the bridge both ignore their own words.

Fix: deliver it to its own connection as `message.new` with `for`, or say in the guide that a
harness routes such turns itself from `addressed_to`.

#### 17. Asked second from the +, a harness hears nothing until it reconnects

**Read**, on both sides. Severity: medium for the several-faces +.

`space.created` reaches the harness named in `asked_of`. It does not reach one named in
`also_asked_of` (`visibility.ts:142`). Jacobian learns that a room was asked of it from that
event, so asked second it never learns. The first words then arrive for the harness itself, with
an empty `for`, and its `turns()` runs over an empty list (Jacobian's `bot.ts:937`). Nothing
happens and nothing is logged until its next `hello`.

Fix: match `also_asked_of` in `opensFor`. See finding 31 for the empty `for`.

#### 18. Unarchiving a room brings back an agent that is archived in its harness

**Ran.** Decision.

In a room with two agents, X was archived in its harness and left. A person then archived and
unarchived the room. X came back, still archived. The door and Move both refuse an archived
agent; `unarchived` does not ask (`one-room.ts:193`). For Jacobian the attach restores the Space,
so a Space archived on purpose comes back.

This is intended where the agent's own archive closed the room, which is the live workspace's 49
rooms. The shared-room case is the odd one. Either bring back only agents the room's own archive
released, or keep it and say so in the ADR.

#### 19. Archiving a room archives a Jacobian agent, and the sheet says it will be free

**Read**, and the live data agrees: 51 archived agents, none free. Decision.

Chips releases the agent. Jacobian hears it and archives the Space (Jacobian's `spaces.ts:677`),
which archives the agent in Chips. An archived agent cannot be added or moved. So for Jacobian
"will be free to join another room" is not true, and rule 4's "elsewhere, with Move back or Fork"
can only follow a Move. Restoring the Space reopens the room, including one a person archived. A
room with three Jacobian agents archives three Spaces.

This is what the plan's Phase 4 asked of Jacobian. Either keep it and change the sheet's words for
a harness that follows its rooms, or have Jacobian leave the Space active and only stop its work.

#### 20. Fork: the minute is a wall, and asking again makes a second copy

**Read.** Severity: medium. The live check is still to come.

- **A copy that registers after 60 seconds stays free.** The room says "Jacobian didn't make the
  copy" though it did (`fork-agent.ts:213`). Try again is a new ask, and Jacobian copies the Space
  again as "· fork 2". The same holds when the registration call fails.
- **Jacobian accepts an ask up to the full minute old** (Jacobian's `bot.ts:796`), so one
  delivered at 55 seconds is started and cannot finish in time.
- **"A new room with the copy" has no busy state**, and makes the room before it asks
  (`apps/mobile/src/agents/RoomPicker.tsx:73`, and the desktop's Agents page). A second tap is a
  second room, a second ask and a second copy. A refused ask leaves an empty "X · fork" room, and
  each retry leaves another.
- **The wait is timed against the device's clock.** A device a minute ahead shows the failure at
  once.
- **A retried registration, once the copy is in the room, answers `attached: false`** with no
  reason (`harnesses.ts:354`).

The copy itself was quick where it was measured: 1.9 seconds for a 7 MB Space. The largest Space
on disk is 264 MB.

Fix, smallest first: a busy state and one room per attempt; Jacobian refuses asks older than 45
seconds; a late copy joins if its ask is still the room's newest, unanswered, and the room is
open, so the minute governs only the waiting line.

#### 21. An agent's history leaves out the tasks handed to it

**Read.** Severity: low to medium. Rule 11 says "what it was asked".

History matches a task card to an agent by the lane's specialist (`agentsTab.ts:219`). That field
holds the harness. The agent is carried on the run only. So Chess Game's history shows its answers
and not the task J gave it. Route cards from before the upgrade name the harness as lead and are
missing from J's history too.

Fix: keep `agent_id` on the lane and match on it.

#### 22. Where an agent is goes stale for a reader in neither room

**Read.** Severity: low to medium once shared.

The attach and release events go to the two rooms and the harness. The directory is read again
only on events the reader receives. So after somebody else puts X in room B, a reader who
unarchives room A sees "X is in no room now", and Move back pulls X out of B. An open Agents page
on the desktop never updates Free, the room or "N waiting".

Fix: read the directory again on a room's archive, unarchive and erase.

#### 23. A harness's connection keeps an agent's old name

**Read.** Severity: low.

Names are cached per connection and dropped only on `person.renamed` (`session.ts:754`). After an
agent is renamed, other harnesses keep its old name in `from` and in context lines until they
reconnect, and the bridge tells its model the old @name.

Fix: drop the entry on `agent.updated` with a name.

#### 24. Small things on the screens

**Read.** Severity: low each.

- **What the ADR's table promises and no screen says:** "Arjun added Chess Game" for a free add;
  that a reply was stopped by an archive; which harness an agent was archived in.
- **Move stops the agent's work in the room it leaves**, and no Move screen says so.
- **Held words keep no date on screen.** Chips writes `held_since`; neither app reads it, so
  day-old words read as said now.
- **"Tern is in Tern."** A room with no title is named after its agent, so the notice repeats it.
- **Every copy shows as "X · fork"** until named, a fork of a fork included.
- **With no directory yet** (an offline launch), a room with an agent can say "No agent in this
  room".
- **Offered, then refused:** Move into an archived room; Add shown to a guest on the phone's room
  sheet; `/close` in a Lead room.
- **Allowed, not offered:** a free agent's "Move back" needs the harness's owner, though any
  member may add a free agent.
- **Phone and desktop differ:** the desktop's notice has no "Add an agent" and the desktop has no
  Lead-room label; the phone has no Remove; the tablet layout has no room sheet; the phone says a
  room is "closed" where the desktop says "archived".

### Jacobian

No finding here deletes or archives the wrong Space. File references in this section are
Jacobian's, under `src/channels/chips/` and `src/spaces/lifecycle/`.

#### 25. A registration that fails is never tried again

**Read**, by the reviewer and again by me. Severity: medium, because 4431 restarts are routine.

`sentAgents` is written before the call and kept when the call throws (`spaces.ts:870`). Each
later pass sees "sent already" and skips (`spaces.ts:909`). So a Space archived, restored or
renamed while 4431 is restarting never reaches Chips until Jacobian itself restarts. A fork's copy
whose call failed is the same.

Fix: write `sentAgents` after Chips answers, and clear it at each `hello`.

#### 26. A fork that fails after the clone leaves a second live Space

**Read.** Severity: medium, and rare.

`forkSpace` creates the clone as active, has no `catch`, and exports outside its `try`
(`manager.ts:2836`). A throw in the scrub, or a kill mid-copy, leaves an active Space under J that
still holds the original's queued tasks, pending approvals and schedules. The next pass registers
it as an agent. A failed export leaves a partial folder in the original's bundle.

Fix: clone paused, scrub, then activate. Catch after the clone and delete it.

#### 27. A turn outlives its agent's release

**Read.** Severity: medium.

The adapter stops nothing when an agent is released (`bot.ts:761`). With findings 10 and 12, a
removal or a delete lets the turn run to its end, and its answer is held for the next room. On an
archive the turn is cancelled, and its closing "Stopped." is said by an agent that is free by
then, so it would be held and posted on unarchive. The live log has no held message yet, so this
has not happened there. With "delete in Jacobian too", the Space is deleted under a live turn.

Fix: on a release, stop every live turn of that agent in that room, then archive or delete. Drop
what a session says once its run is over.

#### 28. An interrupt stops every live turn of the person

**Read.** Severity: medium. ADR 0087's addendum says Phase 4 makes both stops per turn.

A cancel is per turn, which is right. A steer with `interrupt` calls `stopLiveTurn`, keyed by the
person (`bot.ts:1428`). With two agents answering in one room, or turns in two rooms, it stops
them all. It also does not find a lane's run.

Fix: use `stopTurn(session)` and the lookup `onRunCancel` uses.

#### 29. Two Jacobian agents in one room: what is said outside a turn picks the wrong speaker

**Read.** Severity: medium, narrow. In-turn paths are right.

The adapter keeps one Space per room, and the last to speak wins. So a queued-task bubble posted
as Chess Game is later edited as Openings prep, Chips refuses the edit, and the bubble freezes. A
thumbs-down opens its fix run as whichever agent the room is bound to. Cards after one of them
leaves go out as the other.

Fix: carry the Space a send is about down to the post, and keep the author with a status message.

#### 30. Smaller

**Read.** Severity: low each.

- **A fork wakes Spaces that were archived inside the original**, and their paused schedules can
  come back on after a later archive and unarchive of the copy's room.
- **Only the top Space's threads are copied.** Spaces inside the copy start with none.
- **Two turns at once bill each other's model calls**: usage is filtered by person and time.
- **The catch-up handed on joining is kept in memory**, so a restart before the agent's first turn
  loses it.
- **Context lines addressed to the agent are dropped even when it never took a turn on them**,
  which leaves a gap ADR 0088 says must not be there.
- **A message for an agent whose Space is gone is answered by J under that agent's face.**
- **An archive is not gated on who archived the room**; a delete is.
- **A free agent that is not archived keeps its schedules running**, and each result is held with
  no cap, then all posted at once.
- **Nothing reconciles Chips to Jacobian any more.** The cursor moves before the handler, so one
  failed archive leaves the Space live with its room archived.

### The bridge, the SDK and the wire

#### 31. The bridge drops a room asked from the + while it is running

**Read**, on both sides. Severity: high whenever OpenClaw is running.

A room asked of a harness holds the harness itself until it claims the room, so the first words
are addressed to its `hrn_` id. Chips keeps only `agt_` ids in `for` (`session.ts:554`), so the
bridge is handed `message.new` with an empty `for`. Its `turnTakers` takes an array as final
(`bridge.ts:420`): no taker, no claim, no answer. A bridge restart heals it, because start-up
reads the asked rooms another way. The bridge's tests feed it `for: [its own id]`, which Chips
never sends, and so do Jacobian's.

Fix: in the bridge, read an empty `for` on a `message.new` as the harness itself. Say so in the
wire's description of `for` and in the SDK guide, whose sample loop has the same hole. Add a
server test that pins the shape.

#### 32. The view for a harness that has not learnt agents rewrites payloads blind

**Read**; the reviewer ran the function. Severity: medium for such a harness. On the live
workspace that is Scout.

`inLegacyView` walks the whole payload (`packages/protocol/src/agents.ts:35`). It drops any field
named `for` at any depth, removes repeats from every list of strings, and turns the word `agent`
into `harness` under any key ending in `kind`. An approval's edited input came back with a `for`
field gone and `["cp","-r","a","a"]` as `["cp","-r","a"]`.

Fix: rewrite the named id and kind fields only, and strip only the top-level `for`.

#### 33. A harness that has not learnt agents can be made mute, and capabilities have no guard rails

**Read.** Severity: medium to low.

- **Two of its agents in one room.** Since Phase 4 a claim makes an agent per room, and Move can
  put two in one room. The harness answers as itself and is refused "name one as the actor". Its
  view hides agent ids, so it cannot.
- **`forks` without `agents`.** Fork is offered, and the ask is never shown to the harness, so
  every ask times out.
- **`chips declare` replaces the whole list.** `chips declare Jacobian forks` alone would drop
  `agents`. The help line names neither `agents` nor `forks`.
- **A declaration takes effect at the next reconnect**, and `hello` does not carry the list, so a
  harness cannot see what it was given.

Fix: refuse a second agent of such a harness in one room; treat `forks` as needing `agents`; send
the capabilities in `hello`.

#### 34. @handles are lossy and not unique

**Read**; the reviewer ran the resolver. Severity: low to medium. Agents are now named by free
text, and one harness addresses another by @ only.

- **A one-letter name has no handle**, so J cannot be @-named. `@Jacobian` still reaches it.
- **Two agents with the same first word**: `@chess` reaches the first to join.
- **"Chess Game · fork" has no handle of its own.** Its whole name cannot be typed as one, and
  `@chess` is the original's too.
- **The bridge names every claimed room's agent "OpenClaw"**, so in one room the second cannot be
  reached. *(Corrected under "Since this review": it is Chips that gives the name,
  not the bridge.)*

Fix: have Chips give each agent one handle, in handle characters and unique in its room, and
publish it in `hello`, the directory and `from`.

#### 35. Each child lane leaves an agent and a room for good

**Ran.** Severity: medium for a harness that uses child lanes. None on the live workspace;
Jacobian does not use them.

Three `task` events with a `child` made three agents, each active, not marked ephemeral, each in a
new direct room with the person. All three were still there after the lanes completed
(`route-lane.ts:280`). Before agents the child was an ephemeral participant.

Fix: archive the child's agent when its lane ends, and keep it off the Agents list.

#### 36. Smaller: SDK, held words, refusals, context

**Read.** Severity: low each.

- **`agent.attached`, `agent.released` and `agent.fork` reach every harness in the room**, and the
  docs and SDK say "one of your agents". The SDK does not filter.
- **SDK:** `runs.accept` ignores the run's `agent_id`; a message goes to every live run in the
  room whatever `for` says; a refusal's rule and room are dropped; `FORK_WAIT_MS` is not exported.
- **Held is silent to the harness.** The answer is the same as for a post. There is no cap or
  expiry, and a free agent's post that names any room is held.
- **Over HTTP a refusal carries no rule and no room**, and `which_agent` is prose only.
- **Context:** the cut can split an emoji in two; an agent's rename is not a line though ADR 0088
  lists it; file names are not counted against the budget.
- **Schema:** an approver cannot be an agent's id; `space_id` is optional on the three agent
  events that mean nothing without it; the text for closing a room still says it "stops nothing
  else".
- **The bridge:** a release does not abort a turn that has no run yet; a refused claim loses the
  first words until restart.

### The conformance fake

#### 37. The fake has drifted in what follows an event

**Read.** Severity: medium for anyone using the kit.

What is shared as pure code in `@chips/protocol` matches: addressing, mentions, context, the old
view, the fork's minute. The door rules, held words and fork were copied by hand and match. What
differs:

- **No cancel reaches a lane anywhere in the fake.** A lane's run has no agent on it, so Move does
  not cancel it, and archive does not cancel the lanes a room's runs opened.
- **A socket goes deaf to a room** when one of the harness's two agents leaves it. The server
  reads the membership again.
- **The Lead room cannot be made or kept as the server does it.** A harness naming its home is
  refused, and a person can archive one.
- **Delete is not there at all.**
- **A child lane is flattened** where the server makes an agent and a room.
- **A harness's own archive reads as a person's.**
- **A lane's files are dropped** when the specialist is an agent.

No scenario runs against both. No client test uses the fake; the e2e suites and the SDK's tests
run the real server.

Fix: write each scenario once and run it against both, comparing what the harness's socket was
sent. `cli/` already depends on both packages. Move the copied lists and small rules into
`@chips/protocol`.

### Docs

#### 38. The guides are behind the code

**Read.** Severity: medium for an author working from the docs alone.

- **Wrong now:** `connect/websocket.md` and `concepts/harness.md` still say a gateway gives each
  agent a harness and a token; the default agent "is in every room it is added to"; "J and its
  Spaces are spaces" and "One space, one session" in `connect/index.md`.
- **Still describing the old follow:** `concepts/space.md` and `connect/jacobian.md` describe
  rooms followed by `space.updated` and `moved_by`, and a delete that always deletes the Space.
- **Missing:** a Fork section in the SDK guide; the three agent events in the SDK's event list;
  `also_asked_of` in the new-spaces guide; a `chips declare` section in the CLI guide; that
  `forks` needs `agents`; that `for` can be empty.
- **The tab is called Agents.** Four guides still say Harnesses.
- **ADR 0087 and the plan name `GET /v1/agents/:id/messages`.** What was built is
  `/v1/agents/:id/stays`, with no paging, and the apps draw the lines from rooms they hold.

### Scale and housekeeping

#### 39. Reads that scan

**Read.** Severity: none today (6,670 events, 71 agents). Each bends at about a hundred times that.

- **`joinedSeq`** walks a room's events backwards for an agent that has not spoken there, once per
  delivered message (`read-models.ts:672`).
- **`agentStays`** reads every membership event in the workspace with three `json_extract`s, and
  loads every message of each stay to count them, each time a history opens
  (`read-models.ts:1284`).
- **`hello` and the agents list** carry every agent, archived ones too, with no paging.
- **The apps read the whole directory once per agent event**, with no coalescing, and the last
  answer to land wins. An upgrade applied live fires hundreds at once.
- **The desktop history draws every line** and scans every run per line on each render.

#### 40. An agent has no end, and some rooms cannot be deleted

**Read.** Decision.

- **An agent is active or archived, nothing else.** A Space deleted in Jacobian is an archived
  agent for good. The live workspace has 51 archived agents already, and the list only grows.
- **Rooms Chips opens itself are direct rooms with no key**: for a hand-off, for an agent's first
  words, for a child lane. Such a room can be archived and never erased (`erase-space.ts:80`), and
  each hand-off after an archive opens another.
- **"Delete X in Jacobian too" cannot be offered for an archived room**, because its agent has
  left it.

#### 41. Smaller server items

**Read** unless marked. Severity: low each.

- **The same key registered by the harness and by Chips at once throws** (ran): a unique-index
  error, because an idempotency key is per sender. A retry heals it.
- **The answer to a registration is the row as read before the change.**
- **A harness can close a room it opened and cannot reopen it**, because its agent has left.
- **Runs in a room's threads are not cancelled** by archive or move. The apps no longer make
  threads; the wire still can.

#### 42. Phase 7 is not built

Still in place: opening a room by key, the claim, the `hrn_` actor mapping, the view for a harness
without agents, `isAgent` accepting a harness, and in Jacobian the room-keyed map. Each is another
path the rules have to hold on. The ADRs do not yet record what Phases 3 to 6 changed from them.

## Architecture

### What is well designed

- **The log is still the only truth.** Every new fact is an event. What was there was moved by
  `membership.replaced`, nothing was rewritten, and an agent's row is rebuilt from the log.
- **An agent is its own kind.** The harness keeps the token, the owner, the budget and the link
  status. Nothing says the wrong thing.
- **One connection, one delivery.** A message goes once to a harness, with `for` naming who takes
  the turn. That scales with harnesses, not agents.
- **One place for consequences.** The store reacts to what it appends, so a person's event, a
  harness's call and the upgrade all get the same attach, release and held-word handling, keyed by
  the event they follow, so a retry adds nothing.
- **Compatibility has one door.** The old view goes through one module for the socket and every
  HTTP read, so a harness cannot be shown agents on one and itself on the other.
- **Context comes from the log, relative to the message.** A live delivery, a replay and a restart
  hand over the same lines, from one renderer shared with the fake and the SDK.
- **Fork stores nothing.** The ask is an event, the answer is a membership that names it, and the
  wait is arithmetic on two timestamps.
- **Promises need declarations**, and Chips still names no harness.

### What to change, as one mechanism each

1. **Who may write an event belongs in the catalogue.** Today it is a default plus a list kept by
   hand, and the default is "a person may". Say it per event, with the fields only Chips writes,
   and derive the door and the test from that. Closes findings 1 and 2 for good.
2. **One gate for where an agent is.** Keep the agent's room on its own row and claim it inside
   the append's transaction: set it only where it is empty, and refuse otherwise with
   `agent_elsewhere`. Check the room is open and the Lead rules in the same step. Every path then
   gets the rule without asking for it, and it cannot race. Closes 5, 6 and 8, and takes nine
   separate checks down to one.
3. **A trigger and its consequences commit together.** Give the store a way to append a batch in
   one transaction and have the reactions use it. Until then, settle at start-up. Closes 7.
4. **Leaving a room stops the work, whatever the reason.** One function that takes an agent out:
   cancel its runs there, cascade to lanes, remove, release. Archive, move, delete, remove and
   "archived in its harness" all call it. Closes 10 and 12.
5. **An event with no room needs a named audience.** "No room" should not mean "everyone". Closes
   3.
6. **Say exactly what `for` means.** Who takes the turn, including the harness itself; context
   from the oldest mark; an agent's words for a sibling delivered as a turn. Then pin it with a
   server test and feed the adapters' tests the real shape. Closes 15, 16, 17 and 31.
7. **A fork is found by its ask.** Key the copy by the ask's id on both sides, so a retry finds
   the first copy and a late one can still join. Closes most of 20.
8. **The fake follows the server by test, not by hand.** Closes 37.

### Scale

It is comfortable for one person and tens of agents. The design choices that matter scale well:
delivery is per connection, addressing is decided once at ingest, and the hot reads use the
`(workspace, room, seq)` index. What will not scale as it stands is finding 39's list, and the
lack of an end state in finding 40, which makes every list grow for ever. None needs work now.

## Checked and sound

- **The live workspace:** no agent in two rooms; no agent in a closed room; no harness left in a
  room; J alone in its Lead room; no held words; every `released_from` names a closed room.
- **The actor rule.** An agent named as actor must be the token's own. An `hrn_` actor is read as
  its one agent in the room, and refused where it has several.
- **The door:** `agent_elsewhere` with the room, the Lead agent only in a Lead room, no agent into
  a Lead room, an archived agent refused.
- **Move:** the harness's owner or an admin, never a guest, a member of the room it goes to; the
  agent's runs in the room it leaves are cancelled; the room it left says where it went.
- **Fork:** the same people; only a harness that declares `forks`; never the Lead agent, an
  archived or free agent, a Lead room, a closed room or its own room. The copy must be of the
  harness's own agent, joins once per ask, and stays free when late, when the room was archived,
  or when it is elsewhere. Both apps offer exactly what the server accepts.
- **Archive and unarchive:** runs cancelled with their lanes, agents released, the free ones
  brought back, no ping-pong with Jacobian.
- **Held words:** posted oldest first, addressed to nobody, and removed as they are posted.
- **Delete:** a Lead room and a plain direct room are refused; the agent is deleted with it only
  when it is the one there.
- **Context:** the budget is clamped, the pull route is member-scoped, deleted lines are left out,
  and what the harness said before the upgrade reads as its agent's.
- **Delivery:** a harness reads its agents' rooms, hears their releases from rooms it has left,
  and the places a membership changed hands are followed through more than one step.
- **Jacobian:** a cancel stops one turn; a move or a removal leaves the Space alone; J and the
  default agent are never archived or deleted; a fork is made once per ask; the copy is
  consistent, because the fork is one synchronous block and each database travels with its
  write-ahead log; the scrub covers tasks, approvals, turns, changesets, questions, schedules and
  proactive prompts, for the copy and the Spaces inside it.
- **The bridge:** ignores `agent.fork`; handles every release reason safely; keeps a session
  across a Move; `run.cancel` becomes `chat.abort`.
- **The apps:** a room the reader is not in is never named; the fork line is drawn from events
  alone, so it survives a restart; an unknown participant kind is drawn as a harness; a history
  with A, then B, then A again shows two stretches.

## The plan against what was built

| Phase | Built | Differs from the plan |
| --- | --- | --- |
| 1 Context | Yes, live | An agent's rename is not a line. Finding 15. |
| 2 Agents on one connection | Yes, live | `isAgent` still accepts a harness, as planned until Phase 7. |
| 3 The adapters | Yes, live | The bridge makes an agent per room under `main`, not one per gateway agent (the addendum of 30 September). |
| 4 One room per agent | Yes, live | `home` kept its name (addendum, point 7). The rule is not atomic (6) and is skipped off the door (5, 8). Delete does not cancel (10). |
| 5 Agents tab and history | Yes, live | The route is `/stays`, with no paging (38). Tasks are missing from a history (21). |
| 6 Fork | Yes, live; his check still to do | As planned. Finding 20. |
| 7 Cleanup | Not built | Finding 42. |

## Tests that are missing

- **The door:** each of the four agent events from a person and from a guest; each Chips-written
  field from a sender. The "who may send what" test expects the four from a person today; it
  should expect a refusal.
- **One room:** two moves at once; an add into a closed room; the attach route against the Lead
  rules; a restart between a trigger and its consequences.
- **Leaving a room:** a run going on delete, on Remove, and on "archived in its harness".
- **Delivery:** `for` when the harness itself is addressed; `space.created` for a harness asked
  second; context for two agents with different marks; one agent addressing a sibling.
- **Hand-off:** the second hand-off after the same room.
- **Erase:** an event that names the erased room after its tombstone, on the server and in the
  fold.
- **Fork:** a copy after the minute; a second ask after a late copy; a double tap on "a new room";
  a device clock a minute out.
- **Jacobian:** a registration that fails; a fork that throws after the clone; a fork with an
  archived child, pending approvals or a live writer; two own agents in a room outside a turn.
  Nothing runs the adapter against a real Chips.
- **The fake:** any scenario run against both.

## Appendix: what was run

Ten probes, each on a fresh throwaway workspace. They are scripts, not in the repo; the ones worth
keeping should become tests with the fixes.

| Probe | What it showed | Finding |
| --- | --- | --- |
| 1 | A guest and a member writing `agent.updated`, `agent.registered`, `agent.fork`; `from_held` and `held_since` kept | 1, 2 |
| 2 | A forged `membership.replaced`; three races; the attach route in a Lead room; unarchive and an archived agent; delete mid-run; a Lead agent archived and restored; an agent archived mid-run; one key registered twice at once | 1, 6, 8, 18, 10, 12, 41 |
| 3 | Three child lanes; what a guest and another harness are sent of an agent | 35, 3 |
| 4 | A forged fork naming the owner, end to end | 1 |
| 5 | The context for two agents of one harness | 15 |
| 6 | One harness's Lead agent in another's Lead room | 8 |
| 7 | Taking over an agent; an agent into a closed room; the repeated hand-off | 1, 5, 14 |
| 8 | The client model making an erased room again | 11 |
| 9 | Removing the Lead agent; removing an agent mid-run | 9, 12 |
| 10 | A harness's roomless post; `fork_of` on a person's add | 3, 2 |
