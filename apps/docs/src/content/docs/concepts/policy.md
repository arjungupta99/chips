---
title: Policy
description: Rules that decide which actions need a person, and which person. Trust is a dial, not a switch.
---

Every harness has an autonomy level per space. Policy fills in the details. Chips brokers
the decision, records it, and never executes anything itself.

## Four levels

| Level | What it means |
| --- | --- |
| **L0 · Observe** | Reads and proposes. Every action needs a yes. For brand-new harnesses and sensitive rooms. |
| **L1 · Ask first** | Reads are free. Every write and every external action asks. Where every new harness starts. |
| **L2 · Ask when it matters** | Policy decides. Money, external messages, deletions and anything irreversible ask. Everything else — a shell command, a file write — runs unasked and shows up in the receipt. The level the dial is built for, once a harness has earned it. |
| **L3 · Autonomous, report back** | Runs end to end, posts a summary and a receipt. You audit or roll back. |

L3 is earned, not granted: Chips suggests moving up after a streak of approvals with zero edits,
and moves down after a denial.

## Rules read like sentences

```
email.send to an external domain   → ask the owner
payment.* over $500                → ask role: finance
file.delete anything               → ask, show a preview
github.merge into main             → ask any maintainer
budget past 80%                    → warn · past 100% → pause the run
context past 85%                   → checkpoint and summarize · past 95% → pause and ask
lane depth                         → 3 at most
workspace cap                      → no harness above L2 in #finance
```

## How it is evaluated

The policy engine is a pure function with no I/O:

```ts
evaluate(action, harnessPolicy, workspacePolicy)
  -> { decision: 'allow' | 'ask' | 'deny', approvers?, reason }
```

Rules match on the action's `kind` — a dotted verb like `email.send` — and on its flags:
`external`, `irreversible`, and `money_usd`. The workspace cap always wins, so a room can forbid
what a harness's own policy allows.

The engine runs on every [`approval.request`](/reference/events/approval-request/) the moment it
arrives. `ask` leaves the card for a person. `allow` and `deny` are Chips' own decisions and are
logged as an [`approval.resolved`](/reference/events/approval-resolved/) by `system`, with the
engine's reason, beside the request — an auto-approval is an event, so the audit has it. A hook
that posts the request gets the answer in the response, and its wait returns at once.

## What the presets say

| Level | A read | A write with no flags | External, irreversible, money, or a hot risk class |
| --- | --- | --- | --- |
| L0 | ask | ask | ask |
| L1 | allow | ask | ask |
| L2 | allow | allow | ask |
| L3 | allow | allow | allow |

A read is an action whose kind ends in `read`, `list`, `get`, `search`, `fetch`, `view`,
`lookup` or `query`. The hot risk classes are `external`, `external_communication`,
`destructive`, `financial` and `credential`.

Say the L2 row plainly, because it is the trade the dial makes: **at L2 a shell command runs
unasked.** `rm -rf build` claims no flag and no hot class, so policy allows it on the spot, with
`system` as the approver and no card — a lower bar than most harnesses' own prompt. An adapter
claims a risk only where a tool's name really says so — the web tools leave the machine, mail
sent is `external_communication` — because a guess here becomes a rule firing on a guess. A
harness you do not yet trust with that stays at L1, where every command and every write asks.

Rules go first: the workspace's, then the harness's, and the first that matches decides. A
harness's own `allow` speaks only where the workspace lets policy decide — a cap of L2 or more —
and not at L0, so a room capped at L0 or L1 cannot be talked past by a harness's rule, and L0
asks for everything. At L1 it speaks: that is where every harness starts, and where a person's
*This session* and *Always* (below) are rules of the harness's.

## Who may answer

An ask names who may answer it, and Chips settles that as the request arrives
([ADR 0030](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0030-who-may-answer-is-resolved-at-ingest-and-checked-at-the-door.md)).
The refs are `owner`, `any` — everyone in the room but a guest — `role:<name>` — a standing in
the space (owner, member, guest) or in the workspace (owner, admin, member, guest), since M5.5 —
`lead`, the harness leading the lane the run is, or a person's id. The rule that decided supplies
them when it names any; else the harness's own `approvers`, which name people and never a
harness (a `lead` or a harness id there is dropped, since Gate 5); else `owner`, the harness's.
Chips resolves them against the harness's owner and the room's members to a list of people,
writes that list onto the stored `approval.request`, and takes a decision only from somebody on
it: anyone else's is refused with the reason, and their card says *Waiting on Dana* instead of
offering buttons. A list that resolves to nobody falls back to the owner, so an ask always has
somebody who may answer it; an ask that names nobody is anyone's in the room but a guest's.

That is what a room with two harnesses and two people needs: Ledger is Dana's, so Ledger's ask is
Dana's to answer, whoever else is in the room.

Being named is standing enough, wherever the person is
([ADR 0042](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0042-a-named-person-answers-an-approval-from-wherever-they-are.md)):
a person named by their own id, and the harness's owner named by `owner`, are kept whether or not
they are in the room, and they are sent the ask, the decision and what came of it — and nothing
else of that room. `any` and `role:<name>` describe who is *here* and name nobody outside; a guest
is in one space and is named only there.

When nobody named is in the room, the harness's owner answers if they are here; else — Ledger,
Dana's, working a [lane](/concepts/lane/) for Arjun in a room Dana is not in — the person the lane
is for, which keeps that work with the person it is for rather than with Ledger's absent owner;
and only then the owner from wherever they are. An ask that names nobody at all is anyone's in the
room but a guest's. The one *harness* kept though it is not in the room is the lane's lead, when a
person's rule handed the ask to it and the ask does not matter — money, a deletion and an external
action always reach a person: the lead is sent the ask because it names it, and answers from
outside
(M5.5, [ADR 0036](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0036-an-approval-is-handed-on-by-an-event-and-a-lead-answers-what-policy-hands-it.md)
and its Gate 5 addendum). Whoever may answer, or runs the workspace, may hand an ask on with
`approval.routed`, to somebody who can answer it — in this room or elsewhere in the workspace.

## What a decision leaves behind

A decision carries a scope. `once` decides this ask. `session` decides the same action the same
way for the rest of the run, without asking. `always` becomes a rule in the harness's policy, an
`allow` or a `deny`, recorded as
a [`policy.updated`](/reference/events/policy-updated/) so the audit says where the rule came
from and a replay reproduces it; an `always` the room already has adds nothing. For a command both
are written by how each of its parts starts, and for anything else by the action's kind and flags
([Approval](/concepts/approval/#this-session-and-always-are-kept-by-chips)). A `deny` from
either holds at every level, and an `allow` from L1 under a cap of L2 or more, as the rules above
say. It reaches the room it was made in, for that harness, and
handing the ask to a role does not widen it: an admin who answers *always* makes the same room
rule. A rule for every space is a deliberate act: `everywhere: true` on the answer, from an owner or
an admin ([ADR 0239](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0239-a-standing-yes-for-a-command-remembers-how-each-part-starts.md)),
or a `policy.updated` with no space (open decision 2, answered in ADR 0036).

A yes given for an hour or until stopped is a `once` that holds on. Chips keeps it apart from these
rules and reads it after them, so a no a person set still says no
([A yes that holds on](/concepts/approval/#a-yes-that-holds-on)).

## Where the policy lives

A harness's policy is a projection of `policy.updated` ([ADR 0019](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0019-policy-is-a-projection.md)):
its level everywhere, its level in any one space where the dial was turned, its rules,
its budget, and what `usage` has added up. Nothing writes it directly; turning the dial appends
an event, with the workspace cap and who turned it filled in by Chips. A brand-new harness with no
policy yet is treated as L1, ask first. The `hello` a harness receives reports the projection.
