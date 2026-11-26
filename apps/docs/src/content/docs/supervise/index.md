---
title: Supervise
description: How to stay in charge without reading everything.
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
not where you answer it. You answer an ask in its space, on the card at its foot, and the Spaces
list marks a space waiting on a yes. On the iPhone and iPad a push for an ask opens the ask's own
screen, where you answer it.

## Deciding what asks

What a harness asks about is set on its [Permissions](/concepts/permissions/). Its own settings
decide first, and Claude Code's and Codex's mode can be picked for an hour, 8 hours or until
tomorrow. A new harness brings every ask to you. Turn its Chips's rules on when you want Chips to
answer some of them: an Always, a rule you write, Stop asking for a while.

## Spend per job

Each space has a limit on what one job may spend, $3 unless somebody sets another. A job starts with
the last thing a person did in the space. When a job here has spent that much, Chips holds the
agents: they start nothing new until somebody lets them carry on, from the banner that says so,
with the same limit or a higher one.

Set it in the space's details, under **Spend per job**: $1, $3, $5, $10, $25, Other (from $0.25 to
$1,000, in steps of 25 cents) or **No cap**, which means Chips never holds them. The row says what
this job has spent so far, and what the jobs before it spent, ten at a time, with See all.

## Reading a receipt

Every run leaves one: the steps, the sources used, the cost and how long each step took. It isn't
drawn under a reply. Open the menu of the line that closed the run (right-click, or press and
hold) and pick *What the run did*: it opens under that line until you put it away. The point is
that you *can* look, not that you must.

## When something goes wrong

- **Deny with a reason.** The harness gets to read it, and `scope: "always"` turns the answer into
  a policy rule rather than a decision you will make again.
- **Steer mid-run.** A message sent while a run is going returns a receipt saying whether it was
  queued or steered. Type `/steer`, `/followup` or `/interrupt` in the composer, or press the
  Steer chip; the harness is told who said it and their standing in the space.
- **Pause, or stop.** Right-click the thinking bubble on the Mac and the web, or press and hold
  it on the iPhone and iPad. Stop doesn't ask: the run ends as cancelled, and a line in the space
  says who stopped it. A paused one waits for Resume. Pause is offered only where the harness can
  hold a run still; Stop always is.
- **Edit before approving.** An editable approval opens what the harness proposed; what you
  write is what it sends.
- **Change what it may do.** On the harness's Permissions, put Claude Code or Codex back in a
  mode that asks, or turn Chips's rules off so every ask comes to you. Each change is an event the
  harness hears, and the log says who made it.
- **Read the log.** **You → Workspace log**, for an owner or an admin, lists who decided what and when — a person, or Chips on
  their behalf by policy or by an expiry. It is a read of the event log, so it cannot disagree
  with what happened. See [Audit event](/concepts/audit-event/).
