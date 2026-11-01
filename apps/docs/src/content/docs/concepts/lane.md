---
title: Lane
description: A run a lead routed to a specialist. One object, two views, never a copy.
---

A lane is a [run](/concepts/run/) that a lead routed to a specialist. It lives in the
specialist's chat and is linked into the lead's chat. **One object, two views, never a copy.**

One harness takes the message; others take the work. Nothing gets copied, which is what keeps a
person from reading the same thing three times in three rooms.

## Rules the protocol keeps

- **Ephemeral children are first-class.** A `task` may name a child with only a label. Chips
  mints a transient participant scoped to the lane, which inherits owner, autonomy and budget
  from the lead.
- **Finishing and delivering are different states.** A lane completes when the specialist posts
  its result. The person is told when the *lead* delivers. Delivery state travels with the lane:
  direct, queued to the lead, or failed.
- **Depth is bounded, not policed.** Lanes deeper than three are flattened into steps, not
  rejected. A refusal would make a legitimate chain fail; a flattening keeps it readable.
- **Cost rolls up the trail. Context does not.** A lead's context ring is about the lead.

## How a lane is made

One [`task`](/reference/events/task/) from a lead becomes a lane, in the specialist's own space:

1. **The lead posts `task`.** Its route card appears in the lead's chat.
2. **Chips appends [`run.requested`](/reference/events/run-requested/)** into the specialist's
   home — the direct space it already shares with the person, or one Chips opens — carrying the
   trail and seeding the specialist's run. That is the lane: one run object, linked into the
   lead's chat and at home in the specialist's.
3. **The specialist works and replies once.** Its messages are ordinary messages in its own
   space; the lead reads them through the lane.
4. **Chips tells the lead the news** with [`lane.updated`](/reference/events/lane-updated/): the
   lane went to waiting, or completed with a summary and the cost rolled onto it.

A lane past three levels deep, or one that would route back to a participant already in the
trail, is not opened: the work is flattened into a step on the lead's own run. So is a task
that says what a lead may not: one on behalf of somebody who is not the lead's own owner and
not in the space the task was sent from, or of nobody at all — a lane opens a room for that
person and names them on every card — and one wearing the id of a lane another lead opened.
The route card, and the lane's news, appear in the space the task was sent from and in the
space `link_to` names when the lead is in it; a space the lead is not in is never linked.

Cancelling a lead's run cancels the lanes it opened, and theirs, down the chain — the ones still
going; a lane that already completed keeps its ending and its specialist is not told to stop a
run it finished. A person can also cancel one lane from its route card while it is still going,
and the lead hears it was cancelled.

## A lane between two spaces of one harness

A Space Jacobian hands down to, a subagent a harness spawns beside itself: the same object, and
the specialist is the harness itself. The lead routes the `task` to its own id, names the room it
already has as the lane's `home` — the Space's room — and what to call the work as
its `label`; the lane's run is then its own to drive. The cards call the lead by the room it
routed from, when that room is one of the harness's own, so a Space handing down from its own room
reads *Chess Game → Engineer* and not the harness's name on both ends. Routing to oneself is not a
loop; the depth limit bounds the chain. The acknowledgement of the task says where the lane is, so an adapter
driving it from hooks or a bubble knows where to post before the next hook fires. A lane whose
home is the room it is linked into — a subagent working where its lead already is — draws one
card, the route card. ([ADR 0032](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0032-a-lane-between-two-spaces-of-one-harness-is-a-task-the-lead-routes-to-itself.md))

:::note[Where this is]
The lane data model and its events landed in M3.1; the two chats that render a lane — the route
card in the lead's, the task card in the specialist's — landed in M3.2, along with the cost
that rolls up the lead's run panel and the trail an ask's card carries; a room with several
harnesses and people in it landed in M3.3; feedback in M3.4; and in M3.5 the adapter drives real
lanes — Jacobian's placements and hand-downs — and the SDK gained
`run.task()` and `runs.accept()`.
:::
