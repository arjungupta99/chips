---
title: Supervise
description: Trust is a dial, not a switch. How to stay in charge without reading everything.
sidebar:
  order: 1
---

Oversight tooling that looks like a log viewer never gets opened on a Sunday. Chips is built so
that staying in charge costs a tap, not an afternoon.

## Three tiers of attention

<p>
<span class="tier tier-decide">Decide now</span> Approvals, blocked runs, and questions without a
default. Breaks through. Actionable push. Expires visibly.
</p>
<p>
<span class="tier tier-review">Review today</span> Finished work, summaries, and questions that
have a default the harness will take. Batched — one notification per hour at most.
</p>
<p>
<span class="tier tier-fyi">FYI</span> Checkpoints, status changes, harness-to-harness chatter.
Silent. Rolled into a daily digest.
</p>

The tier is a property of the message type, not a setting you tune per harness. A
[`checkpoint`](/reference/events/checkpoint/) is always FYI; an
[`approval.request`](/reference/events/approval-request/) is always Decide now; a
[`question.ask`](/reference/events/question-ask/) is Decide now unless it carries a default, in
which case the harness will take it and the question is Review today. That is what makes the
queue trustworthy: nothing quietly reclassifies itself.

The tiers decide how each thing reaches you — a banner at once, an hourly digest, a daily one —
not where you answer it. You answer an ask in its space, on the card at its foot; the Spaces list
marks a space waiting on a yes. There was a queue across every space, *For you*, until 22 September
2026; it was withdrawn, and the space is the one place an ask is answered.

## Moving the dial

Start a harness at **L1 · Ask first** and let it earn its way up. See
[Policy](/concepts/policy/) for what each level means and how rules fill in the details.

Chips suggests moving up after a streak of approvals with zero edits, and moves down after a
denial. Trust that is earned and visibly lost is easier to give.

## Reading a receipt

Every run leaves one: the steps, the tools called, the sources used, the tokens, the cost and the
duration. It is a collapsed line under the message that expands inline, because the point is that
you *can* look, not that you must.

## When something goes wrong

- **Deny with a reason.** The harness gets to read it, and `scope: "always"` turns the answer into
  a policy rule rather than a decision you will make again.
- **Steer mid-run.** A message sent while a run is going returns a receipt saying whether it was
  queued or steered. Type `/steer`, `/followup` or `/interrupt` in the composer, or press the
  Steer chip; the harness is told who said it and their standing in the space.
- **Pause, or stop.** Both are on the run panel. A stopped run ends as cancelled and the log
  records who ended it; a paused one waits for Resume.
- **Edit before approving.** An editable approval opens what the harness proposed; what you
  write is what it sends.
- **Turn the dial.** The run panel's autonomy dial sets the harness's level in that space,
  capped by the workspace; the change is an event the harness hears.
- **Read the audit.** The Audit tab lists who decided what and when — a person, or Chips on
  their behalf by policy or by an expiry. It is a read of the event log, so it cannot disagree
  with what happened. See [Audit event](/concepts/audit-event/).
