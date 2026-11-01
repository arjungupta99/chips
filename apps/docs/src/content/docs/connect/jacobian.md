---
title: Jacobian
description: One harness, a space per Space, and an approval that settles the same record Telegram would.
sidebar:
  order: 7
---

Jacobian is connected as a channel of its own, beside Telegram, Slack and Discord: one directory
under `src/channels/` in Jacobian's own repository and one line in its manifest, which is how
Jacobian adds a chat surface. The channel is Jacobian's — written there, tested there, speaking
Chips's public wire with nothing of Chips installed — and Chips knows it as a harness like any
other. Nothing about how Jacobian works changes: the Spaces, the walk that places a message, the
tools, the memory and the approvals are all its own.

## Connect it

Add the harness the way you add any harness, with the autonomy dial off — Jacobian's permission
model is its own, per tool and per connector, so a dial would change nothing it could see:

```sh
chips connect custom --name Jacobian --no-dial     # on any machine paired with the server
chips declare Jacobian new_spaces follows_rooms agents forks   # the +, its rooms, its agents, and forks
```

or **Agents → Connect a harness → Anything with HTTP → Advanced** in the app, with *Takes the autonomy
dial* unticked. Either
hands you the four lines every harness is given. Put them where Jacobian runs — as the
environment, or as the `channels.chips` block in `~/.jacobian/config.yaml`:

```yaml
channels:
  chips:
    enabled: true
    server_url: http://mini.local:4431   # CHIPS_URL, as Jacobian's machine reaches it
    harness_id: hrn_…                    # CHIPS_HARNESS_ID
    token: chips_at_…                    # CHIPS_HARNESS_TOKEN, shown once
    space_id: spc_…                      # CHIPS_SPACE_ID — the direct space, which is J's room
```

Restart Jacobian, and its Spaces appear in Chips as it starts. `space_id` is the direct space
between you and the harness that Add a harness opened: Jacobian uses it as J's room, so there is
one room for J and not an empty "Jacobian" beside it. `CHIPS_SERVER_URL` and `CHIPS_TOKEN`, the
names the channel read before 12 September 2026, still work. `allowed_users` names Chips
participants who may speak for the owner besides the owner; `approval_timeout_sec` is how long a
card waits, and should stay at the permission layer's own timeout so both give up together.
`chips doctor` says when the token has never been used, which is the lines not having been put
where Jacobian reads them; `chips disconnect Jacobian` withdraws the token and leaves the block for
you to take out.

## A JSpace is a space — J's, and the ones under it

Jacobian calls its tree's nodes Spaces; to keep them apart from Chips' spaces, Chips calls them
**JSpaces**. Not every JSpace is a space. **Jacobian is one harness**, with one owner, one policy
and one budget. **J is a space, and so is each JSpace directly under J** — the ones your tasks
are performed in: *Shopping*, *India trip 2026*, *Kalshi Trading Desk* — keyed by the JSpace's
id and titled by its name. **A worker under one of those, and anything deeper, is not a room of
its own.** What a worker says or asks shows in its
task Space's room, attributed the way Jacobian already attributes it — the `🤖 Space Agent
(Analyst):` header — and the work that goes to it is a lane at home in that room, called by the
worker's name (M3.5). A task Space made while Jacobian runs gets its room the first time
something is said in it.

**A room follows its JSpace, and a JSpace follows its room.** Archive a JSpace in Jacobian and
its room here is archived within the half-minute: off your list, behind the **Archived** row at
the foot of it, its history whole. Restore the JSpace and the room comes back. The same goes for a
JSpace that Jacobian no longer has at all. And the other way: archive a room here — swipe it on
the phone, or Archive on the desktop's room sheet — and Jacobian archives its JSpace; unarchive
it and Jacobian restores it. A room you archived stays archived when its JSpace is restored in
Jacobian: unarchive it here and the JSpace's agent goes back in. Nor does a room come back while
a guest of it is in another room by now, since a guest is in one at a time. J is never archived,
and J's room here cannot be (below). Jacobian does it with the event any harness may send for a
space it opened — `space.updated` — and finds its rooms, and who last moved each, through
`GET /v1/harnesses/:id/spaces`, so it never opens a room in order to close it.

**Deleting a room.** Delete erases the room from Chips (ADR 0067), and Jacobian deletes its JSpace,
with its memory, its files and the JSpaces under it (ADR 0069). A restart of Jacobian does not
bring it back. This happens only when Jacobian's owner deletes the room. When a workspace owner or
admin who is not Jacobian's owner deletes it, Jacobian archives the JSpace, for its owner to
delete in Jacobian or bring back. The sheet that asks first says which, and the archive sheet
that Jacobian brings a room back too — because Jacobian declares `follows_rooms` (above). Without
it the sheets promise nothing on Jacobian's behalf ([ADR 0077](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0077-chips-promises-for-a-harness-only-what-it-declares.md)).

**J's room is Jacobian's home.** It is always there. Nobody archives or deletes it, and the phone
and the desktop do not offer either. Jacobian tells Chips so as it starts.

Nothing here is a session. A Jacobian Space is not visited the way a working directory is —
there is no terminal to open or close — so its space carries no session strip and the composer
says nothing before you send. A message simply goes.

| In Jacobian | In Chips |
| --- | --- |
| The daemon on the Mac mini | One **harness** |
| J, the root | The space titled `J`, where anything with no Space of its own lands |
| A Space directly under J — where a task of yours is performed | One **space**, keyed by the Space's id |
| A worker under one of those, and anything deeper | Not a room: its work is a **lane** at home in its task Space's room, called by the worker's name |
| A turn — `runTurn`, from a message to its answer | One **run** |
| A tool call | One **step**, and a line of the receipt |
| The thinking bubble | The run's status |
| The walk placing a message on a Space, and its receipt | A **lane** at home in that Space's room, linked into the room the message was said in; the answer lands in the lane |
| `hand_down` mid-turn | A **lane** to the Space handed down to, open while that Space's turn runs and closed with what it said |
| `hand_down` with `wait: false` — a job handed on without waiting | A **lane** opened at once, which outlives the turn that opened it: the job takes over its run in its own room and ends it with its answer and cost |
| A `perm:` or `proj:` card | An **approval** |
| A Space's question, and any other card | A **question**, one option per button |

## Every surface, and what it becomes

| Jacobian says | Chips shows |
| --- | --- |
| A turn begins on a message from Chips | [`run.started`](/reference/events/run-started/), with the message as its goal, marked `chips` so it is not drawn twice |
| The bubble thinks | [`run.status`](/reference/events/run-status/), the last line of the reasoning, at most every few seconds |
| The bubble reports a tool call | [`step.log`](/reference/events/step-log/) `started`, named `jacobian.<tool>`; the previous step is done when the next begins, because Jacobian reports no tool results yet |
| The placement receipt, `🤖 → Shopping → Amazon` | a line of the run's receipt, and a [`task`](/reference/events/task/) that opens a lane in the room the message went to — the route card here, the answer there |
| `hand_down` in the bubble, and the engine's word that the Space's turn began | a `task` that opens a lane to the Space handed down to; that Space's own tool calls are the lane's steps while it runs, and the engine's word that its turn ended completes the lane with what the Space said — or fails it with why — billed with the rounds that Space made under its own id (the turn brackets, 12 September 2026) |
| The journey receipt grows on a mid-turn `hand_down` | a done step, titled by the receipt |
| A `hand_down` that does not wait (long jobs, 5 October 2026) | a `task` that opens a lane at once, from the turn's run; the turn answers in seconds and its run ends, while the lane stays running. The job's first turn, queued on the Space it went to, takes over the lane's run in that Space's room — no `run.started` of its own — and its answer and `usage` end the lane, so the route card in the room it was handed from carries the summary and cost. The Space that handed it on is then handed the answer as a turn of its own job, and answers `NO_REPLY` — a pass — unless it has something to add |
| `reply` | [`message.post`](/reference/events/message-post/), on the run |
| A card with ✅ Approve and ❌ Deny | [`approval.request`](/reference/events/approval-request/), with the pending record behind it read for the action's name and the risk it really carries |
| Any other card — a Space's question, a Space's actions | [`question.ask`](/reference/events/question-ask/), each option's value the button's own callback data |
| A photo, an album, a document | a post with attachments, uploaded first |
| The turn ends | [`run.completed`](/reference/events/run-completed/) with the last reply as its summary, or `run.failed` with what went wrong |
| A queued Space's reply, its files, its team's approval notice, a landed change | `message.post` in the room of the Space it is about, which every notice about a Space's work names; a notice about nothing in particular (an alert, a channel reconnecting) goes to `J` (16 September 2026 — before, a notice that named no Space went where you last wrote, and a restart forgot where that was) |
| A status: a workflow board's progress, a Space whose work has stopped moving | one `message.post` in the room of the Space it is about, then [`message.edited`](/reference/events/message-edited/) as it changes; its last word is an edit, and it is one message however many owners share the room. Never a run: an open run would mark every message you send in that room queued |
| A queued Space turn working — one you asked for, running later from the task queue | one `message.post` in the room of the Space doing it, then [`message.edited`](/reference/events/message-edited/) as it thinks and calls tools (its newest thought, its last three tool calls, a stall line if it has one). When it is done the message becomes how long the work took, above the reply; work that finishes within a second shows nothing. Never deleted, since a message taken back leaves a tombstone, and never a run |
| An approval a Space's team was meant to decide and has not | the same `approval.request` card, in the requesting Space's room, with a line saying who was meant to decide |
| A card raised outside any turn — a tool asking during a Telegram turn, a parked question waking | a run of its own to carry the card, closed by the answer |

The action's name is fixed, never guessed: the `shell` tool's `execute` is always
`jacobian.shell.execute`, and a policy rule written against it is written against the tool you
meant. Risk is claimed only where the name really says so — mail sent is `external_communication`,
a browser leaving the machine is `external` — because a guess here becomes a rule firing on a
guess. A Space approval's own risk word is not one of Chips' classes and is shown on the card
rather than claimed.

## What Chips says, and what it settles

| You do, in Chips | Jacobian does |
| --- | --- |
| Send a message in a space | Runs a turn through the same engine Telegram uses, in the person's own session, placed by the walk **from that space** — J's room enters at the top of the tree and every Space is asked; a Space's own room enters there, so nothing above it is asked and the walk below it is unchanged |
| Send `/status`, `/tasks`, any Jacobian command | Runs it through the same dispatcher; a command Jacobian does not know is a message. Type `//status` in the composer, since Chips has slash commands of its own |
| Attach a file | Fetches it, saves it under Jacobian's data directory, and tells the Space where it is and which tool reads it — the words the Telegram adapter uses |
| Send a voice note | Reads what was said from the attachment's `transcript`, the words Chips wrote down when it arrived. The Space is told them, and that a name or a number may be misheard, and the walk places the message by them. A voice note with no words is an audio file for `transcribe_audio`, as before. Needs Jacobian as of 13 September 2026 |
| Approve or deny a card | Resolves the tap exactly as Telegram would, through the shared callback module: a `perm:` card settles the permission layer's record, a `proj:` card decides through the Space approval facade. **First answer wins, on either surface**, because it is one record |
| Tap an option on a question | The same: the option is the button, resolved through the same parser |
| Type an answer to a Space's question | `wreply <id> <answer>` — the tap's typed twin |
| Let a card expire in Chips | Nothing. Jacobian's own timeout governs its record; Chips gave up waiting, it did not decide |
| Stop a run | `/stop` for that turn, at its next step |
| Steer a run | A message, queued as Jacobian queues; an interrupt stops the turn first |
| Say a reply is not right (*Not right?*: a reason or words) | What `/wrong <note>` is: the flag, then a fix turn on the Space at the top, on the flagged journey's own trace |
| A bare 👎, from an older client | What a 👎 is on Telegram: the flag on the journey that answered it, and Jacobian asks what went wrong |
| Cancel a lane from its route card | The lane's run is stopped; the turn that opened it carries on and says so |

Policy applies as it does for every harness: at L2 a rule that allows something allows it the
moment the card goes up, with `system` as the approver, and the tap is made on Jacobian's side
at once. A decision by somebody who is not the harness's owner, or on the configured list, is
ignored and the card stays.

## Telegram and Chips, side by side

Jacobian fans approval cards to every channel it has and settles the one durable record from
whichever surface answers first; that is how Telegram and Slack already coexist, and Chips is
one more channel in that loop. **A turn you start on Telegram stays on Telegram**, though: its
placement, its steps and its answer are the starting channel's, and Chips sees only what
Jacobian fans out of it — an approval card, a queued reply. A turn you start in Chips is a run
with all of that. Showing a Telegram turn as a run too is a seam on Jacobian's side, tracked in
the Phase 2 packet. A card is put up in Chips once, however many people are allowed
to see it — Chips has rooms, not DMs. A queued reply still carries its `🤖 Space Agent (Name):`
header, because the header is Jacobian's wording and Chips shows what was said.

What differs from talking to Jacobian on Telegram: every Space is its own room rather than one
DM; a turn has a run with steps you can read afterwards; a tool's approval names the action and
its risk and can be answered from a phone that was never told about Telegram. What does not
differ: the model, the memory, the tools, the placement and the approvals are Jacobian's on
either surface — Chips runs no model.

## Where the channel lives

In Jacobian: `src/channels/chips/` is the plugin, `tests/unit/channels/chips/` its tests, and
`src/channels/CLAUDE.md` there its doc. It brings no dependency with it — HTTP and Node's own
`WebSocket` to chipsd, and zod, which Jacobian already has, for its settings — so a Jacobian that
talks to Telegram alone never loads it. Until 12 September 2026 the plugin was a package in this
repository, vendored into Jacobian by a script; that put the dependency arrow the wrong way
round, and it is retired
([ADR 0051](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0051-a-harnesss-adapter-lives-with-the-harness.md)).
Chips never depends on Jacobian. Jacobian will take `@chipschat/conformance` and `@chipschat/protocol` as
dev dependencies the day they are published, to run the kit in its own CI and check every payload
against the protocol's schemas the way its tests did here; until then its own suite covers the
adapter and a live smoke covers the wire.

## What is not there yet

Seven seams on Jacobian's side were named for this, tracked as a checklist in the Phase 2 packet
rather than done here, because they are changes to Jacobian. Three are done and four are still
open. The four the plan names:

- **An outbound source on replies**, so a Space's live answer says which Space said it and
  lands in that Space's room rather than where the message was sent.
- **`spaceId` on permission requests**, so a tool's approval card goes to the Space that asked
  instead of to where you last wrote.
- **A per-Space budget check**, so a Space's spend can be capped. A room's job is capped now
  (ADRs 0117 and 0118): Jacobian reads `context.spend`, carries a job on across turns only
  within the room's ceiling, and starts no follow-up in a room Chips paused with
  `budget.warning`. A Space's spend across all its rooms is still not.
- **Tool-result step logs**, so a step is done when the tool answers, with what it answered,
  rather than when the next begins.

A fifth was one line, done on 6 September 2026, and it is what lights the Cost row: **the cost
store on the channel runtime**. Jacobian records every model call with the turn's session, and
the gateway now hands the store to the runtime bundle a channel is built from, so the channel
adds a turn up and sends `usage` before the run ends.

A sixth came out of building this and **is done**: **an addressed turn**. `handleIncoming`
takes an `entrySpaceId`, and the walk starts there rather than always at the top — so a message
sent in a Space's room is placed from that Space, and the Spaces above it are never asked what
the person already answered by choosing the room. What is below is unchanged: a Space that hands
the message further down still does, and the receipt is drawn against where the message came in,
so it says something only when the message actually travelled. An id the tree no longer holds
falls back to the top, so naming an entry can never lose a message. This replaces the stopgap
that appended `(Sent in the "…" space.)` to the text the walk read — advice a model could
overrule, and keyed by name where two Spaces may share one. And a seventh came out of the first
live message: **turn events for every surface**, so a turn that starts on Telegram shows in Chips
as a run like any other, rather than only what Jacobian fans out of it.

One thing the lanes cannot say, because the channel is not told it: a placed message's
`trace_id` never reaches the channel, so a lane is keyed by the run that opened it rather than by
the journey — the outbound transcript's row is what ties a reply to its journey, and it is what
`fixFlaggedTurn` reads. A delegation lane used to be a second: its summary was only that the
work came back, since a child's `hand_back` is the parent's tool result and the engine kept it,
and the lane closed on the parent's next tool call — which, because a `hand_down` runs its child
on the parent's own session, was always the child's first. Since 12 September 2026 the engine
brackets every turn on a session, `onTurnEntered` and `onTurnEnded` on the bubble, so the lane
opens when the child's turn begins, carries its steps, and closes with the child's words. And
Jacobian edits a message here only for a status and a queued turn's work; its live-edited
drafts are off, so an answer arrives whole.
