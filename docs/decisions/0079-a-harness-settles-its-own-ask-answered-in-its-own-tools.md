# 0079. A harness settles its own ask, answered in its own tools

Date: 27 September 2026
Status: Accepted. Narrows rule 9 of `authorize` (ADR 0022) for a harness's own run; leaves 0036's
lead as it was.

## Context

A harness with tools of its own can be answered there as well as on the card. In the OpenClaw
test an approval answered in OpenClaw's command line ran the command, and the Chips card stayed
live, Approve and Deny, until it expired thirty minutes later; the run said *Needed you* after it
was done (`docs/reviews/openclaw-test-report.md`, finding 5). Chips gave the harness no way to say
so: a harness could send `approval.resolved` only for an ask policy handed it (the lane's lead,
ADR 0036), and `question.answered` not at all.

## Decision

1. **A harness may settle an ask of its own run.** `approval.resolved` and `question.answered`
   are accepted from a harness when the ask belongs to the run the event names and that run is the
   harness's. The door looks the ask's run up; the event's `run_id` alone does not say.
2. **Once, and never an expiry.** A harness's answer has scope `once`: This session and Always are
   rules a person makes (ADR 0080), and the door refuses them from a harness rather than rewrite
   them. `expired` and `timed_out` are Chips's to say, when nobody answered, and are refused too.
3. **In its own name.** `resolved_by` and `answered_by` are the harness, filled in from the
   credential as for anyone, so the card says *Approved by OpenClaw* and the audit shows who.
4. **First answer still wins.** A person answering after the harness is told somebody was first,
   and the harness settling after a person is refused the same way.
5. **An ended run's ask is settled too.** Ended runs keep their asks open on purpose (run state,
   `ABOUT_AN_ASK`); an answer to one is accepted from whoever may give it.

## Consequences

- This gives a harness nothing it did not have. It asked, and it is what runs the action; a harness
  that wanted to skip a person could skip the ask. What changes is that the room says what
  happened, and says the harness decided rather than a person.
- A harness can now be the one to approve an ask that matters (money, a deletion, an external
  action), which ADR 0036 keeps from a lead. The two differ: a lead answers another harness's ask,
  and would be two harnesses agreeing; here the asker reports an answer a person gave in its tools.
  Chips cannot check that a person did, and the card does not claim one did.
- The OpenClaw bridge sends it on OpenClaw's `exec.approval.resolved`, `plugin.approval.resolved`
  and `question.resolved`, for an ask whose card is still open, and skips the ones it sent Chips
  itself. That is the bridge's code, outside Chips.
- A withdrawn ask (`ask.withdrawn`: the harness gave up without an answer) is still not in the
  protocol. It would need its own event and copy, and is not scheduled.
