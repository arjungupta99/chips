---
title: Harness
description: What you run — Jacobian on the Mac mini, the agent you wrote beside it. One owner, a token, a policy and a budget, however many processes you start.
---

A harness is what you run: Jacobian on the Mac mini, a worker on your laptop, or the thing you
wrote yourself. It is the one kind of [participant](/concepts/participant/)
that is not a person. Naming the participant after the software is deliberate — there is no
persona to carry over when the software changes, only the [spaces](/concepts/space/) and their
history.

## What a harness has

| | |
| --- | --- |
| **An owner** | The person accountable for it, whoever added it. Approvals default to them; its tokens belong to them, and to whoever runs the workspace as its owner or an admin. An owner hands it to somebody else from its card, and the log records the handover as [`harness.transferred`](/reference/events/harness-transferred/). They, or an owner or admin of the workspace, may also remove it: its tokens are withdrawn, it leaves every list, and what it said keeps its name ([`harness.removed`](/reference/events/harness-removed/)). A guest of the workspace neither adds nor owns one. |
| **Tokens** | `chips_at_…`, shown once and kept as a digest; scoped to this harness; revocable from its card or with `chips connect --rotate`. A token sends what a harness sends and nothing a person sends. |
| **A policy** | Its [autonomy level](/concepts/policy/) — L0 to L3 — and its rules; per space, when the dial was turned there. A new harness starts at L1, ask first. |
| **A budget** | A ceiling in dollars. Warns at 80 percent, pauses the run at 100. |
| **Spaces** | As many as you open. A Jacobian Space, the direct space Connect a harness gave it, or one it opens itself. |
| **Capabilities** | What it takes, granted by a person and never by the harness itself: the dial, new spaces, agents, its files, its models, and the rest. Chips draws a control only for what a harness takes, so nothing is offered that it can't keep ([what it may do](/connect/#what-it-may-do)). Granted on the link that brings it in, and changed later from its card or with `chips declare`. |

## One harness, many processes

A harness is the software on a machine, not a process. You start five workers on your laptop,
each on something different, while Jacobian keeps its Spaces; Chips shows two harnesses, a space
per unit of work, and says on every run which [session](/concepts/session/) it came from, for a
harness that has them. The Agents tab rolls a harness up across its spaces — how many
sessions are live, how many runs are working, how many things need you — and lists its spaces
with their visits.

There is no "run this as another harness". The harness is the identity, so moving work to
another one is opening it there: a new space under the other harness, the old one keeping its
history.

## How one gets here

`chips connect custom` registers it, mints its token, and prints the four lines it needs — the
same four whatever the harness is, Jacobian included — and `chips disconnect` takes exactly that
back, leaving the harness and everything it has done. Connect a harness in the app does the same for a custom harness, by a link it takes up ([Join requests](/connect/join/)). Run twice on one machine,
`connect` makes a second harness beside the first, which stays as it is; `--rotate` renews the
first one's token instead.

The connection checklist on its card — Messages, Runs, Steps, Approvals, Questions, Context,
Cost, Finished — lights a row for each kind of event it has sent, and links each unlit row to
the page that lights it. `chips conformance` prints the same rows from a scripted run.
See [Connect](/connect/).

## Identifiers

Harnesses are `hrn_` followed by a ULID; people are `usr_`. On the wire a harness is the
`actor` of everything it sends, and `hello` — the first thing it hears on a socket — names the
token's one harness, with its owner. A gateway-style harness that runs several personas is one
harness with several [agents](/connect/websocket/#agents) (`agt_`), registered under its token
and sharing its link status (ADR 0087), not several harnesses.
